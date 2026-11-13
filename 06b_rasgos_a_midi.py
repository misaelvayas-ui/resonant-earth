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

Uso:  python 06b_rasgos_a_midi.py [rasgos.json] [--sin-render]
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

args = [a for a in sys.argv[1:] if not a.startswith("--")]
with open(args[0] if args else sal("rasgos.json")) as fh:
    d = json.load(fh)
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

notas = escala(tonica_midi=48, octavas=3)
v0, v1 = d.get("vmin_sonido", d["vmin"]), d.get("vmax_sonido", d["vmax"])
midi = valor_a_nota(media, v0, v1, notas)
ref = d.get("referencia")
nota_ref = int(valor_a_nota(ref, v0, v1, notas)) if ref is not None else int(midi[0])
nota_dron = int(np.clip(nota_ref + 12 * d.get("dron_octava", 0), 0, 127))

vel = np.round(127 * db_a_lineal(-6 + 6 * np.clip(area / max(area.max(), 1e-6), 0, 1))).astype(int)
pan = np.clip(np.round(64 + 63 * (2 * cx - 1)), 0, 127).astype(int)
vel_dron = int(np.clip(round(45 * d.get("dron_nivel", 0.08) / 0.08), 1, 127))
reverb = int(np.clip(d.get("reverb", 50), 0, 127))
prog_mel = int(d.get("instrumento_melodia", 13)) - 1
prog_dron = int(d.get("instrumento_dron", 49)) - 1

# --- MIDI: eventos con tiempo absoluto en ticks, luego se convierten a delta ---
ev = []                                           # (tick, orden, mensaje)
for canal, prog, p in ((0, prog_mel, 64), (1, prog_dron, 64)):
    ev += [(0, 0, mido.Message("program_change", channel=canal, program=prog)),
           (0, 0, mido.Message("control_change", channel=canal, control=10, value=p)),
           (0, 0, mido.Message("control_change", channel=canal, control=91, value=reverb))]
n_f = len(R)
total = n_f * TICKS_F
for i in range(n_f):
    t = i * TICKS_F
    ev.append((t, 1, mido.Message("control_change", channel=0, control=10, value=int(pan[i]))))
    ev.append((t, 2, mido.Message("note_on", channel=0, note=int(midi[i]), velocity=int(vel[i]))))
    ev.append((t + int(TICKS_F * 0.95), 0, mido.Message("note_off", channel=0, note=int(midi[i]), velocity=0)))
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
print(f"MIDI guardado: {ruta_mid}  ({n_f} notas de melodía, dron en {nota_dron}, "
      f"instrumentos GM {prog_mel + 1}/{prog_dron + 1})")

if "--sin-render" in sys.argv:
    sys.exit(0)

# --- render con fluidsynth --------------------------------------------------
fs_bin = shutil.which("fluidsynth")
sf2 = next((s for s in SF2 if s and os.path.exists(s)), None)
if fs_bin is None or sf2 is None:
    sys.exit("Falta fluidsynth o la SoundFont GM:  sudo apt install fluidsynth fluid-soundfont-gm")
crudo = sal("rocola_real_crudo.wav")
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
guardar_wav(sal("rocola_real.wav"), x)
