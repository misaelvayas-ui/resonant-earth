# Resonant Earth: the Earth jukebox

**Versión en español: [README.md](README.md)**

Turns a scientific video visualization into sound: it reads the colors of every frame, converts them to values with the video's own color bar, and plays them as a stereo melody.

A prototype by team Resonant Earth for the NASA Space Apps Challenge 2026 (challenge 9, "The Earth Information Jukebox"). It is designed for people who are blind or have low vision: what the map shows with colors, you can hear. The web page is called "Listen to the Earth".

It has two parts:

- **The program (Python)**: turns a video into music and checks that the sound says the same thing as the data.
- **The web page** ([web/](web/README.md)): an accessible jukebox to pick a visualization and listen to it. It is **bilingual (Spanish and English)**: use the ES / EN buttons in the header, or open it with `?lang=en`.

NASA data used: **SVS 5207 — Global temperature anomalies 1880–2023 (GISTEMP)** and **SVS 3912 — Ocean currents and sea surface temperature (ECCO2), 2007–2008**.

> Note: the code, its comments and the detailed change log (`docs/CAMBIOS.txt`) are written in Spanish. This file explains everything needed to run and judge the project in English.

## 5-minute guide for the judges

1. Open <https://misaelvayas-ui.github.io/resonant-earth/?lang=en>. Offline: `cd web && python -m http.server 8001` and <http://localhost:8001/?lang=en>.
2. Pick **Planet temperature** and listen for half a minute, ideally with headphones. The melody stays low for a century and climbs over the last forty years; the low note that never moves is the 1951–1980 average.
3. **Before and after** plays 1881–1903 and then, without a pause, 2011–2023. Five seconds of each end.
4. In **Explore the map**, move the cursor or use the arrow keys. Each point plays a note and is described (latitude, longitude, temperature) from the color of the frame at that moment.
5. Switch to **Live sound** and uncheck melody, volume, panning or drone to hear each layer on its own.
6. How close is it to the real data? The average we read from the video and NASA's official GISTEMP series correlate at **0.99** over 58 years. `python -m herramientas.validar_gistemp` recomputes it.
7. Where it falls short: it reads 0.09 °C below the official series, the sea track is a relative index rather than degrees, and in GISTEMP the panning depends on a small area of the map.
8. Tests: `python evaluar.py` (47) and `web/pruebas/verificar.cjs` (34 Playwright and axe checks, both languages).

## How we answer the challenge

| What the challenge asks | Where it is |
|---|---|
| A "jukebox" of EIC visualizations and their soundscapes | The web page (`web/`), with two tracks |
| Sonification **in real time** from the frames | "Live sound" builds the audio in the browser while the video plays. "Explore the map" plays the pixel under the cursor |
| Computer vision: color → sound | `05_video_a_rasgos.py` calibrates against the video's own color bar; `web/js/explorar.js` uses that same bar in the browser |
| Balance between data and music | Pentatonic scale, reference drone, arpeggios. `evaluar.py` and 07 fail if a note does not match the data |
| Exploratory, interactive translation | Per-layer checkboxes, a navigable chart, "Before and after", "Explore the map" |
| Accessibility for blind or low-vision people | Full keyboard use and a live reading for screen readers. Every track has a description, and the map can be walked with the arrow keys. Spanish and English |
| Explaining the decisions | The "Why it matters" section of the page; measurements for each change in `docs/CAMBIOS.txt` and the live-mode rules in `docs/ESPEC_MODO_EN_VIVO.md` (both in Spanish) |

## What you hear

| Data from the map | Sound |
|---|---|
| average value (`media`) | **pitch** of the main voice (pentatonic scale, 3 octaves) |
| hot area (`area`) | **loudness** of the voice (−6 to 0 dB, between the smallest and the largest area of the track) |
| position of the heat (`centroide_x` or `centroide_y`, depending on `paneo`) | **panning** left ↔ right (with `"paneo": "y"`: south ↔ north; GISTEMP and SST use it); with `area` < 0.01 the sound goes to the centre |
| note change | a **pluck** |
| reference value (e.g. 0 °C) | a continuous **drone** (sustained pad, GM 90) for the whole track, one octave below the note the melody plays for that value: you can hear whether the present is above or below it |
| high anomaly | **more notes per frame** (1, 2 or 4, as a rising arpeggio; at the top of the scale, falling from the base note) |

With the real video, the extracted average follows the official GISTEMP curve with a correlation of **0.99** (58 sampled years; bias −0.09 °C). It is checked by `python -m herramientas.validar_gistemp` and by test M1 of `evaluar.py`; the official table is in `docs/datos_oficiales/`.

**Why it sounds like this.** The notes come from a pentatonic scale, so any sequence sounds musical and can be listened to for a long time. Rising pitch is widely understood as "more". The drone is the measuring stick: it marks the reference, so you hear how far the data is from it.

## The web page

```bash
cd web
python -m http.server 8001
```

Open <http://localhost:8001/?lang=en>. It needs a server (it does not load from `file://`).

- Two real tracks: global temperature 1881–2023 (NASA SVS 5207) and ocean currents and temperature 2007–2008 (NASA SVS 3912).
- **Spanish and English**: ES / EN buttons in the header; the choice is remembered (`localStorage`) and `?lang=en` / `?lang=es` forces one. All the text is translated: page, track descriptions, live reading, chart, live-sound controls and shortcuts.
- Two sound modes: the original track (made by the Python program) or **Live sound** (the browser generates it from the data with Web Audio), with checkboxes to hear one feature at a time.
- A live text reading of every moment, announced to screen readers (it can be turned off), and a navigable chart (arrows and Enter).
- **Explore the map** and **Before and after**.
- Full keyboard control (`Space`, arrows, `Tab`), visible focus, AA contrast, reduced motion respected.
- Checked with axe-core (WCAG 2.2 AA): 0 violations in Spanish and English, at 1440 and 390 px.

No build step: plain HTML, CSS and JavaScript modules. Details (in Spanish) in [web/README.md](web/README.md).

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
brew install ffmpeg fluid-synth                  # fluid-synth is optional (without it, 06 uses the numpy fallback)
export ROCOLA_SF2=/path/to/FluidR3_GM.sf2        # a General MIDI SoundFont (.sf2)
```
On macOS the pip build of OpenCV cannot write `mp4v`: `video_io.py` detects it and writes the test videos with ffmpeg (same MPEG-4 codec). Homebrew's ffmpeg has no `drawtext` filter: 08 detects it and draws the year with Pillow.

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
python evaluar.py                                  # 47 PASS/FAIL tests in 1-2 minutes (does not touch salidas/)
python -m herramientas.validar_gistemp             # the track against the official GISTEMP series: r = 0.99
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

`sintesis.py` is the audio engine (oscillators, ADSR, scales, panning). `evaluar.py` runs the whole pipeline on generated videos and reports PASS/FAIL.

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
   ```

This replaces `salidas/rasgos.json` and `salidas/rocola.wav`. To go back to the synthetic example, run 04 → 07 again. The configuration keys of 05 and 06 are listed in [docs/CONFIG.md](docs/CONFIG.md) (Spanish).

## Data contract (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`media` = average value, `area` = fraction of the map above the threshold, `centroide_x`/`centroide_y` = where the heat is (0–1), `cambio` = change from the previous frame, `validos` = fraction of pixels recognized in the palette.

## Project layout

```
sintesis.py  rutas.py  fechas.py  video_io.py  04…08_*.py  evaluar.py    code (root)
config/        configurations for 05
datos/         downloaded videos and color bars (ignored by git)
salidas/       everything generated (WAV, MP4, PNG, JSON)
herramientas/  calibrar.py, exportar_mapeo.py, exportar_web.py, validar_gistemp.py
web/           the accessible web jukebox, in Spanish and English
docs/          CAMBIOS.txt (change log), CONFIG.md, ESPEC_MODO_EN_VIVO.md (in Spanish)
```

## Known limitations

- Second video, SVS 3912 (ECCO2): only about 26 % of the map is valid (the bright current lines) and the average comes out a few °C higher than the real one. It is good for the seasonal shape, not for absolute values; the web page says so.
- The °C range of the color bar is read by eye from `calibracion.png` (there is no OCR).
- Each sampled frame lasts 0.5 s of audio (`SEG_POR_FOTOGRAMA` in 06); with a different `fps_muestreo` the video is stretched or compressed to match.
- Not tried by the team: Safari (macOS and iOS), Firefox, a hidden tab for 10 seconds and real headphones.

## Use of AI

The NASA Space Apps Challenge rules allow AI as long as it is disclosed.

The team designed the system: how an SVS video is read, which features are extracted, the rules that turn each feature into sound (scale, reference drone, panning, note density), the GISTEMP and ECCO2 calibration, and the validation against the official GISTEMP v4 series. We also decided what went into the web page and how it had to work for a blind user.

We used Claude (Anthropic), through Claude Code, to write code and text. With its help we wrote a large part of the Python program (`04`–`08`, `sintesis.py`, `evaluar.py`, `herramientas/`), the whole web page (`web/`, including the Web Audio live mode), the tests, and drafts of the documentation and the page texts, including the English translation. All of it went through the team: we ran it, compared it with NASA's data, checked it with the keyboard and axe, and fixed what did not add up.

What does not come from an AI:

- The sound. The music comes from fixed rules applied to the numbers read from the video (see "What you hear"). The same data always gives the same result.
- The "Now" sentences, which are filled in from templates with those numbers.
- The images. The icon is drawn by code (`web/hacer_icono.py`), the globe textures are NASA's and `web/assets/compartir.jpg` is a screenshot of the page itself.
- The data. The videos come from the NASA Scientific Visualization Studio.

## References

**Data and visualizations (NASA)**

- NASA Scientific Visualization Studio, **SVS 5207**: "Global Temperature Anomalies from 1880 to 2023" (GISTEMP visualization). <https://svs.gsfc.nasa.gov/5207/>
- NASA Scientific Visualization Studio, **SVS 3912**: ocean currents and sea surface temperature (ECCO2 model), 2007–2008. <https://svs.gsfc.nasa.gov/3912/>
- **GISTEMP v4**, NASA Goddard Institute for Space Studies: the official temperature-anomaly series we validate against (`docs/datos_oficiales/`). <https://data.giss.nasa.gov/gistemp/>
- **ECCO2** (Estimating the Circulation and Climate of the Ocean, Phase II), NASA/JPL: the ocean model behind SVS 3912. <https://ecco.jpl.nasa.gov/>
- Globe textures: Blue Marble Next Generation and Black Marble, NASA Earth Observatory (public domain).

**Sound**

- **FluidR3_GM SoundFont** (Frank Wen), MIT license: the real instruments FluidSynth uses in `06`. Optional: without it `06` uses a numpy fallback.
- **FluidSynth** (LGPL-2.1+) and **ffmpeg**: optional.

**Web fonts** (SIL OFL 1.1, texts in `web/assets/fonts/`): Unbounded, Plus Jakarta Sans and Space Mono.

**Libraries**

- Python (`requirements.txt`): numpy, scipy, opencv-python-headless, matplotlib, sounddevice, mido.
- Web (`web/vendor/`, see `LICENCIAS.md`): three.js (MIT), GSAP and ScrollTrigger (GreenSock standard no-charge license).
- Tests: Playwright and axe-core.

This project is not endorsed by NASA. License: MIT (see [LICENSE](LICENSE)).
