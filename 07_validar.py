"""
07 — Validación objetiva del prototipo (no solo "a oído").

1. Espectrograma de rocola.wav  -> el trazo principal debe subir en escalera.
2. Balance L/R por ventana      -> debe ir de izquierda (+L) a derecha (+R).
3. Comprobaciones automáticas con PASA/FALLA.
Genera validacion.png.
"""
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import spectrogram

fs, x = wavfile.read("rocola.wav")
x = x.astype(float) / 32768
ctl = json.load(open("control.json"))
r = json.load(open("rasgos.json"))["rasgos"]
spf = int(ctl["seg_por_fotograma"] * fs)
n_f = len(ctl["midi"])

# 1) tono dominante por fotograma (pico del espectro entre 100 y 1200 Hz, sin el dron)
mono = x.mean(axis=1)
pico_hz = []
for i in range(n_f):
    seg = mono[i * spf + spf // 4:(i + 1) * spf]          # salta el ataque
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    f = np.fft.rfftfreq(len(seg), 1 / fs)
    banda = (f > 120) & (f < 1200)
    pico_hz.append(f[banda][np.argmax(S[banda])])
pico_hz = np.array(pico_hz)
esperado = 440 * 2 ** ((np.array(ctl["midi"]) - 69) / 12)

# 2) balance L/R en dB por fotograma
bal = []
for i in range(n_f):
    L, R = x[i * spf:(i + 1) * spf, 0], x[i * spf:(i + 1) * spf, 1]
    bal.append(20 * np.log10((np.sqrt(np.mean(R ** 2)) + 1e-9) / (np.sqrt(np.mean(L ** 2)) + 1e-9)))
bal = np.array(bal)

err_cents = 1200 * np.abs(np.log2(pico_hz / esperado))
checks = {
    "tono detectado = tono esperado (±50 cents)": bool(np.all(err_cents < 50)),
    "el tono no baja (serie creciente)": bool(np.all(np.diff(esperado) >= 0)),
    # el dron central "diluye" el balance, así que se valida la TENDENCIA, no un valor fijo
    "paneo va de izquierda a derecha": bool(bal[0] < 0 < bal[-1] and np.corrcoef(np.arange(n_f), bal)[0, 1] > 0.9),
    "media de rasgos crece": bool(r[-1]["media"] > r[0]["media"]),
}
for k, v in checks.items():
    print(f"[{'PASA' if v else 'FALLA'}] {k}")
print(f"Error máximo de tono: {err_cents.max():.1f} cents | balance L/R: {bal[0]:.1f} dB -> {bal[-1]:.1f} dB")

fig, ax = plt.subplots(3, 1, figsize=(10, 9))
f, t, S = spectrogram(mono, fs, nperseg=4096, noverlap=3072)
ax[0].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma")
ax[0].set_ylim(0, 1500); ax[0].set_ylabel("Hz"); ax[0].set_title("Espectrograma de rocola.wav")
ax[1].plot(esperado, "o-", label="esperado"); ax[1].plot(pico_hz, "x--", label="detectado")
ax[1].set_ylabel("Hz"); ax[1].legend(); ax[1].set_title("Tono por fotograma")
ax[2].plot(bal, "s-"); ax[2].axhline(0, color="gray", lw=0.8)
ax[2].set_ylabel("dB (R/L)"); ax[2].set_xlabel("fotograma"); ax[2].set_title("Balance estéreo (+ = derecha)")
plt.tight_layout(); plt.savefig("validacion.png", dpi=110)
print("Gráfica: validacion.png")
