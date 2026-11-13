"""
05 — Video -> fotogramas -> inversión de paleta -> rasgos por fotograma -> rasgos.json

Pasos:
  1. Muestrea el video a 'fps_muestreo' (no hace falta procesar los 30 fps).
  2. Recorta la zona de datos (fuera textos, logos, barra).
  3. INVIERTE LA PALETA: lee la barra de colores del propio video, arma una tabla
     color -> valor y asigna a cada píxel el valor del color más cercano en espacio
     CIE Lab (Lab es perceptual: la distancia euclídea ahí ≈ diferencia que ve el ojo).
     No cuentan (NaN):
       - píxeles demasiado lejos de cualquier color de la barra (texto, costas oscuras);
       - píxeles ESTÁTICOS (tierra gris, máscaras, logos): en una paleta divergente el gris
         claro se parece al blanco del centro y se colaría. Un píxel es estático si, en al menos
         'frac_estatico' de los fotogramas muestreados, queda a <= 'umbral_estatico' niveles de
         su MEDIANA temporal. La mediana ignora los fotogramas atípicos (negros, sin datos,
         fundidos, títulos): tolera hasta un (1 - frac_estatico) de ellos sin perder la máscara;
       - un borde de 'borde_px' alrededor de todo lo anterior (antialias de costas/texto).
  4. Rasgos: media, fracción de área sobre umbral, centroide x de lo caliente, cambio.

Uso:  python 05_video_a_rasgos.py [config/config_video.json]   (desde la raíz del proyecto)
Para un video real del EIC: abre un fotograma (guardado como 'salidas/fotograma_ref.png'),
mide los rectángulos del mapa y de la barra en píxeles y edita el config.

Claves opcionales del config (valores por defecto):
  "dist_max": 8.0           distancia Lab máxima para aceptar un color de la barra
  "mascara_estatica": true  descartar píxeles que casi nunca cambian
  "umbral_estatico": 3.0    distancia máxima por canal (niveles 0-255) a la mediana para 'no cambiar'
  "frac_estatico": 0.7      fracción mínima de fotogramas cerca de la mediana para ser estático
                            (0,7 tolera hasta 30 % de fotogramas atípicos)
  "borde_px": 1             píxeles extra descartados alrededor de lo no válido
  "mascara_imagen": null    PNG del tamaño del recorte: negro = descartar (máscara a mano)
  "escala": 1.0             factor de reducción del recorte del mapa antes de procesar (0.25 para
                            un video de 4096x2048). Los rectángulos del config SIEMPRE van en
                            píxeles del video original. Más rápido; INTER_AREA mezcla los bordes
                            (los absorbe borde_px y dist_max)
  "ponderar_latitud": false true = la media pesa cada fila por cos(latitud), suponiendo que el
                            recorte del mapa cubre de +90 a -90 (equirectangular)
  "fechas": null            ruta a un time.txt (una línea por fotograma del video): añade el
                            campo "fecha" a cada rasgo
  "referencia": null        valor que 06 usa para el dron (se copia a rasgos.json)
  "vmin_sonido", "vmax_sonido": null   rango que 06 usa para mapear media -> nota (por defecto
                            vmin/vmax; se copian a rasgos.json). No afectan a la paleta de 05
  "dron_octava", "dron_nivel", "instrumento_melodia", "dron_programa", "reverb", "ligar", "suavizado",
  "densidad", "octava", "humanizar", "densidad_umbrales": null   ajustes musicales de 06 (ver su cabecera; valores por defecto
                            allí); se copian a rasgos.json
"""
import json
import sys
import time
import numpy as np
import cv2
from scipy.spatial import cKDTree
from rutas import sal, cfg_ruta

with open(sys.argv[1] if len(sys.argv) > 1 else cfg_ruta("config_video.json")) as fh:
    cfg = json.load(fh)
DIST_MAX = cfg.get("dist_max", 8.0)
ESC = cfg.get("escala", 1.0)
MAX_REF = 31   # fotogramas de referencia para la máscara estática (se guardan hasta 2*MAX_REF)


def a_lab(bgr):
    """BGR (0-255) -> CIE Lab real (L 0-100). Con uint8, OpenCV escala L a 0-255 y la
    distancia dejaría de ser ΔE; por eso se convierte en float32 dentro de [0, 1]."""
    bgr = np.asarray(bgr, dtype=np.float32).reshape(-1, 1, 3) / 255
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)


def tabla_desde_barra(frame):
    """Devuelve (KD-tree de colores Lab, valores asociados) leyendo la barra."""
    x0, y0, x1, y1 = cfg["barra"]
    if cfg.get("barra_imagen"):            # p. ej. SVS 5207 trae la barra como PNG aparte
        frame = cv2.imread(cfg["barra_imagen"])
        if frame is None:
            sys.exit(f"No se pudo leer la barra '{cfg['barra_imagen']}'. Revisa la ruta.")
    tira = frame[y0:y1, x0:x1]
    # promedia a lo ancho de la barra para quitar ruido de compresión
    perfil = tira.mean(axis=1 if cfg["barra_vertical"] else 0)          # (N, 3) BGR
    n = len(perfil)
    vals = np.linspace(cfg["vmin"], cfg["vmax"], n)
    if cfg["barra_vertical"] and cfg["barra_arriba_es_max"]:
        vals = vals[::-1]
    return cKDTree(a_lab(perfil)), vals


def fotogramas_muestreados(ruta, paso):
    cap = cv2.VideoCapture(ruta)
    k = 0
    while cap.grab():                          # grab() decodifica sin convertir a BGR (más rápido)
        if k % paso == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            yield k, frame
        k += 1
    cap.release()


def tam_recorte():
    """(ancho, alto) del recorte del mapa tras aplicar 'escala'."""
    x0, y0, x1, y1 = cfg["mapa"]
    return max(1, round((x1 - x0) * ESC)), max(1, round((y1 - y0) * ESC))


def recortar(frame):
    """Recorte del mapa (rectángulo en píxeles originales), reducido según 'escala'."""
    x0, y0, x1, y1 = cfg["mapa"]
    zona = frame[y0:y1, x0:x1]
    if ESC != 1.0:
        zona = cv2.resize(zona, tam_recorte(), interpolation=cv2.INTER_AREA)
    return zona


def mascara_fija(paso):
    """True = píxel del recorte que NO es dato (estático o marcado a mano)."""
    ancho, alto = tam_recorte()
    fija = np.zeros((alto, ancho), bool)
    if cfg.get("mascara_imagen"):
        m = cv2.imread(cfg["mascara_imagen"], cv2.IMREAD_GRAYSCALE)
        if m is None:
            sys.exit(f"No se pudo leer la máscara '{cfg['mascara_imagen']}'.")
        if m.shape != fija.shape:
            m = cv2.resize(m, (ancho, alto), interpolation=cv2.INTER_NEAREST)
        fija |= m == 0
    if cfg.get("mascara_estatica", True):
        # Referencia: hasta ~2*MAX_REF fotogramas repartidos a lo largo del video (acota la memoria)
        ref, cada, i = [], 1, 0
        for _, frame in fotogramas_muestreados(cfg["video"], paso):
            if i % cada == 0:
                ref.append(recortar(frame).copy())
            i += 1
            if len(ref) > 2 * MAX_REF:
                ref, cada = ref[::2], cada * 2
        if len(ref) >= 3:
            pila = np.stack(ref).astype(np.int16)
            mediana = np.median(pila, axis=0)
            cerca = (np.abs(pila - mediana).max(axis=3) <= cfg.get("umbral_estatico", 3.0)).mean(axis=0)
            fija |= cerca >= cfg.get("frac_estatico", 0.7)
    return fija


def invertir(frame, arbol, vals, fija):
    zona = recortar(frame)
    d, idx = arbol.query(a_lab(zona))
    campo = vals[idx].astype(float).reshape(zona.shape[:2])
    malo = (d.reshape(zona.shape[:2]) > DIST_MAX) | fija    # no pertenece a la paleta
    b = cfg.get("borde_px", 1)
    if b > 0 and malo.any():                               # quita el halo antialias
        malo = cv2.dilate(malo.astype(np.uint8), np.ones((2 * b + 1, 2 * b + 1), np.uint8)) > 0
    campo[malo] = np.nan
    return campo


t_inicio = time.time()
fps_video = cv2.VideoCapture(cfg["video"]).get(cv2.CAP_PROP_FPS) or 30
paso = max(1, round(fps_video / cfg["fps_muestreo"]))
fija = mascara_fija(paso)
if fija.any():
    print(f"Máscara fija: {fija.mean():.1%} del recorte descartado (estático o marcado a mano)")

if cfg.get("ponderar_latitud"):
    _h = fija.shape[0]
    PESOS_FILA = np.cos(np.deg2rad(90 - (np.arange(_h) + 0.5) * 180 / _h))   # latitud del centro de cada fila
else:
    PESOS_FILA = None
FECHAS = None
if cfg.get("fechas"):
    with open(cfg["fechas"]) as fh:
        FECHAS = [l.strip() for l in fh if l.strip() and not l.startswith("#")]


def media_campo(campo):
    """Media de los píxeles válidos; con ponderar_latitud, cada fila pesa cos(latitud)."""
    if PESOS_FILA is None:
        return float(np.nanmean(campo))
    v = ~np.isnan(campo)
    return float((np.where(v, campo, 0).sum(axis=1) * PESOS_FILA).sum() / (v.sum(axis=1) * PESOS_FILA).sum())


rasgos, arbol, previo, cx_previo = [], None, None, 0.5
for k, frame in fotogramas_muestreados(cfg["video"], paso):
    if arbol is None:
        cv2.imwrite(sal("fotograma_ref.png"), frame)    # para medir rectángulos a mano
        arbol, vals = tabla_desde_barra(frame)
    campo = invertir(frame, arbol, vals, fija)
    validos = ~np.isnan(campo)
    caliente = (campo > cfg["umbral"]) & validos
    area = caliente.sum() / max(validos.sum(), 1)
    if validos.any():
        media = media_campo(campo)
        # centroide de lo que está POR ENCIMA de la media, ponderado por el exceso AL
        # CUADRADO: así domina la zona caliente y no las ondulaciones suaves del fondo.
        exceso = np.nan_to_num(np.clip(campo - media, 0, None)) ** 2
        peso_col = exceso.sum(axis=0)
        cx = float((peso_col * np.arange(len(peso_col))).sum() / peso_col.sum() / len(peso_col)) \
            if peso_col.sum() > 0 else cx_previo
    else:                                          # fotograma sin datos: se repite el anterior
        media = previo if previo is not None else (cfg["vmin"] + cfg["vmax"]) / 2
        cx = cx_previo
        print(f"Aviso: t={k / fps_video:.2f} s sin píxeles válidos; se repite el valor anterior")
    rasgos.append({
        "t": round(k / fps_video, 3),
        **({"fecha": (lambda f: int(f) if f.isdigit() else f)(FECHAS[min(k, len(FECHAS) - 1)])} if FECHAS else {}),
        "media": round(media, 4),
        "area": round(float(area), 4),
        "centroide_x": round(float(cx), 4),            # 0 = izquierda, 1 = derecha
        "cambio": round(0.0 if previo is None else media - previo, 4),
        "validos": round(float(validos.mean()), 3),
    })
    previo, cx_previo = media, cx

salida = {"fuente": cfg["video"], "vmin": cfg["vmin"], "vmax": cfg["vmax"],
          "fps_rasgos": fps_video / paso, "rasgos": rasgos}
if cfg.get("referencia") is not None:
    salida["referencia"] = cfg["referencia"]
for k in ("vmin_sonido", "vmax_sonido", "densidad_umbrales", "dron_octava", "dron_nivel",
          "instrumento_melodia", "reverb", "ligar", "suavizado", "densidad", "octava", "dron_programa",
          "humanizar"):
    if cfg.get(k) is not None:
        salida[k] = cfg[k]
with open(sal("rasgos.json"), "w") as fh:
    json.dump(salida, fh, indent=1)
print(f"{len(rasgos)} fotogramas analizados -> {sal('rasgos.json')}  ({time.time() - t_inicio:.1f} s)")
for r in rasgos[:: max(1, len(rasgos) // 6)]:
    print(r)
_m = [r["media"] for r in rasgos]
print(f"media entre {min(_m):.3f} y {max(_m):.3f}: pon vmin_sonido/vmax_sonido en el config cerca de estos "
      f"valores (y densidad_umbrales) para que la melodía use toda la escala")
