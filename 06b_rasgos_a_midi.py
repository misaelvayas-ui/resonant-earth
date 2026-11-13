"""
06b — rasgos.json -> salidas/rocola.mid -> salidas/rocola_real.wav (instrumentos reales)

Segunda salida de audio, con el MISMO mapeo que 06 (no la reemplaza):
  media       -> NOTA (misma escala, mismo rango "vmin_sonido"/"vmax_sonido")
  area        -> VELOCIDAD (el mismo volumen en dB de 06 pasado a lineal: 0,5 ... 1 -> 64 ... 127)
  centroide_x -> PANEO (CC10 en el canal 1, antes de cada nota)
  referencia  -> DRON sostenido en esa nota (+ 12 * "dron_octava"), canal 2, cuerdas, más bajo
Canal 1 = melodía (marimba, GM 13), canal 2 = dron (cuerdas, GM 49). Reverb CC91 en ambos.

Claves opcionales (van en el config de 05 y se copian a rasgos.json):
  "instrumento_melodia": 13   programa GM, numerado desde 1
  "instrumento_dron": 49      programa GM, numerado desde 1
  "reverb": 50                CC91, 0..127
  "dron_nivel": 0.08          el mismo de 06; velocidad del dron = 45 * dron_nivel / 0,08

Mejoras musicales opcionales (todas apagadas por defecto: sin ellas la salida es idéntica a la ronda 12):
  "ligar": false        true = si la nota no cambia respecto a la anterior, se extiende en vez de re-atacar
  "suavizado": 0        N > 1 = media móvil centrada de N fotogramas sobre la media (antes de elegir nota,
                        densidad y cruce del dron)
  "densidad": false     true = notas por fotograma según la media: < 0,3 -> 1; 0,3-0,7 -> 2; > 0,7 -> 4
                        (arpegio ascendente por la escala desde la nota del fotograma)
  "octava": 0           desplaza melodía y dron (+1 = una octava arriba)
  "dron_programa": null programa GM (desde 1) del dron; si existe, manda sobre "instrumento_dron"
  "humanizar": false    true = velocidad ±10 %, tiempo ±10 ms, semilla fija
Estas claves pueden ir en el config de 05 (se copian a rasgos.json) o en un JSON aparte con --musica.

Uso:  python 06b_rasgos_a_midi.py [rasgos.json] [--musica config/musica_v2.json] [--sufijo _v2] [--sin-render]
Con --sufijo _v2 escribe rocola_v2.mid, rocola_real_v2.wav y control_midi_v2.json (sin pisar los de v1).
Requiere mido (pip), fluidsynth y una SoundFont GM (sudo apt install fluidsynth fluid-soundfont-gm).
Variable de entorno ROCOLA_SF2 = otra SoundFont. El WAV se recorta/rellena a la duración de rocola.wav.
"""
import json
import os
import shutil
import subprocess
import sys
import numpy as np
import mido
from scipy.io import wavfile
from rutas import sal
from sintesis import FS, escala, valor_a_nota, db_a_lineal, limitar, guardar_wav

SEG_POR_FOTOGRAMA = 0.5          # igual que 06
TPB, BPM = 480, 120              # 1 s = 960 ticks
TICKS_F = int(SEG_POR_FOTOGRAMA * TPB * BPM / 60)
SF2 = [os.environ.get("ROCOLA_SF2", ""), "/usr/share/sounds/sf2/FluidR3_GM.sf2",
       "/usr/share/sounds/sf2/default-GM.sf2"]

def opcion(nombre):
    """Valor que sigue a '--nombre' en la línea de comandos (o None)."""
    return sys.argv[sys.argv.index(nombre) + 1] if nombre in sys.argv else None


SUF = opcion("--sufijo") or ""
_val = {sys.argv[sys.argv.index(o) + 1] for o in ("--sufijo", "--musica") if o in sys.argv}
args = [a for a in sys.argv[1:] if not a.startswith("--") and a not in _val]
with open(args[0] if args else sal("rasgos.json")) as fh:
    d = json.load(fh)
if opcion("--musica"):
    with open(opcion("--musica")) as fh:
        d.update(json.load(fh))                  # las claves musicales del JSON aparte mandan
R = d["rasgos"]


def rellenar(v, defecto):                      # idéntico a 06
    v = np.array([np.nan if x is None else x for x in v], dtype=float)
    ultimo = defecto
    for i, x in enumerate(v):
        if np.isnan(x):
            v[i] = ultimo
        else:
            ultimo = x
    return v


media = rellenar([r["media"] for r in R], (d["vmin"] + d["vmax"]) / 2)
area = rellenar([r["area"] for r in R], 0.0)
cx = rellenar([r["centroide_x"] for r in R], 0.5)


def media_movil(x, n):
    """Media móvil centrada de n fotogramas (n impar; en los bordes la ventana se acorta)."""
    n = int(n) | 1
    h = n // 2
    return np.array([x[max(0, i - h): i + h + 1].mean() for i in range(len(x))])


suavizado = int(d.get("suavizado", 0))
media_s = media_movil(media, suavizado) if suavizado > 1 else media

notas = escala(tonica_midi=48, octavas=3)
v0, v1 = d.get("vmin_sonido", d["vmin"]), d.get("vmax_sonido", d["vmax"])
midi = valor_a_nota(media_s, v0, v1, notas)
octava = int(d.get("octava", 0))
ref = d.get("referencia")
nota_ref = int(valor_a_nota(ref, v0, v1, notas)) if ref is not None else int(midi[0])
nota_dron = int(np.clip(nota_ref + 12 * (d.get("dron_octava", 0) + octava), 0, 127))

vel = np.round(127 * db_a_lineal(-6 + 6 * np.clip(area / max(area.max(), 1e-6), 0, 1))).astype(int)
pan = np.clip(np.round(64 + 63 * (2 * cx - 1)), 0, 127).astype(int)
nivel = d.get("dron_nivel", 0.08)
vel_dron = int(np.clip(round(45 * nivel / 0.08), 1, 127))
reverb = int(np.clip(d.get("reverb", 50), 0, 127))
prog_mel = int(d.get("instrumento_melodia", 13)) - 1
prog_dron = int(d.get("dron_programa") or d.get("instrumento_dron", 49)) - 1

n_f = len(R)
total = n_f * TICKS_F

# --- notas de la melodía: lista de (inicio, fin, nota, velocidad) en ticks ----
def n_notas(m):                                   # densidad según la anomalía (media suavizada)
    return 1 if m < 0.3 else (2 if m <= 0.7 else 4)


idx_escala = {int(n): i for i, n in enumerate(notas)}
por_fotograma = []                                # notas (sin octava) de cada fotograma
mel = []
for i in range(n_f):
    k = n_notas(media_s[i]) if d.get("densidad") else 1
    base = idx_escala[int(midi[i])]
    arp = [int(notas[min(base + j, len(notas) - 1)]) for j in range(k)]
    por_fotograma.append(arp)
    lim = [round(j * TICKS_F / k) for j in range(k + 1)]
    for j in range(k):
        ini = i * TICKS_F + lim[j]
        mel.append([ini, ini + int((lim[j + 1] - lim[j]) * 0.95), arp[j], int(vel[i])])
atq_antes_de_ligar = len(mel)
if d.get("ligar"):                                # misma nota que la anterior: se extiende
    fusion = [mel[0]]
    for ini, fin, nota, v in mel[1:]:
        if nota == fusion[-1][2]:
            fusion[-1][1] = fin
        else:
            fusion.append([ini, fin, nota, v])
    mel = fusion
if d.get("humanizar"):                            # semilla fija: mismo resultado en cada ejecución
    rng = np.random.default_rng(12345)
    ms = round(0.010 * TPB * BPM / 60)            # 10 ms en ticks
    for m in mel:
        j = int(round(rng.uniform(-1, 1) * ms))
        m[0], m[1] = max(0, m[0] + j), min(total, m[1] + j)
        m[3] = int(np.clip(round(m[3] * rng.uniform(0.9, 1.1)), 1, 127))
    for a_, b_ in zip(mel, mel[1:]):              # melodía monofónica: una nota no pisa a la siguiente
        a_[1] = max(a_[0] + 1, min(a_[1], b_[0] - 1))
mel = [[ini, fin, int(np.clip(nota + 12 * octava, 0, 127)), v] for ini, fin, nota, v in mel]

# --- MIDI: eventos con tiempo absoluto en ticks, luego se convierten a delta ---
ev = []                                           # (tick, orden, mensaje)
for canal, prog, p in ((0, prog_mel, 64), (1, prog_dron, 64)):
    ev += [(0, 0, mido.Message("program_change", channel=canal, program=prog)),
           (0, 0, mido.Message("control_change", channel=canal, control=10, value=p)),
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
ruta_mid = sal(f"rocola{SUF}.mid")
archivo.save(ruta_mid)

# curva de control de 06b (para evaluar.py y para reportar): la serie suavizada y el cruce del dron
voz = midi + 12 * octava
fechas = [r.get("fecha") for r in R]
tras = [i for i in range(n_f) if (voz[i:] >= nota_dron).all()]
cruce = (fechas[tras[0]] if fechas[tras[0]] is not None else tras[0]) if tras else None
with open(sal(f"control_midi{SUF}.json"), "w") as fh:
    json.dump({"seg_por_fotograma": SEG_POR_FOTOGRAMA, "midi": voz.tolist(),
               "notas": [[n + 12 * octava for n in a_] for a_ in por_fotograma],
               "ataques": len(mel), "ataques_sin_ligar": atq_antes_de_ligar,
               "dron": nota_dron, "cruce_dron": cruce,
               "nota_min": min(m[2] for m in mel), "nota_max": max(m[2] for m in mel)}, fh)
print(f"MIDI guardado: {ruta_mid}  ({len(mel)} ataques, dron en {nota_dron}, cruce del dron: {cruce}, "
      f"notas {min(m[2] for m in mel)}-{max(m[2] for m in mel)}, instrumentos GM {prog_mel + 1}/{prog_dron + 1})")

if "--sin-render" in sys.argv:
    sys.exit(0)

# --- render con fluidsynth --------------------------------------------------
fs_bin = shutil.which("fluidsynth")
sf2 = next((s for s in SF2 if s and os.path.exists(s)), None)
if fs_bin is None or sf2 is None:
    sys.exit("Falta fluidsynth o la SoundFont GM:  sudo apt install fluidsynth fluid-soundfont-gm")
crudo = sal(f"rocola_real{SUF}_crudo.wav")
r = subprocess.run([fs_bin, "-ni", "-r", str(FS), "-T", "wav", "-F", crudo, sf2, ruta_mid],
                   capture_output=True, text=True)
if r.returncode != 0 or not os.path.exists(crudo):
    sys.exit(f"fluidsynth falló:\n{r.stderr[-1500:]}")
fs, x = wavfile.read(crudo)
os.remove(crudo)
x = x.astype(float) / 32768.0
if x.ndim == 1:
    x = np.stack([x, x], axis=1)
N = n_f * int(SEG_POR_FOTOGRAMA * FS)             # misma duración que rocola.wav
x = x[:N] if len(x) >= N else np.vstack([x, np.zeros((N - len(x), 2))])
x[-int(0.05 * FS):] *= np.linspace(1, 0, int(0.05 * FS))[:, None]      # fundido de 50 ms
x *= 0.85 / max(np.abs(x).max(), 1e-9)                                  # mismo techo que 06
guardar_wav(sal(f"rocola_real{SUF}.wav"), x)
