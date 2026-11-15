"""
07 — Validación objetiva del audio (no solo a oído) -> validacion.png + PASA/FALLA.

  - el tono de rocola.wav en cada fotograma coincide con la nota base de control.json (los arpegios no se miden);
  - el balance L/R va hacia donde está la zona caliente (al centro con area < 0,01).
"""
import json
import os
import sys
import numpy as np
from rutas import sal
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import spectrogram

for _n in ("rasgos.json", "control.json", "rocola.wav", "rocola.mid"):
    if not os.path.exists(sal(_n)):
        sys.exit(f"Falta {sal(_n)}: ejecuta antes 05 y 06 (en ese orden).")
fs, x = wavfile.read(sal("rocola.wav"))
x = x.astype(float) / 32768
ctl = json.load(open(sal("control.json")))
r = json.load(open(sal("rasgos.json")))["rasgos"]
spf = int(ctl["seg_por_fotograma"] * fs)
n_f = len(ctl["midi"])

# 1) tono dominante por fotograma. control.json trae la NOTA BASE de cada fotograma ("midi"), su arpegio
#    ("notas") y "ataque_en_fotograma". Solo se miden los fotogramas CON ataque (en uno ligado la nota
#    viene del fotograma anterior, ya se apagó y solo queda el dron), y solo su PRIMERA nota (ventana de
#    30 a 200 ms, acortada si la nota dura menos). Se ignora la frecuencia del dron y sus armónicos,
#    salvo los que coinciden con la nota esperada (si la nota base ES el dron, no se puede enmascarar).
mono = x.mean(axis=1)
TOL_DRON = 100    # cents que se enmascaran alrededor de cada armónico del dron: el pad GM 90 tiene chorus y su pico es más ancho que 50
hz = lambda m: 440 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)
con = np.array(ctl.get("ataque_en_fotograma", [True] * n_f))
dron_hz = hz(ctl["dron"]) if "dron" in ctl else None
pico_hz = np.full(n_f, np.nan)
for i in np.flatnonzero(con):
    k = len(ctl["notas"][i]) if "notas" in ctl else 1
    ini = i * spf + int(0.03 * fs)
    fin = i * spf + min(int(0.20 * fs), int(spf / k) - int(0.01 * fs))
    seg = mono[ini:fin]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 16 * len(seg)))       # relleno de ceros: pico más fino
    f = np.fft.rfftfreq(16 * len(seg), 1 / fs)
    banda = (f > 100) & (f < 2500)
    if dron_hz is not None:
        esp_i = hz(ctl["midi"][i])
        for h in (1, 2, 3, 4):
            if abs(1200 * np.log2(dron_hz * h / esp_i)) > TOL_DRON:           # armónico que no es la nota
                banda &= np.abs(1200 * np.log2(np.maximum(f, 1e-9) / (dron_hz * h))) > TOL_DRON
    pico_hz[i] = f[banda][np.argmax(S[banda])]
esperado = hz(ctl["midi"])
nota_ok = np.where(con)[0]
print(f"Tono medido en {len(nota_ok)} fotogramas con ataque de {n_f} (los {n_f - len(nota_ok)} ligados se excluyen)")

# notas exactas: el .mid debe contener justo los ataques que control.json declara (arpegios, ligaduras, re-golpes)
import mido
atq_mid, esp_mid = [], []
for m in mido.merge_tracks(mido.MidiFile(sal("rocola.mid")).tracks):
    if m.type == "note_on" and m.velocity > 0 and m.channel == 0:
        atq_mid.append(m.note)
esp_mid = ctl["notas_ataque"]
notas_exactas = atq_mid == esp_mid and len(atq_mid) == ctl["ataques"]

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
# el paneo solo se mide donde 06 lo aplica: con area < 0,01 (AREA_CENTRO de 06) el sonido va al centro por diseño;
# por eso ya no se exige empezar a la izquierda: basta que el balance suba hacia la derecha (> 6 dB, Spearman > 0,9)
rangos = lambda a_, b_: np.corrcoef(np.argsort(np.argsort(a_)), np.argsort(np.argsort(b_)))[0, 1]    # Spearman: la curva pan -> dB no es lineal
con_zona = np.array([rr.get("area", 0.0) >= 0.01 for rr in r])
bal_p, idx_p = bal[con & con_zona], np.arange(n_f)[con & con_zona]

err_cents = 1200 * np.abs(np.log2(pico_hz[con] / esperado[con]))
sintetico = os.path.basename(json.load(open(sal("rasgos.json"))).get("fuente", "")) == "04_video_sintetico.mp4"
checks = {
    "tono de la nota base (fotogramas con ataque) = esperado (±50 cents)": bool(np.all(err_cents < 50)),
    "notas de rocola.mid = notas esperadas de control.json": bool(notas_exactas),
    # solo tienen sentido con el video sintético (media creciente y tormenta de izquierda a derecha)
    "el tono no baja (serie creciente)": bool(np.all(np.diff(esperado) >= 0)) if sintetico else None,
    # el dron central "diluye" el balance, así que se valida la TENDENCIA, no un valor fijo
    "paneo va de izquierda a derecha": bool(bal_p[-1] > 0 and bal_p[-1] - bal_p[0] > 6 and rangos(idx_p, bal_p) > 0.9) if sintetico else None,
    "media de rasgos crece": bool(r[-1]["media"] > r[0]["media"]) if sintetico else None,
}
for k, v in checks.items():
    print(f"[{'NO APLICA' if v is None else 'PASA' if v else 'FALLA'}] {k}" + ("" if v is not None else " (solo para el video sintético)"))
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
sys.exit(0 if all(v is not False for v in checks.values()) else 1)
