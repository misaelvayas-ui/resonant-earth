"""
exportar_paleta.py — guarda la barra de colores de cada pista como tabla color -> valor para la web.

    python -m herramientas.exportar_paleta

La web la usa en «Explorar el mapa»: lee el color del píxel bajo el cursor en el fotograma del video, busca el color
más parecido de esta tabla y lo toca. Es la misma barra y el mismo rango (vmin, vmax) que usa 05.
Necesita los PNG de las barras en datos/ (ver README): giss_navy_anomaly_Vertical-both.png y sst_ecco2_cbar.png.
"""
import json
import os
import sys

import cv2
import numpy as np

N = 64
PISTAS = [("gistemp_1880_2023", os.path.join("config", "config_eic.json"), "°C"),
          ("sst_ecco2_2007_2008", os.path.join("config", "config_sst.json"), "°C")]
DESTINO = os.path.join("web", "assets")


def paleta(cfg):
    """N colores RGB de vmin a vmax, leídos de la barra del config."""
    img = cv2.imread(cfg["barra_imagen"], cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f"No pude leer la barra {cfg['barra_imagen']} (descárgala en datos/, ver README).")
    x0, y0, x1, y1 = cfg["barra"]
    rec = img[y0:y1, x0:x1].astype(np.float64)
    if cfg.get("barra_vertical"):
        linea = np.median(rec, axis=1)                       # un color por fila
        if cfg.get("barra_arriba_es_max", True):
            linea = linea[::-1]
    else:
        linea = np.median(rec, axis=0)                       # un color por columna (mínimo a la izquierda)
    idx = np.linspace(0, len(linea) - 1, N).round().astype(int)
    return [[int(round(c)) for c in linea[i][::-1]] for i in idx]      # BGR -> RGB


def main():
    if not os.path.isdir("herramientas"):
        sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.exportar_paleta")
    for id_, ruta_cfg, unidad in PISTAS:
        with open(ruta_cfg) as fh:
            cfg = json.load(fh)
        doc = {"id": id_, "barra": os.path.basename(cfg["barra_imagen"]), "vmin": cfg["vmin"], "vmax": cfg["vmax"],
               "unidad": unidad, "modo_color": cfg.get("modo_color", "lab"),
               "brillo_min": cfg.get("brillo_min", 60), "saturacion_min": cfg.get("saturacion_min", 60),
               "colores": paleta(cfg)}
        salida = os.path.join(DESTINO, id_ + "_paleta.json")
        with open(salida, "w") as fh:
            json.dump(doc, fh, separators=(",", ":"))
            fh.write("\n")
        print(f"{salida}: {N} colores de {doc['vmin']} a {doc['vmax']} {unidad} ({doc['modo_color']}); "
              f"extremos {doc['colores'][0]} … {doc['colores'][-1]}")


if __name__ == "__main__":
    main()
