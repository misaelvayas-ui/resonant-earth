"""
03 — Ejercicio central del Bloque A: una lista de números -> melodía.

Los datos de abajo son una SERIE DE EJEMPLO inventada con forma de "anomalía de
temperatura" (sube con ruido). Cuando tengas datos reales (CSV de NASA GISTEMP, etc.)
reemplaza 'datos' por tu columna.

Mapeo:
  valor  -> nota (cuantizada a pentatónica)   = tono
  |cambio| respecto al anterior -> volumen      = "qué tan brusco fue el año"
  + un tono de referencia fijo (dron) en el valor 0 para escuchar "por encima / por debajo"
"""
import numpy as np
from rutas import sal
from sintesis import (FS, escala, valor_a_nota, midi_a_hz, oscilador, adsr,
                      limitar, guardar_wav, reproducir, PENTATONICA_MAYOR)

rng = np.random.default_rng(0)
anios = np.arange(1960, 2026)
datos = 0.018 * (anios - 1960) - 0.2 + 0.1 * rng.standard_normal(len(anios))  # ejemplo

DUR_NOTA = 0.18  # s por dato -> 66 datos ≈ 12 s
notas = escala(tonica_midi=55, octavas=3, grados=PENTATONICA_MAYOR)  # Sol3 ... Sol6
vmin, vmax = datos.min(), datos.max()
midi = valor_a_nota(datos, vmin, vmax, notas)

cambio = np.abs(np.diff(datos, prepend=datos[0]))
vol = 0.35 + 0.65 * cambio / (cambio.max() + 1e-12)

n = int(DUR_NOTA * FS)
melodia = np.concatenate([
    v * oscilador(np.full(n, midi_a_hz(m)), "suave") * adsr(n, a=0.005, d=0.05, s=0.6, r=0.06)
    for m, v in zip(midi, vol)
])

# Dron de referencia en el valor 0 (sin cuantizar a la escala para que sea "el cero")
nota_cero = valor_a_nota(0.0, vmin, vmax, notas)
dron = 0.12 * oscilador(np.full(len(melodia), midi_a_hz(nota_cero - 12)), "seno")

salida = limitar(melodia + dron)
guardar_wav(sal("03_datos_a_melodia.wav"), salida)
reproducir(salida)

print("Primeras notas MIDI:", midi[:12])

# EJERCICIOS
# 1. Cambia a PENTATONICA_MENOR. ¿Cambia la "emoción" de la serie?
# 2. Haz que el volumen dependa del valor y el tono del cambio. ¿Cuál se entiende mejor?
# 3. Cierra los ojos: ¿escuchas en qué momento la serie cruza el dron (el cero)?
