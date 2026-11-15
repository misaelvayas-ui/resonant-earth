"""
04 — Video de prueba con verdad conocida: mapa 'viridis', barra vertical a la derecha y un título que hay que recortar.

Lo que el audio debe contar:
  - la media sube de ~0,12 a ~0,64            -> el tono sube
  - una mancha caliente cruza de izq. a der.  -> el sonido va de L a R
  - el área caliente crece                    -> el volumen sube
"""
import json
import sys
import numpy as np
from rutas import sal, cfg_ruta
import cv2
from matplotlib import colormaps

W, H, FPS = 640, 360, 20
DUR = int(sys.argv[1]) if len(sys.argv) > 1 else 10   # segundos (opcional: python 04_video_sintetico.py 2)
MAPA = (20, 40, 540, 340)      # x0, y0, x1, y1 de la zona de datos
BARRA = (580, 40, 600, 340)    # x0, y0, x1, y1 de la barra de colores (arriba = vmax)
VMIN, VMAX = 0.0, 1.0
cmap = colormaps["viridis"]


def a_bgr(valores):
    rgba = cmap(np.clip((valores - VMIN) / (VMAX - VMIN), 0, 1))
    return (rgba[..., :3][..., ::-1] * 255).astype(np.uint8)  # RGB -> BGR (OpenCV)


x0, y0, x1, y1 = MAPA
mh, mw = y1 - y0, x1 - x0
yy, xx = np.mgrid[0:mh, 0:mw]

# barra de colores (constante)
bx0, by0, bx1, by1 = BARRA
col_barra = np.linspace(VMAX, VMIN, by1 - by0)[:, None].repeat(bx1 - bx0, 1)
img_barra = a_bgr(col_barra)

out = cv2.VideoWriter(sal("04_video_sintetico.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
n_frames = FPS * DUR
for k in range(n_frames):
    p = k / (n_frames - 1)                                    # 0 -> 1
    fondo = 0.1 + 0.5 * p + 0.03 * np.sin(xx / 25 + 6 * p)   # sube de 0.1 a ~0.6
    cx, cy = 0.1 * mw + 0.8 * mw * p, mh / 2                  # tormenta de izq. a der.
    sig = 25 + 35 * p                                         # y crece
    tormenta = 0.45 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sig ** 2))
    campo = np.clip(fondo + tormenta, VMIN, VMAX)

    frame = np.full((H, W, 3), 255, np.uint8)                 # fondo blanco
    frame[y0:y1, x0:x1] = a_bgr(campo)
    frame[by0:by1, bx0:bx1] = img_barra
    cv2.putText(frame, f"Anomalia sintetica  t={k / FPS:4.1f}s", (20, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    cv2.putText(frame, "1.0", (603, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.putText(frame, "0.0", (603, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    out.write(frame)
out.release()

# Configuración que leerá el script 05 (para un video real, la editas a mano)
cfg = {"video": sal("04_video_sintetico.mp4"), "mapa": MAPA, "barra": BARRA,
       "barra_vertical": True, "barra_arriba_es_max": True, "vmin": VMIN, "vmax": VMAX,
       "umbral": 0.7, "fps_muestreo": 4,
       "dist_max": 8.0, "mascara_estatica": True, "umbral_estatico": 3.0, "frac_estatico": 0.7, "borde_px": 1}
with open(cfg_ruta("config_video.json"), "w") as fh:
    json.dump(cfg, fh, indent=2)
print(f"Video: {sal('04_video_sintetico.mp4')} ({n_frames} fotogramas). Config: {cfg_ruta('config_video.json')}")
