"""
04 — Genera un video de PRUEBA con verdad conocida (tu "señal patrón").

Imita una visualización del EIC: mapa de calor con colormap 'viridis', barra de
colores vertical a la derecha y un título de texto (para practicar recortarlo).

Verdad conocida (lo que el audio DEBE contar):
  - el valor medio sube de ~0.12 a ~0.64 (fondo + tormenta) -> el tono debe SUBIR
  - una "tormenta" (mancha caliente) cruza de izq. a der. -> el sonido debe ir de L a R
  - el área caliente crece con el tiempo                   -> el volumen debe SUBIR
"""
import json
import sys
import numpy as np
from escritor_video import abrir_escritor
from rutas import sal, cfg_ruta
import cv2
from matplotlib import colormaps

W, H, FPS = 640, 360, 20
DUR_DEFECTO = 10               # segundos (opcional: python 04_video_sintetico.py 2)
MAPA = (20, 40, 540, 340)      # x0, y0, x1, y1 de la zona de datos
BARRA = (580, 40, 600, 340)    # x0, y0, x1, y1 de la barra de colores (arriba = vmax)
VMIN, VMAX = 0.0, 1.0
PALETA = colormaps["viridis"]


def a_bgr(valores):
    rgba = PALETA(np.clip((valores - VMIN) / (VMAX - VMIN), 0, 1))
    return (rgba[..., :3][..., ::-1] * 255).astype(np.uint8)  # RGB -> BGR (OpenCV)


def imagen_barra():
    """Barra de colores (constante en todo el video): arriba = VMAX."""
    bx0, by0, bx1, by1 = BARRA
    columna = np.linspace(VMAX, VMIN, by1 - by0)[:, None].repeat(bx1 - bx0, 1)
    return a_bgr(columna)


def campo_en(p, xx, yy):
    """Campo de datos en el instante p (0 = inicio, 1 = final): fondo que sube + tormenta que cruza."""
    mh, mw = xx.shape
    fondo = 0.1 + 0.5 * p + 0.03 * np.sin(xx / 25 + 6 * p)   # sube de 0.1 a ~0.6
    cx, cy = 0.1 * mw + 0.8 * mw * p, mh / 2                  # tormenta de izq. a der.
    sig = 25 + 35 * p                                         # y crece
    tormenta = 0.45 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sig ** 2))
    return np.clip(fondo + tormenta, VMIN, VMAX)


def dibujar_fotograma(campo, barra, segundo):
    """Fotograma completo: fondo blanco, mapa, barra de colores y textos."""
    x0, y0, x1, y1 = MAPA
    bx0, by0, bx1, by1 = BARRA
    frame = np.full((H, W, 3), 255, np.uint8)                 # fondo blanco
    frame[y0:y1, x0:x1] = a_bgr(campo)
    frame[by0:by1, bx0:bx1] = barra
    cv2.putText(frame, f"Anomalia sintetica  t={segundo:4.1f}s", (20, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    cv2.putText(frame, "1.0", (603, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.putText(frame, "0.0", (603, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    return frame


def escribir_video(ruta, dur):
    """Escribe el video de 'dur' segundos y devuelve cuántos fotogramas tiene."""
    x0, y0, x1, y1 = MAPA
    yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]
    barra = imagen_barra()
    out = abrir_escritor(ruta, FPS, (W, H))
    n_frames = FPS * dur
    for k in range(n_frames):
        p = k / (n_frames - 1)                                # 0 -> 1
        out.write(dibujar_fotograma(campo_en(p, xx, yy), barra, k / FPS))
    out.release()
    return n_frames


def escribir_config(ruta, ruta_video):
    """Configuración que leerá el script 05 (para un video real, la editas a mano)."""
    cfg = {"video": ruta_video, "mapa": MAPA, "barra": BARRA,
           "barra_vertical": True, "barra_arriba_es_max": True, "vmin": VMIN, "vmax": VMAX,
           "umbral": 0.7, "fps_muestreo": 4,
           "dist_max": 8.0, "mascara_estatica": True, "umbral_estatico": 3.0, "frac_estatico": 0.7, "borde_px": 1}
    with open(ruta, "w") as fh:
        json.dump(cfg, fh, indent=2)


def main():
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else DUR_DEFECTO
    ruta_video, ruta_cfg = sal("04_video_sintetico.mp4"), cfg_ruta("config_video.json")
    n_frames = escribir_video(ruta_video, dur)
    escribir_config(ruta_cfg, ruta_video)
    print(f"Video: {ruta_video} ({n_frames} fotogramas). Config: {ruta_cfg}")


if __name__ == "__main__":
    main()
