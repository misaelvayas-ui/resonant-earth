"""evaluar.py — mini evaluaciones rápidas (< 30 s) con tabla PASA/FALLA.

Uso (desde la raíz del proyecto):
    python evaluar.py            # todas
    python evaluar.py --rapido   # solo el motor de síntesis (grupo A, < 1 s)

Los grupos B-D ejecutan los scripts reales con ROCOLA_SALIDAS/ROCOLA_CONFIG apuntando a una
carpeta temporal y ROCOLA_SIN_AUDIO=1: salidas/ y config/ del proyecto no se tocan.
Código de salida: 0 si no hay FALLA, 1 si hay alguna.
"""
import os
import sys

if not os.path.exists("sintesis.py"):
    sys.exit("Ejecuta evaluar.py desde la raíz del proyecto (la carpeta que contiene "
             f"sintesis.py). Carpeta actual: {os.getcwd()}")

import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import time

import cv2
import numpy as np
from matplotlib import colormaps
from scipy.io import wavfile

from sintesis import (FS, adsr, escala, guardar_wav, hz_a_midi, limitar, midi_a_hz,
                      oscilador, paneo, tono, valor_a_nota)

# --- Umbrales de las pruebas C, medidos a 320x180 con 8 fotogramas muestreados (máscara estática
# por mediana, umbral_estatico = 3, frac_estatico = 0,7) ---
# C1 (video limpio): error máx |media - verdad| = 0.0049 -> umbral 0.01 (margen x2,0);
#     |mediana de validos - fracción real de datos| = 0.057 -> umbral 0.10 (margen x1,8).
#     La fracción real solo descuenta la tierra (11,3 %); 05 descarta además la costa, 1 px de
#     borde y algo de dato casi inmóvil, por eso 'validos' queda ~0,06 por debajo.
# C3 (negro + título): máscara fija medida 7,5 % (video limpio: 9,7 %); error de media 0.0036.
#     Con la máscara desactivada la prueba mediría 0 %: el umbral 5 % las separa (margen x1,5).
UMBRAL_MEDIA_C1 = 0.01
UMBRAL_VALIDOS_C1 = 0.10
MASCARA_MIN_C3 = 5.0
# C4 (ponderar_latitud, video 320x180 con valor creciente hacia los polos): error medio ponderada
#     0.0005 y sin ponderar 0.0006 -> umbral 0.01 (margen x16); las dos medias distan 0.081 como
#     mínimo -> umbral 0.05 (margen x1,6): si no se separan, la ponderación no actuó.
# C5 (escala 0,5 frente a 1,0): |Δmedia| máx = 0.0001 -> umbral 0.01 (margen x100).
UMBRAL_LAT, SEPARACION_LAT, UMBRAL_ESCALA = 0.01, 0.05, 0.01

# Video sintético de las pruebas C (misma geometría que usa 04, en pequeño)
W, H, FPS, N_FRAMES = 320, 180, 20, 40
MAPA, BARRA = (10, 20, 270, 170), (290, 20, 300, 170)
TIERRA = [(slice(30, 70), slice(50, 130)), (slice(100, 130), slice(150, 190))]   # filas, cols del recorte


# ============================================================ utilidades
def entorno(carpeta):
    e = dict(os.environ)
    e.update(ROCOLA_SALIDAS=os.path.join(carpeta, "salidas"),
             ROCOLA_CONFIG=os.path.join(carpeta, "config"), ROCOLA_SIN_AUDIO="1")
    return e


def correr(script, args, carpeta):
    return subprocess.run([sys.executable, script, *map(str, args)], capture_output=True,
                          text=True, env=entorno(carpeta), timeout=120)


def leer_json(ruta):
    """JSON que ACEPTA NaN pero lo reporta: devuelve (datos, hay_nan)."""
    hay = []
    with open(ruta) as fh:
        d = json.load(fh, parse_constant=lambda c: hay.append(c) or float(c))
    return d, bool(hay)


def video_c(carpeta, nombre, vacio_en=None, negro_en=None, titulo_en=None):
    """Genera un video RdBu_r con tierra gris fija y costa negra. Devuelve (ruta_cfg, verdad).
    'verdad' = media del campo sin tierra de cada fotograma muestreado (1 de cada 5)."""
    cm = colormaps["RdBu_r"]
    x0, y0, x1, y1 = MAPA
    mh, mw = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:mh, 0:mw]
    tierra = np.zeros((mh, mw), bool)
    for f, c in TIERRA:
        tierra[f, c] = True
    bgr = lambda v: (cm(np.clip(v, 0, 1))[..., :3][..., ::-1] * 255).astype(np.uint8)
    barra = bgr(np.linspace(1, 0, BARRA[3] - BARRA[1])[:, None].repeat(BARRA[2] - BARRA[0], 1))
    ruta_video = os.path.join(carpeta, nombre + ".mp4")
    out = cv2.VideoWriter(ruta_video, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    verdad = []
    for k in range(N_FRAMES):
        p = k / (N_FRAMES - 1)
        campo = np.clip(0.3 + 0.4 * p + 0.15 * np.sin(xx / 40 + 3 * p) + 0.05 * np.cos(yy / 30), 0, 1)
        z = bgr(campo)
        z[tierra] = (240, 240, 240)
        cv2.polylines(z, [np.array([[0, 80], [100, 95], [200, 60], [259, 70]])], False, (0, 0, 0), 1, cv2.LINE_AA)
        if k == vacio_en:
            z[:] = (128, 128, 128)
        if k == negro_en:                                  # fotograma negro (p. ej. inicio del video)
            z[:] = 0
        if k == titulo_en:                                 # tarjeta de título (fondo blanco, texto negro)
            z[:] = 255
            cv2.putText(z, "TITULO", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 3, cv2.LINE_AA)
        f = np.full((H, W, 3), 255, np.uint8)
        f[y0:y1, x0:x1] = z
        f[BARRA[1]:BARRA[3], BARRA[0]:BARRA[2]] = barra
        out.write(f)
        if k % 5 == 0:
            verdad.append(float(campo[~tierra].mean()))
    out.release()
    cfg = {"video": ruta_video, "mapa": MAPA, "barra": BARRA, "barra_vertical": True,
           "barra_arriba_es_max": True, "vmin": 0.0, "vmax": 1.0, "umbral": 0.7, "fps_muestreo": 4}
    ruta_cfg = os.path.join(carpeta, nombre + ".json")
    with open(ruta_cfg, "w") as fh:
        json.dump(cfg, fh)
    return ruta_cfg, verdad, float(tierra.mean())


# ============================================================ A) motor de síntesis
def a1():
    v = abs(tono(440, 1.0)[0])
    return v < 1e-12, f"|x[0]| = {v:.1e}"


def a2():
    x = tono(440, 1.0)
    f = np.fft.rfftfreq(len(x), 1 / FS)[np.argmax(np.abs(np.fft.rfft(x)))]
    return abs(f - 440) <= 1, f"pico = {f:.2f} Hz"


def a3():
    x = oscilador(np.linspace(200, 800, FS))
    salto, tope = np.abs(np.diff(x)).max(), 2 * np.pi * 800 / FS * 1.01
    return salto <= tope, f"salto máx = {salto:.4f} (tope {tope:.4f})"


def a4():
    msgs, ok = [], True
    for n in (441, 4410, 44100):
        e = adsr(n, a=0.02, d=0.1, s=0.7, r=0.2)
        bien = len(e) == n and abs(e[-1]) < 1e-12 and e.max() <= 1 + 1e-12
        ok &= bool(bien)
        msgs.append(f"n={n}: fin={e[-1]:.1e}")
    return ok, "; ".join(msgs)


def a5():
    v = (float(midi_a_hz(69)), float(midi_a_hz(81)), float(hz_a_midi(midi_a_hz(60))))
    ok = all(abs(a - b) < 1e-9 for a, b in zip(v, (440, 880, 60)))
    return ok, f"{v[0]:.6f}, {v[1]:.6f}, {v[2]:.6f}"


def a6():
    notas = escala()
    v = valor_a_nota(np.linspace(-1, 2, 300), 0, 1, notas)
    ok = bool(np.isin(v, notas).all() and v[0] == notas[0] and v[-1] == notas[-1])
    return ok, f"300 valores en [{notas[0]}, {notas[-1]}], extremos {v[0]}/{v[-1]}"


def a7():
    x = np.random.default_rng(0).standard_normal(1000)
    st = paneo(x, np.linspace(-1, 1, 1000))
    err = np.abs(st[:, 0] ** 2 + st[:, 1] ** 2 - x ** 2).max()
    izq = np.abs(paneo(x, -1.0)[:, 1]).max()
    return err < 1e-9 and izq < 1e-9, f"error potencia = {err:.1e}; R(pan=-1) = {izq:.1e}"


def a8():
    t = np.linspace(0, 1, FS)
    pico = np.abs(limitar(3 * np.sin(2 * np.pi * 5 * t))).max()
    ok = pico <= 0.85 + 1e-9
    with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
        for forma in ((1000,), (1000, 2)):
            x = np.random.default_rng(1).uniform(-1, 1, forma)
            ruta = os.path.join(tmp, "t.wav")
            guardar_wav(ruta, x)
            fs, d = wavfile.read(ruta)
            ok &= bool(fs == FS and d.dtype == np.int16 and d.shape == forma
                       and np.abs(d.astype(int) - (x * 32767).astype(int)).max() <= 1)
    return ok, f"pico limitador = {pico:.4f}; WAV mono y estéreo int16 a {FS} Hz"


# ============================================================ B) pipeline 04 -> 07 (video de 2 s)
ESTADO = {}


def pipeline():
    """Ejecuta 04 (2 s) -> 05 -> 06 -> 07 una sola vez; las pruebas B y D leen sus salidas."""
    if "dir" in ESTADO:
        return ESTADO
    ESTADO["tmp"] = tempfile.TemporaryDirectory()
    d = ESTADO["dir"] = ESTADO["tmp"].name
    ESTADO["codigos"], ESTADO["07"] = {}, ""
    for script, args in (("04_video_sintetico.py", [2]), ("05_video_a_rasgos.py", []),
                         ("06_rasgos_a_audio.py", []), ("07_validar.py", [])):
        r = correr(script, args, d)
        ESTADO["codigos"][script[:2]] = r.returncode
        if script.startswith("07"):
            ESTADO["07"] = r.stdout
        if r.returncode != 0:
            ESTADO.setdefault("errores", []).append(f"{script[:2]}: {r.stderr.strip().splitlines()[-1:]}")
    return ESTADO


def b1():
    c = pipeline()["codigos"]
    return all(v == 0 for v in c.values()) and len(c) == 4, "códigos " + " ".join(f"{k}={v}" for k, v in c.items())


def b2():
    d = pipeline()["dir"]
    datos, nan = leer_json(os.path.join(d, "salidas", "rasgos.json"))
    R = datos["rasgos"]
    m, c, v = (np.array([r[k] for r in R]) for k in ("media", "centroide_x", "validos"))
    ok = len(R) == 8 and np.all(np.diff(m) > 0) and np.all(np.diff(c) > 0) and v.min() >= 0.99 and not nan
    return bool(ok), (f"{len(R)} fotogramas; media {m[0]:.3f}→{m[-1]:.3f}; "
                      f"cx {c[0]:.3f}→{c[-1]:.3f}; validos mín {v.min():.3f}; NaN={nan}")


def b3():
    fs, x = wavfile.read(os.path.join(pipeline()["dir"], "salidas", "rocola.wav"))
    pico = np.abs(x / 32768).max()
    ok = x.ndim == 2 and x.shape[1] == 2 and fs == 44100 and abs(len(x) / fs - 4.0) <= 0.01 and pico < 1.0
    return bool(ok), f"forma {x.shape}, {fs} Hz, {len(x) / fs:.3f} s, pico {pico:.4f}"


def b4():
    s = pipeline()["07"]
    n_pasa, n_falla = s.count("[PASA]"), s.count("[FALLA]")
    return n_pasa == 5 and n_falla == 0, f"{n_pasa} PASA, {n_falla} FALLA"


# ============================================================ C) robustez de 05
def c1():
    with tempfile.TemporaryDirectory() as d:
        cfg, verdad, f_tierra = video_c(d, "c1")
        r = correr("05_video_a_rasgos.py", [cfg], d)
        if r.returncode != 0:
            return False, "05 falló: " + r.stderr.strip()[-120:]
        R = leer_json(os.path.join(d, "salidas", "rasgos.json"))[0]["rasgos"]
    m = np.array([x["media"] for x in R])
    err = np.abs(m - np.array(verdad)).max()
    dv = abs(np.median([x["validos"] for x in R]) - (1 - f_tierra))
    return bool(err < UMBRAL_MEDIA_C1 and dv < UMBRAL_VALIDOS_C1), \
        f"error media {err:.4f} (<{UMBRAL_MEDIA_C1}); |validos-real| {dv:.4f} (<{UMBRAL_VALIDOS_C1})"


def c2():
    vacio = 20                                           # fotograma 20 = muestreado nº 4
    with tempfile.TemporaryDirectory() as d:
        cfg, _, _ = video_c(d, "c2", vacio_en=vacio)
        r5 = correr("05_video_a_rasgos.py", [cfg], d)
        if r5.returncode != 0:
            return False, "05 falló: " + r5.stderr.strip()[-120:]
        r6 = correr("06_rasgos_a_audio.py", [], d)
        R, nan = leer_json(os.path.join(d, "salidas", "rasgos.json"))
        R = R["rasgos"]
        wav = os.path.exists(os.path.join(d, "salidas", "rocola.wav"))
    i = vacio // 5
    ok = (r6.returncode == 0 and wav and not nan and R[i]["validos"] == 0
          and R[i]["media"] == R[i - 1]["media"] and "sin píxeles válidos" in r5.stdout)
    return bool(ok), (f"05/06 códigos {r5.returncode}/{r6.returncode}; fotograma vacío: validos={R[i]['validos']}, "
                      f"media={R[i]['media']} (anterior {R[i - 1]['media']}); NaN={nan}")


def c3():
    """Un fotograma negro al inicio (k=0) y una tarjeta de título al final (k=35, último muestreado)
    no deben desactivar la máscara de píxeles estáticos."""
    with tempfile.TemporaryDirectory() as d:
        cfg, verdad, f_tierra = video_c(d, "c3", negro_en=0, titulo_en=35)
        r = correr("05_video_a_rasgos.py", [cfg], d)
        if r.returncode != 0:
            return False, "05 falló: " + r.stderr.strip()[-120:]
        R = leer_json(os.path.join(d, "salidas", "rasgos.json"))[0]["rasgos"]
    linea = next((x for x in r.stdout.splitlines() if x.startswith("Máscara fija")), "")
    pct = float(linea.split(":")[1].split("%")[0]) if linea else 0.0
    normales = slice(1, len(R) - 1)                      # sin el negro ni el título
    m = np.array([x["media"] for x in R])[normales]
    err = np.abs(m - np.array(verdad)[normales]).max()
    ok = pct >= MASCARA_MIN_C3 and err < UMBRAL_MEDIA_C1
    return bool(ok), f"máscara fija {pct:.1f} % (≥ {MASCARA_MIN_C3}); error media {err:.4f} (<{UMBRAL_MEDIA_C1})"


def video_lat(carpeta, nombre):
    """Video 320x180 cuyo valor depende de la latitud (|lat| grande = valor alto) y sube con el
    tiempo. Devuelve (ruta_cfg, media_ponderada, media_sin_ponderar, ruta_fechas) por fotograma
    muestreado; las medias salen del campo sin comprimir."""
    cm = colormaps["RdBu_r"]
    x0, y0, x1, y1 = MAPA
    mh, mw = y1 - y0, x1 - x0
    lat = 90 - (np.arange(mh) + 0.5) * 180 / mh
    w = np.cos(np.deg2rad(lat))
    bgr = lambda v: (cm(np.clip(v, 0, 1))[..., :3][..., ::-1] * 255).astype(np.uint8)
    barra = bgr(np.linspace(1, 0, BARRA[3] - BARRA[1])[:, None].repeat(BARRA[2] - BARRA[0], 1))
    ruta_video = os.path.join(carpeta, nombre + ".mp4")
    out = cv2.VideoWriter(ruta_video, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    ponderada, simple = [], []
    for k in range(N_FRAMES):
        p = k / (N_FRAMES - 1)
        fila = np.clip(0.15 + 0.6 * np.abs(lat) / 90 + 0.2 * p, 0, 1)          # valor por fila
        campo = np.repeat(fila[:, None], mw, axis=1) + 0.03 * np.sin(np.arange(mw) / 9 + 4 * p)[None, :]
        f = np.full((H, W, 3), 255, np.uint8)
        f[y0:y1, x0:x1] = bgr(campo)
        f[BARRA[1]:BARRA[3], BARRA[0]:BARRA[2]] = barra
        out.write(f)
        if k % 5 == 0:
            ponderada.append(float((campo.mean(axis=1) * w).sum() / w.sum()))
            simple.append(float(campo.mean()))
    out.release()
    ruta_fechas = os.path.join(carpeta, nombre + "_time.txt")
    with open(ruta_fechas, "w") as fh:
        fh.write("# comentario\n" + "\n".join(str(1900 + k) for k in range(N_FRAMES)) + "\n")
    cfg = {"video": ruta_video, "mapa": MAPA, "barra": BARRA, "barra_vertical": True,
           "barra_arriba_es_max": True, "vmin": 0.0, "vmax": 1.0, "umbral": 0.7, "fps_muestreo": 4}
    ruta_cfg = os.path.join(carpeta, nombre + ".json")
    with open(ruta_cfg, "w") as fh:
        json.dump(cfg, fh)
    return ruta_cfg, ponderada, simple, ruta_fechas


def correr05(carpeta, ruta_cfg, **extra):
    """Ejecuta 05 con claves extra añadidas al config; devuelve (lista de rasgos, salida estándar)."""
    with open(ruta_cfg) as fh:
        cfg = json.load(fh)
    cfg.update(extra)
    ruta = os.path.join(carpeta, "cfg_extra.json")
    with open(ruta, "w") as fh:
        json.dump(cfg, fh)
    r = correr("05_video_a_rasgos.py", [ruta], carpeta)
    if r.returncode != 0:
        raise RuntimeError("05 falló: " + r.stderr.strip()[-150:])
    return leer_json(os.path.join(carpeta, "salidas", "rasgos.json"))[0]["rasgos"], r.stdout


def c4():
    """ponderar_latitud: la media con cos(lat) sigue a la verdad ponderada y se aparta de la simple."""
    with tempfile.TemporaryDirectory() as d:
        cfg, pond, simple, _ = video_lat(d, "lat")
        m_p = np.array([x["media"] for x in correr05(d, cfg, ponderar_latitud=True)[0]])
        m_s = np.array([x["media"] for x in correr05(d, cfg)[0]])
    e_p = np.abs(m_p - pond).max()
    e_s = np.abs(m_s - simple).max()
    sep = np.abs(m_p - m_s).min()
    ok = e_p < UMBRAL_LAT and e_s < UMBRAL_LAT and sep > SEPARACION_LAT
    return bool(ok), (f"error ponderada {e_p:.4f}, sin ponderar {e_s:.4f} (< {UMBRAL_LAT}); "
                      f"separación mín. entre ambas {sep:.3f} (> {SEPARACION_LAT})")


def c5():
    """escala: reducir el recorte no cambia la media; el defecto == escala 1.0; fechas añade 'fecha'."""
    with tempfile.TemporaryDirectory() as d:
        cfg, _, _, fechas = video_lat(d, "esc")
        base, _ = correr05(d, cfg)
        uno, _ = correr05(d, cfg, escala=1.0)
        mitad, _ = correr05(d, cfg, escala=0.5, fechas=fechas)
    m = lambda R: np.array([x["media"] for x in R])
    igual = base == uno
    dif = np.abs(m(base) - m(mitad)).max()
    fechas_ok = [x.get("fecha") for x in mitad] == [1900 + 5 * i for i in range(len(mitad))] \
        and "fecha" not in base[0]
    return bool(igual and dif < UMBRAL_ESCALA and fechas_ok), \
        f"defecto = escala 1.0: {igual}; |Δmedia| escala 0,5 = {dif:.4f} (< {UMBRAL_ESCALA}); fechas: {fechas_ok}"


# ============================================================ D) sincronía de 08
def d1():
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        return None, "ffmpeg/ffprobe no instalados (sudo apt install ffmpeg)"
    d = pipeline()["dir"]
    sal = os.path.join(d, "salidas")
    r = correr("08_video_con_audio.py", [os.path.join(sal, "04_video_sintetico.mp4"),
                                         os.path.join(sal, "rocola.wav"), os.path.join(sal, "demo.mp4")], d)
    if r.returncode != 0 or "[PASA]" not in r.stdout:
        return False, f"08 código {r.returncode}: {r.stdout.strip().splitlines()[-1:] or r.stderr.strip()[-100:]}"
    pts = []
    for flujo in ("v", "a"):
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", f"{flujo}:0", "-show_entries",
                              "packet=pts_time", "-of", "csv=p=0", os.path.join(sal, "demo.mp4")],
                             capture_output=True, text=True).stdout.split()
        pts.append(min(float(x) for x in out))
    # El video empieza ~0,100 s después del audio (retardo de 2 B-frames a 20 fps): es la
    # configuración confirmada sin entrecortes en VLC (ronda 7); el umbral deja margen de 1 fotograma.
    desfase = abs(pts[0] - pts[1])
    return desfase <= 0.15, f"08 PASA; primer pts video {pts[0]:.3f} s, audio {pts[1]:.3f} s (desfase {desfase:.3f} s)"


# ============================================================ E) instrumentos reales y respaldo (06)
def leer_mid(ruta):
    """(ataques canal 1 [(tick, nota, vel)], inicios del canal 2 [(nota, vel)], último tick, ticks/negra)."""
    import mido
    mid = mido.MidiFile(ruta)
    t, ons, dron, fin = 0, [], [], 0
    for m in mido.merge_tracks(mid.tracks):
        t += m.time
        if m.type == "note_on" and m.velocity > 0:
            (ons if m.channel == 0 else dron).append((t, m.note, m.velocity) if m.channel == 0 else (m.note, m.velocity))
        fin = t
    return ons, dron, fin, mid.ticks_per_beat


def e1():
    sal_ = os.path.join(pipeline()["dir"], "salidas")
    ctl = json.load(open(os.path.join(sal_, "control.json")))
    ons, dron, fin, tpb = leer_mid(os.path.join(sal_, "rocola.mid"))
    tpf = ctl["seg_por_fotograma"] * 2 * tpb                       # 120 bpm
    tol = 0.010 * 2 * tpb + 1                                      # ±10 ms de humanización
    notas_ok = [n for _, n, _ in ons] == ctl["notas_ataque"] and ctl["ataques"] == len(ons)
    tiempos_ok = len(ons) == len(ctl["inicio_ticks"]) and all(abs(o[0] - t) <= tol + 0.5 for o, t in zip(ons, ctl["inicio_ticks"]))
    base_ok = [n[0] for n in ctl["notas"]] == ctl["midi"]
    dron_ok = len(dron) == 1 and dron[0][0] == ctl["dron"]
    fs_, w = wavfile.read(os.path.join(sal_, "rocola.wav"))
    dur_ok = abs(w.shape[0] / fs_ - len(ctl["midi"]) * ctl["seg_por_fotograma"]) < 0.01 and abs(fin - len(ctl["midi"]) * tpf) <= 1
    return (notas_ok and tiempos_ok and base_ok and dron_ok and dur_ok,
            f"modo {ctl['modo']}; {len(ons)} ataques (sin ligar {ctl['ataques_sin_ligar']}) = control.json: {notas_ok}; "
            f"tiempos ±10 ms: {tiempos_ok}; dron {ctl['dron']}: {dron_ok}; wav {w.shape[0] / fs_:.3f} s: {dur_ok}")


def esperados_e2(media):
    """Cálculo independiente de los ataques de 06 con sus valores por defecto: [(tick nominal, nota, tipo)]."""
    n = len(media)
    ms = [float(np.mean(media[max(0, i - 1): i + 2])) for i in range(n)]            # suavizado 3, centrado
    sc = escala(48, 3)
    tpf = 480.0
    fuerte = [i > 0 and abs(media[i] - media[i - 1]) > 0.15 for i in range(n)]
    out, ult, notas_f = [], -1, []
    for f, m in enumerate(ms):
        k = 1 if m < 0.3 else (2 if m <= 0.7 else 4)
        b = list(sc).index(int(valor_a_nota(m, -0.6, 1.2, sc)))
        arp = [int(sc[min(b + j, len(sc) - 1)]) + 12 for j in range(k)]
        notas_f.append(arp)
        for j, nota in enumerate(arp):
            tick, forzado = f * tpf + j * tpf / k, fuerte[f] and j == 0
            if out and nota == out[-1][1] and not forzado:
                if j == 0 and f - ult >= 2:
                    out.append((tick, nota, "regolpe"))
                    ult = f
                continue
            out.append((tick, nota, "fuerte" if forzado else "ataque"))
            ult = f
    return out, notas_f


def e2():
    """06 con sus valores por defecto frente a un cálculo independiente (suavizado 3, densidad, arpegio,
    ligar + re-golpe cada 2 fotogramas, ataque fuerte por evento, octava +1, humanizar, dron pad)."""
    media = [0.00, 0.10, 0.50, 1.20, 1.20, 1.20, 1.15, 1.20]          # cubre 1, 2 y 4 notas, notas ligadas y un salto
    with tempfile.TemporaryDirectory() as d:
        R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]
        for r, m in zip(R["rasgos"], media):
            r["media"], r["area"] = m, 0.0                            # área 0 -> velocidad base 64
        R.update(vmin_sonido=-0.6, vmax_sonido=1.2, referencia=0.0)
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "rasgos_e2.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico"], d)
        if r.returncode != 0:
            return False, f"06 código {r.returncode}: {r.stderr.strip()[-120:]}"
        ons, dron, fin, tpb = leer_mid(os.path.join(d, "salidas", "rocola.mid"))
        ctl = json.load(open(os.path.join(d, "salidas", "control.json")))
    esp, notas_f = esperados_e2(media)
    tpf = 0.5 * 2 * tpb
    tol = 0.010 * 2 * tpb + 1
    notas_ok = [n for _, n, _ in ons] == [n for _, n, _ in esp]
    tiempos_ok = len(ons) == len(esp) and all(abs(o[0] - e[0]) <= tol + 0.5 for o, e in zip(ons, esp))
    tipos = {t for _, _, t in esp}
    # velocidad base 64 (área 0): ataque 64, re-golpe 40 % = 26, fuerte >= 100; humanizar ±10 %
    rango = {"ataque": (57, 71), "regolpe": (23, 29), "fuerte": (90, 127)}
    vel_ok = len(ons) == len(esp) and all(rango[e[2]][0] <= o[2] <= rango[e[2]][1] for o, e in zip(ons, esp))
    arp_ok = all(e == sorted(e) for e in notas_f) and {len(e) for e in notas_f} >= {1, 4}
    ref = int(escala(48, 3)[list(escala(48, 3)).index(int(valor_a_nota(0.0, -0.6, 1.2, escala(48, 3))))]) + 12
    dron_ok = dron == [(ref - 12, 27)]            # ref = melodía(0 °C) con octava +1; dron = ref - 12
    ctl_ok = (ctl["midi"] == [e[0] for e in notas_f] and ctl["notas"] == notas_f
              and ctl["ataques"] == len(ons) and ctl["tipo_ataque"] == [t for _, _, t in esp] and ctl["dron"] == ref - 12)
    dur_ok = abs(fin - len(media) * tpf) <= 1
    ok = notas_ok and tiempos_ok and vel_ok and arp_ok and dron_ok and ctl_ok and dur_ok and tipos == {"ataque", "regolpe", "fuerte"}
    return ok, (f"ataques {len(ons)} ({sorted(tipos)}); notas: {notas_ok}; ±10 ms: {tiempos_ok}; velocidades: {vel_ok}; "
                f"arpegio: {arp_ok}; dron {dron[0][0] if dron else None}: {dron_ok}; control.json: {ctl_ok}; duración: {dur_ok}")


def e4():
    """Retardo entre la media cruda y las notas de salida: correlación cruzada por fotograma, |retardo| <= 1."""
    n = 40
    t = np.arange(n)
    media = 0.5 + 0.5 * np.sin(2 * np.pi * t / 17) + 0.3 * np.sin(2 * np.pi * t / 6) + 0.2 * np.sin(2 * np.pi * t / 3.4)
    with tempfile.TemporaryDirectory() as d:
        R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]
        R["rasgos"] = [{**R["rasgos"][i % len(R["rasgos"])], "t": i * 0.25, "media": float(media[i])} for i in range(n)]
        R.update(vmin_sonido=-0.3, vmax_sonido=1.3)
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "rasgos_e4.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico"], d)
        if r.returncode != 0:
            return False, f"06 código {r.returncode}: {r.stderr.strip()[-120:]}"
        ons, _, _, tpb = leer_mid(os.path.join(d, "salidas", "rocola.mid"))
        base = np.array(json.load(open(os.path.join(d, "salidas", "control.json")))["midi"], float)
    tpf = 0.5 * 2 * tpb
    sonando = np.array([[nt for tk, nt, _ in ons if tk <= i * tpf + 0.2 * tpf][-1] for i in range(n)], float)

    def retardo(serie):
        a, b = (media - media.mean()) / media.std(), (serie - serie.mean()) / serie.std()
        c = {L: float(np.mean((a[:n - L] * b[L:]) if L >= 0 else (a[-L:] * b[:n + L]))) for L in range(-4, 5)}
        return max(c, key=c.get), c
    l1, c1_ = retardo(base)
    l2, c2_ = retardo(sonando)
    return abs(l1) <= 1 and abs(l2) <= 1 and c1_[l1] > 0.8, \
        f"retardo control.json {l1:+d} fotogramas (r {c1_[l1]:.2f}); notas de rocola.mid {l2:+d} (r {c2_[l2]:.2f})"


def e3():
    """Respaldo numpy: --sintetico y también el caso sin fluidsynth (PATH vacío) con su aviso."""
    base = pipeline()["dir"]
    out, partes = [], []
    mid_ref = open(os.path.join(base, "salidas", "rocola.mid"), "rb").read()
    for etiqueta, extra, env_extra in (("--sintetico", ["--sintetico"], {}), ("sin fluidsynth", [], {"PATH": "/nonexistent"})):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "salidas"))
            shutil.copy(os.path.join(base, "salidas", "rasgos.json"), os.path.join(d, "salidas", "rasgos.json"))
            e = entorno(d)
            e.update(env_extra)
            r = subprocess.run([sys.executable, "06_rasgos_a_audio.py", *extra], capture_output=True,
                               text=True, env=e, timeout=120)
            r7 = subprocess.run([sys.executable, "07_validar.py"], capture_output=True, text=True, env=e, timeout=120)
            sal_ = os.path.join(d, "salidas")
            ctl = json.load(open(os.path.join(sal_, "control.json")))
            fs_, w = wavfile.read(os.path.join(sal_, "rocola.wav"))
            aviso = "sudo apt install fluidsynth fluid-soundfont-gm" in r.stdout
            ok = (r.returncode == 0 and r7.returncode == 0 and ctl["modo"] == "sintetico" and w.ndim == 2
                  and abs(w.shape[0] / fs_ - 4.0) < 0.01 and np.abs(w).max() / 32767 <= 0.85 + 1e-3
                  and open(os.path.join(sal_, "rocola.mid"), "rb").read() == mid_ref
                  and (aviso or etiqueta == "--sintetico"))
            out.append(ok)
            partes.append(f"{etiqueta}: 06={r.returncode} 07={r7.returncode}, {w.shape[0] / fs_:.3f} s, "
                          f"mismo .mid, aviso apt {'sí' if aviso else 'no'}")
    return all(out), "; ".join(partes)


# ============================================================ F) casos de la auditoría (videos nuevos)
def f1():
    """Densidad con otro rango de datos (270-310): los umbrales siguen al rango de sonido y no saturan en 4 notas."""
    with tempfile.TemporaryDirectory() as d:
        R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]
        for r, m in zip(R["rasgos"], np.linspace(270, 310, len(R["rasgos"]))):
            r["media"] = float(m)
        R.update(vmin=270.0, vmax=310.0)
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "k.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico"], d)
        if r.returncode != 0:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        n = [len(x) for x in json.load(open(os.path.join(d, "salidas", "control.json")))["notas"]]
    return len(set(n)) >= 2 and 1 in n, f"notas por fotograma con datos 270-310: {sorted(set(n))} (más de un valor y alguno = 1)"


def f2():
    """Video que abre en negro: la barra se toma de un fotograma con degradado (no de uno negro)."""
    with tempfile.TemporaryDirectory() as d:
        cfg, _, _, _ = video_lat(d, "negro_src")
        c = json.load(open(cfg))
        cap = cv2.VideoCapture(c["video"])
        ruta = os.path.join(d, "negro.mp4")
        out = cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
        for k in range(N_FRAMES):
            ok, f = cap.read()
            out.write(np.zeros_like(f) if k < 6 else f)
        out.release()
        cap.release()
        c["video"] = ruta
        json.dump(c, open(cfg, "w"))
        R = correr05(d, cfg)[0]
    med = float(np.median([x["validos"] for x in R]))
    return med > 0.9 and R[-1]["media"] > R[0]["media"], f"mediana de validos {med:.2f} (> 0,9); media {R[0]['media']:.3f} → {R[-1]['media']:.3f}"


def f3():
    """Errores claros: video inexistente y rectángulo fuera del fotograma (rasgos.json queda intacto)."""
    with tempfile.TemporaryDirectory() as d:
        cfg, _, _, _ = video_lat(d, "err")
        base = json.load(open(cfg))
        os.makedirs(os.path.join(d, "salidas"), exist_ok=True)
        previo = os.path.join(d, "salidas", "rasgos.json")
        open(previo, "w").write('{"marca": 1}')
        res = []
        for nombre, cambio, frase in (("sin video", {"video": os.path.join(d, "no_existe.mp4")}, "No se pudo abrir"),
                                      ("mapa fuera", {"mapa": [10, 20, 900, 700]}, "se sale del video")):
            json.dump({**base, **cambio}, open(cfg, "w"))
            r = correr("05_video_a_rasgos.py", [cfg], d)
            res.append((nombre, r.returncode != 0 and frase in (r.stderr + r.stdout), open(previo).read() == '{"marca": 1}'))
    return all(a and b for _, a, b in res), "; ".join(f"{n}: mensaje {'sí' if a else 'NO'}, rasgos.json {'intacto' if b else 'PISADO'}" for n, a, b in res)


def f4():
    """08 con 600 rasgos (un drawtext por rasgo): la línea de comandos ya no revienta."""
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        return None, "ffmpeg/ffprobe no instalados"
    base = os.path.join(pipeline()["dir"], "salidas")
    with tempfile.TemporaryDirectory() as d:
        sal_ = os.path.join(d, "salidas")
        os.makedirs(sal_)
        for f in ("04_video_sintetico.mp4", "rocola.wav"):
            shutil.copy(os.path.join(base, f), sal_)
        R = leer_json(os.path.join(base, "rasgos.json"))[0]
        r0 = R["rasgos"][0]
        R["rasgos"] = [{**r0, "t": round(i * 4.0 / 600, 4), "fecha": 1900 + i} for i in range(600)]
        json.dump(R, open(os.path.join(sal_, "rasgos.json"), "w"))
        r = correr("08_video_con_audio.py", [os.path.join(sal_, "04_video_sintetico.mp4"),
                                             os.path.join(sal_, "rocola.wav"), os.path.join(sal_, "demo.mp4")], d)
    return r.returncode == 0 and "[PASA]" in r.stdout, f"08 con 600 rasgos: código {r.returncode}; {r.stdout.strip().splitlines()[-1:] or r.stderr.strip()[-100:]}"


def g1():
    """Dron = nota que la melodía toca con 0 °C - 12 (medido en el .mid: una serie constante en 0 °C)."""
    with tempfile.TemporaryDirectory() as d:
        R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]
        for r in R["rasgos"]:
            r["media"] = 0.0
        R.update(vmin=-2.0, vmax=2.0, vmin_sonido=-0.6, vmax_sonido=1.2, referencia=0.0)
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "k.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico"], d)
        if r.returncode != 0:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        ons, dron, _, _ = leer_mid(os.path.join(d, "salidas", "rocola.mid"))
    mel = {n for _, n, _ in ons}
    ok = len(mel) == 1 and len(dron) == 1 and dron[0][0] == min(mel) - 12
    return ok, f"melodía en 0 °C = MIDI {sorted(mel)}; dron = MIDI {[x[0] for x in dron]} (esperado melodía - 12)"


def g2():
    """centroide_y en rasgos.json: presente en todos, entre 0 y 1 y ~0,5 con la tormenta sintética a media latitud."""
    R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]["rasgos"]
    cy = [r.get("centroide_y") for r in R]
    ok = all(c is not None and 0 <= c <= 1 for c in cy) and abs(float(np.mean(cy)) - 0.5) < 0.03
    return ok, f"{sum(c is not None for c in cy)}/{len(R)} con centroide_y; rango {min(cy):.3f}-{max(cy):.3f}; media {np.mean(cy):.3f} (≈ 0,5)"


def g3():
    """paneo 'y': el centroide_y (normalizado por percentiles) gobierna control.json y recorre casi todo el rango."""
    with tempfile.TemporaryDirectory() as d:
        R = leer_json(os.path.join(pipeline()["dir"], "salidas", "rasgos.json"))[0]
        n = len(R["rasgos"])
        for i, r in enumerate(R["rasgos"]):
            r["centroide_x"], r["centroide_y"] = 0.5, 0.2 + 0.6 * i / (n - 1)
        R["paneo"] = "y"
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "k.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico"], d)
        if r.returncode != 0:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        ctl = json.load(open(os.path.join(d, "salidas", "control.json")))
    p = np.array(ctl["pan"])
    return ctl["paneo"] == "y" and np.all(np.diff(p) >= -1e-9) and p[0] < -0.9 and p[-1] > 0.9, \
        f"paneo {ctl['paneo']}: pan {p[0]:.2f} → {p[-1]:.2f}, creciente: {bool(np.all(np.diff(p) >= -1e-9))}"


EVALUACIONES = [
    ("A1", "fase inicial = 0", "|x[0]| < 1e-12", a1),
    ("A2", "tono(440) → 440 Hz", "440 ± 1 Hz", a2),
    ("A3", "fase continua en barrido", "salto ≤ 2π·800/FS·1,01", a3),
    ("A4", "ADSR termina en 0", "len = n, fin = 0, máx ≤ 1", a4),
    ("A5", "MIDI ↔ Hz", "440, 880, 60 (±1e-9)", a5),
    ("A6", "cuantización en la escala", "todas ∈ escala, extremos", a6),
    ("A7", "paneo potencia constante", "error < 1e-9", a7),
    ("A8", "limitador y guardar_wav", "pico ≤ 0,85; int16 ida y vuelta", a8),
    ("B1", "pipeline 04→07 (video 2 s)", "4 códigos de salida = 0", b1),
    ("B2", "rasgos.json", "8 fotogramas, media y cx crecientes, validos ≥ 0,99, sin NaN", b2),
    ("B3", "rocola.wav", "estéreo, 44100 Hz, 4,0 ± 0,01 s, pico < 1", b3),
    ("B4", "validación 07", "5 × [PASA], 0 × [FALLA]", b4),
    ("C1", "05 con tierra gris + costa", f"error media < {UMBRAL_MEDIA_C1}; validos ± {UMBRAL_VALIDOS_C1}", c1),
    ("C2", "05 y 06 con fotograma sin datos", "sin NaN, validos = 0, media anterior", c2),
    ("C3", "máscara robusta: negro + título", f"máscara ≥ {MASCARA_MIN_C3} %; error media < {UMBRAL_MEDIA_C1}", c3),
    ("C4", "05 ponderar_latitud", f"error < {UMBRAL_LAT}; separación > {SEPARACION_LAT}", c4),
    ("C5", "05 escala + fechas", f"|Δmedia| < {UMBRAL_ESCALA}; defecto = escala 1.0", c5),
    ("D1", "sincronía de 08", "PASA; desfase de inicio ≤ 0,15 s", d1),
    ("E1", "06: rocola.mid vs control.json", "ataques y tiempos (±10 ms) idénticos; 1 dron; wav = misma duración", e1),
    ("E2", "06: valores por defecto", "notas, arpegio, ligar, ±10 ms, dron y duración = cálculo independiente", e2),
    ("F1", "06: densidad con datos 270-310", "más de un nº de notas por fotograma, alguno = 1", f1),
    ("F2", "05: video que abre en negro", "validos > 0,9 y media creciente", f2),
    ("F3", "05: errores claros", "mensaje y rasgos.json intacto (sin video / mapa fuera)", f3),
    ("F4", "08: 600 rasgos con texto", "08 PASA (sin 'Argument list too long')", f4),
    ("G1", "06: dron = melodía(0 °C) - 12", "dron = nota de la melodía con 0 °C - 12 (medido en el .mid)", g1),
    ("G2", "05: centroide_y", "presente, entre 0 y 1, ≈ 0,5 en el video sintético", g2),
    ("G3", "06: paneo 'y' normalizado", "pan sigue a centroide_y y recorre < -0,9 … > 0,9", g3),
    ("E4", "06: retardo media → notas", "|retardo| ≤ 1 fotograma (correlación cruzada), r > 0,8", e4),
    ("E3", "06: respaldo numpy", "07 PASA, mismo .mid, 4,0 s, pico ≤ 0,85, aviso con apt si no hay fluidsynth", e3),
]


def main():
    rapido = "--rapido" in sys.argv[1:]
    t0, filas = time.time(), []
    for id_, nombre, umbral, f in EVALUACIONES:
        if rapido and not id_.startswith("A"):
            continue
        t = time.time()
        try:
            ok, medido = f()
        except Exception as e:                            # una excepción es un FALLA
            ok, medido = False, f"{type(e).__name__}: {e}"
        filas.append((id_, nombre, medido, umbral, {True: "PASA", False: "FALLA", None: "OMITIDA"}[ok], time.time() - t))
    if "tmp" in ESTADO:
        ESTADO["tmp"].cleanup()
    ancho = [max(len(str(f[i])) for f in filas + [("ID", "Evaluación", "Medido", "Umbral", "", 0)]) for i in range(4)]
    print(f"{'ID':<{ancho[0]}} | {'Evaluación':<{ancho[1]}} | {'Medido':<{ancho[2]}} | {'Umbral':<{ancho[3]}} | Res.    | s")
    print("-" * (sum(ancho) + 28))
    for id_, nombre, medido, umbral, res, seg in filas:
        print(f"{id_:<{ancho[0]}} | {nombre:<{ancho[1]}} | {medido:<{ancho[2]}} | {umbral:<{ancho[3]}} | {res:<7} | {seg:.1f}")
    fallas = sum(f[4] == "FALLA" for f in filas)
    print(f"\n{sum(f[4] == 'PASA' for f in filas)} PASA, {fallas} FALLA, "
          f"{sum(f[4] == 'OMITIDA' for f in filas)} OMITIDA en {time.time() - t0:.1f} s")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
