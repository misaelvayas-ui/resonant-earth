"""exportar_web.py — MP4 y rasgos de web/assets hechos con la misma salida que el demo.

Uso (desde la raíz):  python -m herramientas.exportar_web [--gistemp DIR] [--sst DIR] [--destino web/assets]
Por pista escribe <id>.mp4 (video original sin texto, 1024x512, estirado al largo de rocola.wav), <id>_rasgos.json
(con "t_video") y <id>_procedencia.json (sha256 de lo que se usó). Aborta si el audio del MP4 no es el de rocola.wav
(RMS y balance L/R por ventana de 0,5 s). Aborta sin escribir nada en el destino si rasgos.json no es del video de la
pista, si rocola.wav no es de ese rasgos.json o si el audio no coincide: todo se arma en una carpeta temporal y se publica al final.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

SEG_POR_FOTOGRAMA = 0.5            # igual que en 06_rasgos_a_audio.py
PISTAS = {"gistemp_1880_2023": "gistemp", "sst_ecco2_2007_2008": "sst"}
VIDEOS = {"gistemp_1880_2023": "2023GISTEMP_Map_SOS.mp4", "sst_ecco2_2007_2008": "ecco2_sst_flow.mp4"}   # video original de cada pista
MAX_MB = 5          # cada pista se descarga entera antes de sonar: que pese poco (ronda 38)
VENTANA = 0.5                      # s
PISO_DB = -45.0                    # solo se comparan las ventanas con más señal que esto (en las casi mudas el AAC dominaría)
TOL_RMS_DB, TOL_BALANCE_DB = 1.5, 3.0


def ejecutar(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Falló {os.path.basename(cmd[0])}: {r.stderr.strip()[-300:]}")
    return r.stdout


def duracion(ruta):
    return float(ejecutar(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta]).strip())


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as fh:
        for bloque in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def ventanas(x, fs):
    """(RMS en dB de la mezcla, balance R/L en dB) por ventana de 0,5 s; x es (N, 2) float."""
    n = int(len(x) / fs / VENTANA)
    paso = int(VENTANA * fs)
    rms = lambda v: np.sqrt(np.mean(v ** 2)) + 1e-9
    L = np.array([rms(x[i * paso:(i + 1) * paso, 0]) for i in range(n)])
    R = np.array([rms(x[i * paso:(i + 1) * paso, 1]) for i in range(n)])
    return 20 * np.log10(np.sqrt((L ** 2 + R ** 2) / 2)), 20 * np.log10(R / L)


def leer_audio(ruta):
    """(fs, (N, 2) float) de un WAV o del audio de un MP4 (decodificado a 44,1 kHz estéreo)."""
    if ruta.lower().endswith(".wav"):
        fs, x = wavfile.read(ruta)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "a.wav")
            ejecutar(["ffmpeg", "-y", "-v", "error", "-i", ruta, "-vn", "-ac", "2", "-ar", "44100", wav])
            fs, x = wavfile.read(wav)
    x = x.astype(float) / 32768
    return fs, (np.stack([x, x], axis=1) if x.ndim == 1 else x)


def comparar_audio(wav, otro):
    """Compara el audio de 'otro' (MP4) con el de 'wav' por ventanas con señal. Devuelve (ok, texto)."""
    fs, ref = leer_audio(wav)
    fs2, y = leer_audio(otro)
    r1, b1 = ventanas(ref, fs)
    r2, b2 = ventanas(y, fs2)
    n = min(len(r1), len(r2))
    con = r1[:n] > PISO_DB
    if con.sum() < 3:
        return False, "casi ninguna ventana con señal para comparar"
    dr, db = np.abs(r1[:n] - r2[:n])[con], np.abs(b1[:n] - b2[:n])[con]
    ok = dr.max() <= TOL_RMS_DB and db.max() <= TOL_BALANCE_DB and abs(len(r1) - len(r2)) <= 1
    return ok, (f"{con.sum()} ventanas con señal de {n}: RMS dif máx {dr.max():.2f} dB (tope {TOL_RMS_DB}), balance L/R dif máx "
                f"{db.max():.2f} dB (tope {TOL_BALANCE_DB}), duración {len(r1) * VENTANA:.1f} s frente a {len(r2) * VENTANA:.1f} s")


def crear_mp4(video, wav, salida, ancho=1024, alto=512):
    """MP4 de la web: el video estirado al largo del audio, escalado, con ese audio. Devuelve (MB, crf)."""
    factor = duracion(wav) / duracion(video)
    filtro = f"scale={ancho}:{alto}" if 0.99 <= factor <= 1.01 else f"setpts=PTS*{factor:.6f},scale={ancho}:{alto}"
    for crf in (28, 30, 33, 36, 40):
        ejecutar(["ffmpeg", "-y", "-v", "error", "-i", video, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-vf", filtro,
                  "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                  "-shortest", "-movflags", "+faststart", salida])
        mb = os.path.getsize(salida) / 1e6
        if mb < MAX_MB:
            return mb, crf
    sys.exit(f"{salida}: no logré bajar de {MAX_MB} MB.")


def exportar(id_, carpeta, destino, video_esperado=None):
    video_esperado = video_esperado or VIDEOS[id_]
    ruta_rasgos, wav = os.path.join(carpeta, "rasgos.json"), os.path.join(carpeta, "rocola.wav")
    for r in (ruta_rasgos, wav):
        if not os.path.exists(r):
            sys.exit(f"Falta {r} (pista {id_}): corre 05, 06 y 08 con ROCOLA_SALIDAS={carpeta}.")
    with open(ruta_rasgos, encoding="utf-8") as fh:
        doc = json.load(fh)
    fuente = doc.get("fuente", "")
    if os.path.basename(fuente) != video_esperado:
        sys.exit(f"{id_}: {ruta_rasgos} es del video '{fuente}', no de '{video_esperado}', el de esta pista. "
                 f"Corre 05 con el config de la pista y ROCOLA_SALIDAS={carpeta}.")
    video = next((p for p in (fuente, os.path.join("datos", os.path.basename(fuente))) if os.path.exists(p)), None)
    if video is None:
        sys.exit(f"{id_}: no encuentro el video original '{fuente}' (rasgos.json['fuente']).")
    dur_wav = duracion(wav)
    if abs(len(doc["rasgos"]) * SEG_POR_FOTOGRAMA - dur_wav) > 0.6:
        sys.exit(f"{id_}: {len(doc['rasgos'])} rasgos x {SEG_POR_FOTOGRAMA} s = {len(doc['rasgos']) * SEG_POR_FOTOGRAMA:.1f} s, "
                 f"pero {wav} dura {dur_wav:.1f} s: el WAV no es de este rasgos.json.")
    with tempfile.TemporaryDirectory() as tmp:               # nada llega al destino hasta que todo está comprobado
        mp4 = os.path.join(tmp, f"{id_}.mp4")
        mb, crf = crear_mp4(video, wav, mp4)
        demos = sorted(f for f in os.listdir(carpeta) if f.startswith("demo_") and f.endswith(".mp4"))
        print(f"{id_}: {os.path.join(destino, id_ + '.mp4')}  {mb:.1f} MB (crf {crf}), {duracion(mp4):.2f} s, de {wav} (sha256 {sha256(wav)[:12]})")
        for etiqueta, ruta in [("rocola.wav", wav)] + [(d, os.path.join(carpeta, d)) for d in demos]:
            # el MP4 web contra el WAV; y cada demo contra el WAV: así web y demo quedan probados con el mismo audio
            ok, texto = comparar_audio(wav, mp4 if etiqueta == "rocola.wav" else ruta)
            print(f"  [{'PASA' if ok else 'FALLA'}] audio {'del MP4 web' if etiqueta == 'rocola.wav' else 'de ' + etiqueta} = rocola.wav: {texto}")
            if not ok:
                sys.exit(f"{id_}: el audio no coincide con {wav}. No se escribió nada en {destino}.")
        web = dict(doc, fuente=os.path.basename(fuente), seg_por_fotograma=SEG_POR_FOTOGRAMA)
        web["rasgos"] = [dict(r, t_video=round(i * SEG_POR_FOTOGRAMA, 3)) for i, r in enumerate(doc["rasgos"])]
        with open(os.path.join(tmp, f"{id_}_rasgos.json"), "w", encoding="utf-8") as fh:
            json.dump(web, fh, ensure_ascii=False, indent=1)
        with open(os.path.join(tmp, f"{id_}_procedencia.json"), "w", encoding="utf-8") as fh:
            json.dump({"id": id_, "carpeta": carpeta, "video_original": os.path.basename(video), "rocola_wav_sha256": sha256(wav),
                       "rasgos_sha256": sha256(ruta_rasgos), "mp4_sha256": sha256(mp4), "demos_comprobados": demos,
                       "tolerancias": {"rms_db": TOL_RMS_DB, "balance_db": TOL_BALANCE_DB, "piso_db": PISO_DB}},
                      fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        os.makedirs(destino, exist_ok=True)
        for nombre in sorted(os.listdir(tmp)):
            shutil.move(os.path.join(tmp, nombre), os.path.join(destino, nombre))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--gistemp", default="salidas_gistemp")
    ap.add_argument("--sst", default="salidas_sst")
    ap.add_argument("--destino", default=os.path.join("web", "assets"))
    a = ap.parse_args()
    if not os.path.exists("sintesis.py"):
        sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.exportar_web")
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        sys.exit("Hace falta ffmpeg y ffprobe (sudo apt install ffmpeg).")
    for id_, clave in PISTAS.items():
        exportar(id_, getattr(a, clave), a.destino)


if __name__ == "__main__":
    main()
