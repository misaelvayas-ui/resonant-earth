"""calibrar.py — prepara el config de 05 para un video real y dibuja salidas/calibracion.png para revisarlo.

Uso (desde la raíz):  python -m herramientas.calibrar [opciones]   (ver --help)
Detecta el degradado de la barra PNG (filas o columnas de un solo color; gana la orientación de mayor área) y el
mapa (filas y columnas cuyos píxeles casan con la paleta). El rango en °C no se lee (no hay OCR): se confirma a
ojo en calibracion.png y se pasa con --vmin/--vmax. Conserva las claves musicales del config que ya exista.
"""
import argparse
import json
import os
import sys

try:
    from rutas import sal, cfg_ruta
except ModuleNotFoundError:
    sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.calibrar")

import cv2
import numpy as np
from scipy.spatial import cKDTree


def _rect_por_filas(alfa, rgb):
    """(x0, y0, x1, y1) del bloque de filas contiguas donde cada fila es de un solo color, o None."""
    h, w = alfa.shape
    corridas = {}
    for y in range(h):
        mejor, x = (0, 0, 0), 0
        while x < w:
            if alfa[y, x] < 250:
                x += 1
                continue
            e = x
            while e + 1 < w and alfa[y, e + 1] >= 250 and np.abs(rgb[y, e + 1] - rgb[y, x]).max() <= 1:
                e += 1
            if e - x + 1 > mejor[0]:
                mejor = (e - x + 1, x, e + 1)
            x = e + 1
        corridas[y] = mejor
    tramos = [(r[1], r[2]) for r in corridas.values() if r[0] >= 20]
    if not tramos:
        return None
    x0, x1 = max(set(tramos), key=tramos.count)
    filas = [y for y, r in corridas.items() if (r[1], r[2]) == (x0, x1)]
    return x0, min(filas), x1, max(filas) + 1


def rect_degradado_orientado(png, orientacion="auto"):
    """((x0, y0, x1, y1), vertical) del degradado de una barra PNG (con o sin canal alfa).
    Vertical = el color cambia a lo largo del eje y (cada FILA es de un solo color)."""
    img = cv2.imread(png, cv2.IMREAD_UNCHANGED)
    if img is None:
        sys.exit(f"No se pudo leer la barra '{png}'.")
    alfa = img[..., 3] if img.ndim == 3 and img.shape[2] == 4 else np.full(img.shape[:2], 255, np.uint8)
    rgb = img[..., :3].astype(int)
    vert = _rect_por_filas(alfa, rgb) if orientacion in ("auto", "vertical") else None
    hor = _rect_por_filas(alfa.T, rgb.transpose(1, 0, 2)) if orientacion in ("auto", "horizontal") else None
    if hor is not None:
        hor = (hor[1], hor[0], hor[3], hor[2])                 # deshace la transposición
    if vert is None and hor is None:
        sys.exit("No encontré un degradado en la barra (filas o columnas de un solo color).")
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    # una barra es más larga que ancha EN LA DIRECCIÓN DEL DEGRADADO: vertical = alta, horizontal = ancha.
    # (Sin esta regla, una barra vertical también deja tramos de columnas de un solo color y la orientación de mayor área elegiría mal.)
    def forma_ok(r, vertical):
        alto, ancho = r[3] - r[1], r[2] - r[0]
        return alto >= ancho if vertical else ancho >= alto
    validas = [(r, v) for r, v in ((vert, True), (hor, False)) if r is not None and forma_ok(r, v)]
    if validas:
        return max(validas, key=lambda rv: area(rv[0]))
    return (vert, True) if vert is not None else (hor, False)       # ninguna con forma de barra: se toma la que se encontró


def rect_degradado(png):
    """Rectángulo (x0, y0, x1, y1) del degradado de una barra PNG vertical."""
    return rect_degradado_orientado(png, "vertical")[0]


def lab(bgr):
    bgr = np.asarray(bgr, dtype=np.float32).reshape(-1, 1, 3) / 255
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)


def leer_cuadro(video, posicion):
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        sys.exit(f"No se pudo abrir el video '{video}'.")
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(posicion * max(n - 1, 0)))
    ok, frame = cap.read()
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.release()
    if not ok:
        sys.exit("No se pudo leer el fotograma de referencia.")
    return frame, n, fps


def rect_mapa(frame, arbol, tol=20.0, frac=0.2, lado=0.25, borde=0.03):
    """Rectángulo del mapa: filas/columnas con >= 'frac' de píxeles que casan con la paleta (tol en
    Lab; el mapa del video suele ir más pálido que la barra). Un borde a < 3 % del fotograma se
    ajusta al borde. Devuelve (rect, distancias de los píxeles del rectángulo)."""
    s = cv2.resize(frame, None, fx=lado, fy=lado, interpolation=cv2.INTER_AREA)
    d = arbol.query(lab(s))[0].reshape(s.shape[:2])
    casa = d <= tol
    filas, cols = np.where(casa.mean(axis=1) >= frac)[0], np.where(casa.mean(axis=0) >= frac)[0]
    if len(filas) == 0 or len(cols) == 0:
        sys.exit("No encontré el mapa: ninguna fila/columna casa con la paleta de la barra.")
    h, w = s.shape[:2]
    y0, y1, x0, x1 = filas[0], filas[-1] + 1, cols[0], cols[-1] + 1
    y0, x0 = (0 if y0 < borde * h else y0), (0 if x0 < borde * w else x0)
    y1, x1 = (h if h - y1 < borde * h else y1), (w if w - x1 < borde * w else x1)
    k = 1 / lado
    return (int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k)), d[y0:y1, x0:x1]


def dibujar(frame, rect_m, barra_png, rect_b, salida, vertical=True):
    """calibracion.png: fotograma con cuadrícula y rectángulo del mapa (izquierda); barra PNG sobre
    fondo gris con su degradado enmarcado y líneas en sus extremos (derecha, para leer el rango)."""
    ancho = 1024
    k = ancho / frame.shape[1]
    s = cv2.resize(frame, (ancho, int(frame.shape[0] * k)), interpolation=cv2.INTER_AREA)
    paso = 512 if frame.shape[1] >= 2000 else 64
    for x in range(0, frame.shape[1], paso):
        cv2.line(s, (int(x * k), 0), (int(x * k), s.shape[0] - 1), (255, 255, 255), 1)
        cv2.putText(s, str(x), (int(x * k) + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    for y in range(0, frame.shape[0], paso):
        cv2.line(s, (0, int(y * k)), (ancho - 1, int(y * k)), (255, 255, 255), 1)
        cv2.putText(s, str(y), (2, int(y * k) + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    x0, y0, x1, y1 = (int(v * k) for v in rect_m)
    cv2.rectangle(s, (x0 + 1, y0 + 1), (x1 - 2, y1 - 2), (255, 0, 255), 2)             # magenta
    cv2.putText(s, "mapa", (x0 + 8, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
    img = cv2.imread(barra_png, cv2.IMREAD_UNCHANGED)
    a = img[..., 3:4] / 255.0 if img.shape[2] == 4 else np.ones(img.shape[:2] + (1,))
    c = (img[..., :3] * a + 90.0 * (1 - a)).astype(np.uint8)       # fondo gris: el texto blanco se lee
    bx0, by0, bx1, by1 = rect_b
    cv2.rectangle(c, (bx0, by0), (bx1, by1), (255, 255, 0), 1)                          # cian
    if vertical:                                       # líneas en los extremos: de ahí se lee el rango
        for y in (by0, by1):
            cv2.line(c, (0, y), (c.shape[1] - 1, y), (255, 255, 0), 1)
    else:
        for x in (bx0, bx1):
            cv2.line(c, (x, 0), (x, c.shape[0] - 1), (255, 255, 0), 1)
    c = cv2.resize(c, None, fx=0.75, fy=0.75, interpolation=cv2.INTER_AREA)
    alto = max(s.shape[0], c.shape[0])
    lienzo = np.zeros((alto, s.shape[1] + c.shape[1], 3), np.uint8)
    lienzo[:s.shape[0], :s.shape[1]] = s
    lienzo[:c.shape[0], s.shape[1]:] = c
    cv2.imwrite(salida, lienzo)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--video", default="datos/2023GISTEMP_Map_SOS.mp4")
    ap.add_argument("--barra", default=None, help="PNG de la barra de colores del video (por defecto, solo para el de GISTEMP)")
    ap.add_argument("--fechas", default=None, help="time.txt de fechas (p. ej. datos/time.txt); sin él no se añade 'fechas'")
    ap.add_argument("--vmin", type=float, help="valor del extremo bajo de la barra (léelo en calibracion.png)")
    ap.add_argument("--vmax", type=float, help="valor del extremo alto de la barra")
    ap.add_argument("--cuadro", type=float, default=0.6, help="posición del fotograma de referencia, 0-1")
    ap.add_argument("--fps-muestreo", type=float, default=2)
    ap.add_argument("--escala", type=float, help="por defecto, la que deja el mapa en ~1024 px de ancho")
    ap.add_argument("--umbral", type=float, help="valor sobre el que se mide 'area' (por defecto, el 75 %% del rango)")
    ap.add_argument("--referencia", type=float, help="valor en el que suena el dron de 06")
    ap.add_argument("--orientacion", choices=("auto", "vertical", "horizontal"), default="auto",
                    help="orientación de la barra PNG (auto: el degradado de mayor área)")
    ap.add_argument("--mapa", default=None, metavar="X0,Y0,X1,Y1",
                    help="rectángulo del mapa en píxeles del video; omite la detección automática")
    ap.add_argument("--modo-color", choices=("lab", "matiz"), default=None,
                    help="se copia a 'modo_color' (ver 05); con 'matiz' hace falta --mapa y se escriben dist_max 4, "
                         "borde_px 0 y mascara_estatica false (salvo que el config ya fuera matiz)")
    ap.add_argument("--salida", default=None, help="ruta del config (por defecto config/config_<video>.json)")
    a = ap.parse_args()

    if a.barra is None:
        if os.path.normpath(a.video) != os.path.normpath("datos/2023GISTEMP_Map_SOS.mp4"):
            sys.exit(f"Indica --barra <PNG de la barra de colores de '{a.video}'>: la de GISTEMP no sirve para otro video.")
        a.barra = "datos/giss_navy_anomaly_Vertical-both.png"
    # un config por video (no se pisan entre sí). El modo de color efectivo es el de --modo-color o, si no se
    # pasa, el del config que ya exista: así no se mezclan claves de un modo con las del otro
    ruta = a.salida or cfg_ruta("config_" + os.path.splitext(os.path.basename(a.video))[0] + ".json")
    previo = {}
    if os.path.exists(ruta):
        with open(ruta) as fh:
            previo = json.load(fh)
    modo = a.modo_color or previo.get("modo_color", "lab")
    rect_b, vertical = rect_degradado_orientado(a.barra, a.orientacion)
    print(f"Degradado de la barra PNG (x0, y0, x1, y1) = {rect_b} ({'vertical' if vertical else 'horizontal'})")
    frame, n_frames, fps = leer_cuadro(a.video, a.cuadro)
    alto, ancho = frame.shape[:2]
    img = cv2.imread(a.barra)
    perfil = img[rect_b[1]:rect_b[3], rect_b[0]:rect_b[2]].mean(axis=1 if vertical else 0)
    arbol = cKDTree(lab(perfil))
    if a.mapa is not None:
        try:
            rect_m = tuple(int(v) for v in a.mapa.split(","))
            x0, y0, x1, y1 = rect_m
        except ValueError:
            sys.exit(f"--mapa '{a.mapa}' no es válido: usa X0,Y0,X1,Y1 (enteros, píxeles del video).")
        if not (0 <= x0 < x1 <= ancho and 0 <= y0 < y1 <= alto):
            sys.exit(f"--mapa {rect_m} se sale del video ({ancho}x{alto}).")
        dist = arbol.query(lab(cv2.resize(frame[y0:y1, x0:x1], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)))[0]
    elif modo == "matiz":
        sys.exit("Con modo_color matiz indica el mapa a mano (--mapa X0,Y0,X1,Y1): la detección usa la paleta en Lab.")
    else:
        rect_m, dist = rect_mapa(frame, arbol)
    print(f"Mapa en el video (x0, y0, x1, y1) = {rect_m}  (video {ancho}x{alto}, {n_frames} fotogramas, {fps:g} fps)")
    dibujar(frame, rect_m, a.barra, rect_b, sal("calibracion.png"), vertical)
    print(f"Imagen de revisión: {sal('calibracion.png')}")
    if a.vmin is None or a.vmax is None:
        sys.exit("No puedo leer el rango de °C de la barra (las cifras son una imagen y no hay OCR).\n"
                 f"Abre {sal('calibracion.png')}, lee la cifra de arriba y la de abajo del degradado y "
                 "vuelve a ejecutar con --vmin X --vmax Y.")
    vmin, vmax = a.vmin, a.vmax
    ancho_m, alto_m = rect_m[2] - rect_m[0], rect_m[3] - rect_m[1]
    lat_ok = alto_m >= 0.97 * alto and 1.9 <= ancho_m / alto_m <= 2.1       # equirectangular completo
    # dist_max: percentil 95 de las distancias a la paleta dentro del mapa (el mapa del video es más
    # pálido que la barra), acotado a [8, 20]
    dist_max = float(np.clip(np.ceil(np.percentile(dist, 95)), 8, 20))
    cfg = {"video": a.video, "mapa": list(rect_m), "barra_imagen": a.barra, "barra": list(rect_b),
           "barra_vertical": vertical, "vmin": vmin, "vmax": vmax,
           "umbral": a.umbral if a.umbral is not None else round(vmin + 0.75 * (vmax - vmin), 3),
           "fps_muestreo": a.fps_muestreo,
           "escala": a.escala if a.escala is not None else round(min(1.0, 1024 / ancho), 3),
           "ponderar_latitud": bool(lat_ok)}
    if vertical:
        cfg["barra_arriba_es_max"] = True            # horizontal: la izquierda es vmin (05 no lo necesita)
    if modo == "matiz":
        # dist_max va en unidades de matiz (no sirve el de Lab); las líneas finas no sobreviven a borde_px = 1
        # (validos 26 % -> 7 % con ECCO2) y la máscara estática no aporta. Si el config ya era matiz, se respeta.
        era = previo.get("modo_color") == "matiz"
        cfg.update(modo_color="matiz", dist_max=previo.get("dist_max", 4.0) if era else 4.0,
                   borde_px=previo.get("borde_px", 0) if era else 0,
                   mascara_estatica=previo.get("mascara_estatica", False) if era else False)
    else:
        cfg["dist_max"] = dist_max
        if a.modo_color == "lab":
            cfg["modo_color"] = "lab"
        if previo.get("modo_color") == "matiz":      # se vuelve a Lab: no heredar los ajustes de matiz
            previo = {k: v for k, v in previo.items() if k not in ("modo_color", "borde_px", "mascara_estatica",
                                                                    "brillo_min", "saturacion_min")}
    if a.fechas:
        if not os.path.exists(a.fechas):
            sys.exit(f"No existe el archivo de fechas '{a.fechas}'.")
        cfg["fechas"] = a.fechas
    if a.referencia is not None:
        cfg["referencia"] = a.referencia
    elif vmin < 0 < vmax:
        cfg["referencia"] = 0.0
    # si el config ya existía se conservan las claves que calibrar no calcula
    if previo:
        conservar = {k: v for k, v in previo.items() if k not in cfg and k != "fechas"}
        if "fechas" in previo and "fechas" not in cfg and a.fechas is None and previo.get("video") == a.video:
            conservar["fechas"] = previo["fechas"]
        cfg.update(conservar)
        if conservar:
            print(f"Se conservaron de {ruta}: {', '.join(conservar)}")
    with open(ruta, "w") as fh:
        json.dump(cfg, fh, indent=2)
    print(f"Rango: {vmin:g} .. {vmax:g} °C | ponderar_latitud={lat_ok} | "
          f"dist_max={cfg['dist_max']:g}{' (unidades de matiz)' if modo == 'matiz' else ''} | escala={cfg['escala']}")
    print(f"Config: {ruta}")


if __name__ == "__main__":
    main()
