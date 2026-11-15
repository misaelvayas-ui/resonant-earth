"""
08 — Une el video y rocola.wav en un MP4 sincronizado (demo).

Uso:  python 08_video_con_audio.py [video.mp4] [rocola.wav] [salida.mp4]
      (por defecto, en salidas/: 04_video_sintetico.mp4, rocola.wav, demo_rocola.mp4)
Estira el video al largo del audio (no lo toca si difieren menos de 1 %), superpone la fecha o la media del
fotograma en pantalla (si rasgos.json es de este video) y comprueba que video y audio duren lo mismo (± 0,1 s).
Requiere ffmpeg y ffprobe.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from rutas import sal

TOLERANCIA = 0.1  # s


def ejecutar(cmd, cwd=None):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if r.returncode != 0:
        sys.exit(f"Falló: {' '.join(cmd[:3])} ...\n{r.stderr[-2000:]}")
    return r.stdout


def duracion(ruta, flujo=None):
    """Duración en s del archivo (flujo=None) o de su primer flujo 'v' o 'a'."""
    if flujo is None:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta]
    else:
        cmd = ["ffprobe", "-v", "error", "-select_streams", f"{flujo}:0",
               "-show_entries", "stream=duration", "-of", "csv=p=0", ruta]
    texto = ejecutar(cmd).strip()
    try:
        return float(texto)
    except ValueError:
        sys.exit(f"ffprobe no devolvió una duración para {ruta} ({flujo or 'archivo'}): '{texto}'")


def duracion_real(ruta, flujo):
    """Fin del último paquete del flujo ('v' o 'a'): lo que realmente se reproduce.
    El 'duration' del encabezado puede no coincidir cuando no hay listas de edición."""
    texto = ejecutar(["ffprobe", "-v", "error", "-select_streams", f"{flujo}:0",
                      "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", ruta])
    fines = []
    for linea in texto.split():
        try:
            pts, dur = (float(x) for x in linea.strip(",").split(",")[:2])
            fines.append(pts + dur)
        except ValueError:
            continue
    if not fines:
        sys.exit(f"ffprobe no devolvió paquetes de {flujo} en {ruta}")
    return max(fines)


def fuente_tipografica():
    """DejaVuSans de matplotlib (viene en el .venv) para no depender de fontconfig."""
    try:
        import matplotlib
        ruta = os.path.join(matplotlib.get_data_path(), "fonts", "ttf", "DejaVuSans.ttf")
        return ruta if os.path.exists(ruta) else None
    except ImportError:
        return None


def opcion_grafo():
    """Opción de ffmpeg para leer el grafo de filtros desde un archivo.
    ffmpeg >= 7: '-/filter_complex archivo' ('-filter_complex_script' queda obsoleta y desaparece en las
    versiones nuevas). ffmpeg <= 6: solo '-filter_complex_script'. Se prueba con un grafo mínimo en lugar de
    leer el número de versión (las compilaciones de git no lo traen)."""
    with tempfile.TemporaryDirectory() as tmp:
        with open(os.path.join(tmp, "g.txt"), "w") as fh:
            fh.write("[0:v]null[v]")
        for opcion in ("-/filter_complex", "-filter_complex_script"):
            r = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=16x16:d=0.04",
                                opcion, "g.txt", "-map", "[v]", "-f", "null", "-"],
                               capture_output=True, text=True, cwd=tmp)
            if r.returncode == 0:
                return opcion
    sys.exit("Este ffmpeg no acepta ni '-/filter_complex' ni '-filter_complex_script'. "
             "Actualiza ffmpeg (>= 4).")


def alto_video(ruta):
    return int(ejecutar(["ffprobe", "-v", "error", "-select_streams", "v:0",
                         "-show_entries", "stream=height", "-of", "csv=p=0", ruta]).strip())


def filtros_texto(video, factor, carpeta):
    """Lista de filtros drawtext ('media = X' por intervalo) o [] si no aplica."""
    if not os.path.exists(sal("rasgos.json")):
        print("rasgos.json no existe: sin texto superpuesto.")
        return []
    with open(sal("rasgos.json")) as fh:
        d = json.load(fh)
    if os.path.basename(d.get("fuente", "")) != os.path.basename(video):
        print(f"rasgos.json es de '{d.get('fuente')}', no de '{video}': sin texto superpuesto.")
        return []
    fuente = fuente_tipografica()
    if fuente is None:
        print("No encontré DejaVuSans.ttf: sin texto superpuesto.")
        return []
    shutil.copy(fuente, os.path.join(carpeta, "f.ttf"))   # nombres relativos: sin ':' ni '\\' de rutas (Windows)
    R = d["rasgos"]
    margen = round(0.02 * alto_video(video))          # ~2 % de la altura, para el texto del año
    filtros = []
    for i, r in enumerate(R):
        ini = r["t"] * factor                                        # tiempos del video ESTIRADO
        fin = R[i + 1]["t"] * factor if i + 1 < len(R) else 1e9
        # el texto va en un archivo: así no hay que escapar '=', ',' ni espacios en el filtro
        nombre_txt = f"media_{i:04d}.txt"
        ruta_txt = os.path.join(carpeta, nombre_txt)
        con_fecha = "fecha" in r
        with open(ruta_txt, "w") as fh:
            fh.write(str(r["fecha"]) if con_fecha else f"media = {r['media']:.3f}".replace(".", ","))
        pos = f"x={2 * margen}:y={2 * margen}" if con_fecha else "x=w-tw-12:y=h-th-12"
        tam = "fontsize=h*0.06" if con_fecha else "fontsize=20"   # año: ~6 % de la altura
        filtros.append(
            f"drawtext=fontfile=f.ttf:textfile={nombre_txt}:{pos}:"
            f"{tam}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw={margen if con_fecha else 6}:"
            f"enable='gte(t\\,{ini:.4f})*lt(t\\,{fin:.4f})'")
    return filtros


def main():
    args = sys.argv[1:]
    video = args[0] if len(args) > 0 else sal("04_video_sintetico.mp4")
    audio = args[1] if len(args) > 1 else sal("rocola.wav")
    salida = args[2] if len(args) > 2 else sal("demo_rocola.mp4")

    faltan = [p for p in ("ffmpeg", "ffprobe") if shutil.which(p) is None]
    if faltan:
        sys.exit(f"No encontré {' y '.join(faltan)}. Instálalo con:  sudo apt install ffmpeg\n"
                 "(macOS: brew install ffmpeg; Windows: winget install Gyan.FFmpeg y reinicia la terminal)")
    for ruta in (video, audio):
        if not os.path.exists(ruta):
            sys.exit(f"No existe el archivo: {ruta}")

    dur_v, dur_a = duracion(video), duracion(audio)
    factor = dur_a / dur_v
    estirar = not (0.99 <= factor <= 1.01)
    print(f"Video: {video}  {dur_v:.3f} s")
    print(f"Audio: {audio}  {dur_a:.3f} s")
    print(f"Factor dur_audio/dur_video = {factor:.4f} -> "
          f"{'se estira el video (setpts=PTS*' + f'{factor:.6f})' if estirar else 'sin estirar'}")

    with tempfile.TemporaryDirectory() as tmp:
        f_aplicado = factor if estirar else 1.0
        cadena = ([f"setpts=PTS*{factor:.6f}"] if estirar else []) + filtros_texto(video, f_aplicado, tmp)
        # el grafo va en un archivo (la línea de comandos tiene un tope: ~128 KB en Linux, 32 KB en Windows)
        # y ffmpeg corre dentro de la carpeta temporal, con las rutas de entrada/salida absolutas
        with open(os.path.join(tmp, "grafo.txt"), "w") as fh:
            fh.write("[0:v]" + ",".join(cadena or ["null"]) + "[v]")
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", os.path.abspath(video), "-i", os.path.abspath(audio),
               opcion_grafo(), "grafo.txt", "-map", "[v]",
               "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
               # sin listas de edición: VLC las maneja mal y el audio se entrecortaba al inicio
               "-use_editlist", "0", os.path.abspath(salida)]
        ejecutar(cmd, cwd=tmp)

    sv, sa, sf = duracion_real(salida, "v"), duracion_real(salida, "a"), duracion(salida)
    dif = abs(sv - sa)
    print(f"Salida: {os.path.abspath(salida)}  ({sf:.3f} s)")
    print(f"  video {sv:.3f} s | audio {sa:.3f} s | diferencia {dif:.3f} s")
    print(f"[{'PASA' if dif < TOLERANCIA else 'FALLA'}] video y audio difieren < {TOLERANCIA} s")
    sys.exit(0 if dif < TOLERANCIA else 1)


if __name__ == "__main__":
    main()
