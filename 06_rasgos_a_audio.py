"""
06 — rasgos.json -> rocola.mid -> rocola.wav (estéreo, instrumentos reales) + control.json

Mapeo (el "contrato" sonoro, explícalo así en el pitch):
  media        -> NOTA de la melodía (pentatónica de 3 octavas; antes se suaviza con una media móvil)
  area         -> VOLUMEN: velocidad MIDI 64...127 (= -6 dB ... 0 dB); el área se normaliza entre SU mínimo y SU máximo
                  (SST: 0,43-0,49 recorre los 6 dB); sin variación: 0 dB si hay zona caliente, -6 dB si no
  centroide_x  -> PANEO izquierda/derecha = dónde está lo "caliente" en el mapa (CC10 en el .mid; en el
                  WAV se aplica tras el render, porque las muestras estéreo de la SoundFont ignoran CC10); con area < 0,01
                  (AREA_CENTRO) el paneo va al centro: sin zona caliente apreciable el centroide no significa nada
  densidad     -> notas por fotograma según la anomalía: < u1 -> 1; u1-u2 -> 2; > u2 -> 4 (0,3 y 0,7 en GISTEMP)
                  (arpegio ascendente por la escala desde la nota del fotograma; si arriba no caben todas las notas,
                  desciende desde la nota base: así no se repite la más alta y el ligado no se come golpes)
  referencia   -> DRON sostenido una octava bajo la nota que la melodía toca con el valor 'referencia'
                  (p. ej. 0 = sin anomalía) o, si no existe, bajo la del primer fotograma: se oye si el presente está por encima o por debajo

Salida: canal 1 = marimba (GM 13), canal 2 = dron en pad SOSTENIDO (GM 90; el 89 decae a silencio en ~6 s en FluidR3), reverb CC91. Se escribe
salidas/rocola.mid y se renderiza con FluidSynth a 44,1 kHz estéreo -> salidas/rocola.wav, más
salidas/control.json (lo leen 07 y evaluar.py).

Respaldo: sin fluidsynth o sin SoundFont (o con --sintetico) se usa la síntesis numpy de siempre,
dirigida por las MISMAS notas: mismo .mid, misma duración, otro timbre.
    sudo apt install fluidsynth fluid-soundfont-gm

Claves opcionales (van en el config de 05 y se copian a rasgos.json); entre paréntesis, el valor por defecto:
  "ligar" (true)           misma nota que la anterior -> se extiende en vez de re-atacar
  "suavizado" (3)          media móvil centrada de N fotogramas sobre la media (0 o 1 = sin suavizar)
  "densidad" (true)        notas por fotograma según la anomalía; false = una nota por fotograma
  "regolpe_ligado" (1)     en una nota ligada, la vuelve a tocar cada N fotogramas (0 = nunca)
  "regolpe_vel" (0.7)      velocidad del re-golpe como fracción de la de la nota (0,4 dejaba la marimba casi muda en las notas ligadas)
  "umbral_evento" (1/12 del rango de sonido; 0,15 en GISTEMP)   si la media CRUDA cambia más que esto entre fotogramas, ataque fuerte (vel >= 100)
                           aunque la nota no cambie
  "octava" (1)             desplaza melodía y dron (+1 = una octava arriba)
  "humanizar" (true)       velocidad ±10 %, tiempo ±10 ms, semilla fija (12345)
  "instrumento_melodia" (13), "dron_programa" (90)   programas GM, numerados desde 1
  "dron_octava" (0)        octavas extra del dron; 0 = melodía(referencia) - 12 semitonos
  "dron_nivel" (0.048)     volumen del dron: amplitud del seno en el respaldo; con FluidSynth el RMS del dron se lleva a
                           DRON_FLUID (0,35) de ese seno, ~7 dB bajo la marimba (el .mid lleva velocidad 45 * dron_nivel / 0,08)
  "reverb" (50)            CC91, 0..127
  "paneo" ("x")            eje del paneo: "x" = izquierda-derecha del mapa, "y" = sur (izq.) - norte (der.);
                           el centroide se suaviza y se normaliza (percentiles 5-95, si recorren >= 0,1 del mapa) antes de panear
  "vmin_sonido"/"vmax_sonido" (vmin/vmax)   rango de la media que se reparte entre las notas
  "densidad_umbrales" ([u1, u2])   media por debajo de u1 -> 1 nota; hasta u2 -> 2; más -> 4 (por defecto
                           el 50 % y el 72 % del rango de sonido; GISTEMP usa [0.3, 0.7])
Para el sonido sin adornos: ligar false, suavizado 0, densidad false, octava 0, humanizar false.

Los valores por defecto y el tempo viven en parametros.py (los comparten 05, la exportación y la web).

Uso:  python 06_rasgos_a_audio.py [rasgos.json] [--sintetico]
Variable de entorno ROCOLA_SF2 = otra SoundFont. Con ROCOLA_SIN_AUDIO=1 no reproduce el resultado.
"""
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass

import mido
import numpy as np
from scipy.io import wavfile

from parametros import (AREA_CENTRO, BPM, DEFECTOS, DRON_FLUID, OCTAVAS, SEG_POR_FOTOGRAMA, SEMILLA_HUMANIZAR,
                        TICKS_F, TONICA_MIDI, TPB, VEL_FUERTE)
from rutas import sal
from sintesis import (FS, escala, valor_a_nota, midi_a_hz, oscilador, adsr, paneo, db_a_lineal,
                      suavizar_rapido, limitar, guardar_wav, reproducir)

MUESTRAS_F = int(SEG_POR_FOTOGRAMA * FS)        # muestras de audio de un fotograma
SF2 = [os.environ.get("ROCOLA_SF2", ""), "/usr/share/sounds/sf2/FluidR3_GM.sf2",
       "/usr/share/sounds/sf2/default-GM.sf2"]
APT = "sudo apt install fluidsynth fluid-soundfont-gm"


# ============================================================================ entrada
def leer_argumentos(argv):
    """Devuelve (ruta de rasgos.json, True si se pidió --sintetico)."""
    raras = [a for a in argv if a.startswith("--") and a != "--sintetico"]
    if raras:
        sys.exit(f"Opción desconocida: {' '.join(raras)}. La única opción es --sintetico (respaldo numpy).")
    rutas = [a for a in argv if not a.startswith("--")]
    return (rutas[0] if rutas else sal("rasgos.json")), "--sintetico" in argv


def cargar_rasgos(ruta):
    with open(ruta) as fh:
        d = json.load(fh)
    if not d["rasgos"]:
        sys.exit("rasgos.json no tiene fotogramas: vuelve a ejecutar 05 y revisa su configuración.")
    return d


def rango_sonido(d):
    """Rango de la media que se reparte entre las notas (propio del sonido; por defecto vmin/vmax)."""
    return d.get("vmin_sonido", d["vmin"]), d.get("vmax_sonido", d["vmax"])


def leer_ajustes(d):
    """Ajustes musicales: los de rasgos.json sobre los valores por defecto."""
    cfg = {**DEFECTOS, **{k: d[k] for k in DEFECTOS if d.get(k) is not None}}
    if cfg["umbral_evento"] is None:              # por defecto: 1/12 del rango de sonido (0,15 en GISTEMP)
        v0, v1 = rango_sonido(d)
        cfg["umbral_evento"] = (v1 - v0) / 12
    return cfg


# ============================================================================ series por fotograma
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


def media_movil(x, n):
    """Media móvil centrada de n fotogramas (n impar; en los bordes la ventana se acorta)."""
    h = (int(n) | 1) // 2
    return np.array([x[max(0, i - h): i + h + 1].mean() for i in range(len(x))])


def ganancia_por_area(area):
    """Volumen: de -6 dB a 0 dB. El área se normaliza ENTRE su mínimo y su máximo (así el recorrido se aprovecha
    aunque el área casi no varíe, como en SST); sin variación (rango < 1e-6): 0 dB si hay zona caliente, -6 dB si no."""
    rango = area.max() - area.min()
    if rango >= 1e-6:
        area_n = np.clip((area - area.min()) / rango, 0, 1)
    else:
        area_n = np.full(len(area), 1.0 if area.max() >= 1e-6 else 0.0)
    return db_a_lineal(-6 + 6 * area_n)


def nota_del_dron(d, cfg, notas, midi):
    """Devuelve (nota de la referencia, nota del dron).
    El dron es la nota que la MELODÍA toca con la referencia (misma función de mapeo, cuantización y
    octava) - 12; "dron_octava" lo desplaza más (0 = exactamente una octava bajo la melodía). Sin
    'referencia' se usa la nota del primer fotograma."""
    v0, v1 = rango_sonido(d)
    ref = d.get("referencia")
    nota_ref = int(valor_a_nota(ref, v0, v1, notas)) if ref is not None else int(midi[0])
    dron = int(np.clip(nota_ref + 12 * int(cfg["octava"]) - 12 + 12 * int(cfg["dron_octava"]), 0, 127))
    return nota_ref, dron


def calcular_paneo(R, cx, eje, area):
    """Devuelve (eje usado, posición 0..1 por fotograma).
    Eje 'x' (izquierda-derecha del mapa) o 'y' (sur = izquierda, norte = derecha). El centroide se
    suaviza y se normaliza con los percentiles 5-95 de la serie: así el paneo usa todo su recorrido
    aunque el centroide real se mueva poco (en GISTEMP casi no se mueve). Con area < AREA_CENTRO, al centro."""
    if eje == "y" and not any("centroide_y" in r for r in R):
        print("AVISO: rasgos.json no trae centroide_y (vuelve a ejecutar 05); uso paneo 'x'.")
        eje = "x"
    c_eje = cx if eje == "x" else rellenar([r.get("centroide_y") for r in R], 0.5)
    c_suave = media_movil(c_eje, 3)
    p5, p95 = np.percentile(c_suave, [5, 95])
    if p95 - p5 >= 0.1:
        c_pan = np.clip((c_suave - p5) / (p95 - p5), 0, 1)
    else:                                          # recorrido < 0,1 (10 % del mapa): no se estira
        c_pan = np.clip(0.5 + (c_suave - (p5 + p95) / 2) / 0.1, 0, 1)
    # sin zona caliente apreciable (area < AREA_CENTRO) el centroide no significa nada: el paneo vuelve al centro
    return eje, np.where(area < AREA_CENTRO, 0.5, c_pan)


def umbrales_densidad(d):
    """Umbrales de densidad en las unidades de la media; por defecto, la misma fracción del rango de
    sonido que 0,3 y 0,7 en GISTEMP (rango -0,6..1,2): 1/2 y 13/18 del rango."""
    v0, v1 = rango_sonido(d)
    return d.get("densidad_umbrales") or (v0 + 0.5 * (v1 - v0), v0 + 13 / 18 * (v1 - v0))


@dataclass
class Mapeo:
    """Todo lo que sale de los datos, por fotograma, antes de escribir notas."""
    n_f: int                 # número de fotogramas
    media: np.ndarray        # media cruda (con huecos rellenados)
    media_s: np.ndarray      # media suavizada: de aquí sale la nota
    area: np.ndarray         # fracción de área caliente: de aquí sale el volumen
    notas: np.ndarray        # la escala disponible (sin octava)
    midi: np.ndarray         # nota base por fotograma (sin octava)
    octava: int
    nota_ref: int            # nota de la referencia (sin octava)
    nota_dron: int           # nota del dron (ya con octava)
    vel: np.ndarray          # velocidad MIDI por fotograma
    eje: str                 # eje del paneo que se usó
    c_pan: np.ndarray        # posición del paneo, 0 = izquierda, 1 = derecha
    umbrales: tuple          # (u1, u2) de la densidad

    @property
    def total(self):
        """Duración total en ticks MIDI."""
        return self.n_f * TICKS_F


def mapear(d, cfg):
    """rasgos.json -> Mapeo (nota, volumen y paneo de cada fotograma)."""
    R = d["rasgos"]
    media = rellenar([r["media"] for r in R], (d["vmin"] + d["vmax"]) / 2)
    area = rellenar([r["area"] for r in R], 0.0)
    cx = rellenar([r["centroide_x"] for r in R], 0.5)
    media_s = media_movil(media, cfg["suavizado"]) if int(cfg["suavizado"]) > 1 else media
    notas = escala(tonica_midi=TONICA_MIDI, octavas=OCTAVAS)                   # Do3 ... Do6
    midi = valor_a_nota(media_s, *rango_sonido(d), notas)
    nota_ref, nota_dron = nota_del_dron(d, cfg, notas, midi)
    vel = np.round(127 * ganancia_por_area(area)).astype(int)
    eje, c_pan = calcular_paneo(R, cx, cfg["paneo"], area)
    return Mapeo(n_f=len(R), media=media, media_s=media_s, area=area, notas=notas, midi=midi,
                 octava=int(cfg["octava"]), nota_ref=nota_ref, nota_dron=nota_dron, vel=vel,
                 eje=eje, c_pan=c_pan, umbrales=umbrales_densidad(d))


# ============================================================================ melodía
def notas_por_fotograma(m, umbrales):
    """Densidad según la anomalía (media suavizada): 1, 2 o 4 notas."""
    u1, u2 = umbrales
    return 1 if m < u1 else (2 if m <= u2 else 4)


def arpegiar(mp, cfg):
    """Devuelve (arpegio de cada fotograma, lista de notas [inicio, fin, nota, velocidad, fotograma, j]
    en ticks). Arpegio ascendente por la escala desde la nota del fotograma; sin sitio hacia arriba, baja desde
    la nota base (así no se repite la más alta y el ligado no se come golpes)."""
    idx_escala = {int(n): i for i, n in enumerate(mp.notas)}
    por_fotograma, mel = [], []
    for i in range(mp.n_f):
        k = notas_por_fotograma(mp.media_s[i], mp.umbrales) if cfg["densidad"] else 1
        base = idx_escala[int(mp.midi[i])]
        paso = 1 if base + k <= len(mp.notas) else -1
        arp = [int(mp.notas[base + paso * j]) for j in range(k)]
        por_fotograma.append(arp)
        lim = [round(j * TICKS_F / k) for j in range(k + 1)]
        for j in range(k):
            ini = i * TICKS_F + lim[j]
            mel.append([ini, ini + int((lim[j + 1] - lim[j]) * 0.95), arp[j], int(mp.vel[i]), i, j])
    return por_fotograma, mel


def eventos_fuertes(media, umbral):
    """Cambios bruscos de la media CRUDA (sin suavizar): siempre llevan un ataque fuerte, aunque la
    nota no cambie."""
    return [bool(i > 0 and abs(media[i] - media[i - 1]) > umbral) for i in range(len(media))]


def ligar_notas(mel, fuerte, cfg):
    """Une las notas repetidas. Devuelve (notas [inicio, fin, nota, velocidad], meta), donde meta trae,
    por cada ataque, (fotograma, tipo, inicio nominal en ticks); tipo = ataque | fuerte | regolpe."""
    meta, fusion = [], []
    ult_f = -1                                        # fotograma del último ataque
    for ini, fin, nota, v, f, j in mel:
        forzado = fuerte[f] and j == 0
        if forzado:
            v = max(v, VEL_FUERTE)
        if cfg["ligar"] and fusion and nota == fusion[-1][2] and not forzado:
            rg = int(cfg["regolpe_ligado"])
            if rg > 0 and j == 0 and f - ult_f >= rg:           # nota larga ligada: se vuelve a tocar, suave
                fusion.append([ini, fin, nota, max(1, round(v * cfg["regolpe_vel"]))])
                meta.append((f, "regolpe", ini))
                ult_f = f
            else:
                fusion[-1][1] = fin                              # se extiende en vez de re-atacar
            continue
        fusion.append([ini, fin, nota, v])
        meta.append((f, "fuerte" if forzado else "ataque", ini))
        ult_f = f
    return fusion, meta


def marcas_por_fotograma(meta, n_f):
    """Devuelve (ataque_en_fotograma, regolpe_en_fotograma).
    ataque = golpe NUEVO (nota nueva o evento brusco) en el arranque del fotograma; False = nota ligada
    o solo un re-golpe suave (no sirve para medir tono ni paneo)."""
    ataque = [False] * n_f
    for f, tipo, ini in meta:
        if tipo != "regolpe" and ini == f * TICKS_F:
            ataque[f] = True
    regolpe = [any(t == "regolpe" and f == i for f, t, _ in meta) for i in range(n_f)]
    return ataque, regolpe


def humanizar(mel, total):
    """Mueve cada nota ±10 ms y su velocidad ±10 %, en el sitio. Semilla fija: mismo resultado siempre."""
    rng = np.random.default_rng(SEMILLA_HUMANIZAR)
    ms = round(0.010 * TPB * BPM / 60)            # 10 ms en ticks
    for m in mel:
        j = int(round(rng.uniform(-1, 1) * ms))
        m[0], m[1] = max(0, m[0] + j), min(total, m[1] + j)
        m[3] = int(np.clip(round(m[3] * rng.uniform(0.9, 1.1)), 1, 127))
    for a, b in zip(mel, mel[1:]):                # melodía monofónica: una nota no pisa a la siguiente
        a[1] = max(a[0] + 1, min(a[1], b[0] - 1))


def componer(mp, cfg):
    """Mapeo -> melodía final. Devuelve un diccionario con la melodía y lo que control.json declara."""
    por_fotograma, mel = arpegiar(mp, cfg)
    ataques_sin_ligar = len(mel)
    fuerte = eventos_fuertes(mp.media, cfg["umbral_evento"])
    mel, meta = ligar_notas(mel, fuerte, cfg)
    ataque, regolpe = marcas_por_fotograma(meta, mp.n_f)
    if cfg["humanizar"]:
        humanizar(mel, mp.total)
    mel = [[ini, fin, int(np.clip(nota + 12 * mp.octava, 0, 127)), v] for ini, fin, nota, v in mel]
    return {"mel": mel, "meta": meta, "por_fotograma": por_fotograma, "fuerte": fuerte,
            "ataque_en_fotograma": ataque, "regolpe_en_fotograma": regolpe,
            "ataques_sin_ligar": ataques_sin_ligar}


# ============================================================================ archivo MIDI
def eventos_midi(mp, mel, cfg):
    """Lista ordenada de (tick, orden, mensaje): canal 0 = melodía, canal 1 = dron."""
    pan = np.clip(np.round(64 + 63 * (2 * mp.c_pan - 1)), 0, 127).astype(int)
    vel_dron = int(np.clip(round(45 * cfg["dron_nivel"] / 0.08), 1, 127))
    reverb = int(np.clip(cfg["reverb"], 0, 127))
    prog_mel, prog_dron = int(cfg["instrumento_melodia"]) - 1, int(cfg["dron_programa"]) - 1
    ev = []
    for canal, prog in ((0, prog_mel), (1, prog_dron)):
        ev += [(0, 0, mido.Message("program_change", channel=canal, program=prog)),
               (0, 0, mido.Message("control_change", channel=canal, control=10, value=64)),
               (0, 0, mido.Message("control_change", channel=canal, control=91, value=reverb))]
    for i in range(mp.n_f):
        ev.append((i * TICKS_F, 1, mido.Message("control_change", channel=0, control=10, value=int(pan[i]))))
    for ini, fin, nota, v in mel:
        ev.append((ini, 2, mido.Message("note_on", channel=0, note=nota, velocity=v)))
        ev.append((fin, 0, mido.Message("note_off", channel=0, note=nota, velocity=0)))
    ev.append((0, 2, mido.Message("note_on", channel=1, note=mp.nota_dron, velocity=vel_dron)))
    ev.append((mp.total, 0, mido.Message("note_off", channel=1, note=mp.nota_dron, velocity=0)))
    ev.sort(key=lambda e: (e[0], e[1]))
    return ev


def archivo_midi(ev, total, canal=None):
    """MidiFile de una pista con los eventos; con 'canal', SOLO los de ese canal."""
    pista = mido.MidiTrack()
    pista.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
    previo = 0
    for t, _, m in ev:
        if canal is None or getattr(m, "channel", canal) == canal:
            pista.append(m.copy(time=t - previo))
            previo = t
    pista.append(mido.MetaMessage("end_of_track", time=total - previo))
    archivo = mido.MidiFile(type=1, ticks_per_beat=TPB)
    archivo.tracks.append(pista)
    return archivo


# ============================================================================ audio
def por_muestra(v, n_f):
    """Interpolación lineal de un valor por fotograma (centrado en su fotograma) a un valor por muestra."""
    return np.interp(np.arange(n_f * MUESTRAS_F), (np.arange(n_f) + 0.5) * MUESTRAS_F, v)


def paneo_por_muestra(c_pan):
    """Paneo -1..1 por muestra, suavizado 150 ms."""
    return suavizar_rapido(por_muestra(2 * c_pan - 1, len(c_pan)), 0.15)


# --- audio 1: instrumentos reales con FluidSynth ------------------------------
def renderizar_canal(fs_bin, sf2, canal, ev, total, n_muestras):
    """Renderiza SOLO un canal del .mid y devuelve (n_muestras, 2) float. Se hace por separado porque las
    muestras estéreo de la SoundFont ignoran el CC10 (paneo): el paneo se aplica después, por muestra."""
    tmp_mid, tmp_wav = sal(f"_canal{canal}.mid"), sal(f"_canal{canal}.wav")
    archivo_midi(ev, total, canal).save(tmp_mid)
    r = subprocess.run([fs_bin, "-ni", "-r", str(FS), "-T", "wav", "-F", tmp_wav, sf2, tmp_mid],
                       capture_output=True, text=True)
    os.remove(tmp_mid)
    if r.returncode != 0 or not os.path.exists(tmp_wav):
        return None, r.stderr.strip()[-200:]
    _, x = wavfile.read(tmp_wav)
    os.remove(tmp_wav)
    x = x.astype(float) / 32768.0
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    if len(x) >= n_muestras:
        return x[:n_muestras], ""
    return np.vstack([x, np.zeros((n_muestras - len(x), 2))]), ""


def buscar_fluidsynth():
    """Devuelve (programa fluidsynth, SoundFont) o None si falta alguno (y avisa)."""
    fs_bin = shutil.which("fluidsynth")
    sf2 = next((s for s in SF2 if s and os.path.exists(s)), None)
    if os.environ.get("ROCOLA_SF2") and not os.path.exists(os.environ["ROCOLA_SF2"]):
        print(f"AVISO: ROCOLA_SF2='{os.environ['ROCOLA_SF2']}' no existe; "
              f"{'uso otra SoundFont del sistema' if sf2 else 'no hay otra SoundFont'}.")
    if fs_bin is None or sf2 is None:
        print(f"AVISO: falta {'fluidsynth' if fs_bin is None else 'la SoundFont GM'}; uso la síntesis "
              f"numpy de respaldo (suena distinto, mismas notas).\n       Para instrumentos reales:  {APT}\n"
              "       (macOS: brew install fluid-synth; otra SoundFont o Windows: ver README, variable ROCOLA_SF2)")
        return None
    return fs_bin, sf2


def nivelar_dron(dron_x, dron_nivel):
    """El dron es un pad SOSTENIDO (GM 90) y su nivel no depende de la velocidad MIDI ni de la SoundFont: el RMS de
    su mezcla mono se lleva al de un seno de amplitud dron_nivel (como el respaldo numpy), por DRON_FLUID. Así suena
    continuo toda la pista aunque la marimba se apague en las notas ligadas."""
    rms = float(np.sqrt(np.mean(dron_x.mean(axis=1) ** 2)))
    if rms > 1e-9:
        return dron_x * (DRON_FLUID * dron_nivel / np.sqrt(2) / rms)
    return dron_x


def renderizar_fluidsynth(mp, ev, dron_nivel):
    """Devuelve el estéreo float (N, 2) o None si falta fluidsynth/SoundFont o falla el render."""
    encontrado = buscar_fluidsynth()
    if encontrado is None:
        return None
    n_muestras = mp.n_f * MUESTRAS_F
    melodia, err1 = renderizar_canal(*encontrado, 0, ev, mp.total, n_muestras)
    dron_x, err2 = renderizar_canal(*encontrado, 1, ev, mp.total, n_muestras)
    if melodia is None or dron_x is None:
        print(f"AVISO: fluidsynth falló ({err1 or err2}); uso la síntesis numpy de respaldo.")
        return None
    # la melodía se pasa a mono y se panea por muestra: así el paneo es exacto aunque la imagen
    # estéreo propia de cada muestra de la SoundFont cambie de una nota a otra
    x = paneo(melodia.mean(axis=1), paneo_por_muestra(mp.c_pan)) * np.sqrt(2) + nivelar_dron(dron_x, dron_nivel)
    x[-int(0.05 * FS):] *= np.linspace(1, 0, int(0.05 * FS))[:, None]      # fundido de 50 ms
    return limitar(x)                                                       # mismo limitador que el respaldo (techo 0,85)


# --- audio 2 (respaldo): la síntesis numpy de siempre, dirigida por las mismas notas ----------
def sintetizar_numpy(mp, mel, dron_nivel):
    n_muestras = mp.n_f * MUESTRAS_F
    # nota que suena en cada muestra: la última que empezó (la voz se mantiene hasta la siguiente)
    inicios = [int(m[0] * FS / (TPB * BPM / 60)) for m in mel]
    nota_m = np.full(n_muestras, float(mel[0][2]))
    for k, ini in enumerate(inicios):
        nota_m[ini: (inicios[k + 1] if k + 1 < len(inicios) else n_muestras)] = mel[k][2]
    f_lead = suavizar_rapido(midi_a_hz(nota_m), 0.01)           # glide 10 ms
    amp = suavizar_rapido(por_muestra(ganancia_por_area(mp.area), mp.n_f), 0.08)
    lead = 0.5 * amp * oscilador(f_lead, "suave")
    plucks = np.zeros(n_muestras)                              # un golpe en cada ataque
    n_pl = int(0.35 * FS)
    for (_, _, nota, vl), ini in zip(mel, inicios):
        seg = oscilador(np.full(n_pl, midi_a_hz(nota)), "triangular")
        seg *= adsr(n_pl, a=0.003, d=0.12, s=0.0, r=0.05)
        fin = min(ini + n_pl, n_muestras)
        plucks[ini:fin] += 0.35 * (vl / 90) * seg[: fin - ini]
    dron = dron_nivel * oscilador(np.full(n_muestras, midi_a_hz(mp.nota_dron)), "seno")
    return limitar(paneo(lead + plucks, paneo_por_muestra(mp.c_pan)) + paneo(dron, 0.0))


def renderizar(mp, mel, ev, cfg, forzar_sintetico):
    """Devuelve (modo, estéreo): instrumentos reales si se puede; si no, el respaldo numpy."""
    estereo = None if forzar_sintetico else renderizar_fluidsynth(mp, ev, cfg["dron_nivel"])
    if estereo is not None:
        return "fluidsynth", estereo
    return "sintetico", sintetizar_numpy(mp, mel, cfg["dron_nivel"])


# ============================================================================ control.json
def cruce_de_la_referencia(mp, fechas):
    """Primer fotograma desde el que la melodía ya no baja de la referencia (su fecha si la hay)."""
    voz = mp.midi + 12 * mp.octava
    tras = [i for i in range(mp.n_f) if (voz[i:] >= mp.nota_ref + 12 * mp.octava).all()]
    if not tras:
        return None
    return fechas[tras[0]] if fechas[tras[0]] is not None else tras[0]


def armar_control(mp, comp, modo, cruce):
    """Lo que leen 07 y evaluar.py: qué se quiso tocar, para compararlo con lo que suena."""
    mel, meta, octava = comp["mel"], comp["meta"], mp.octava
    return {"seg_por_fotograma": SEG_POR_FOTOGRAMA,
            "midi": (mp.midi + 12 * octava).tolist(),          # NOTA BASE por fotograma (ya con octava)
            "notas": [[n + 12 * octava for n in arp] for arp in comp["por_fotograma"]],   # arpegio por fotograma
            "pan": (2 * mp.c_pan - 1).tolist(), "paneo": mp.eje,
            "ataque_en_fotograma": comp["ataque_en_fotograma"], "dron": mp.nota_dron, "cruce_dron": cruce,
            "regolpe_en_fotograma": comp["regolpe_en_fotograma"], "evento_fuerte": comp["fuerte"],
            "notas_ataque": [m[2] for m in mel], "inicio_ticks": [t for _, _, t in meta],
            "tipo_ataque": [t for _, t, _ in meta],
            "ataques": len(mel), "ataques_sin_ligar": comp["ataques_sin_ligar"],
            "nota_min": min(m[2] for m in mel), "nota_max": max(m[2] for m in mel),
            "modo": modo}


def main():
    ruta_rasgos, forzar_sintetico = leer_argumentos(sys.argv[1:])
    d = cargar_rasgos(ruta_rasgos)
    cfg = leer_ajustes(d)
    mp = mapear(d, cfg)
    comp = componer(mp, cfg)
    mel = comp["mel"]
    ev = eventos_midi(mp, mel, cfg)
    archivo_midi(ev, mp.total).save(sal("rocola.mid"))
    modo, estereo = renderizar(mp, mel, ev, cfg, forzar_sintetico)
    guardar_wav(sal("rocola.wav"), estereo)
    cruce = cruce_de_la_referencia(mp, [r.get("fecha") for r in d["rasgos"]])
    control = armar_control(mp, comp, modo, cruce)
    with open(sal("control.json"), "w") as fh:
        json.dump(control, fh)
    print(f"Modo: {modo} | ataques {len(mel)} (sin ligar {comp['ataques_sin_ligar']}) | notas "
          f"{control['nota_min']}-{control['nota_max']} | dron {mp.nota_dron} | cruce de la referencia: {cruce}")
    print("Nota base por fotograma:", (mp.midi + 12 * mp.octava).astype(int).tolist())
    reproducir(estereo)


if __name__ == "__main__":
    main()

# EJERCICIOS
# 1. Cambia SEG_POR_FOTOGRAMA (en parametros.py) a 0.25 y 1.0: ¿qué tempo se entiende mejor?
# 2. Apaga las mejoras (ligar false, suavizado 0, densidad false, humanizar false) y compara el sonido.
# 3. Invierte el paneo y pide a alguien que señale con la mano dónde está la "tormenta".
