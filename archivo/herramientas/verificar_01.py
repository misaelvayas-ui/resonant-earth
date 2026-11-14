"""
verificar_01.py — Verifica 01_tono_prueba.wav y la hipótesis de clic en el corte.
No modifica ningún archivo.
"""
import numpy as np
from scipy.io import wavfile
import sys
try:
    from rutas import sal
except ModuleNotFoundError:
    sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.verificar_01")
from sintesis import tono, FS

N_TONO = int(1.0 * FS)          # 44100
N_SIL = int(0.3 * FS)           # 13230
K = 10                          # muestras a inspeccionar en cada borde

fs, datos = wavfile.read(sal("01_tono_prueba.wav"))
canales = 1 if datos.ndim == 1 else datos.shape[1]

print("== a) Formato ==")
print(f"fs={fs} Hz  canales={canales}  dtype={datos.dtype}  muestras={len(datos)} "
      f"(esperado {2 * N_TONO + N_SIL})  duración={len(datos) / fs:.4f} s")

x = datos.astype(float) / 32767
crudo = x[:N_TONO]
sil = x[N_TONO:N_TONO + N_SIL]
env = x[N_TONO + N_SIL:]

print("\n== b) Frecuencia dominante del tono crudo (FFT) ==")
espectro = np.abs(np.fft.rfft(crudo * np.hanning(len(crudo))))
freqs = np.fft.rfftfreq(len(crudo), 1 / fs)
print(f"pico en {freqs[np.argmax(espectro)]:.2f} Hz (resolución {fs / len(crudo):.2f} Hz)")

print("\n== c) Pico de amplitud ==")
print(f"crudo: {np.max(np.abs(crudo)):.5f}   ADSR: {np.max(np.abs(env)):.5f}   "
      f"silencio máx |x|: {np.max(np.abs(sil)):.5f}")
print(f"ADSR en sostenido (muestras 6000-35000): {np.max(np.abs(env[6000:35000])):.5f}")


def salto_max(seg):
    return np.max(np.abs(np.diff(seg))) if len(seg) > 1 else 0.0


print("\n== d) Saltos en bordes (incluye la transición con lo que hay antes/después) ==")
paso_tipico = salto_max(crudo[N_TONO // 2 - 200:N_TONO // 2 + 200])
print(f"referencia: salto máx en régimen del tono crudo = {paso_tipico:.5f}")
for nombre, ini in (("crudo", 0), ("ADSR", N_TONO + N_SIL)):
    fin = ini + N_TONO
    previo = x[ini - 1] if ini > 0 else 0.0          # antes del WAV se asume silencio
    posterior = x[fin] if fin < len(x) else 0.0      # después del WAV se asume silencio
    borde_ini = np.concatenate([[previo], x[ini:ini + K]])
    borde_fin = np.concatenate([x[fin - K:fin], [posterior]])
    print(f"{nombre:6s} inicio: x[0]={x[ini]:+.5f}  salto máx={salto_max(borde_ini):.5f}   |   "
          f"fin: x[-1]={x[fin - 1]:+.5f}  salto máx={salto_max(borde_fin):.5f}")

print("\n== 4) Hipótesis: duración con ciclos enteros vs. medio ciclo extra ==")
for dur in (1.0, 1.0 + 0.5 / 440, 1.0 + 0.25 / 440):  # el último: corte en el pico
    t = 0.5 * tono(440, dur)
    # salto de corte = de la última muestra a 0 (silencio siguiente)
    print(f"dur={dur:.6f} s  N={len(t)}  ciclos={440 * len(t) / FS:.4f}  "
          f"x[0]={t[0]:+.5f}  x[-1]={t[-1]:+.5f}  salto inicio={abs(t[0]):.5f}  "
          f"salto fin={abs(t[-1]):.5f}")
