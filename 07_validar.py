"""
07 — Validación objetiva del prototipo (no solo "a oído").

1. Tono de la nota base de cada fotograma (control.json) -> debe coincidir con el de rocola.wav;
   el trazo principal sube en escalera. Los arpegios no se miden.
2. Balance L/R por ventana      -> debe ir de izquierda (+L) a derecha (+R).
3. Comprobaciones automáticas con PASA/FALLA.
Genera validacion.png.
"""
import json
import sys
import numpy as np
from rutas import sal
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import spectrogram

fs, x = wavfile.read(sal("rocola.wav"))
x = x.astype(float) / 32768
ctl = json.load(open(sal("control.json")))
r = json.load(open(sal("rasgos.json")))["rasgos"]
spf = int(ctl["seg_por_fotograma"] * fs)
n_f = len(ctl["midi"])

# 1) tono dominante por fotograma. control.json trae la NOTA BASE de cada fotograma ("midi") y su
#    arpegio ("notas"): como el arpegio sube desde la nota base, solo se mide la PRIMERA nota del
#    fotograma (ventana de 30 ms tras el inicio hasta el final de esa nota), nunca las siguientes.
mono = x.mean(axis=1)
pico_hz = []
for i in range(n_f):
    k = len(ctl["notas"][i]) if "notas" in ctl else 1
    ini = i * spf + int(0.03 * fs)
    fin = i * spf + int(spf / k) - int(0.01 * fs)
    seg = mono[ini:fin]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 16 * len(seg)))      # relleno de ceros: pico más fino
    f = np.fft.rfftfreq(16 * len(seg), 1 / fs)
    banda = (f > 100) & (f < 2500)
    pico_hz.append(f[banda][np.argmax(S[banda])])
pico_hz = np.array(pico_hz)
esperado = 440 * 2 ** ((np.array(ctl["midi"]) - 69) / 12)

# 2) balance L/R en dB por fotograma, medido en el ATAQUE (20-100 ms): la marimba decae y después solo
#    queda el dron, que es central. Un fotograma con la nota ligada (sin golpe nuevo) no informa del
#    paneo y se excluye.
bal = []
for i in range(n_f):
    seg = x[i * spf + int(0.02 * fs): i * spf + int(0.10 * fs)]
    L, R = seg[:, 0], seg[:, 1]
    bal.append(20 * np.log10((np.sqrt(np.mean(R ** 2)) + 1e-9) / (np.sqrt(np.mean(L ** 2)) + 1e-9)))
bal = np.array(bal)
con = np.array(ctl.get("ataque_en_fotograma", [True] * n_f))
bal_a, idx_a = bal[con], np.arange(n_f)[con]

err_cents = 1200 * np.abs(np.log2(pico_hz / esperado))
checks = {
    "tono de la nota base detectado = esperado (±50 cents)": bool(np.all(err_cents < 50)),
    "el tono no baja (serie creciente)": bool(np.all(np.diff(esperado) >= 0)),
    # el dron central "diluye" el balance, así que se valida la TENDENCIA, no un valor fijo
    "paneo va de izquierda a derecha": bool(bal_a[0] < 0 < bal_a[-1] and np.corrcoef(idx_a, bal_a)[0, 1] > 0.9),
    "media de rasgos crece": bool(r[-1]["media"] > r[0]["media"]),
}
for k, v in checks.items():
    print(f"[{'PASA' if v else 'FALLA'}] {k}")
print(f"Error máximo de tono: {err_cents.max():.1f} cents | balance L/R (fotogramas con golpe): {bal_a[0]:.1f} dB -> {bal_a[-1]:.1f} dB, r = {np.corrcoef(idx_a, bal_a)[0, 1]:.2f}")

fig, ax = plt.subplots(3, 1, figsize=(10, 9))
f, t, S = spectrogram(mono, fs, nperseg=4096, noverlap=3072)
ax[0].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma")
ax[0].set_ylim(0, 2500); ax[0].set_ylabel("Hz"); ax[0].set_title("Espectrograma de rocola.wav")
ax[1].plot(esperado, "o-", label="esperado"); ax[1].plot(pico_hz, "x--", label="detectado")
ax[1].set_ylabel("Hz"); ax[1].legend(); ax[1].set_title("Nota base por fotograma")
ax[2].plot(bal, "s--", alpha=0.4); ax[2].plot(idx_a, bal_a, "s-"); ax[2].axhline(0, color="gray", lw=0.8)
ax[2].set_ylabel("dB (R/L)"); ax[2].set_xlabel("fotograma"); ax[2].set_title("Balance estéreo (+ = derecha)")
plt.tight_layout(); plt.savefig(sal("validacion.png"), dpi=110)
print(f"Gráfica: {sal('validacion.png')}")
sys.exit(0 if all(checks.values()) else 1)
