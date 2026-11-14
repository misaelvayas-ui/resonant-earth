# Earth Jukebox (Rocola de la Tierra)

**Versión en español: [README.md](README.md)**

Turns a scientific video visualization into sound: it reads the colors of every frame, converts them to values using the video's own color bar, and plays them as a stereo melody.

A prototype by team **Resonant Earth** for the NASA Space Apps Challenge 2026 (challenge 9, "The Earth Information Jukebox"). It is designed for people who are blind or have low vision: what the map shows with colors, you can hear.

It has two parts:

- **The program (Python)**: turns a video into music and checks that the sound says the same thing as the data.
- **The web page** ([web/](web/README.md)): an accessible jukebox to pick a visualization and listen to it, in Spanish and English, with a text description, voice narration, captions, keyboard control and screen reader support.

NASA data used: **SVS 5207 — Global temperature anomalies 1880–2023 (GISTEMP)** and **SVS 3912 — Ocean currents and sea surface temperature (ECCO2), 2007–2008**.

> Note: the code, its comments and the detailed change log (`docs/CAMBIOS.txt`) are written in Spanish. This file explains everything needed to run and judge the project in English. The web page itself is fully available in English.

## What you hear

| Data from the map | Sound |
|---|---|
| average value (`media`) | **pitch** of the main voice (pentatonic scale, 3 octaves) |
| hot area (`area`) | **loudness** of the voice (−6 to 0 dB, between the smallest and the largest area of the track) |
| position of the heat (`centroide_x` or `centroide_y`, depending on `paneo`) | **panning** left ↔ right (with `"paneo": "y"`: south ↔ north; GISTEMP and SST use it); with `area` < 0.01 the sound goes to the centre |
| note change | a **pluck** |
| reference value (e.g. 0 °C) | a continuous **drone** (sustained pad, GM 90) for the whole track, one octave below the note the melody plays for that value: you can hear whether the present is above or below it |
| high anomaly | **more notes per frame** (1, 2 or 4, as a rising arpeggio; at the top of the scale, falling from the base note) |

With the real video, the extracted average follows the official GISTEMP curve with a correlation of **0.99** (58 sampled years).

**Why it sounds like this.** The notes come from a pentatonic scale, so any sequence sounds musical and can be listened to for a long time. Rising pitch is widely understood as "more". The drone is the measuring stick: in the temperature map it marks the 1951–1980 average, so when the melody climbs away from it the planet is warmer than it was then. With high values each moment plays more notes, so the music speeds up and conveys urgency.

## The web page

```bash
cd web
python -m http.server 8000
```

Open <http://localhost:8000/?lang=en>. It needs a server (it does not load from `file://`).

What it offers:

- Three tracks: global temperature 1880–2023 (NASA SVS 5207), ocean currents and sea temperature 2007–2008 (NASA SVS 3912) and a synthetic example with a known truth.
- Spanish and English; dark and light themes; preferences are remembered.
- "What is happening now": an automatic text description of every moment, announced to screen readers, optionally spoken by the browser's voice and optionally shown as captions.
- "Key moments": buttons that jump to the start, the lowest and highest values, the biggest jump and the point where the data stays above the reference.
- "What you are hearing": six short sound examples that teach what each sound means.
- Full keyboard control (`Space`, arrows, `Tab`, `?` for help), visible focus, 20 px base text, optional vibration on sudden changes (phones).
- Checked with axe-core 4.10.2 (WCAG 2.2 AA): 0 violations in both themes and both languages.

No frameworks and no build step: plain HTML, CSS and JavaScript. Details (in Spanish) in [web/README.md](web/README.md) and [web/GUIA_ESTILO.md](web/GUIA_ESTILO.md). Screenshots: [desktop](web/capturas/escritorio.png), [mobile](web/capturas/movil.png), [desktop, English, light theme](web/capturas/escritorio_claro_en.png).

## Installation

**Ubuntu / Debian**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg                          # 08 (video + audio)
sudo apt install fluidsynth fluid-soundfont-gm   # 06: real instruments (without it, 06 uses a numpy fallback)
```

**macOS**
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
brew install ffmpeg fluid-synth
export ROCOLA_SF2=/path/to/FluidR3_GM.sf2        # a General MIDI SoundFont (.sf2)
```

**Windows (PowerShell)** — not tested in this project; package names may differ
```powershell
py -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
winget install Gyan.FFmpeg
winget install FluidSynth.FluidSynth             # optional
$env:ROCOLA_SF2 = "C:\path\FluidR3_GM.sf2"
```

Without fluidsynth or a SoundFont, **06 still works** with a numpy fallback (same notes, different timbre) and says so. Without ffmpeg only 08 fails (video with audio). `ROCOLA_SIN_AUDIO=1` stops 06 from playing the result through the speakers.

All commands are run **from the project root**; otherwise the script tells you.

## Quick start

```bash
python evaluar.py                                  # 45 PASS/FAIL tests in 1-2 minutes (does not touch salidas/)
python 04_video_sintetico.py && python 05_video_a_rasgos.py && python 06_rasgos_a_audio.py && python 07_validar.py
python 08_video_con_audio.py                       # salidas/demo_rocola.mp4
```

## Pipeline

| Script | Input → output |
|---|---|
| `04_video_sintetico.py [seconds]` | makes a test video with a known truth → `salidas/04_video_sintetico.mp4`, `config/config_video.json` |
| `05_video_a_rasgos.py [config]` | video → `salidas/rasgos.json` (one record per sampled frame) |
| `06_rasgos_a_audio.py [rasgos] [--sintetico]` | features → `salidas/rocola.mid` → `salidas/rocola.wav` (stereo, marimba + pad drone with FluidSynth) + `salidas/control.json`. `--sintetico` (or no fluidsynth) uses the numpy fallback with the same notes |
| `07_validar.py` | checks the pitch and the notes of the WAV (with the synthetic video, also the pitch and panning trends) → `salidas/validacion.png` + PASS/FAIL |
| `08_video_con_audio.py [video] [wav] [mp4]` | joins video and audio in sync → `salidas/demo_rocola.mp4` |

`sintesis.py` is the audio engine (oscillators, ADSR, scales, panning). `parametros.py` holds the constants shared by several scripts (tempo, default values of 06). `evaluar.py` runs the whole pipeline on generated videos and reports PASS/FAIL.

## Real video (NASA SVS 5207)

1. Download into `datos/` (not versioned), from <https://svs.gsfc.nasa.gov/5207/>: `2023GISTEMP_Map_SOS.mp4`, `giss_navy_anomaly_Vertical-both.png` and `time.txt`.
2. Calibrate: it finds the map and the color bar gradient and saves `salidas/calibracion.png` so you can check them.
   ```bash
   python -m herramientas.calibrar --vmin -2 --vmax 2 --fechas datos/time.txt --salida config/config_eic.json
   ```
3. Process (about 25 s for 60 frames):
   ```bash
   python 05_video_a_rasgos.py config/config_eic.json
   python 06_rasgos_a_audio.py
   python 08_video_con_audio.py datos/2023GISTEMP_Map_SOS.mp4 salidas/rocola.wav salidas/demo_gistemp.mp4
   ```

The configuration keys of 05 and 06 are listed in the Spanish README ("Configuración de 05") and at the top of each script.

## Data contract (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`media` = average value, `area` = fraction of the map above the threshold, `centroide_x`/`centroide_y` = where the heat is (0–1), `cambio` = change from the previous frame, `validos` = fraction of pixels recognized in the palette (if it drops below 0.8, check the crop).

## Project layout

```
sintesis.py  rutas.py  fechas.py  parametros.py  04…08_*.py  evaluar.py    code (root)
config/        configurations for 05
datos/         downloaded videos and color bars (ignored by git)
salidas/       everything generated (WAV, MP4, PNG, JSON)
herramientas/  calibrar.py (calibration), exportar_mapeo.py (data → sound mapping for a live mode) and exportar_web.py (builds the web videos from the same audio as the demo)
web/           the accessible web jukebox, in Spanish and English
docs/          CAMBIOS.txt (change log), audits and specifications (in Spanish)
archivo/       early exercises
```

## Known limitations

- Second video, SVS 3912 (ECCO2): only about 26 % of the map is valid (the bright current lines) and the average comes out a few °C higher than the real one. It is good for the seasonal shape, not for absolute values; the web page says so.
- The °C range of the color bar is read by eye from `calibracion.png` (there is no OCR).
- Each sampled frame lasts 0.5 s of audio (`SEG_POR_FOTOGRAMA` in `parametros.py`); the video is stretched to match.
- The sound is rendered ahead of time and mixed into each video; a mode that generates the sound live in the browser is specified in `docs/ESPEC_MODO_EN_VIVO.md` but not built yet.

## Use of AI

The NASA Space Apps Challenge rules allow AI if it is disclosed. This is what was done with the help of AI:

- **Code**: a large part of the Python program (`04`–`08`, `sintesis.py`, `evaluar.py`, `herramientas/`) and the whole web page (`web/`) were written with the help of an AI assistant (Claude, by Anthropic, through Claude Code). The team reviewed and tested the result. Every round of changes made with AI is marked as such in [docs/CAMBIOS.txt](docs/CAMBIOS.txt).
- **Documentation**: this README, the Spanish README and the documents in `docs/` and `web/` were also drafted with the help of AI.
- **Logo**: the Resonant Earth logo (`web/assets/logo*.jpg`) was generated with AI. It carries the visible mark "Generado con IA" (AI-generated) written inside the image. It does not use NASA logos or marks. The browser tab icon is drawn by code (`web/hacer_icono.py`), without AI.
- **What is NOT AI**: the sound and the text descriptions. The music comes from fixed rules applied to the numbers read from the video (see "What you hear"), and the "What is happening now" sentences are built from templates using the same numbers (`web/describir.js`). The same data always gives the same result. The narrating voice is the browser's own.
- **Data**: no AI-generated data. The videos are from NASA (Scientific Visualization Studio); the third example on the web page is a synthetic video made by code (`04_video_sintetico.py`) and is labeled as an example.

## References

- NASA Scientific Visualization Studio, SVS 5207: global temperature anomalies from 1880 to 2023 (GISTEMP). <https://svs.gsfc.nasa.gov/5207/>
- NASA Scientific Visualization Studio, SVS 3912: ocean currents and sea surface temperature (ECCO2 model). <https://svs.gsfc.nasa.gov/3912/>
- Web fonts: Unbounded, Plus Jakarta Sans and Space Mono (SIL OFL license; see `web/assets/fonts/`).
- Libraries: numpy, scipy, opencv-python, matplotlib, mido (see `requirements.txt`); FluidSynth and ffmpeg, optional.

This project is not endorsed by NASA. License: MIT (see [LICENSE](LICENSE)).
