"""
validar_gistemp.py — compara la media que 05 extrae del video SVS 5207 con la serie oficial GISTEMP v4.

    python -m herramientas.validar_gistemp                 # usa web/assets/gistemp_1880_2023_rasgos.json
    python -m herramientas.validar_gistemp --rasgos salidas_gistemp/rasgos.json
    python -m herramientas.validar_gistemp --descargar     # refresca la tabla oficial antes de comparar
"""
import argparse
import csv
import json
import os
import sys
import urllib.request

import numpy as np

URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
TABLA = os.path.join("docs", "datos_oficiales", "GLB.Ts+dSST.csv")
RASGOS = os.path.join("web", "assets", "gistemp_1880_2023_rasgos.json")


def leer_oficial(ruta=TABLA):
    """{año: anomalía media anual (columna J-D) en °C}."""
    oficial = {}
    with open(ruta, newline="") as fh:
        filas = list(csv.reader(fh))
    cab = next(f for f in filas if f and f[0] == "Year")
    col = cab.index("J-D")
    for f in filas:
        if f and f[0].isdigit():
            try:
                oficial[int(f[0])] = float(f[col])
            except ValueError:                      # '***': año incompleto
                pass
    return oficial


def comparar(ruta_rasgos=RASGOS, ruta_tabla=TABLA):
    """Devuelve un dict con n, r, sesgo, rmse y pendientes; los años repetidos del video se promedian."""
    with open(ruta_rasgos) as fh:
        doc = json.load(fh)
    rasgos = doc["rasgos"] if isinstance(doc, dict) else doc
    por_anio = {}
    for r in rasgos:
        if r.get("media") is not None and str(r.get("fecha", "")).isdigit():
            por_anio.setdefault(int(r["fecha"]), []).append(r["media"])
    oficial = leer_oficial(ruta_tabla)
    anios = sorted(a for a in por_anio if a in oficial)
    if len(anios) < 10:
        sys.exit(f"Solo {len(anios)} años en común entre {ruta_rasgos} y {ruta_tabla}: ¿es la pista de GISTEMP?")
    video = np.array([np.mean(por_anio[a]) for a in anios])
    ofi = np.array([oficial[a] for a in anios])
    x = np.array(anios)
    desde80 = x >= 1980
    return {
        "n": len(anios), "primero": anios[0], "ultimo": anios[-1],
        "r": float(np.corrcoef(video, ofi)[0, 1]),
        "sesgo": float((video - ofi).mean()),
        "rmse": float(np.sqrt(((video - ofi) ** 2).mean())),
        "pendiente_video": float(np.polyfit(x[desde80], video[desde80], 1)[0] * 10),
        "pendiente_oficial": float(np.polyfit(x[desde80], ofi[desde80], 1)[0] * 10),
        "video_primero": float(video[0]), "oficial_primero": float(ofi[0]),
        "video_ultimo": float(video[-1]), "oficial_ultimo": float(ofi[-1]),
        "mas_frio_video": anios[int(video.argmin())], "mas_frio_oficial": anios[int(ofi.argmin())],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--rasgos", default=RASGOS)
    ap.add_argument("--tabla", default=TABLA)
    ap.add_argument("--descargar", action="store_true", help="baja de nuevo la tabla oficial de data.giss.nasa.gov")
    a = ap.parse_args()
    if not os.path.isdir("herramientas"):
        sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.validar_gistemp")
    if a.descargar:
        pet = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(pet, timeout=30) as r, open(a.tabla, "wb") as fh:
            fh.write(r.read())
        print(f"Tabla oficial actualizada: {a.tabla}")
    for ruta in (a.rasgos, a.tabla):
        if not os.path.exists(ruta):
            sys.exit(f"No existe {ruta}.")
    c = comparar(a.rasgos, a.tabla)
    f = lambda v: f"{v:+.2f}".replace(".", ",").replace("-", "−")
    print(f"Pista: {a.rasgos}\nOficial: {a.tabla} (GISTEMP v4, media anual J-D, base 1951–1980)")
    print(f"Años comparados: {c['n']} ({c['primero']}–{c['ultimo']})")
    print(f"Correlación de Pearson: {c['r']:.4f}".replace(".", ","))
    print(f"Sesgo medio (video − oficial): {f(c['sesgo'])} °C | error cuadrático medio: {c['rmse']:.2f} °C".replace(".", ","))
    print(f"Pendiente 1980–{c['ultimo']}: video {c['pendiente_video']:.3f}, oficial {c['pendiente_oficial']:.3f} °C por década".replace(".", ","))
    print(f"{c['primero']}: video {f(c['video_primero'])}, oficial {f(c['oficial_primero'])} °C | "
          f"{c['ultimo']}: video {f(c['video_ultimo'])}, oficial {f(c['oficial_ultimo'])} °C")
    print(f"Año más frío: video {c['mas_frio_video']}, oficial {c['mas_frio_oficial']}")
    ok = c["r"] >= 0.98
    print(f"[{'PASA' if ok else 'FALLA'}] correlación ≥ 0,98")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
