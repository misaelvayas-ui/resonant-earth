"""
06 — rasgos.json -> rocola.mid -> rocola.wav (estéreo, instrumentos reales) + control.json

Mapeo (el "contrato" sonoro, explícalo así en el pitch):
  media        -> NOTA de la melodía (pentatónica de 3 octavas; antes se suaviza con una media móvil)
  area         -> VOLUMEN: velocidad MIDI 64...127 (= -6 dB ... 0 dB)
  centroide_x  -> PANEO izquierda/derecha = dónde está lo "caliente" en el mapa (CC10 en el .mid; en el
                  WAV se aplica tras el render, porque las muestras estéreo de la SoundFont ignoran CC10)
  densidad     -> notas por fotograma según la anomalía: < u1 -> 1; u1-u2 -> 2; > u2 -> 4 (0,3 y 0,7 en GISTEMP)
                  (arpegio ascendente por la escala desde la nota del fotograma)
  referencia   -> DRON sostenido una octava bajo la nota que la melodía toca con el valor 'referencia'
                  (p. ej. 0 = sin anomalía) o, si no existe, bajo la del primer fotograma: se oye si el presente está por encima o por debajo

Salida: canal 1 = marimba (GM 13), canal 2 = dron en pad (GM 89), reverb CC91. Se escribe
salidas/rocola.mid y se renderiza con FluidSynth a 44,1 kHz estéreo -> salidas/rocola.wav, más
salidas/control.json (lo leen 07 y evaluar.py).

Respaldo: sin fluidsynth o sin SoundFont (o con --sintetico) se usa la síntesis numpy de siempre,
dirigida por las MISMAS notas: mismo .mid, misma duración, otro timbre.
    sudo apt install fluidsynth fluid-soundfont-gm

Claves opcionales (van en el config de 05 y se copian a rasgos.json); entre paréntesis, el valor por defecto:
  "ligar" (true)           misma nota que la anterior -> se extiende en vez de re-atacar
  "suavizado" (3)          media móvil centrada de N fotogramas sobre la media (0 o 1 = sin suavizar)
  "densidad" (true)        notas por fotograma según la anomalía; false = una nota por fotograma
  "regolpe_ligado" (2)     en una nota ligada, la vuelve a tocar cada N fotogramas (0 = nunca)
  "regolpe_vel" (0.4)      velocidad del re-golpe como fracción de la de la nota
  "umbral_evento" (0.15)   si la media CRUDA cambia más que esto entre fotogramas, ataque fuerte (vel >= 100)
                           aunque la nota no cambie
  "octava" (1)             desplaza melodía y dron (+1 = una octava arriba)
  "humanizar" (true)       velocidad ±10 %, tiempo ±10 ms, semilla fija (12345)
  "instrumento_melodia" (13), "dron_programa" (89)   programas GM, numerados desde 1
  "dron_octava" (0)        octavas extra del dron; 0 = melodía(referencia) - 12 semitonos
  "dron_nivel" (0.048)     volumen del dron (velocidad MIDI = 45 * dron_nivel / 0,08; amplitud en el respaldo)
  "reverb" (50)            CC91, 0..127
  "paneo" ("x")            eje del paneo: "x" = izquierda-derecha del mapa, "y" = sur (izq.) - norte (der.);
                           el centroide se suaviza y se normaliza (percentiles 5-95) antes de panear
  "vmin_sonido"/"vmax_sonido" (vmin/vmax)   rango de la media que se reparte entre las notas
  "densidad_umbrales" ([u1, u2])   media por debajo de u1 -> 1 nota; hasta u2 -> 2; más -> 4 (por defecto
                           el 50 % y el 72 % del rango de sonido; GISTEMP usa [0.3, 0.7])
Para el sonido sin adornos: ligar false, suavizado 0, densidad false, octava 0, humanizar false.

Uso:  python 06_rasgos_a_audio.py [rasgos.json] [--sintetico]
Variable de entorno ROCOLA_SF2 = otra SoundFont. Con ROCOLA_SIN_AUDIO=1 no reproduce el resultado.
"""
import json
import os
import shutil
import subprocess
import sys
import mido
import numpy as np
from scipy.io import wavfile
from rutas import sal
from sintesis import (FS, escala, valor_a_nota, midi_a_hz, oscilador, adsr, paneo, db_a_lineal,
                      suavizar_rapido, limitar, guardar_wav, reproducir)

SEG_POR_FOTOGRAMA = 0.5          # tempo: cuánto dura cada fotograma en el audio
TPB, BPM = 480, 120              # 1 s = 960 ticks
TICKS_F = int(SEG_POR_FOTOGRAMA * TPB * BPM / 60)
SF2 = [os.environ.get("ROCOLA_SF2", ""), "/usr/share/sounds/sf2/FluidR3_GM.sf2",
       "/usr/share/sounds/sf2/default-GM.sf2"]
APT = "sudo apt install fluidsynth fluid-soundfont-gm"
DEFECTOS = {"ligar": True, "suavizado": 3, "densidad": True, "octava": 1, "humanizar": True,
            "instrumento_melodia": 13, "dron_programa": 89, "dron_octava": 0, "dron_nivel": 0.048,
            "reverb": 50, "paneo": "x", "regolpe_ligado": 2, "regolpe_vel": 0.4, "umbral_evento": 0.15}

args = [a for a in sys.argv[1:] if not a.startswith("--")]
with open(args[0] if args else sal("rasgos.json")) as fh:
    d = json.load(fh)
R = d["rasgos"]
if not R:
    sys.exit("rasgos.json no tiene fotogramas: vuelve a ejecutar 05 y revisa su configuración.")
cfg = {**DEFECTOS, **{k: d[k] for k in DEFECTOS if d.get(k) is not None}}


def rellenar(v, defecto):
    """Sustituye NaN/None por el último valor válido (o 'defecto' si aún no hay ninguno)."""
    v = np.array([np.nan if x is None else x for x in v], dtype=float)
    ultimo = defecto
    for i, x in enumerate(v):
        if np.isnan(x):
            v[i] = ultimo
        else:
            ultimo = x
    return v


def media_movil(x, n):
    """Media móvil centrada de n fotogramas (n impar; en los bordes la ventana se acorta)."""
    h = (int(n) | 1) // 2
    return np.array([x[max(0, i - h): i + h + 1].mean() for i in range(len(x))])


media = rellenar([r["media"] for r in R], (d["vmin"] + d["vmax"]) / 2)
area = rellenar([r["area"] for r in R], 0.0)
cx = rellenar([r["centroide_x"] for r in R], 0.5)
media_s = media_movil(media, cfg["suavizado"]) if int(cfg["suavizado"]) > 1 else media

# --- nota base por fotograma ---------------------------------------------
notas = escala(tonica_midi=48, octavas=3)                   # Do3 ... Do6
v0, v1 = d.get("vmin_sonido", d["vmin"]), d.get("vmax_sonido", d["vmax"])   # rango propio del sonido
midi = valor_a_nota(media_s, v0, v1, notas)
octava = int(cfg["octava"])
ref = d.get("referencia")
nota_ref = int(valor_a_nota(ref, v0, v1, notas)) if ref is not None else int(midi[0])
# dron = la nota que la MELODÍA toca con la referencia (misma función de mapeo, cuantización y octava) - 12;
# "dron_octava" lo desplaza más (0 = exactamente una octava bajo la melodía)
nota_dron = int(np.clip(nota_ref + 12 * octava - 12 + 12 * int(cfg["dron_octava"]), 0, 127))

vel = np.round(127 * db_a_lineal(-6 + 6 * np.clip(area / max(area.max(), 1e-6), 0, 1))).astype(int)
# paneo: eje 'x' (izquierda-derecha del mapa) o 'y' (sur = izquierda, norte = derecha). El centroide se
# suaviza y se normaliza con los percentiles 5-95 de la serie: así el paneo usa todo su recorrido aunque el
# centroide real se mueva poco (en GISTEMP casi no se mueve).
eje = cfg["paneo"]
if eje == "y" and not any("centroide_y" in r for r in R):
    print("AVISO: rasgos.json no trae centroide_y (vuelve a ejecutar 05); uso paneo 'x'.")
    eje = "x"
c_eje = cx if eje == "x" else rellenar([r.get("centroide_y") for r in R], 0.5)
c_suave = media_movil(c_eje, 3)
p5, p95 = np.percentile(c_suave, [5, 95])
c_pan = np.clip((c_suave - p5) / (p95 - p5), 0, 1) if p95 - p5 > 1e-6 else np.full(len(R), 0.5)
pan = np.clip(np.round(64 + 63 * (2 * c_pan - 1)), 0, 127).astype(int)
vel_dron = int(np.clip(round(45 * cfg["dron_nivel"] / 0.08), 1, 127))
reverb = int(np.clip(cfg["reverb"], 0, 127))
prog_mel, prog_dron = int(cfg["instrumento_melodia"]) - 1, int(cfg["dron_programa"]) - 1

n_f = len(R)
total = n_f * TICKS_F


# umbrales de densidad en las unidades de la media; por defecto, la misma fracción del rango de sonido
# que 0,3 y 0,7 en GISTEMP (rango -0,6..1,2): 1/2 y 13/18 del rango
u1, u2 = d.get("densidad_umbrales") or (v0 + 0.5 * (v1 - v0), v0 + 13 / 18 * (v1 - v0))


def n_notas(m):                                   # densidad según la anomalía (media suavizada)
    return 1 if m < u1 else (2 if m <= u2 else 4)


# --- melodía: lista de [inicio, fin, nota, velocidad] en ticks -------------
idx_escala = {int(n): i for i, n in enumerate(notas)}
por_fotograma, mel = [], []
for i in range(n_f):
    k = n_notas(media_s[i]) if cfg["densidad"] else 1
    base = idx_escala[int(midi[i])]
    arp = [int(notas[min(base + j, len(notas) - 1)]) for j in range(k)]
    por_fotograma.append(arp)
    lim = [round(j * TICKS_F / k) for j in range(k + 1)]
    for j in range(k):
        ini = i * TICKS_F + lim[j]
        mel.append([ini, ini + int((lim[j + 1] - lim[j]) * 0.95), arp[j], int(vel[i]), i, j])
ataques_sin_ligar = len(mel)
# eventos bruscos de la media CRUDA (sin suavizar): siempre llevan un ataque fuerte, aunque la nota no cambie
fuerte = [bool(i > 0 and abs(media[i] - media[i - 1]) > cfg["umbral_evento"]) for i in range(n_f)]
VEL_FUERTE = 100
meta = []                                         # por cada ataque: (fotograma, tipo, inicio nominal en ticks)
fusion = []
ult_f = -1                                        # fotograma del último ataque
for ini, fin, nota, v, f, j in mel:
    forzado = fuerte[f] and j == 0
    if forzado:
        v = max(v, VEL_FUERTE)
    if cfg["ligar"] and fusion and nota == fusion[-1][2] and not forzado:
        rg = int(cfg["regolpe_ligado"])
        if rg > 0 and j == 0 and f - ult_f >= rg:           # nota larga ligada: se vuelve a tocar, suave
            fusion.append([ini, fin, nota, max(1, round(v * cfg["regolpe_vel"]))])
            meta.append((f, "regolpe", ini))
            ult_f = f
        else:
            fusion[-1][1] = fin                              # se extiende en vez de re-atacar
        continue
    fusion.append([ini, fin, nota, v])
    meta.append((f, "fuerte" if forzado else "ataque", ini))
    ult_f = f
mel = fusion
# ataque_en_fotograma: golpe NUEVO (nota nueva o evento brusco) en el arranque del fotograma;
# False = nota ligada o solo un re-golpe suave (no sirve para medir tono ni paneo)
ataque_en_fotograma = [False] * n_f
for f, tipo, ini in meta:
    if tipo != "regolpe" and ini == f * TICKS_F:
        ataque_en_fotograma[f] = True
regolpe_en_fotograma = [any(t == "regolpe" and f == i for f, t, _ in meta) for i in range(n_f)]
if cfg["humanizar"]:                              # semilla fija: mismo resultado en cada ejecución
    rng = np.random.default_rng(12345)
    ms = round(0.010 * TPB * BPM / 60)            # 10 ms en ticks
    for m in mel:
        j = int(round(rng.uniform(-1, 1) * ms))
        m[0], m[1] = max(0, m[0] + j), min(total, m[1] + j)
        m[3] = int(np.clip(round(m[3] * rng.uniform(0.9, 1.1)), 1, 127))
    for a_, b_ in zip(mel, mel[1:]):              # melodía monofónica: una nota no pisa a la siguiente
        a_[1] = max(a_[0] + 1, min(a_[1], b_[0] - 1))
mel = [[ini, fin, int(np.clip(nota + 12 * octava, 0, 127)), v] for ini, fin, nota, v in mel]

# --- archivo MIDI ----------------------------------------------------------
ev = []                                           # (tick, orden, mensaje)
for canal, prog in ((0, prog_mel), (1, prog_dron)):
    ev += [(0, 0, mido.Message("program_change", channel=canal, program=prog)),
           (0, 0, mido.Message("control_change", channel=canal, control=10, value=64)),
           (0, 0, mido.Message("control_change", channel=canal, control=91, value=reverb))]
for i in range(n_f):
    ev.append((i * TICKS_F, 1, mido.Message("control_change", channel=0, control=10, value=int(pan[i]))))
for ini, fin, nota, v in mel:
    ev.append((ini, 2, mido.Message("note_on", channel=0, note=nota, velocity=v)))
    ev.append((fin, 0, mido.Message("note_off", channel=0, note=nota, velocity=0)))
ev.append((0, 2, mido.Message("note_on", channel=1, note=nota_dron, velocity=vel_dron)))
ev.append((total, 0, mido.Message("note_off", channel=1, note=nota_dron, velocity=0)))
ev.sort(key=lambda e: (e[0], e[1]))
pista = mido.MidiTrack()
pista.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
previo = 0
for t, _, m in ev:
    pista.append(m.copy(time=t - previo))
    previo = t
pista.append(mido.MetaMessage("end_of_track", time=total - previo))
archivo = mido.MidiFile(type=1, ticks_per_beat=TPB)
archivo.tracks.append(pista)
ruta_mid = sal("rocola.mid")
archivo.save(ruta_mid)

N = n_f * int(SEG_POR_FOTOGRAMA * FS)             # muestras totales (igual en los dos modos)


# --- audio 1: instrumentos reales con FluidSynth ------------------------------
def renderizar_canal(fs_bin, sf2, canal):
    """Renderiza SOLO un canal del .mid y devuelve (N, 2) float. Se hace por separado porque las
    muestras estéreo de la SoundFont ignoran el CC10 (paneo): el paneo se aplica después, por muestra."""
    pista_c = mido.MidiTrack()
    pista_c.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
    previo_c = 0
    for t, _, m in ev:
        if getattr(m, "channel", canal) == canal:
            pista_c.append(m.copy(time=t - previo_c))
            previo_c = t
    pista_c.append(mido.MetaMessage("end_of_track", time=total - previo_c))
    mf = mido.MidiFile(type=1, ticks_per_beat=TPB)
    mf.tracks.append(pista_c)
    tmp_mid, tmp_wav = sal(f"_canal{canal}.mid"), sal(f"_canal{canal}.wav")
    mf.save(tmp_mid)
    r = subprocess.run([fs_bin, "-ni", "-r", str(FS), "-T", "wav", "-F", tmp_wav, sf2, tmp_mid],
                       capture_output=True, text=True)
    os.remove(tmp_mid)
    if r.returncode != 0 or not os.path.exists(tmp_wav):
        return None, r.stderr.strip()[-200:]
    _, x = wavfile.read(tmp_wav)
    os.remove(tmp_wav)
    x = x.astype(float) / 32768.0
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return (x[:N] if len(x) >= N else np.vstack([x, np.zeros((N - len(x), 2))])), ""


def renderizar_fluidsynth():
    """Devuelve el estéreo float (N, 2) o None si falta fluidsynth/SoundFont o falla el render."""
    fs_bin = shutil.which("fluidsynth")
    sf2 = next((s for s in SF2 if s and os.path.exists(s)), None)
    if fs_bin is None or sf2 is None:
        print(f"AVISO: falta {'fluidsynth' if fs_bin is None else 'la SoundFont GM'}; uso la síntesis "
              f"numpy de respaldo (suena distinto, mismas notas).\n       Para instrumentos reales:  {APT}\n"
              "       (macOS: brew install fluid-synth; otra SoundFont o Windows: ver README, variable ROCOLA_SF2)")
        return None
    melodia, err1 = renderizar_canal(fs_bin, sf2, 0)
    dron_x, err2 = renderizar_canal(fs_bin, sf2, 1)
    if melodia is None or dron_x is None:
        print(f"AVISO: fluidsynth falló ({err1 or err2}); uso la síntesis numpy de respaldo.")
        return None
    spf = int(SEG_POR_FOTOGRAMA * FS)
    p = suavizar_rapido(np.interp(np.arange(N), (np.arange(n_f) + 0.5) * spf, 2 * c_pan - 1), 0.15)
    # la melodía se pasa a mono y se panea por muestra: así el paneo es exacto aunque la imagen
    # estéreo propia de cada muestra de la SoundFont cambie de una nota a otra
    x = paneo(melodia.mean(axis=1), p) * np.sqrt(2) + dron_x
    x[-int(0.05 * FS):] *= np.linspace(1, 0, int(0.05 * FS))[:, None]      # fundido de 50 ms
    return limitar(x)                                                       # mismo limitador que el respaldo (techo 0,85)


# --- audio 2 (respaldo): la síntesis numpy de siempre, dirigida por las mismas notas ----------
def sintetizar_numpy():
    spf = int(SEG_POR_FOTOGRAMA * FS)
    t_f = (np.arange(n_f) + 0.5) * spf
    lineal = lambda v: np.interp(np.arange(N), t_f, v)         # interpolación lineal
    # nota que suena en cada muestra: la última que empezó (la voz se mantiene hasta la siguiente)
    inicios = [int(m[0] * FS / (TPB * BPM / 60)) for m in mel]
    nota_m = np.full(N, float(mel[0][2]))
    for k, ini in enumerate(inicios):
        nota_m[ini: (inicios[k + 1] if k + 1 < len(inicios) else N)] = mel[k][2]
    f_lead = suavizar_rapido(midi_a_hz(nota_m), 0.04)           # glide 40 ms
    amp = suavizar_rapido(lineal(db_a_lineal(-6 + 6 * np.clip(area / max(area.max(), 1e-6), 0, 1))), 0.08)
    lead = 0.5 * amp * oscilador(f_lead, "suave")
    plucks = np.zeros(N)                                       # un golpe en cada ataque
    n_pl = int(0.35 * FS)
    for (ini_t, _, nota, vl), ini in zip(mel, inicios):
        seg = oscilador(np.full(n_pl, midi_a_hz(nota + 12)), "triangular")
        seg *= adsr(n_pl, a=0.003, d=0.12, s=0.0, r=0.05)
        fin = min(ini + n_pl, N)
        plucks[ini:fin] += 0.35 * (vl / 90) * seg[: fin - ini]
    dron = cfg["dron_nivel"] * oscilador(np.full(N, midi_a_hz(nota_dron)), "seno")
    p = suavizar_rapido(lineal(2 * c_pan - 1), 0.15)
    return limitar(paneo(lead + plucks, p) + paneo(dron, 0.0))


modo, estereo = "sintetico", None
if "--sintetico" not in sys.argv:
    estereo = renderizar_fluidsynth()
    modo = "fluidsynth" if estereo is not None else "sintetico"
if estereo is None:
    estereo = sintetizar_numpy()
guardar_wav(sal("rocola.wav"), estereo)

# --- control.json: lo leen 07 y evaluar.py -----------------------------------------------------
voz = midi + 12 * octava
fechas = [r.get("fecha") for r in R]
tras = [i for i in range(n_f) if (voz[i:] >= nota_dron).all()]
cruce = (fechas[tras[0]] if fechas[tras[0]] is not None else tras[0]) if tras else None
with open(sal("control.json"), "w") as fh:
    json.dump({"seg_por_fotograma": SEG_POR_FOTOGRAMA,
               "midi": voz.tolist(),                          # NOTA BASE por fotograma (ya con octava)
               "notas": [[n + 12 * octava for n in a_] for a_ in por_fotograma],   # arpegio por fotograma
               "pan": (2 * c_pan - 1).tolist(), "paneo": eje, "ataque_en_fotograma": ataque_en_fotograma, "dron": nota_dron, "cruce_dron": cruce,
               "regolpe_en_fotograma": regolpe_en_fotograma, "evento_fuerte": fuerte,
               "notas_ataque": [m[2] for m in mel], "inicio_ticks": [t for _, _, t in meta],
               "tipo_ataque": [t for _, t, _ in meta],
               "ataques": len(mel), "ataques_sin_ligar": ataques_sin_ligar,
               "nota_min": min(m[2] for m in mel), "nota_max": max(m[2] for m in mel),
               "modo": modo}, fh)
print(f"Modo: {modo} | ataques {len(mel)} (sin ligar {ataques_sin_ligar}) | notas "
      f"{min(m[2] for m in mel)}-{max(m[2] for m in mel)} | dron {nota_dron} | cruce del dron: {cruce}")
print("Nota base por fotograma:", voz.astype(int).tolist())
reproducir(estereo)

# EJERCICIOS
# 1. Cambia SEG_POR_FOTOGRAMA a 0.25 y 1.0: ¿qué tempo se entiende mejor?
# 2. Apaga las mejoras (ligar false, suavizado 0, densidad false, humanizar false) y compara el sonido.
# 3. Invierte el paneo y pide a alguien que señale con la mano dónde está la "tormenta".
