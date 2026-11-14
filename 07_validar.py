"""
07 — Validación objetiva del prototipo (no solo "a oído").

1. Tono de la nota base de cada fotograma (control.json) -> debe coincidir con el de rocola.wav;
   el trazo principal sube en escalera. Los arpegios no se miden.
2. Balance L/R por ventana      -> debe ir hacia la derecha (+R) donde hay zona caliente (area >= 0,01; antes, al centro).
3. Comprobaciones automáticas con PASA/FALLA.
Genera validacion.png.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mido
import numpy as np
from scipy.io import wavfile
from scipy.signal import spectrogram

from parametros import AREA_CENTRO
from rutas import sal
from sintesis import midi_a_hz

NECESARIOS = ("rasgos.json", "control.json", "rocola.wav", "rocola.mid")
TOL_DRON = 100    # cents que se enmascaran alrededor de cada armónico del dron: el pad GM 90 tiene chorus y su pico es más ancho que 50


def leer_json(nombre):
    with open(sal(nombre)) as fh:
        return json.load(fh)


def cargar():
    """Devuelve (fs, audio estéreo float, control.json, rasgos.json completo)."""
    for nombre in NECESARIOS:
        if not os.path.exists(sal(nombre)):
            sys.exit(f"Falta {sal(nombre)}: ejecuta antes 05 y 06 (en ese orden).")
    fs, x = wavfile.read(sal("rocola.wav"))
    return fs, x.astype(float) / 32768, leer_json("control.json"), leer_json("rasgos.json")


def banda_sin_dron(f, dron_hz, esperado_hz):
    """Frecuencias donde buscar el pico: de 100 a 2500 Hz, sin el dron ni sus armónicos, salvo los que
    coinciden con la nota esperada (si la nota base ES el dron, no se puede enmascarar)."""
    banda = (f > 100) & (f < 2500)
    if dron_hz is None:
        return banda
    for h in (1, 2, 3, 4):
        if abs(1200 * np.log2(dron_hz * h / esperado_hz)) > TOL_DRON:           # armónico que no es la nota
            banda &= np.abs(1200 * np.log2(np.maximum(f, 1e-9) / (dron_hz * h))) > TOL_DRON
    return banda


def medir_tono(mono, fs, ctl, con):
    """Tono dominante (Hz) de cada fotograma CON ataque; NaN en los demás.
    control.json trae la NOTA BASE de cada fotograma ("midi"), su arpegio ("notas") y
    "ataque_en_fotograma". Solo se miden los fotogramas con ataque (en uno ligado la nota viene del
    fotograma anterior, ya se apagó y solo queda el dron), y solo su PRIMERA nota (ventana de 30 a
    200 ms, acortada si la nota dura menos)."""
    spf = int(ctl["seg_por_fotograma"] * fs)
    dron_hz = midi_a_hz(ctl["dron"]) if "dron" in ctl else None
    pico_hz = np.full(len(ctl["midi"]), np.nan)
    for i in np.flatnonzero(con):
        k = len(ctl["notas"][i]) if "notas" in ctl else 1
        ini = i * spf + int(0.03 * fs)
        fin = i * spf + min(int(0.20 * fs), int(spf / k) - int(0.01 * fs))
        seg = mono[ini:fin]
        S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 16 * len(seg)))       # relleno de ceros: pico más fino
        f = np.fft.rfftfreq(16 * len(seg), 1 / fs)
        banda = banda_sin_dron(f, dron_hz, midi_a_hz(ctl["midi"][i]))
        pico_hz[i] = f[banda][np.argmax(S[banda])]
    return pico_hz


def notas_exactas(ctl):
    """El .mid debe contener justo los ataques que control.json declara (arpegios, ligaduras, re-golpes)."""
    ataques = [m.note for m in mido.merge_tracks(mido.MidiFile(sal("rocola.mid")).tracks)
               if m.type == "note_on" and m.velocity > 0 and m.channel == 0]
    return ataques == ctl["notas_ataque"] and len(ataques) == ctl["ataques"]


def medir_balance(x, fs, spf, n_f):
    """Balance L/R en dB por fotograma (+ = derecha), medido en el ATAQUE (20-100 ms): la marimba decae
    y después solo queda el dron, que es central."""
    bal = []
    for i in range(n_f):
        seg = x[i * spf + int(0.02 * fs): i * spf + int(0.10 * fs)]
        L, R = seg[:, 0], seg[:, 1]
        bal.append(20 * np.log10((np.sqrt(np.mean(R ** 2)) + 1e-9) / (np.sqrt(np.mean(L ** 2)) + 1e-9)))
    return np.array(bal)


def spearman(a, b):
    """Correlación de rangos: la curva pan -> dB no es lineal."""
    return np.corrcoef(np.argsort(np.argsort(a)), np.argsort(np.argsort(b)))[0, 1]


def comprobar(err_cents, exactas, esperado, idx_p, bal_p, rasgos, sintetico):
    """Comprobaciones con True/False, o None si no aplican a este video."""
    return {
        "tono de la nota base (fotogramas con ataque) = esperado (±50 cents)": bool(np.all(err_cents < 50)),
        "notas de rocola.mid = notas esperadas de control.json": bool(exactas),
        # solo tienen sentido con el video sintético (media creciente y tormenta de izquierda a derecha)
        "el tono no baja (serie creciente)": bool(np.all(np.diff(esperado) >= 0)) if sintetico else None,
        # el dron central "diluye" el balance, así que se valida la TENDENCIA, no un valor fijo
        "paneo va de izquierda a derecha": bool(bal_p[-1] > 0 and bal_p[-1] - bal_p[0] > 6 and spearman(idx_p, bal_p) > 0.9) if sintetico else None,
        "media de rasgos crece": bool(rasgos[-1]["media"] > rasgos[0]["media"]) if sintetico else None,
    }


def graficar(mono, fs, esperado, pico_hz, bal, idx_a, bal_a):
    fig, ax = plt.subplots(3, 1, figsize=(10, 9))
    f, t, S = spectrogram(mono, fs, nperseg=4096, noverlap=3072)
    ax[0].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma")
    ax[0].set_ylim(0, 2500)
    ax[0].set_ylabel("Hz")
    ax[0].set_title("Espectrograma de rocola.wav")
    ax[1].plot(esperado, "o-", label="esperado")
    ax[1].plot(pico_hz, "x--", label="detectado")
    ax[1].set_ylabel("Hz")
    ax[1].legend()
    ax[1].set_title("Nota base por fotograma")
    ax[2].plot(bal, "s--", alpha=0.4)
    ax[2].plot(idx_a, bal_a, "s-")
    ax[2].axhline(0, color="gray", lw=0.8)
    ax[2].set_ylabel("dB (R/L)")
    ax[2].set_xlabel("fotograma")
    ax[2].set_title("Balance estéreo (+ = derecha)")
    plt.tight_layout()
    plt.savefig(sal("validacion.png"), dpi=110)
    print(f"Gráfica: {sal('validacion.png')}")


def main():
    fs, x, ctl, doc = cargar()
    n_f = len(ctl["midi"])
    spf = int(ctl["seg_por_fotograma"] * fs)
    mono = x.mean(axis=1)
    # un fotograma con la nota ligada (sin golpe nuevo) no informa del tono ni del paneo y se excluye
    con = np.array(ctl.get("ataque_en_fotograma", [True] * n_f))

    pico_hz = medir_tono(mono, fs, ctl, con)
    esperado = midi_a_hz(ctl["midi"])
    print(f"Tono medido en {con.sum()} fotogramas con ataque de {n_f} (los {n_f - con.sum()} ligados se excluyen)")
    err_cents = 1200 * np.abs(np.log2(pico_hz[con] / esperado[con]))

    bal = medir_balance(x, fs, spf, n_f)
    bal_a, idx_a = bal[con], np.arange(n_f)[con]
    # el paneo solo se mide donde 06 lo aplica: con area < 0,01 (AREA_CENTRO) el sonido va al centro por diseño; por
    # eso ya no se exige empezar a la izquierda: basta que el balance suba hacia la derecha (> 6 dB, Spearman > 0,9)
    con_zona = np.array([r.get("area", 0.0) >= AREA_CENTRO for r in doc["rasgos"]])
    bal_p, idx_p = bal[con & con_zona], np.arange(n_f)[con & con_zona]

    sintetico = os.path.basename(doc.get("fuente", "")) == "04_video_sintetico.mp4"
    checks = comprobar(err_cents, notas_exactas(ctl), esperado, idx_p, bal_p, doc["rasgos"], sintetico)
    for k, v in checks.items():
        print(f"[{'NO APLICA' if v is None else 'PASA' if v else 'FALLA'}] {k}" + ("" if v is not None else " (solo para el video sintético)"))
    print(f"Error máximo de tono: {err_cents.max():.1f} cents | balance L/R (fotogramas con golpe): {bal_a[0]:.1f} dB -> {bal_a[-1]:.1f} dB, r = {np.corrcoef(idx_a, bal_a)[0, 1]:.2f}")

    graficar(mono, fs, esperado, pico_hz, bal, idx_a, bal_a)
    sys.exit(0 if all(v is not False for v in checks.values()) else 1)


if __name__ == "__main__":
    main()
