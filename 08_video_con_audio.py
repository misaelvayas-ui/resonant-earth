"""
08 — Une el video de la visualización con rocola.wav en un solo MP4 sincronizado (demo).

Uso:  python 08_video_con_audio.py [video.mp4] [rocola.wav] [salida.mp4]
Por defecto: 04_video_sintetico.mp4, rocola.wav, demo_rocola.mp4

1. Mide la duración del video y del audio con ffprobe; factor = dur_audio / dur_video.
2. Estira el video con setpts=PTS*factor (el audio no se toca). Si 0,99 <= factor <= 1,01, no estira.
3. libx264 + yuv420p (reproduce en cualquier lado), audio AAC, -shortest, -preset veryfast.
4. Si existe rasgos.json y corresponde a este video, superpone "media = X" del fotograma
   analizado que está en pantalla (cada valor se mantiene hasta el siguiente fotograma muestreado).
5. Verifica con ffprobe que video y audio del resultado difieran < 0,1 s (PASA/FALLA).

Requiere ffmpeg y ffprobe:  sudo apt install ffmpeg
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

TOLERANCIA = 0.1  # s


def ejecutar(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
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


def filtros_texto(video, factor, carpeta):
    """Lista de filtros drawtext ('media = X' por intervalo) o [] si no aplica."""
    if not os.path.exists("rasgos.json"):
        print("rasgos.json no existe: sin texto superpuesto.")
        return []
    with open("rasgos.json") as fh:
        d = json.load(fh)
    if os.path.basename(d.get("fuente", "")) != os.path.basename(video):
        print(f"rasgos.json es de '{d.get('fuente')}', no de '{video}': sin texto superpuesto.")
        return []
    fuente = fuente_tipografica()
    if fuente is None:
        print("No encontré DejaVuSans.ttf: sin texto superpuesto.")
        return []
    R = d["rasgos"]
    filtros = []
    for i, r in enumerate(R):
        ini = r["t"] * factor                                        # tiempos del video ESTIRADO
        fin = R[i + 1]["t"] * factor if i + 1 < len(R) else 1e9
        # el texto va en un archivo: así no hay que escapar '=', ',' ni espacios en el filtro
        ruta_txt = os.path.join(carpeta, f"media_{i:04d}.txt")
        with open(ruta_txt, "w") as fh:
            fh.write(f"media = {r['media']:.3f}".replace(".", ","))
        filtros.append(
            f"drawtext=fontfile={fuente}:textfile={ruta_txt}:x=w-tw-12:y=h-th-12:"
            f"fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:"
            f"enable='gte(t\\,{ini:.4f})*lt(t\\,{fin:.4f})'")
    return filtros


def main():
    args = sys.argv[1:]
    video = args[0] if len(args) > 0 else "04_video_sintetico.mp4"
    audio = args[1] if len(args) > 1 else "rocola.wav"
    salida = args[2] if len(args) > 2 else "demo_rocola.mp4"

    faltan = [p for p in ("ffmpeg", "ffprobe") if shutil.which(p) is None]
    if faltan:
        sys.exit(f"No encontré {' y '.join(faltan)}. Instálalo con:  sudo apt install ffmpeg")
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
        # tpad: repite el último fotograma 0,1 s para que -shortest corte por el audio
        # y no se pierda su final (antes se recortaban ~0,05 s).
        cadena = ([f"setpts=PTS*{factor:.6f}"] if estirar else []) + filtros_texto(video, f_aplicado, tmp) \
            + ["tpad=stop_mode=clone:stop_duration=0.1"]
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", video, "-i", audio,
               "-filter_complex", "[0:v]" + ",".join(cadena) + "[v]", "-map", "[v]",
               "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
               # sin B-frames: sin lista de edición, su retardo dejaría el video 0,1 s tarde;
               # un fotograma clave por segundo para poder saltar en la demo
               "-bf", "0", "-g", "20",
               "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
               # sin listas de edición: VLC las maneja mal y el audio se entrecortaba al inicio
               "-use_editlist", "0", salida]
        ejecutar(cmd)

    sv, sa, sf = duracion_real(salida, "v"), duracion_real(salida, "a"), duracion(salida)
    dif = abs(sv - sa)
    print(f"Salida: {os.path.abspath(salida)}  ({sf:.3f} s)")
    print(f"  video {sv:.3f} s | audio {sa:.3f} s | diferencia {dif:.3f} s")
    print(f"[{'PASA' if dif < TOLERANCIA else 'FALLA'}] video y audio difieren < {TOLERANCIA} s")
    sys.exit(0 if dif < TOLERANCIA else 1)


if __name__ == "__main__":
    main()
