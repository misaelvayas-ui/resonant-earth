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
  "fechas": null            ruta a un time.txt (una línea por fotograma del video) o a un archivo
                            "ID  AAAA-MM-DDTHH:MMZ" (se usa la 2.ª columna): añade el campo "fecha" a
                            cada rasgo (ver fechas.py)
  "fechas_formato": "anio"  "anio" -> 2007 | "mes" -> "mar 2007" (solo con fechas ISO; GISTEMP sigue en año)
  "modo_color": "lab"       "lab": color más cercano en CIE Lab (paletas que el video reproduce igual que
                            la barra). "matiz": solo cuenta el MATIZ (HSV): para videos cuyo color pierde
                            brillo/saturación según otra variable (líneas de flujo sobre fondo oscuro, p. ej.
                            ECCO2). Entonces 'dist_max' son unidades de matiz de OpenCV (0-179; 2 = 4°)
  "validos_min": 0.5 (0.1 con "matiz")   AVISO si la mediana de 'validos' queda por debajo (en "matiz" solo las
                            líneas brillantes son dato, p. ej. ~0,26 en ECCO2)
  "brillo_min", "saturacion_min": 60, 60   (solo "matiz") V y S mínimos (0-255) para que un píxel cuente;
                            descartan el fondo oscuro y la tierra gris
  "referencia": null        valor que 06 usa para el dron (se copia a rasgos.json)
  "vmin_sonido", "vmax_sonido": null   rango que 06 usa para mapear media -> nota (por defecto
                            vmin/vmax; se copian a rasgos.json). No afectan a la paleta de 05
  "dron_octava", "dron_nivel", "instrumento_melodia", "dron_programa", "reverb", "ligar", "suavizado",
  "densidad", "octava", "humanizar", "densidad_umbrales", "regolpe_ligado", "regolpe_vel", "umbral_evento", "paneo": null   ajustes musicales de 06 (ver su cabecera; valores por defecto
                            allí); se copian a rasgos.json
"""
import json
import sys
import time
import numpy as np
import cv2
from scipy.spatial import cKDTree
from rutas import sal, cfg_ruta
from fechas import FORMATOS, etiqueta, leer_fechas
from parametros import CLAVES_MUSICALES

MAX_REF = 31   # fotogramas de referencia para la máscara estática (se guardan hasta 2*MAX_REF)
OBLIGATORIAS = ("video", "mapa", "barra", "vmin", "vmax", "umbral", "fps_muestreo", "barra_vertical")


# ----------------------------------------------------------------------------- configuración
def leer_config(ruta):
    """Lee el config y sale con un mensaje claro si falta, está roto o le faltan claves."""
    try:
        with open(ruta) as fh:
            cfg = json.load(fh)
    except FileNotFoundError:
        sys.exit(f"No existe el config '{ruta}'. Créalo con 04 (video sintético) o con "
                 "'python -m herramientas.calibrar', o pasa su ruta como argumento.")
    except json.JSONDecodeError as e:
        sys.exit(f"El config '{ruta}' no es un JSON válido: {e}")
    faltan = [k for k in OBLIGATORIAS + (("barra_arriba_es_max",) if cfg.get("barra_vertical") else ())
              if k not in cfg]
    if faltan:
        sys.exit(f"Faltan claves obligatorias en '{ruta}': {', '.join(faltan)} (ver la cabecera de 05 y el README).")
    modo = cfg.get("modo_color", "lab")
    if modo not in ("lab", "matiz"):
        sys.exit(f"'modo_color' = {modo!r} no es válido: usa \"lab\" o \"matiz\".")
    if cfg.get("fechas_formato", "anio") not in FORMATOS:
        sys.exit(f"'fechas_formato' = {cfg['fechas_formato']!r} no es válido: usa " + " o ".join(f'"{f}"' for f in FORMATOS) + ".")
    return cfg


def modo_color(cfg):
    return cfg.get("modo_color", "lab")


def abrir_y_validar_video(cfg):
    """Comprueba que el video abre y que los rectángulos caben. Devuelve los fps del video."""
    cap = cv2.VideoCapture(cfg["video"])
    if not cap.isOpened():
        sys.exit(f"No se pudo abrir el video '{cfg['video']}'. Revisa la ruta (se ejecuta desde la raíz del proyecto).")
    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30
    ancho, alto = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    for nombre in ("mapa",) + (() if cfg.get("barra_imagen") else ("barra",)):
        x0, y0, x1, y1 = cfg[nombre]
        if not (0 <= x0 < x1 <= ancho and 0 <= y0 < y1 <= alto):
            sys.exit(f"'{nombre}' = {cfg[nombre]} se sale del video ({ancho}x{alto}). Los rectángulos van "
                     "en píxeles del video original [x0, y0, x1, y1]; mídelos en salidas/fotograma_ref.png.")
    if cfg.get("barra_imagen"):
        png = leer_barra_png(cfg)
        x0, y0, x1, y1 = cfg["barra"]
        if not (0 <= x0 < x1 <= png.shape[1] and 0 <= y0 < y1 <= png.shape[0]):
            sys.exit(f"'barra' = {cfg['barra']} se sale del PNG de la barra ({png.shape[1]}x{png.shape[0]}). Con "
                     "'barra_imagen' el rectángulo va en píxeles de ese PNG, no del video.")
    return fps_video


def leer_barra_png(cfg):
    """Barra de colores que viene como imagen aparte (p. ej. SVS 5207)."""
    png = cv2.imread(cfg["barra_imagen"])
    if png is None:
        sys.exit(f"No se pudo leer la barra '{cfg['barra_imagen']}'. Revisa la ruta.")
    return png


# ----------------------------------------------------------------------------- color -> valor
def a_lab(bgr):
    """BGR (0-255) -> CIE Lab real (L 0-100). Con uint8, OpenCV escala L a 0-255 y la
    distancia dejaría de ser ΔE; por eso se convierte en float32 dentro de [0, 1]."""
    bgr = np.asarray(bgr, dtype=np.float32).reshape(-1, 1, 3) / 255
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)


class TablaMatiz:
    """Como cKDTree pero por MATIZ (HSV de OpenCV, 0-179, circular): query(bgr Nx3) -> (distancia en
    unidades de matiz, índice en la barra). Un píxel con poca saturación o brillo (tierra gris, fondo
    oscuro) devuelve distancia infinita: su matiz es ruido."""

    def __init__(self, perfil_bgr, s_min, v_min):
        h = cv2.cvtColor(np.round(perfil_bgr).astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_BGR2HSV)[:, 0, 0]
        h = np.rad2deg(np.unwrap(np.deg2rad(h.astype(float) * 2))) / 2     # continuo (el rojo 177 -> -3)
        self.orden = np.argsort(h)
        self.h = h[self.orden]
        self.s_min, self.v_min = s_min, v_min

    def query(self, bgr):
        hsv = cv2.cvtColor(np.ascontiguousarray(bgr, np.uint8).reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
        mejor, idx = np.full(len(hsv), np.inf), np.zeros(len(hsv), int)
        for vuelta in (-180, 0, 180):                       # el matiz es circular: se prueba cada vuelta
            p = hsv[:, 0].astype(float) + vuelta
            j = np.clip(np.searchsorted(self.h, p), 1, len(self.h) - 1)
            izq = np.abs(p - self.h[j - 1]) <= np.abs(p - self.h[j])
            j = np.where(izq, j - 1, j)
            d = np.abs(p - self.h[j])
            mejor, idx = np.where(d < mejor, d, mejor), np.where(d < mejor, self.orden[j], idx)
        mejor[(hsv[:, 1] < self.s_min) | (hsv[:, 2] < self.v_min)] = np.inf
        return mejor, idx


def tira_barra(frame, cfg):
    """Recorte de la barra de colores, tal como viene en el fotograma."""
    x0, y0, x1, y1 = cfg["barra"]
    return frame[y0:y1, x0:x1]


def perfil_barra(tira, cfg):
    """Color medio de la barra a lo largo de su eje, (N, 3) BGR: promediar a lo ancho quita ruido de compresión."""
    return tira.mean(axis=1 if cfg["barra_vertical"] else 0)


def tabla_desde_barra(frame, cfg):
    """Devuelve (buscador de colores, valores asociados) leyendo la barra."""
    if cfg.get("barra_imagen"):            # p. ej. SVS 5207 trae la barra como PNG aparte
        frame = leer_barra_png(cfg)
    perfil = perfil_barra(tira_barra(frame, cfg), cfg)
    vals = np.linspace(cfg["vmin"], cfg["vmax"], len(perfil))
    if cfg["barra_vertical"] and cfg["barra_arriba_es_max"]:
        vals = vals[::-1]
    if modo_color(cfg) == "matiz":
        s_min, v_min = cfg.get("saturacion_min", 60), cfg.get("brillo_min", 60)
        avisar_barra_gris(perfil, s_min, v_min)
        return TablaMatiz(perfil, s_min, v_min), vals
    return cKDTree(a_lab(perfil)), vals


def avisar_barra_gris(perfil, s_min, v_min):
    """Avisa si parte de la barra no tiene matiz legible (blanco o gris): esos valores no se pueden leer en modo matiz."""
    hsv_b = cv2.cvtColor(np.round(perfil).astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    gris = float(((hsv_b[:, 1] < s_min) | (hsv_b[:, 2] < v_min)).mean())
    if gris > 0.02:
        print(f"AVISO: el {gris:.0%} de la barra tiene saturación o brillo por debajo de saturacion_min/brillo_min: "
              "esos valores no se pueden leer por matiz (¿paleta con blanco o gris? Usa modo_color \"lab\").")


def barra_con_degradado(frame, cfg):
    """True si la tira de la barra tiene contraste (un fotograma negro o de título no sirve)."""
    return np.ptp(perfil_barra(tira_barra(frame, cfg).astype(float), cfg), axis=0).max() > 30


# ----------------------------------------------------------------------------- fotogramas y recorte
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


def tam_recorte(cfg):
    """(ancho, alto) del recorte del mapa tras aplicar 'escala'."""
    x0, y0, x1, y1 = cfg["mapa"]
    esc = cfg.get("escala", 1.0)
    return max(1, round((x1 - x0) * esc)), max(1, round((y1 - y0) * esc))


def recortar(frame, cfg):
    """Recorte del mapa (rectángulo en píxeles originales), reducido según 'escala'."""
    x0, y0, x1, y1 = cfg["mapa"]
    zona = frame[y0:y1, x0:x1]
    if cfg.get("escala", 1.0) != 1.0:
        zona = cv2.resize(zona, tam_recorte(cfg), interpolation=cv2.INTER_AREA)
    return zona


# ----------------------------------------------------------------------------- máscara de lo que no es dato
def mascara_a_mano(cfg, ancho, alto):
    """True donde el PNG 'mascara_imagen' es negro."""
    m = cv2.imread(cfg["mascara_imagen"], cv2.IMREAD_GRAYSCALE)
    if m is None:
        sys.exit(f"No se pudo leer la máscara '{cfg['mascara_imagen']}'.")
    if m.shape != (alto, ancho):
        m = cv2.resize(m, (ancho, alto), interpolation=cv2.INTER_NEAREST)
    return m == 0


def fotogramas_de_referencia(cfg, paso):
    """Hasta ~2*MAX_REF recortes repartidos a lo largo del video (acota la memoria)."""
    ref, cada, i = [], 1, 0
    for _, frame in fotogramas_muestreados(cfg["video"], paso):
        if i % cada == 0:
            ref.append(recortar(frame, cfg).copy())
        i += 1
        if len(ref) > 2 * MAX_REF:
            ref, cada = ref[::2], cada * 2
    return ref


def mascara_de_estaticos(cfg, ref):
    """True donde el píxel casi nunca se aparta de su mediana temporal (tierra, logos, textos)."""
    pila = np.stack(ref).astype(np.int16)
    # por bandas de filas: la mediana y la resta nunca se materializan para todo el recorte
    # (a 1080p sin bandas, la resta en float64 pedía ~3 GB); el resultado es el mismo
    cerca = np.empty(pila.shape[1:3])
    for y in range(0, pila.shape[1], 32):
        sub = pila[:, y:y + 32]
        dif = np.abs(sub - np.median(sub, axis=0)).max(axis=3)
        cerca[y:y + 32] = (dif <= cfg.get("umbral_estatico", 3.0)).mean(axis=0)
    return cerca >= cfg.get("frac_estatico", 0.7)


def mascara_fija(cfg, paso):
    """True = píxel del recorte que NO es dato (estático o marcado a mano)."""
    ancho, alto = tam_recorte(cfg)
    fija = np.zeros((alto, ancho), bool)
    if cfg.get("mascara_imagen"):
        fija |= mascara_a_mano(cfg, ancho, alto)
    if cfg.get("mascara_estatica", True):
        ref = fotogramas_de_referencia(cfg, paso)
        if len(ref) >= 3:
            fija |= mascara_de_estaticos(cfg, ref)
    return fija


def invertir(frame, arbol, vals, fija, cfg):
    """Fotograma -> campo de valores del recorte (NaN donde no hay dato)."""
    zona = recortar(frame, cfg)
    d, idx = arbol.query(zona.reshape(-1, 3) if modo_color(cfg) == "matiz" else a_lab(zona))
    campo = vals[idx].astype(float).reshape(zona.shape[:2])
    malo = (d.reshape(zona.shape[:2]) > cfg.get("dist_max", 8.0)) | fija    # no pertenece a la paleta
    b = cfg.get("borde_px", 1)
    if b > 0 and malo.any():                               # quita el halo antialias
        malo = cv2.dilate(malo.astype(np.uint8), np.ones((2 * b + 1, 2 * b + 1), np.uint8)) > 0
    campo[malo] = np.nan
    return campo


# ----------------------------------------------------------------------------- rasgos de un fotograma
def pesos_por_fila(cfg, alto):
    """Con 'ponderar_latitud': cos(latitud del centro de cada fila). Sin ella: None."""
    if not cfg.get("ponderar_latitud"):
        return None
    return np.cos(np.deg2rad(90 - (np.arange(alto) + 0.5) * 180 / alto))


def media_campo(campo, pesos_fila):
    """Media de los píxeles válidos; con ponderar_latitud, cada fila pesa cos(latitud)."""
    if pesos_fila is None:
        return float(np.nanmean(campo))
    v = ~np.isnan(campo)
    return float((np.where(v, campo, 0).sum(axis=1) * pesos_fila).sum() / (v.sum(axis=1) * pesos_fila).sum())


def centroide_y(caliente, previo):
    """Latitud media (ponderada por cos(lat), el área real de cada píxel) de lo que está sobre el umbral;
    0 = sur, 1 = norte; si no hay nada, el valor anterior. Supone que el recorte va de +90 a -90."""
    if not caliente.any():
        return previo
    lat = 90 - (np.arange(caliente.shape[0]) + 0.5) * 180 / caliente.shape[0]
    w = caliente.sum(axis=1) * np.cos(np.deg2rad(lat))
    return float((w * lat).sum() / w.sum() + 90) / 180


def centroide_x(campo, media, previo):
    """Centroide de lo que está POR ENCIMA de la media, ponderado por el exceso AL CUADRADO: así
    domina la zona caliente y no las ondulaciones suaves del fondo. 0 = izquierda, 1 = derecha."""
    exceso = np.nan_to_num(np.clip(campo - media, 0, None)) ** 2
    peso_col = exceso.sum(axis=0)
    if peso_col.sum() > 0:
        return float((peso_col * np.arange(len(peso_col))).sum() / peso_col.sum() / len(peso_col))
    return previo


def extraer_rasgos(cfg, paso, fps_video, fija, fechas):
    """Recorre el video y devuelve (lista de rasgos, índice del último fotograma leído)."""
    pesos_fila = pesos_por_fila(cfg, fija.shape[0])
    rasgos, arbol, vals, previo, cx_previo, cy_previo, k = [], None, None, None, 0.5, 0.5, 0
    for k, frame in fotogramas_muestreados(cfg["video"], paso):
        if arbol is None:
            if not cfg.get("barra_imagen") and not barra_con_degradado(frame, cfg):
                continue          # video que abre en negro/título: se espera al primer fotograma con barra
            cv2.imwrite(sal("fotograma_ref.png"), frame)    # para medir rectángulos a mano
            arbol, vals = tabla_desde_barra(frame, cfg)
        campo = invertir(frame, arbol, vals, fija, cfg)
        validos = ~np.isnan(campo)
        caliente = (campo > cfg["umbral"]) & validos
        area = caliente.sum() / max(validos.sum(), 1)
        cy = centroide_y(caliente, cy_previo)
        if validos.any():
            media = media_campo(campo, pesos_fila)
            cx = centroide_x(campo, media, cx_previo)
        else:                                          # fotograma sin datos: se repite el anterior
            media = previo if previo is not None else (cfg["vmin"] + cfg["vmax"]) / 2
            cx = cx_previo
            print(f"Aviso: t={k / fps_video:.2f} s sin píxeles válidos; se repite el valor anterior")
        rasgos.append({
            "t": round(k / fps_video, 3),
            **({"fecha": etiqueta(fechas[min(k, len(fechas) - 1)], cfg.get("fechas_formato", "anio"))} if fechas else {}),
            "media": round(media, 4),
            "area": round(float(area), 4),
            "centroide_x": round(float(cx), 4),            # 0 = izquierda, 1 = derecha
            "centroide_y": round(float(cy), 4),            # 0 = sur, 1 = norte
            "cambio": round(0.0 if previo is None else media - previo, 4),
            "validos": round(float(validos.mean()), 3),
        })
        previo, cx_previo, cy_previo = media, cx, cy
    return rasgos, k


# ----------------------------------------------------------------------------- salida
def avisar_problemas(cfg, rasgos, fechas, ultimo_k):
    """Avisos que no detienen el proceso: fechas que no alcanzan, mapa que casi no coincide con la barra y
    rango de sonido que no cubre los datos."""
    if fechas and ultimo_k > len(fechas) - 1:
        print(f"AVISO: '{cfg['fechas']}' tiene {len(fechas)} líneas y el video llega al fotograma {ultimo_k}: "
              f"la última fecha ({fechas[-1]}) se repite al final.")
    mediana = float(np.median([r["validos"] for r in rasgos]))
    matiz = modo_color(cfg) == "matiz"
    minimo = cfg.get("validos_min", 0.1 if matiz else 0.5)   # en "matiz" solo cuentan las líneas brillantes
    if mediana < minimo:
        print(f"AVISO: la mediana de 'validos' es {mediana:.2f} (< {minimo:g}): casi ningún píxel del mapa coincide con la barra. "
              f"Revisa 'mapa', 'barra', 'vmin/vmax' y 'dist_max' (mira {sal('fotograma_ref.png')})."
              + (" En modo matiz revisa también 'borde_px' (0 con líneas finas), 'brillo_min' y 'saturacion_min'." if matiz else ""))
    if cfg.get("vmin_sonido") is not None and cfg.get("vmax_sonido") is not None and not cfg.get("rasgo_tono"):
        fuera = sum(not cfg["vmin_sonido"] <= r["media"] <= cfg["vmax_sonido"] for r in rasgos)
        if fuera > 0.2 * len(rasgos):
            print(f"AVISO: {fuera} de {len(rasgos)} fotogramas tienen la media fuera de vmin_sonido..vmax_sonido "
                  f"({cfg['vmin_sonido']}..{cfg['vmax_sonido']}): la melodía se quedará pegada a la nota más alta o más baja. "
                  "Vuelve a medir el rango (y 'referencia') con los valores de abajo.")


def armar_salida(cfg, rasgos, fps_rasgos):
    """El contenido de rasgos.json: los rasgos más los ajustes de sonido que 06 necesita."""
    salida = {"fuente": cfg["video"], "vmin": cfg["vmin"], "vmax": cfg["vmax"],
              "fps_rasgos": fps_rasgos, "rasgos": rasgos}
    if cfg.get("referencia") is not None:
        salida["referencia"] = cfg["referencia"]
    for clave in CLAVES_MUSICALES:
        if cfg.get(clave) is not None:
            salida[clave] = cfg[clave]
    return salida


def imprimir_resumen(rasgos, segundos):
    print(f"{len(rasgos)} fotogramas analizados -> {sal('rasgos.json')}  ({segundos:.1f} s)")
    for r in rasgos[:: max(1, len(rasgos) // 6)]:
        print(r)
    medias = [r["media"] for r in rasgos]
    print(f"media entre {min(medias):.3f} y {max(medias):.3f}: pon vmin_sonido/vmax_sonido en el config cerca de estos "
          f"valores (y densidad_umbrales) para que la melodía use toda la escala")


def main():
    cfg = leer_config(sys.argv[1] if len(sys.argv) > 1 else cfg_ruta("config_video.json"))
    t_inicio = time.time()
    fps_video = abrir_y_validar_video(cfg)
    paso = max(1, round(fps_video / cfg["fps_muestreo"]))
    fija = mascara_fija(cfg, paso)
    if fija.any():
        print(f"Máscara fija: {fija.mean():.1%} del recorte descartado (estático o marcado a mano)")
    fechas = leer_fechas(cfg["fechas"]) if cfg.get("fechas") else None
    rasgos, ultimo_k = extraer_rasgos(cfg, paso, fps_video, fija, fechas)
    if not rasgos:
        sys.exit(f"Ningún fotograma del video tiene el degradado de la barra en {cfg['barra']}: revisa 'barra' "
                 "(¿coordenadas de otra resolución?). rasgos.json no se modificó.")
    avisar_problemas(cfg, rasgos, fechas, ultimo_k)
    with open(sal("rasgos.json"), "w") as fh:
        json.dump(armar_salida(cfg, rasgos, fps_video / paso), fh, indent=1)
    imprimir_resumen(rasgos, time.time() - t_inicio)


if __name__ == "__main__":
    main()
