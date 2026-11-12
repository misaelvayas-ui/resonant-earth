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
    ok = pico <= 0.9 + 1e-9
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
    return n_pasa == 4 and n_falla == 0, f"{n_pasa} PASA, {n_falla} FALLA"


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


EVALUACIONES = [
    ("A1", "fase inicial = 0", "|x[0]| < 1e-12", a1),
    ("A2", "tono(440) → 440 Hz", "440 ± 1 Hz", a2),
    ("A3", "fase continua en barrido", "salto ≤ 2π·800/FS·1,01", a3),
    ("A4", "ADSR termina en 0", "len = n, fin = 0, máx ≤ 1", a4),
    ("A5", "MIDI ↔ Hz", "440, 880, 60 (±1e-9)", a5),
    ("A6", "cuantización en la escala", "todas ∈ escala, extremos", a6),
    ("A7", "paneo potencia constante", "error < 1e-9", a7),
    ("A8", "limitador y guardar_wav", "pico ≤ 0,9; int16 ida y vuelta", a8),
    ("B1", "pipeline 04→07 (video 2 s)", "4 códigos de salida = 0", b1),
    ("B2", "rasgos.json", "8 fotogramas, media y cx crecientes, validos ≥ 0,99, sin NaN", b2),
    ("B3", "rocola.wav", "estéreo, 44100 Hz, 4,0 ± 0,01 s, pico < 1", b3),
    ("B4", "validación 07", "4 × [PASA], 0 × [FALLA]", b4),
    ("C1", "05 con tierra gris + costa", f"error media < {UMBRAL_MEDIA_C1}; validos ± {UMBRAL_VALIDOS_C1}", c1),
    ("C2", "05 y 06 con fotograma sin datos", "sin NaN, validos = 0, media anterior", c2),
    ("C3", "máscara robusta: negro + título", f"máscara ≥ {MASCARA_MIN_C3} %; error media < {UMBRAL_MEDIA_C1}", c3),
    ("C4", "05 ponderar_latitud", f"error < {UMBRAL_LAT}; separación > {SEPARACION_LAT}", c4),
    ("C5", "05 escala + fechas", f"|Δmedia| < {UMBRAL_ESCALA}; defecto = escala 1.0", c5),
    ("D1", "sincronía de 08", "PASA; desfase de inicio ≤ 0,15 s", d1),
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
