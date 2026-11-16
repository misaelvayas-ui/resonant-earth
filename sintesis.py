"""
sintesis.py — motor de audio de la rocola: osciladores, envolventes, escalas, paneo y WAV.

Solo numpy y scipy. Señales float en [-1, 1], frecuencia de muestreo FS.
Cada función hace una sola cosa y se prueba en evaluar.py (grupo A).
"""
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

FS = 44100  # Hz

# ---------------------------------------------------------------------------
# 1) Nota MIDI <-> frecuencia
#    f = 440 * 2^((n - 69) / 12)   (n = 69 es La4 = 440 Hz; +12 = una octava)
# ---------------------------------------------------------------------------
def midi_a_hz(n):
    return 440.0 * 2.0 ** ((np.asarray(n, dtype=float) - 69.0) / 12.0)


def hz_a_midi(f):
    return 69.0 + 12.0 * np.log2(np.asarray(f, dtype=float) / 440.0)


# ---------------------------------------------------------------------------
# 2) Oscilador con FASE CONTINUA
#    sin(2*pi*f*t) con f variable da saltos de fase (clics): se integra la frecuencia
#    instantánea, phi[n] = sum(2*pi*f[k]/FS).
# ---------------------------------------------------------------------------
def oscilador(f_inst, forma="seno"):
    """f_inst: array de frecuencia por muestra (Hz). Devuelve la señal."""
    f_inst = np.asarray(f_inst, dtype=float)
    fase = 2 * np.pi * (np.cumsum(f_inst) - f_inst[0]) / FS  # empieza en fase 0
    if forma == "seno":
        return np.sin(fase)
    if forma == "suave":  # seno + 2 armónicos -> timbre más "órgano"
        return (np.sin(fase) + 0.35 * np.sin(2 * fase) + 0.15 * np.sin(3 * fase)) / 1.5
    if forma == "triangular":
        return 2 / np.pi * np.arcsin(np.sin(fase))
    raise ValueError(forma)


def tono(f, dur, forma="seno"):
    """Tono de frecuencia fija de 'dur' segundos."""
    return oscilador(np.full(int(dur * FS), float(f)), forma)


# ---------------------------------------------------------------------------
# 3) Envolvente ADSR (Attack, Decay, Sustain, Release)
#    Evita clics al inicio y al final, y da carácter a cada nota.
# ---------------------------------------------------------------------------
def adsr(n_muestras, a=0.01, d=0.08, s=0.7, r=0.12):
    """a, d, r en segundos; s = nivel de sostenido (0..1). Longitud total = n_muestras."""
    total = (a + d + r) * FS
    if total > n_muestras:  # nota corta: escalar fases para que la liberación llegue a 0
        k = n_muestras / total
        a, d, r = a * k, d * k, r * k
    na, nd, nr = int(a * FS), int(d * FS), int(r * FS)
    ns = max(n_muestras - na - nd - nr, 0)
    env = np.concatenate([
        np.linspace(0, 1, na, endpoint=False),
        np.linspace(1, s, nd, endpoint=False),
        np.full(ns, s),
        np.linspace(s, 0, nr),
    ])
    return env[:n_muestras] if len(env) >= n_muestras else np.pad(env, (0, n_muestras - len(env)))


# ---------------------------------------------------------------------------
# 4) Cuantizar a escala (la pentatónica suena bien en cualquier orden)
# ---------------------------------------------------------------------------
PENTATONICA_MAYOR = [0, 2, 4, 7, 9]  # grados en semitonos respecto a la tónica


def escala(tonica_midi=60, octavas=3, grados=PENTATONICA_MAYOR):
    """Lista de notas MIDI disponibles (p. ej. Do4 = 60, 3 octavas)."""
    return np.array([tonica_midi + 12 * o + g for o in range(octavas) for g in grados]
                    + [tonica_midi + 12 * octavas])


def valor_a_nota(x, vmin, vmax, notas):
    """Mapea x en [vmin, vmax] linealmente al índice de la escala (cuantización)."""
    x = np.clip((np.asarray(x, dtype=float) - vmin) / (vmax - vmin + 1e-12), 0, 1)
    idx = np.round(x * (len(notas) - 1)).astype(int)
    return notas[idx]


# ---------------------------------------------------------------------------
# 5) Utilidades: suavizado, paneo, dB, guardar WAV, reproducir
# ---------------------------------------------------------------------------
def suavizar(x, tau_s):
    """Filtro IIR de 1 polo (glide/portamento); tau_s = constante de tiempo en s."""
    alfa = 1 - np.exp(-1 / (tau_s * FS))
    y, _ = lfilter([alfa], [1, alfa - 1], x, zi=[x[0] * (1 - alfa)])
    return y


def db_a_lineal(db):
    return 10 ** (np.asarray(db, dtype=float) / 20)


def paneo(mono, pan):
    """Paneo de potencia constante. pan en [-1 (izq), +1 (der)], escalar o array."""
    th = (np.asarray(pan) + 1) * np.pi / 4
    return np.stack([mono * np.cos(th), mono * np.sin(th)], axis=1)


def limitar(x, techo=0.85):
    """Limitador suave (tanh) + normalización al techo (0,85: margen para que el AAC no sature)."""
    y = np.tanh(1.5 * x)
    return techo * y / (np.max(np.abs(y)) + 1e-12)


def guardar_wav(ruta, x):
    wavfile.write(ruta, FS, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(f"WAV guardado: {ruta}  ({len(x) / FS:.1f} s)")


def reproducir(x):
    """Reproduce si sounddevice está instalado y hay tarjeta de audio.
    Con la variable de entorno ROCOLA_SIN_AUDIO no reproduce (pruebas automáticas)."""
    if os.environ.get("ROCOLA_SIN_AUDIO"):
        return
    try:
        import sounddevice as sd
        sd.play(x, FS)
        sd.wait()
    except Exception as e:  # sin audio (servidor, etc.)
        print(f"(No se pudo reproducir: {e}). Abre el WAV generado.")
