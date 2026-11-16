# Resonant Earth: The Earth Information Jukebox

**Versión en español: [README.md](README.md)**

Turns NASA scientific visualizations into sound: it reads the colors of each video frame, maps them to physical values using the video's own color bar, and generates a stereo melody in real time.

Built by team Resonant Earth for the **NASA Space Apps Challenge 2026** (Challenge 9, *The Earth Information Jukebox*). It works with two NASA datasets: **SVS 5207** (Global Temperature Anomalies 1880–2023, GISTEMP) and **SVS 3912** (Ocean Surface Currents and Temperature 2007–2008, ECCO2). The web interface is titled **Listen to Earth**.

## 5-Minute Guide for the Judges

1. **Open the web app:** visit <https://misaelvayas-ui.github.io/resonant-earth/?lang=en> (or toggle between **ES / EN** in the top header). To run it locally offline, execute `cd web && python -m http.server 8001` and open <http://localhost:8001/?lang=en>.
2. **Listen to global temperature:** select **Planet temperature** and listen for about 30 seconds, ideally with headphones. The melody stays in low registers for nearly a century before climbing over the last four decades, while a steady low drone anchors the 1951–1980 baseline average.
3. **Compare extremes:** press **Before and after** to hear 5 seconds from the start of the record (1881–1903) followed immediately by the final stretch (2011–2023).
4. **Explore the map:** activate **Explore the map** and move your cursor or arrow keys across the map. Each point computes its value directly from the current video frame's pixel color, plays its corresponding note, and announces latitude, longitude, and temperature.
5. **Isolate each audio layer:** switch to **Live sound** and toggle the checkboxes for melody, volume, panning, and drone to hear how each physical variable shapes the soundscape.
6. **Verify scientific accuracy:** the values extracted directly from the video frames correlate at **0.99** with NASA's official GISTEMP series across 58 sampled years. You can reproduce this check with `python -m herramientas.validar_gistemp`.
7. **Run the automated test suites:** the repository includes 47 pipeline tests in Python (`python evaluar.py`) and 34 UI and accessibility checks using Playwright and axe (`web/pruebas/verificar.cjs`).

## How We Address "The Earth Information Jukebox"

| Challenge Requirement | Implementation |
|---|---|
| A "jukebox" to select EIC visualizations and hear their soundscape | The web app (`web/`) provides two complete tracks with synchronized video, audio, and live text readings; SVS 3912 is listed among the official challenge resources |
| **Real-time** sonifications generated from video frames | **Live sound** synthesizes audio in the browser via Web Audio as the video plays; **Explore the map** reads the pixel under the cursor and plays its note on the spot |
| Computer vision frame analysis (color → sound) | `05_video_a_rasgos.py` calibrates map pixels against the video's own color bar; `web/js/explorar.js` replicates that mapping in the browser using `<id>_paleta.json` |
| Balance between data fidelity and musicality | 3-octave pentatonic scale, reference drone, and intensity-driven arpeggios; both `evaluar.py` (I1) and `07_validar.py` verify that every note matches the underlying data |
| Exploratory, interactive translation | Independent layer toggles (melody, volume, panning, drone), keyboard-navigable timeline chart, "Before and after" comparison, and point-by-point map exploration |
| Accessibility for blind and low-vision users | Full keyboard navigation, live screen-reader announcements, text descriptions per track, arrow-key map exploration with coordinate/value readouts, and haptic feedback on supported mobile devices |
| Transparent design rationale | "Why it matters" section in the web app, technical changelog with measurements in `docs/CAMBIOS.txt`, and live-engine rules in `docs/ESPEC_MODO_EN_VIVO.md` |

## Web Application

The web app (`web/`) is bilingual (Spanish and English via the ES / EN header buttons or `?lang=en`) and ships with both real tracks (GISTEMP and SST/ECCO2). Its media assets and parameter mappings are regenerated from the Python pipeline via `python -m herramientas.exportar_web` and `python -m herramientas.exportar_mapeo`. See [web/README.md](web/README.md) for details.

## What You Hear

| Map Feature | Audio Mapping |
|---|---|
| Mean value (`media`) | **Pitch** of the lead voice across a 3-octave pentatonic scale |
| Warm area (`area`) | **Volume** of the lead voice (−6 to 0 dB, scaled between the track's minimum and maximum area) |
| Heat centroid (`centroide_x` or `centroide_y`, per `paneo`) | **Stereo panning** left ↔ right (with `"paneo": "y"`, south ↔ north, used in GISTEMP and SST); centered when `area < 0.01` |
| Note transition | **Pluck attack** to articulate pitch changes |
| Reference baseline (e.g., 0 °C) | **Continuous drone** (sustained pad, GM 90) one octave below the reference pitch, making it clear whether the present sits above or below baseline |
| High anomaly | **Note density**: 1, 2, or 4 notes per frame played as an ascending arpeggio (or descending at the top of the scale) |

On the real GISTEMP video, the extracted mean tracks NASA's official series with a **0.99 correlation** (58 sampled years, with a −0.09 °C offset). You can verify this with `python -m herramientas.validar_gistemp` and test M1 in `evaluar.py`; the official reference table lives in `docs/datos_oficiales/`.

## Installation

**Ubuntu / Debian**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg                          # 08 (muxing video and audio)
sudo apt install fluidsynth fluid-soundfont-gm   # 06: real instruments (optional; falls back to NumPy synthesis)
```

**macOS**
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
brew install ffmpeg fluid-synth                  # fluid-synth is optional
export ROCOLA_SF2=/path/to/FluidR3_GM.sf2        # path to a General MIDI SoundFont (.sf2)
```
*macOS note:* pip's `opencv-python-headless` lacks `mp4v` encoding support and Homebrew's `ffmpeg` omits the `drawtext` filter; both `video_io.py` and `08_video_con_audio.py` detect these limitations and fall back automatically to `ffmpeg` and Pillow.

**Windows (PowerShell)** *(not tested for this release; package names may vary)*
```powershell
py -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
winget install Gyan.FFmpeg                       # 08 (restart terminal to refresh PATH)
winget install FluidSynth.FluidSynth             # optional
$env:ROCOLA_SF2 = "C:\path\FluidR3_GM.sf2"       # GM SoundFont (.sf2) for FluidSynth
```

Without FluidSynth or a configured SoundFont, `06_rasgos_a_audio.py` still runs using additive NumPy synthesis (identical notes and timing, different timbre). Without `ffmpeg`, only step `08` is unavailable. Run all commands **from the repository root**.

## Quick Start

```bash
python evaluar.py                                  # 47 automated tests (1–2 min, leaves salidas/ untouched)
python -m herramientas.validar_gistemp             # validation against official GISTEMP series (r = 0.99)
python 04_video_sintetico.py && python 05_video_a_rasgos.py && python 06_rasgos_a_audio.py && python 07_validar.py
python 08_video_con_audio.py                       # outputs salidas/demo_rocola.mp4
```

## Pipeline

| Script | Input → Output |
|---|---|
| `04_video_sintetico.py [sec]` | Generates a synthetic test video with ground-truth values → `salidas/04_video_sintetico.mp4`, `config/config_video.json` |
| `05_video_a_rasgos.py [config]` | Extracts per-frame physical features from video → `salidas/rasgos.json` |
| `06_rasgos_a_audio.py [rasgos] [--sintetico]` | Converts features into MIDI and stereo audio (marimba + pad drone via FluidSynth, or NumPy fallback with `--sintetico`) → `salidas/rocola.mid`, `salidas/rocola.wav`, `salidas/control.json` |
| `07_validar.py` | Verifies pitch, note accuracy, trend, and panning in the generated WAV → `salidas/validacion.png` |
| `08_video_con_audio.py [video] [wav] [mp4]` | Muxes and synchronizes the original video with the generated audio → `salidas/demo_rocola.mp4` |

`sintesis.py` houses the core audio engine (oscillators, ADSR envelopes, scales, and panning). Early synthesis exercises (`01`–`03`) are preserved under the `practica-completa` git tag.

## Processing Real NASA Data (SVS 5207)

1. Download from <https://svs.gsfc.nasa.gov/5207/> into `datos/` (git-ignored): `2023GISTEMP_Map_SOS.mp4`, `giss_navy_anomaly_Vertical-both.png`, and `time.txt`.
2. Calibrate the map and color-bar crops (writes `salidas/calibracion.png` for visual verification):
   ```bash
   python -m herramientas.calibrar
   python -m herramientas.calibrar --vmin -2 --vmax 2 --fechas datos/time.txt --salida config/config_eic.json
   ```
3. Extract features and synthesize audio (≈25 s for 60 frames):
   ```bash
   python 05_video_a_rasgos.py config/config_eic.json
   python 06_rasgos_a_audio.py
   ```
4. Mux the original video with the synthesized audio:
   ```bash
   python 08_video_con_audio.py datos/2023GISTEMP_Map_SOS.mp4 salidas/rocola.wav salidas/demo_gistemp.mp4
   ```

This overwrites `salidas/rasgos.json` and `salidas/rocola.wav`. To restore the synthetic test case, rerun steps `04` → `07`.

## Configuration (`05`)

Each visualization has its own JSON configuration under `config/`. Core keys include:

| Key | Description |
|---|---|
| `mapa`, `barra` | Bounding boxes `[x0, y0, x1, y1]` for the map and color bar in original video pixels |
| `vmin`, `vmax` | Physical values at both ends of the color bar (verified via `salidas/calibracion.png`) |
| `fps_muestreo` | Sampled frames per second (each sampled frame spans 0.5 s of audio) |
| `dist_max` | Maximum color distance allowed to accept a pixel (default `8`; `17` for GISTEMP) |
| `referencia` | Baseline value where the drone sits (0 °C anomaly for GISTEMP) |
| `paneo` | Spatial axis (`"x"` or `"y"`) mapped to left–right stereo panning |

The full reference of configuration keys and defaults is documented in [docs/CONFIG.md](docs/CONFIG.md) (in Spanish).

## Data Contract (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`validos` reports the fraction of pixels matched against the calibrated palette (if it drops below `0.8`, check the crop coordinates). The audio engine ignores extra keys, allowing downstream modules to enrich records (e.g., adding `"evento"`) without breaking compatibility.

## Repository Structure

```text
sintesis.py  rutas.py  fechas.py  video_io.py  04…08_*.py  evaluar.py    core pipeline (root)
config/        per-visualization configurations (GISTEMP, ECCO2, synthetic)
datos/         downloaded NASA videos and color bars (git-ignored)
salidas/       generated artifacts (WAV, MP4, PNG, JSON); salidas_sst/ stores ECCO2 (ROCOLA_SALIDAS=salidas_sst)
herramientas/  calibrar.py         → crop and color-bar detection (--mapa, --modo-color)
               exportar_mapeo.py   → exports feature-to-sound parameters for the browser live engine
               validar_gistemp.py  → compares extracted series against official GISTEMP v4
               exportar_paleta.py  → exports color lookup tables for "Explore the map"
               exportar_web.py     → packages video and features into web/assets/ and verifies audio
web/           bilingual web app with 3D globe and accessible jukebox (see web/README.md)
docs/          CAMBIOS.txt (technical log), CONFIG.md (parameters), ESPEC_MODO_EN_VIVO.md, and datos_oficiales/
```

Environment variables: `ROCOLA_SALIDAS` and `ROCOLA_CONFIG` redirect output/config directories; `ROCOLA_SIN_AUDIO=1` disables speaker playback when running `06`.

## Known Limitations

- **GISTEMP offset (SVS 5207):** the extracted mean tracks the official series with a `0.99` correlation, but exhibits a systematic −0.09 °C bias relative to GISTEMP v4 due to video color smoothing.
- **Ocean track (SVS 3912 / ECCO2):** processed with `config/config_sst.json` and `ROCOLA_SALIDAS=salidas_sst`. Only 26 % of the map consists of valid current streamlines (the bright pixels), which shifts the extracted mean a few degrees above actual sea-surface temperature. It captures seasonal cycles well, but should not be read as absolute degrees (noted in the web UI).
- **Manual range reading:** `vmin` and `vmax` are read visually from `salidas/calibracion.png` (no OCR is performed on video labels).
- **Color tolerance in SVS 5207:** the map rendering is slightly more desaturated than its reference color bar, so `config_eic.json` raises `dist_max` to `17`.
- **Frame duration and sync:** each sampled frame lasts 0.5 s of audio (`SEG_POR_FOTOGRAMA` in `06`). When `fps_muestreo` differs from 2, `08` stretches or compresses video playback to match audio duration. In `demo_rocola.mp4`, video starts 0.1 s after audio to prevent stuttering in VLC.
- **Browser coverage:** tested thoroughly in Chromium (desktop and mobile) and with Spanish screen readers; full validation in Safari, Firefox, and English screen readers remains pending.
- **Voice guide:** works best in Chrome and Edge. Firefox has no speech recognition and Brave does not connect it to any service, so there the guide is used by typing; the voice it speaks with depends on the voices installed on the system.

Detailed logs and measurements for every iteration are recorded in [docs/CAMBIOS.txt](docs/CAMBIOS.txt).

## Use of AI

In accordance with NASA Space Apps Challenge disclosure rules, we declare how artificial intelligence was used in this project:

- **What the team designed and validated:** the computer-vision pipeline architecture, the mathematical rules mapping climate variables to musical parameters, the calibration against NASA datasets (GISTEMP v4 and ECCO2), the accessibility design, and the entire scientific and UI test suite.
- **Where AI was used:** we used **Claude (Anthropic)** via Claude Code as a coding assistant to accelerate Python and JavaScript implementation, draft documentation, and generate the English translation. All generated code was audited, executed, and refined by the team.
- **What does not involve AI:** sound generation (deterministic from fixed rules and video pixels), dynamic narration text (data-driven templates), visual assets (NASA textures, our own screenshots, and a code-drawn icon in `web/hacer_icono.py`), and scientific data.

## References

**Data and Visualizations (NASA)**

- NASA Scientific Visualization Studio, **SVS 5207**: *Global Temperature Anomalies from 1880 to 2023* (GISTEMP visualization). <https://svs.gsfc.nasa.gov/5207/>
- NASA Scientific Visualization Studio, **SVS 3912**: Ocean surface currents and temperature (ECCO2 model), 2007–2008. <https://svs.gsfc.nasa.gov/3912/>
- **GISTEMP v4**, NASA Goddard Institute for Space Studies: official global temperature anomaly series used for validation (`docs/datos_oficiales/`). <https://data.giss.nasa.gov/gistemp/>
- **ECCO2** (*Estimating the Circulation and Climate of the Ocean, Phase II*), NASA/JPL: ocean model behind SVS 3912. <https://ecco.jpl.nasa.gov/>
- 3D Globe textures: *Blue Marble Next Generation* and *Black Marble*, NASA Earth Observatory (public domain).

**Audio and Typography**

- **FluidR3_GM SoundFont** (Frank Wen, MIT license): instrument bank used by FluidSynth in `06` (optional; falls back to NumPy synthesis).
- **FluidSynth** (LGPL-2.1+) and **ffmpeg**: optional external tools for MIDI rendering and media muxing.
- Web fonts (`web/assets/fonts/`, SIL OFL 1.1 license): *Unbounded*, *Plus Jakarta Sans*, and *Space Mono*.

**Libraries and Testing**

- Python (`requirements.txt`): `numpy`, `scipy`, `opencv-python-headless`, `matplotlib`, `sounddevice`, `mido`.
- Web (`web/vendor/`, see `LICENCIAS.md`): `three.js` (MIT), `GSAP` and `ScrollTrigger` (standard free GreenSock license).
- Testing: `Playwright` and `axe-core`.

This project is not officially endorsed by NASA.