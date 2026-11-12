"""
06 — rasgos.json -> rocola.wav (estéreo)

Mapeo (el "contrato" sonoro, explícalo así en el pitch):
  media        -> TONO de la voz principal (cuantizado a pentatónica, con glide)
  area         -> VOLUMEN de la voz principal (en dB: -6 dB ... 0 dB)
  centroide_x  -> PANEO (izquierda/derecha = dónde está lo "caliente" en el mapa)
  cambio       -> "golpe" (pluck con ADSR) cuando la media cambia de nota
  referencia   -> DRON grave fijo en la nota del valor medio del primer fotograma
                  (escuchas cuánto se aleja el presente del inicio)

Los rasgos llegan a ~4 por segundo; se interpolan a 44,1 kHz y se suavizan
(filtro de 1 polo) para que no haya escalones ni clics.
"""
import json
import sys
import numpy as np
from sintesis import (FS, escala, valor_a_nota, midi_a_hz, oscilador, adsr, paneo,
                      db_a_lineal, suavizar_rapido, limitar, guardar_wav, reproducir)

SEG_POR_FOTOGRAMA = 0.5   # tempo: cuánto dura cada fotograma en el audio
with open(sys.argv[1] if len(sys.argv) > 1 else "rasgos.json") as fh:
    d = json.load(fh)
R = d["rasgos"]


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


media = rellenar([r["media"] for r in R], (d["vmin"] + d["vmax"]) / 2)
area = rellenar([r["area"] for r in R], 0.0)
cx = rellenar([r["centroide_x"] for r in R], 0.5)

notas = escala(tonica_midi=48, octavas=3)                   # Do3 ... Do6
midi = valor_a_nota(media, d["vmin"], d["vmax"], notas)

# --- de "un valor por fotograma" a "un valor por muestra" ----------------
n_f = len(R)
spf = int(SEG_POR_FOTOGRAMA * FS)
N = n_f * spf
escalon = lambda v: np.repeat(v, spf)                      # retención de orden cero
t_f = (np.arange(n_f) + 0.5) * spf
lineal = lambda v: np.interp(np.arange(N), t_f, v)         # interpolación lineal

f_lead = suavizar_rapido(escalon(midi_a_hz(midi)), 0.04)   # glide 40 ms
amp_lead = suavizar_rapido(lineal(db_a_lineal(-6 + 6 * np.clip(area / max(area.max(), 1e-6), 0, 1))), 0.08)
pan = suavizar_rapido(lineal(2 * cx - 1), 0.15)

lead = 0.5 * amp_lead * oscilador(f_lead, "suave")

# --- plucks en cada cambio de nota ---------------------------------------
plucks = np.zeros(N)
n_pl = int(0.35 * FS)
for i in range(n_f):
    if i == 0 or midi[i] != midi[i - 1]:
        ini = i * spf
        seg = oscilador(np.full(n_pl, midi_a_hz(midi[i] + 12)), "triangular")
        seg *= adsr(n_pl, a=0.003, d=0.12, s=0.0, r=0.05)
        fin = min(ini + n_pl, N)
        plucks[ini:fin] += 0.35 * seg[: fin - ini]

# --- dron de referencia --------------------------------------------------
dron = 0.08 * oscilador(np.full(N, midi_a_hz(midi[0] - 12)), "seno")

estereo = paneo(lead + plucks, pan) + paneo(dron, 0.0)
estereo = limitar(estereo)
guardar_wav("rocola.wav", estereo)

# guarda la curva de control para validar (script 07)
with open("control.json", "w") as fh:
    json.dump({"seg_por_fotograma": SEG_POR_FOTOGRAMA, "midi": midi.tolist(),
               "pan": (2 * cx - 1).tolist()}, fh)
print("Notas por fotograma:", midi.tolist())
reproducir(estereo)

# EJERCICIOS
# 1. Cambia SEG_POR_FOTOGRAMA a 0.25 y 1.0: ¿qué tempo se entiende mejor?
# 2. Usa 'cambio' para controlar un filtro paso bajo (scipy.signal) -> más brillo si cambia rápido.
# 3. Invierte el paneo y pide a alguien que señale con la mano dónde está la "tormenta".
