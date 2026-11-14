"""evaluar.py — mini evaluaciones (~50 s) con tabla PASA/FALLA.

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
        paso = 1 if b + k <= len(sc) else -1                         # sin sitio arriba, el arpegio baja desde la base
        arp = [int(sc[b + paso * j]) + 12 for j in range(k)]
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
    media = [0.10, 0.10, 0.10, 0.10, 0.50, 1.20, 1.20, 1.15]          # cubre 1, 2 y 4 notas, notas ligadas, un salto y el arpegio en lo alto
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
    # velocidad base 64 (área 0): ataque 64, re-golpe 70 % = 45, fuerte >= 100; humanizar ±10 %
    rango = {"ataque": (57, 71), "regolpe": (40, 50), "fuerte": (90, 127)}      # base 64; re-golpe = 70 % (45), +-10 % humanizar
    vel_ok = len(ons) == len(esp) and all(rango[e[2]][0] <= o[2] <= rango[e[2]][1] for o, e in zip(ons, esp))
    # ascendente; en lo más alto de la escala (no caben todas arriba) desciende desde la nota base
    arp_ok = all(e == sorted(e) or e == sorted(e, reverse=True) for e in notas_f) and {len(e) for e in notas_f} >= {1, 4} \
        and any(e != sorted(e) for e in notas_f)
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
        png = os.path.join(d, "barra.png")
        cv2.imwrite(png, np.zeros((50, 10, 3), np.uint8))
        sin_umbral = {k: v for k, v in base.items() if k != "umbral"}
        res = []
        for nombre, config, frase in (("sin video", {**base, "video": os.path.join(d, "no_existe.mp4")}, "No se pudo abrir"),
                                      ("mapa fuera", {**base, "mapa": [10, 20, 900, 700]}, "se sale del video"),
                                      ("sin 'umbral'", sin_umbral, "Faltan claves obligatorias"),
                                      ("barra fuera del PNG", {**base, "barra_imagen": png}, "se sale del PNG")):
            json.dump(config, open(cfg, "w"))
            r = correr("05_video_a_rasgos.py", [cfg], d)
            res.append((nombre, r.returncode != 0 and frase in (r.stderr + r.stdout) and "Traceback" not in r.stderr,
                        open(previo).read() == '{"marca": 1}'))
    return all(a and b for _, a, b in res), "; ".join(f"{n}: mensaje {'sí' if a else 'NO'}, rasgos.json {'intacto' if b else 'PISADO'}" for n, a, b in res)


def _06(R, d, *extra):
    """Escribe R como rasgos.json en d/salidas, corre 06 --sintetico y devuelve (control.json | None, r)."""
    os.makedirs(os.path.join(d, "salidas"), exist_ok=True)
    ruta = os.path.join(d, "salidas", "rasgos.json")
    json.dump(R, open(ruta, "w"))
    r = correr("06_rasgos_a_audio.py", [ruta, "--sintetico", *extra], d)
    ctl = os.path.join(d, "salidas", "control.json")
    return (json.load(open(ctl)) if r.returncode == 0 else None), r


def _serie(n=60, fechas=False):
    """rasgos mínimos con n fotogramas (media = 0, se sustituye después)."""
    return {"fuente": "x.mp4", "vmin": 0.0, "vmax": 1.0, "fps_rasgos": 2.0,
            "rasgos": [{"t": i * 0.5, **({"fecha": 1900 + i} if fechas else {}), "media": 0.5, "area": 0.1 + 0.005 * i,
                        "centroide_x": 0.5, "centroide_y": 0.5, "cambio": 0.0, "validos": 1.0} for i in range(n)]}


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
            r["area"] = 0.1                                          # con area < 0,01 el paneo va al centro (prueba G6)
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


def g4():
    """cruce_dron: primer fotograma desde el que la melodía ya no baja de la nota de la referencia (no del dron)."""
    R = _serie(40)
    media = np.linspace(-0.6, 1.2, 40)
    for r, m in zip(R["rasgos"], media):
        r["media"] = float(m)
    R.update(vmin=-2.0, vmax=2.0, vmin_sonido=-0.6, vmax_sonido=1.2, referencia=0.0, suavizado=0)
    with tempfile.TemporaryDirectory() as d:
        ctl, r = _06(R, d)
    if ctl is None:
        return False, "06 falló: " + r.stderr.strip()[-120:]
    notas = escala(48, 3)
    ref = int(valor_a_nota(0.0, -0.6, 1.2, notas)) + 12
    voz = valor_a_nota(media, -0.6, 1.2, notas) + 12
    esp = next(i for i in range(40) if (voz[i:] >= ref).all())
    return ctl["cruce_dron"] == esp and esp > 0, f"cruce_dron = {ctl['cruce_dron']}; esperado {esp} (primer fotograma con la nota de referencia {ref}; con el dron saldría 0)"


def f5():
    """umbral_evento relativo: la misma serie en 0-1 y en 270-310 da los mismos eventos fuertes (ni 0 ni todos)."""
    cuentas = []
    for a, b in ((0.0, 1.0), (270.0, 310.0)):
        R = _serie(60)
        for i, r in enumerate(R["rasgos"]):
            r["media"] = a + (0.5 + 0.3 * np.sin(0.9 * i)) * (b - a)
        R.update(vmin=a, vmax=b)
        with tempfile.TemporaryDirectory() as d:
            ctl, r = _06(R, d)
        if ctl is None:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        cuentas.append(sum(ctl["evento_fuerte"]))
    return cuentas[0] == cuentas[1] and 0 < cuentas[0] < 59, f"eventos fuertes con rango 0-1: {cuentas[0]}; con 270-310: {cuentas[1]} (de 60)"


def g5():
    """paneo con centroide casi fijo (0,5 ± 0,002): no se estira a todo el campo estéreo."""
    R = _serie(60)
    rng = np.random.default_rng(0)
    for r in R["rasgos"]:
        r["centroide_y"] = 0.5 + float(rng.uniform(-0.002, 0.002))
    R["paneo"] = "y"
    with tempfile.TemporaryDirectory() as d:
        ctl, r = _06(R, d)
    if ctl is None:
        return False, "06 falló: " + r.stderr.strip()[-120:]
    m = float(np.abs(ctl["pan"]).max())
    return m < 0.1, f"centroide_y 0,498-0,502 -> |pan| máx. {m:.3f}"


def e5():
    """Respaldo numpy con arpegios de 4 notas: 07 mide el tono sin FALLA (glide corto, golpe en la misma octava)."""
    R = _serie(60)
    for i, r in enumerate(R["rasgos"]):
        r["media"] = i / 59
    with tempfile.TemporaryDirectory() as d:
        ctl, r = _06(R, d)
        if ctl is None:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        r7 = subprocess.run([sys.executable, "07_validar.py"], capture_output=True, text=True, env=entorno(d), timeout=120)
    err = [l for l in r7.stdout.splitlines() if l.startswith("Error máximo")]
    max4 = max(len(n) for n in ctl["notas"])
    return r7.returncode == 0 and max4 == 4, f"notas por fotograma hasta {max4}; 07 código {r7.returncode}; {err[0] if err else r7.stdout.strip()[-100:]}"


def _barra_png(ruta, horizontal, mesetas=False):
    """PNG RGBA de una barra de colores con borde negro, margen transparente y 'texto' (marcas de otro color).
    mesetas=True: el degradado se hace por tramos de color constante de 30 px (peor caso para la detección)."""
    L, G = 120, 24                                         # largo y grosor del degradado
    t = np.linspace(0, 1, L)
    if mesetas:
        t = np.floor(t * 4) / 3
    colores = (np.stack([255 * (1 - t), 255 * np.abs(t - 0.5) * 2, 255 * t], axis=1)).astype(np.uint8)   # BGR
    img = np.zeros((G + 40, L + 30, 4), np.uint8)          # transparente
    img[10:10 + G + 4, 8:8 + L + 4] = (0, 0, 0, 255)       # borde negro opaco
    img[12:12 + G, 10:10 + L, :3] = colores[None, :, :]
    img[12:12 + G, 10:10 + L, 3] = 255
    img[G + 20:G + 30, 12:50] = (255, 255, 255, 255)       # 'texto' bajo la barra
    if not horizontal:
        img = img.transpose(1, 0, 2)
        # las marcas de la transposición quedan a un lado; el degradado queda en filas
    cv2.imwrite(ruta, img)
    x0, y0 = (10, 12) if horizontal else (12, 10)
    return (x0, y0, x0 + L, y0 + G) if horizontal else (x0, y0, x0 + G, y0 + L)


def h1():
    """calibrar: barra horizontal detectada; la vertical (incluida una con mesetas de color) sigue igual."""
    from herramientas.calibrar import rect_degradado, rect_degradado_orientado
    with tempfile.TemporaryDirectory() as d:
        res = []
        for nombre, hor, mes in (("horizontal", True, False), ("vertical", False, False), ("vertical con mesetas", False, True)):
            png = os.path.join(d, nombre.replace(" ", "_") + ".png")
            esperado = _barra_png(png, hor, mes)
            rect, vertical = rect_degradado_orientado(png)
            res.append((nombre, rect == esperado and vertical == (not hor)))
        # la función de siempre (solo vertical) da lo mismo que antes en la vertical
        vieja = rect_degradado(os.path.join(d, "vertical.png")) == _barra_png(os.path.join(d, "v2.png"), False)
    return all(ok for _, ok in res) and vieja, "; ".join(f"{n}: {'sí' if ok else 'NO'}" for n, ok in res) + f"; rect_degradado vertical: {'igual' if vieja else 'CAMBIÓ'}"


def video_matiz(carpeta, nombre="matiz"):
    """Video 320x180 con barra HORIZONTAL (matiz azul -> rojo, 0..32) y mapa cuyo color es el de la barra
    pero atenuado a 40-90 % de brillo (como las líneas de flujo de ECCO2). Devuelve (ruta_cfg, verdad)."""
    x0, y0, x1, y1 = MAPA
    mh, mw = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:mh, 0:mw]
    def pintar(v, brillo):                                 # v en 0..32 -> BGR con el matiz de la barra
        v = np.asarray(v, float)
        hsv = np.stack([110 - 105 * v / 32, np.full(v.shape, 220.0), 240 * np.broadcast_to(brillo, v.shape)], axis=-1)
        return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    barra_xy = (x0, 4, x1, 14)
    ruta_video = os.path.join(carpeta, nombre + ".mp4")
    out = cv2.VideoWriter(ruta_video, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    verdad = []
    for k in range(N_FRAMES):
        p = k / (N_FRAMES - 1)
        campo = np.clip(10 + 12 * p + 6 * np.sin(xx / 40 + 3 * p) + 3 * np.cos(yy / 30), 0, 32)
        brillo = 0.65 + 0.25 * np.sin(xx / 7 + yy / 5)             # 0,40 .. 0,90
        f = np.full((H, W, 3), 0, np.uint8)
        f[y0:y1, x0:x1] = pintar(campo, brillo)
        f[barra_xy[1]:barra_xy[3], barra_xy[0]:barra_xy[2]] = pintar(np.linspace(0, 32, barra_xy[2] - barra_xy[0])[None, :].repeat(barra_xy[3] - barra_xy[1], 0), 1.0)
        out.write(f)
        if k % 5 == 0:
            verdad.append(float(campo.mean()))
    out.release()
    ruta_fechas = os.path.join(carpeta, nombre + "_fechas.txt")
    with open(ruta_fechas, "w") as fh:
        fh.write("\n".join(f"{23000 + 4 * k}  2007-{3 + k // 14:02d}-25T{(k % 6) * 4:02d}:00Z" for k in range(N_FRAMES)) + "\n")
    cfg = {"video": ruta_video, "mapa": list(MAPA), "barra": list(barra_xy), "barra_vertical": False, "vmin": 0.0,
           "vmax": 32.0, "umbral": 25.0, "fps_muestreo": 4, "modo_color": "matiz", "dist_max": 6, "mascara_estatica": False,
           "borde_px": 0, "fechas": ruta_fechas}
    ruta_cfg = os.path.join(carpeta, nombre + ".json")
    with open(ruta_cfg, "w") as fh:
        json.dump(cfg, fh)
    return ruta_cfg, verdad


def h2():
    """05 modo_color 'matiz' con barra horizontal y color atenuado; el modo 'lab' por defecto no lo resuelve."""
    with tempfile.TemporaryDirectory() as d:
        cfg, verdad = video_matiz(d)
        R, _ = correr05(d, cfg)
        err = max(abs(r["media"] - v) for r, v in zip(R, verdad))
        val = float(np.median([r["validos"] for r in R]))
        Rl, _ = correr05(d, cfg, modo_color="lab", dist_max=8.0)
        val_lab = float(np.median([r["validos"] for r in Rl]))
    return len(R) == len(verdad) and err < 0.5 and val > 0.95 and val_lab < 0.5, \
        f"error máx de media {err:.3f} °C; validos matiz {val:.2f}, lab {val_lab:.2f}"


def h3():
    """Fechas ISO (2.ª columna): 'mar 2007' con fechas_formato 'mes', año con el formato por defecto; error claro si no es válido."""
    from fechas import etiqueta, leer_fechas
    with tempfile.TemporaryDirectory() as d:
        cfg, _ = video_matiz(d)
        Rm, _ = correr05(d, cfg, fechas_formato="mes")
        Ra, _ = correr05(d, cfg)
        malo = {**json.load(open(cfg)), "fechas_formato": "dia"}
        json.dump(malo, open(os.path.join(d, "malo.json"), "w"))
        r = correr("05_video_a_rasgos.py", [os.path.join(d, "malo.json")], d)
        crudos = leer_fechas(json.load(open(cfg))["fechas"])
        anio = os.path.join(d, "time.txt")
        open(anio, "w").write("# c\n1881\n1882\n")
        ok_msg = r.returncode != 0 and "fechas_formato" in (r.stderr + r.stdout) and "Traceback" not in r.stderr
        unit = (crudos[0] == "2007-03-25T00:00Z" and etiqueta(crudos[0], "mes") == "mar 2007" and etiqueta(crudos[0]) == 2007
                and etiqueta("1881", "mes") == 1881 and etiqueta("2008-12-01T00:00Z", "mes") == "dic 2008" and leer_fechas(anio) == ["1881", "1882"])
        # formatos que antes fallaban: segundos, mes de 1 cifra, mes imposible (sin excepción) y 2 columnas sin ISO
        raros = (etiqueta("2007-03-25T12:00:00Z", "mes") == "mar 2007" and etiqueta("2007-3-25T12:00Z", "mes") == "mar 2007"
                 and etiqueta("2007-03-25T12:00:00+00:00") == 2007 and etiqueta("2007-13-01T00:00Z", "mes") == "2007-13-01T00:00Z")
        dos_col = os.path.join(d, "dos.txt")
        open(dos_col, "w").write("1881 enero\n23000  2007-03-25T12:00Z  extra\n")
        raros = raros and leer_fechas(dos_col) == ["1881", "2007-03-25T12:00Z"]
    unit = unit and raros
    return unit and Rm[0]["fecha"] == "mar 2007" and Ra[0]["fecha"] == 2007 and ok_msg, \
        f"fecha 'mes' = {Rm[0]['fecha']!r}, por defecto = {Ra[0]['fecha']!r}, time.txt = año suelto y formatos raros (segundos, mes de 1 cifra, mes 13): {'sí' if unit else 'NO'}; formato inválido: mensaje {'sí' if ok_msg else 'NO'}"


def i1():
    """Especificación del modo en vivo (docs/ESPEC_MODO_EN_VIVO.md): aplicar sus fórmulas a rasgos.json reproduce
    lo que sonó (control.json de 06; sintético) y los _esperado.json de las pistas reales (con su _mapeo.json)."""
    from herramientas.exportar_mapeo import aplicar_mapeo, comparar_con_control, construir_mapeo
    rng = np.random.default_rng(7)
    n = 60
    casos = {
        # eje x, rama amplia, rango de sonido propio, referencia, valores fuera de rango
        "x amplia": dict(extra={"vmin_sonido": 0.2, "vmax_sonido": 0.8, "referencia": 0.5},
                         cx=np.clip(0.5 + 0.35 * np.sin(np.arange(n) / 7), 0, 1), cy=np.full(n, 0.5), area="con huecos"),
        # eje y, rama estrecha (recorrido < 0,1), sin referencia, umbrales de densidad propios, octava 0, dron +1
        "y estrecha": dict(extra={"paneo": "y", "densidad_umbrales": [0.4, 0.6], "octava": 0, "dron_octava": 1},
                           cx=np.full(n, 0.5), cy=0.5 + 0.02 * np.sin(np.arange(n) / 9), area="estrecha"),
        # eje y con rama amplia, sin densidad ni suavizado, umbral de evento propio
        "y amplia sin densidad": dict(extra={"paneo": "y", "densidad": False, "suavizado": 0, "umbral_evento": 0.1},
                                      cx=np.full(n, 0.5), cy=np.clip(0.5 + 0.3 * np.cos(np.arange(n) / 6), 0, 1), area="normal"),
    }
    res = []
    with tempfile.TemporaryDirectory() as d:
        for nombre, c in casos.items():
            R = _serie(n)
            media = np.clip(0.5 + 0.45 * np.sin(np.arange(n) / 5) + 0.05 * rng.standard_normal(n), 0, 1)
            for i, r in enumerate(R["rasgos"]):
                area = np.clip(0.1 + 0.4 * abs(np.sin(i / 11)), 0, 1)
                if c["area"] == "estrecha":                         # como SST: el área casi no varía
                    area = 0.43 + 0.06 * abs(np.sin(i / 11))
                elif c["area"] == "con huecos" and i % 7 < 2:       # fotogramas sin zona caliente: el paneo va al centro
                    area = 0.004
                r.update(media=float(media[i]), area=float(area),
                         centroide_x=float(c["cx"][i]), centroide_y=float(c["cy"][i]))
            R["rasgos"][5]["media"] = None                    # dato ausente: se rellena con el anterior
            R.update(c["extra"])
            ctl, r = _06(R, d)
            if ctl is None:
                return False, "06 falló: " + r.stderr.strip()[-120:]
            m = construir_mapeo(R, nombre)
            f = comparar_con_control(aplicar_mapeo(R["rasgos"], m), ctl, tol_pan=0.02)
            res.append((nombre + f" (rama {m['paneo']['rama']})", f))
    # pistas reales: solo si están sus archivos (web/assets/<id>_esperado.json, _mapeo.json y los rasgos)
    reales = []
    for id_, carpeta in (("gistemp_1880_2023", "salidas_gistemp"), ("sst_ecco2_2007_2008", "salidas_sst")):
        ruta = lambda suf: os.path.join("web", "assets", f"{id_}_{suf}.json")
        rasgos = next((q for q in (ruta("rasgos"), os.path.join(carpeta, "rasgos.json")) if os.path.exists(q)), None)
        if not (os.path.exists(ruta("esperado")) and os.path.exists(ruta("mapeo")) and rasgos):
            continue
        esp = json.load(open(ruta("esperado")))["fotogramas"]
        calc = aplicar_mapeo(json.load(open(rasgos))["rasgos"], json.load(open(ruta("mapeo"))))
        fallas = [] if len(calc) == len(esp) else [f"{len(calc)} fotogramas frente a {len(esp)}"]
        for e, c in zip(esp, calc):
            if (e["nota"], e["notas"], e["dron"]) != (c["nota"], c["notas"], c["dron"]) or abs(e["pan"] - c["pan"]) > 0.02 \
                    or abs(e["ganancia"] - c["ganancia"]) > 1e-4:
                fallas.append(f"f{e['i']}")
        reales.append((id_, fallas))
    todo = res + reales
    return all(not f for _, f in todo), "; ".join(f"{n_}: {'reproduce' if not f else str(len(f)) + ' discrepancias ' + str(f[:3])}" for n_, f in todo) \
        + ("" if reales else "; pistas reales: sin archivos (no se comprobaron)")


def _calibrar(d, *args):
    """Ejecuta 'python -m herramientas.calibrar' con las carpetas temporales; devuelve el proceso."""
    return subprocess.run([sys.executable, "-m", "herramientas.calibrar", *map(str, args)], capture_output=True, text=True,
                          env=entorno(d), timeout=120)


def h4():
    """calibrar con 'matiz': escribe dist_max 4 (unidades de matiz), borde_px 0 y mascara_estatica false; no mezcla las claves de Lab."""
    with tempfile.TemporaryDirectory() as d:
        cfg0, _ = video_matiz(d)
        video = json.load(open(cfg0))["video"]
        png = os.path.join(d, "barra.png")
        _barra_png(png, True)
        sal_cfg = os.path.join(d, "cal.json")
        base = ["--video", video, "--barra", png, "--vmin", 0, "--vmax", 32, "--mapa", "10,20,270,170", "--salida", sal_cfg]
        pasos = []
        for nombre, extra in (("Lab", []), ("matiz", ["--modo-color", "matiz"]), ("matiz de nuevo, sin opción", []), ("de vuelta a Lab", ["--modo-color", "lab"])):
            r = _calibrar(d, *base, *extra)
            if r.returncode != 0:
                return False, f"calibrar ({nombre}) falló: {(r.stderr + r.stdout).strip()[-150:]}"
            pasos.append((nombre, json.load(open(sal_cfg))))
        lab1, mat, mat2, lab2 = (c for _, c in pasos)
        ok = (lab1.get("modo_color") is None and 8 <= lab1["dist_max"] <= 20 and "borde_px" not in lab1
              and mat["modo_color"] == "matiz" and mat["dist_max"] == 4.0 and mat["borde_px"] == 0 and mat["mascara_estatica"] is False
              and mat["barra_vertical"] is False
              and mat2["modo_color"] == "matiz" and mat2["dist_max"] == 4.0                   # sin opción se mantiene el modo del config
              and lab2["modo_color"] == "lab" and 8 <= lab2["dist_max"] <= 20 and "borde_px" not in lab2 and "mascara_estatica" not in lab2)
    return ok, (f"Lab dist_max {lab1['dist_max']:g}; matiz: dist_max {mat['dist_max']:g}, borde_px {mat.get('borde_px')}, "
                f"mascara_estatica {mat.get('mascara_estatica')}; sin opción: {mat2.get('modo_color')} {mat2['dist_max']:g}; "
                f"de vuelta a Lab: dist_max {lab2['dist_max']:g}, borde_px {lab2.get('borde_px')}")


def h5():
    """05 avisa cuando la media se sale de vmin_sonido..vmax_sonido y usa un umbral de 'validos' propio del modo matiz."""
    with tempfile.TemporaryDirectory() as d:
        cfg, _ = video_matiz(d)
        _, fuera = correr05(d, cfg, vmin_sonido=40.0, vmax_sonido=50.0)
        _, dentro = correr05(d, cfg, vmin_sonido=0.0, vmax_sonido=32.0)
        _, pocos = correr05(d, cfg, brillo_min=250)              # casi ningún píxel cuenta: aviso de 'validos' con el hint de matiz
    ok = ("fuera de vmin_sonido..vmax_sonido" in fuera and "fuera de vmin_sonido..vmax_sonido" not in dentro
          and "AVISO" not in dentro and "AVISO: la mediana de 'validos'" in pocos and "brillo_min" in pocos)
    return ok, (f"rango 40-50: aviso {'sí' if 'fuera de' in fuera else 'NO'}; rango 0-32: sin aviso {'sí' if 'AVISO' not in dentro else 'NO'}; "
                f"brillo_min 250: aviso de validos {'sí' if 'AVISO: la mediana' in pocos else 'NO'}")


def j1():
    """06: con area < 0,01 el paneo va al centro (pan = 0); con zona caliente sigue al centroide."""
    n = 40
    R = _serie(n)
    for i, r in enumerate(R["rasgos"]):
        r["centroide_x"] = 0.1 + 0.8 * i / (n - 1)
        r["area"] = 0.005 if i < 10 or 20 <= i < 24 else 0.2             # 14 fotogramas sin zona caliente apreciable
    R["rasgos"][3]["area"] = 0.0099                                       # justo por debajo del umbral
    R["rasgos"][10]["area"] = 0.01                                        # en el umbral NO se centra
    with tempfile.TemporaryDirectory() as d:
        ctl, r = _06(R, d)
        if ctl is None:
            return False, "06 falló: " + r.stderr.strip()[-120:]
    p = np.array(ctl["pan"])
    sin = np.array([x["area"] < 0.01 for x in R["rasgos"]])
    ok = bool(np.all(np.abs(p[sin]) < 1e-9) and np.abs(p[~sin]).max() > 0.5 and abs(p[10]) > 1e-3 and sin.sum() == 14)
    return ok, f"{sin.sum()} fotogramas con area < 0,01: |pan| máx. {np.abs(p[sin]).max():.2g}; con zona caliente: |pan| máx. {np.abs(p[~sin]).max():.2f}; area = 0,01: pan {p[10]:+.2f}"


def j2():
    """06: el volumen normaliza el área entre su mínimo y su máximo (SST: 0,43-0,49 recorre -6..0 dB); casos sin variación."""
    def velocidades(areas):
        R = _serie(len(areas))
        for r, a in zip(R["rasgos"], areas):
            r["area"], r["media"] = a, 0.5                                # media fija: sin eventos fuertes
        R.update(ligar=False, densidad=False, humanizar=False)            # un ataque por fotograma, velocidad exacta
        with tempfile.TemporaryDirectory() as d:
            ctl, r = _06(R, d)
            if ctl is None:
                raise RuntimeError("06 falló: " + r.stderr.strip()[-120:])
            ons, _, _, _ = leer_mid(os.path.join(d, "salidas", "rocola.mid"))
        return [o[2] for o in ons]
    estrecho = velocidades(list(np.linspace(0.43, 0.49, 20)))
    constante_caliente = velocidades([0.3] * 10)
    constante_cero = velocidades([0.0] * 10)
    ok = (min(estrecho) == 64 and max(estrecho) == 127 and sorted(estrecho) == estrecho
          and set(constante_caliente) == {127} and set(constante_cero) == {64})
    return ok, (f"area 0,43-0,49: velocidad {min(estrecho)}..{max(estrecho)} (antes 116..127); area constante 0,3: {set(constante_caliente)}; "
                f"area constante 0: {set(constante_cero)}")


def j3():
    """06: el arpegio sube si caben las notas y baja desde la nota base en lo más alto de la escala (la primera nota es siempre la base)."""
    R = _serie(8)
    for r, m in zip(R["rasgos"], [0.75, 0.75, 1.0, 1.1, 1.2, 1.2, 1.2, 0.2]):
        r["media"] = m
    R.update(vmin_sonido=-0.6, vmax_sonido=1.2, referencia=0.0, densidad_umbrales=[0.3, 0.7], suavizado=0, octava=0)
    with tempfile.TemporaryDirectory() as d:
        ctl, r = _06(R, d)
        if ctl is None:
            return False, "06 falló: " + r.stderr.strip()[-120:]
    nf = ctl["notas"]
    esc = list(escala(48, 3))
    suben, bajan = nf[0], nf[4]
    ok = (suben == sorted(suben) and len(suben) == 4 and suben == esc[11:15]                 # base 11: caben 4 hacia arriba
          and bajan == esc[15:11:-1] and nf[4][0] == ctl["midi"][4]                          # base 15 (tope): baja 4
          and all(len(set(x)) == len(x) for x in nf))                                        # nunca se repite la nota más alta
    return ok, f"base 11: {suben}; base 15 (tope): {bajan}; sin notas repetidas en ningún fotograma: {all(len(set(x)) == len(x) for x in nf)}"


def j4():
    """web/preparar_datos.py aborta si salidas/rasgos.json no es del video de la pista que va a generar."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("preparar_datos", os.path.join("web", "preparar_datos.py"))
    pd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pd)
    video = os.path.join("datos", "2023GISTEMP_Map_SOS.mp4")
    res = {}
    with tempfile.TemporaryDirectory() as d:
        for nombre, fuente in (("sintético", "04_video_sintetico.mp4"), ("otro video", "datos/ecco2_sst_flow.mp4"), ("el mismo", "datos/2023GISTEMP_Map_SOS.mp4")):
            ruta = os.path.join(d, "r.json")
            json.dump({"fuente": fuente, "rasgos": []}, open(ruta, "w"))
            try:
                pd.comprobar_fuente(ruta, video)
                res[nombre] = "pasa"
            except SystemExit as e:
                res[nombre] = "aborta" if fuente.split("/")[-1] in str(e) else "aborta (mensaje sin la fuente)"
        try:
            pd.comprobar_fuente(os.path.join(d, "no_existe.json"), video)
            res["sin rasgos.json"] = "pasa"
        except SystemExit as e:
            res["sin rasgos.json"] = "aborta" if "Falta" in str(e) else "aborta (mensaje raro)"
    ok = res == {"sintético": "aborta", "otro video": "aborta", "el mismo": "pasa", "sin rasgos.json": "aborta"}
    return ok, "; ".join(f"{k}: {v}" for k, v in res.items())


def k1():
    """06 con FluidSynth: el dron suena continuo (sin ventanas de 0,5 s casi mudas ni caídas de más de 12 dB aunque la nota se repita y se ligue)."""
    if not (shutil.which("fluidsynth") and any(os.path.exists(p) for p in ("/usr/share/sounds/sf2/FluidR3_GM.sf2", "/usr/share/sounds/sf2/default-GM.sf2"))):
        return None, "fluidsynth o SoundFont no instalados"
    R = _serie(40)
    for i, r in enumerate(R["rasgos"]):
        r["media"], r["area"] = (0.3 if i < 20 else 0.35), 0.2 + 0.1 * (i % 3)     # la misma nota ligada durante 20 fotogramas seguidos
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "salidas"))
        ruta = os.path.join(d, "salidas", "k1.json")
        json.dump(R, open(ruta, "w"))
        r = correr("06_rasgos_a_audio.py", [ruta], d)                                # sin --sintetico: FluidSynth
        if r.returncode != 0:
            return False, "06 falló: " + r.stderr.strip()[-120:]
        fs, x = wavfile.read(os.path.join(d, "salidas", "rocola.wav"))
    m, w = (x.astype(float) / 32768).mean(axis=1), 22050
    db = np.array([20 * np.log10(np.sqrt(np.mean(m[i * w:(i + 1) * w] ** 2)) + 1e-12) for i in range(len(m) // w)])
    caida, minimo = float(-np.diff(db).min()), float(db.min())
    return caida <= 12 and minimo > -40, f"{len(db)} ventanas de 0,5 s: mínima {minimo:.1f} dB, mayor caída entre contiguas {caida:.1f} dB"


def k2():
    """exportar_web: comparar_audio() acepta el MP4 hecho con ese rocola.wav y rechaza otro audio (canales invertidos, 10 dB menos)."""
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        return None, "ffmpeg/ffprobe no instalados"
    from herramientas.exportar_web import comparar_audio, crear_mp4
    base = os.path.join(pipeline()["dir"], "salidas")
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(base, "rocola.wav")
        mp4 = os.path.join(d, "web.mp4")
        crear_mp4(os.path.join(base, "04_video_sintetico.mp4"), wav, mp4)
        fs, x = wavfile.read(wav)
        invertido, bajo = os.path.join(d, "inv.wav"), os.path.join(d, "bajo.wav")
        wavfile.write(invertido, fs, x[:, ::-1].copy())
        wavfile.write(bajo, fs, (x.astype(float) * 0.316).astype(np.int16))
        ok_mismo, t1 = comparar_audio(wav, mp4)
        ok_inv, _ = comparar_audio(invertido, mp4)
        ok_bajo, _ = comparar_audio(bajo, mp4)
    return ok_mismo and not ok_inv and not ok_bajo, f"mismo WAV: {'acepta' if ok_mismo else 'RECHAZA'} ({t1[:70]}); canales invertidos: {'acepta' if ok_inv else 'rechaza'}; 10 dB menos: {'acepta' if ok_bajo else 'rechaza'}"


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
    ("F3", "05: errores claros", "mensaje sin traza y rasgos.json intacto (4 casos)", f3),
    ("F4", "08: 600 rasgos con texto", "08 PASA (sin 'Argument list too long')", f4),
    ("G1", "06: dron = melodía(0 °C) - 12", "dron = nota de la melodía con 0 °C - 12 (medido en el .mid)", g1),
    ("G2", "05: centroide_y", "presente, entre 0 y 1, ≈ 0,5 en el video sintético", g2),
    ("G3", "06: paneo 'y' normalizado", "pan sigue a centroide_y y recorre < -0,9 … > 0,9", g3),
    ("G4", "06: cruce_dron = referencia", "primer fotograma con la nota de la referencia (no el 0)", g4),
    ("F5", "06: umbral_evento relativo", "mismos eventos fuertes con rango 0-1 y 270-310 (ni 0 ni todos)", f5),
    ("G5", "06: paneo con centroide fijo", "|pan| máx. < 0,1 con centroide 0,5 ± 0,002", g5),
    ("E5", "06 numpy + 07 con 4 notas", "07 sin FALLA con arpegios de 4 notas", e5),
    ("E4", "06: retardo media → notas", "|retardo| ≤ 1 fotograma (correlación cruzada), r > 0,8", e4),
    ("H1", "calibrar: orientación de la barra", "horizontal detectada; vertical (también con mesetas) igual que antes", h1),
    ("H2", "05: modo_color 'matiz'", "barra horizontal + color atenuado: error < 0,5 °C, validos > 0,95; 'lab' < 0,5", h2),
    ("H3", "fechas ISO: 'mar 2007'", "mes con fechas_formato 'mes', año por defecto, time.txt intacto, error claro", h3),
    ("H4", "calibrar: modo matiz", "dist_max 4, borde_px 0, mascara_estatica false; sin mezclar claves de Lab", h4),
    ("H5", "05: avisos en modo matiz", "aviso de media fuera de vmin_sonido..vmax_sonido y de validos (umbral propio)", h5),
    ("J1", "06: area < 0,01 -> pan al centro", "pan = 0 donde area < 0,01; con area = 0,01 sigue al centroide", j1),
    ("J2", "06: volumen min-max", "area 0,43-0,49 -> velocidad 64..127; area constante: 127 (hay zona) o 64", j2),
    ("J3", "06: arpegio en lo alto de la escala", "sube si caben las notas, baja desde la base si no; sin notas repetidas", j3),
    ("J4", "preparar_datos: protección de la fuente", "aborta si rasgos.json no es del video de la pista; pasa si coincide", j4),
    ("K1", "06: dron continuo (FluidSynth)", "ninguna ventana de 0,5 s < -40 dB ni caída > 12 dB con notas ligadas", k1),
    ("K2", "exportar_web: audio web = rocola.wav", "acepta el MP4 de ese WAV; rechaza canales invertidos y 10 dB menos", k2),
    ("I1", "especificación modo en vivo", "fórmulas de la ESPEC = control.json: notas exactas, pan ± 0,02 (3 casos sintéticos + 2 pistas)", i1),
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
