"""
02 — Por qué la fase continua importa.
Glissando de 220 Hz a 880 Hz hecho de DOS formas:
  (a) MAL:  sin(2*pi*f(t)*t)   -> la frecuencia aparente NO es f(t) y hay artefactos
  (b) BIEN: integrar f(t)      -> barrido limpio
Pista DSP: la frecuencia instantánea es (1/2pi) d(phi)/dt. En (a) phi = 2*pi*f(t)*t,
así que f_inst = f(t) + t*f'(t)  -> se dispara al final (llega al doble).
"""
import numpy as np
from sintesis import FS, oscilador, guardar_wav, reproducir

dur = 3.0
t = np.arange(int(dur * FS)) / FS
f = 220 * (880 / 220) ** (t / dur)  # barrido exponencial (lineal en semitonos)

mal = 0.4 * np.sin(2 * np.pi * f * t)
bien = 0.4 * oscilador(f)

guardar_wav("02a_mal.wav", mal)
guardar_wav("02b_bien.wav", bien)
reproducir(np.concatenate([mal, np.zeros(FS // 2), bien]))

# EJERCICIO: calcula a mano f_inst de (a) en t = 3 s. ¿A qué nota MIDI corresponde?
