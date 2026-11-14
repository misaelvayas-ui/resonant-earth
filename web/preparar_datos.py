"""
web/preparar_datos.py — prepara los archivos de la rocola web en web/assets/.

Uso (desde la raíz del proyecto, con el .venv activo):  python web/preparar_datos.py

1. Si existen salidas/rocola.wav y datos/2023GISTEMP_Map_SOS.mp4 (video real NASA SVS 5207):
   crea con ffmpeg un mp4 de 1280 px de ancho con ese audio mezclado (< 30 MB)
   -> web/assets/gistemp_1880_2023.mp4 + gistemp_1880_2023_rasgos.json
2. Si no, corre el pipeline sintético 04 -> 05 -> 06 -> 08 en una carpeta temporal
   (ROCOLA_SALIDAS / ROCOLA_CONFIG, así no pisa salidas/ ni config/)
   -> web/assets/ejemplo_sintetico.mp4 + ejemplo_sintetico_rasgos.json

No modifica los scripts del pipeline. A cada rasgo le agrega "t_video": el segundo del mp4
final en que empieza (06 dedica SEG_POR_FOTOGRAMA = 0,5 s de audio a cada rasgo y el video
se estira para durar lo mismo que el audio).
Si la visualización aún no está en web/catalogo.json, la agrega.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "web")
ASSETS = os.path.join(WEB, "assets")
CATALOGO = os.path.join(WEB, "catalogo.json")
MAX_MB = 30

sys.path.insert(0, RAIZ)          # este script vive en web/: parametros.py está en la raíz
from parametros import SEG_POR_FOTOGRAMA   # noqa: E402  (el mismo tempo que usa 06)

REAL_VIDEO = os.path.join(RAIZ, "datos", "2023GISTEMP_Map_SOS.mp4")
REAL_WAV = os.path.join(RAIZ, "salidas", "rocola.wav")
REAL_RASGOS = os.path.join(RAIZ, "salidas", "rasgos.json")

ENTRADA_REAL = {
    "id": "gistemp-1880-2023",
    "titulo": "Temperatura del planeta, 1880–2023",
    "descripcion": "Mapa mundial de anomalías de temperatura (GISTEMP), año por año. "
                   "Cada anomalía compara la temperatura con el promedio de 1951–1980.",
    "video": "assets/gistemp_1880_2023.mp4",
    "rasgos": "assets/gistemp_1880_2023_rasgos.json",
    "unidad": "°C",
    "leyenda": "Azul: más frío que el promedio. Blanco: cerca del promedio. "
               "Rojo y amarillo: más caliente que el promedio.",
}
ENTRADA_SINTETICA = {
    "id": "ejemplo-sintetico",
    "titulo": "Mancha de calor viajera (ejemplo)",
    "descripcion": "Video de prueba con verdad conocida: una mancha caliente cruza el mapa "
                   "de izquierda a derecha y crece. El tono sube, el volumen sube y el sonido "
                   "viaja de izquierda a derecha.",
    "video": "assets/ejemplo_sintetico.mp4",
    "rasgos": "assets/ejemplo_sintetico_rasgos.json",
    "unidad": "",
    "leyenda": "Escala de 0 a 1. Morado oscuro: valor bajo. Verde: medio. Amarillo: valor alto.",
}


def ejecutar(cmd, env=None):
    print("$", " ".join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd)))
    r = subprocess.run(cmd, cwd=RAIZ, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"Falló:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
    return r.stdout


def duracion(ruta):
    return float(ejecutar(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                           "-of", "csv=p=0", ruta]).strip())


def rasgos_web(origen, destino, fuente):
    """Copia rasgos.json agregando t_video y sin rutas locales."""
    with open(origen, encoding="utf-8") as fh:
        d = json.load(fh)
    d["fuente"] = fuente
    d["seg_por_fotograma"] = SEG_POR_FOTOGRAMA
    for i, r in enumerate(d["rasgos"]):
        r["t_video"] = round(i * SEG_POR_FOTOGRAMA, 3)
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)
    print(f"Rasgos: {destino} ({len(d['rasgos'])} registros)")


def agregar_al_catalogo(entrada):
    cat = {"visualizaciones": []}
    if os.path.exists(CATALOGO):
        with open(CATALOGO, encoding="utf-8") as fh:
            cat = json.load(fh)
    if any(v["id"] == entrada["id"] for v in cat["visualizaciones"]):
        return
    cat["visualizaciones"].insert(0, entrada)
    with open(CATALOGO, "w", encoding="utf-8") as fh:
        json.dump(cat, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"Catálogo: agregada '{entrada['id']}'")


def preparar_real():
    salida = os.path.join(ASSETS, "gistemp_1880_2023.mp4")
    factor = duracion(REAL_WAV) / duracion(REAL_VIDEO)
    filtro = f"setpts=PTS*{factor:.6f},scale=1280:-2" if not 0.99 <= factor <= 1.01 else "scale=1280:-2"
    for crf in (26, 30, 34, 38):
        ejecutar(["ffmpeg", "-y", "-v", "error", "-i", REAL_VIDEO, "-i", REAL_WAV,
                  "-map", "0:v:0", "-map", "1:a:0", "-vf", filtro,
                  "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
                  "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", salida])
        mb = os.path.getsize(salida) / 1e6
        print(f"Video: {salida}  {mb:.1f} MB (crf {crf})")
        if mb < MAX_MB:
            break
    else:
        sys.exit(f"No logré bajar de {MAX_MB} MB.")
    rasgos_web(REAL_RASGOS, os.path.join(ASSETS, "gistemp_1880_2023_rasgos.json"),
               os.path.basename(REAL_VIDEO))
    agregar_al_catalogo(ENTRADA_REAL)


def preparar_sintetico():
    with tempfile.TemporaryDirectory() as tmp:
        sal, cfg = os.path.join(tmp, "salidas"), os.path.join(tmp, "config")
        env = dict(os.environ, ROCOLA_SALIDAS=sal, ROCOLA_CONFIG=cfg, ROCOLA_SIN_AUDIO="1",
                   PYTHONIOENCODING="utf-8")
        py = sys.executable
        ejecutar([py, "04_video_sintetico.py"], env)
        ejecutar([py, "05_video_a_rasgos.py"], env)
        ejecutar([py, "06_rasgos_a_audio.py"], env)
        # 08 superpone "media = X" solo si el nombre del video coincide con rasgos.json;
        # con una copia de otro nombre el mp4 queda limpio (la web muestra el texto en vivo)
        limpio = os.path.join(sal, "video_limpio.mp4")
        shutil.copy(os.path.join(sal, "04_video_sintetico.mp4"), limpio)
        destino = os.path.join(ASSETS, "ejemplo_sintetico.mp4")
        print(ejecutar([py, "08_video_con_audio.py", limpio, os.path.join(sal, "rocola.wav"),
                        destino], env).strip().splitlines()[-1])
        rasgos_web(os.path.join(sal, "rasgos.json"),
                   os.path.join(ASSETS, "ejemplo_sintetico_rasgos.json"), "04_video_sintetico.mp4")
    agregar_al_catalogo(ENTRADA_SINTETICA)


def main():
    faltan = [p for p in ("ffmpeg", "ffprobe") if shutil.which(p) is None]
    if faltan:
        sys.exit(f"No encontré {' y '.join(faltan)}. Instala ffmpeg.")
    os.makedirs(ASSETS, exist_ok=True)
    if os.path.exists(REAL_WAV) and os.path.exists(REAL_VIDEO):
        print("Encontré el video real y rocola.wav: preparo el video NASA SVS 5207.")
        preparar_real()
    else:
        print("No están datos/2023GISTEMP_Map_SOS.mp4 y salidas/rocola.wav: uso el ejemplo sintético.")
        preparar_sintetico()


if __name__ == "__main__":
    main()
