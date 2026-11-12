"""
01 — Comprueba el entorno: un La4 (440 Hz) de 1 s, con y sin envolvente.
Escucha la diferencia: el primero hace "clic" al empezar y terminar; el segundo no.
"""
from sintesis import tono, adsr, guardar_wav, reproducir, FS
import numpy as np

crudo = 0.5 * tono(440, 1.0)
con_env = crudo * adsr(len(crudo), a=0.02, d=0.1, s=0.7, r=0.2)
silencio = np.zeros(int(0.3 * FS))

salida = np.concatenate([crudo, silencio, con_env])
guardar_wav("01_tono_prueba.wav", salida)
reproducir(salida)

# EJERCICIO: cambia forma="suave" y forma="triangular" en tono() y compara timbres.
