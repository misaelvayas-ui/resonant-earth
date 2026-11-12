"""graficar_01.py — Figura didáctica: por qué la envolvente ADSR evita el clic.

Genera grafica_01_v2.png. Las señales se calculan en memoria con las mismas
funciones de sintesis.py (tono, adsr) y los mismos parámetros que 01_tono_prueba.py.
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter
from sintesis import tono, adsr, FS

# ---------------------------------------------------------------- señales
A, D, S, R = 0.02, 0.1, 0.7, 0.2
crudo = 0.5 * tono(440, 1.0)
env = adsr(len(crudo), a=A, d=D, s=S, r=R)
con_env = crudo * env
N, NS = len(crudo), int(0.3 * FS)
x = np.concatenate([crudo, np.zeros(NS), con_env])

# Paleta accesible (Okabe-Ito): azul = crudo, naranja = ADSR
AZUL, NARANJA, GRIS = "#0072B2", "#E69F00", "#999999"
TRAMOS = {  # tramos ADSR: colores distintos y distinguibles (no rojo/verde)
    "Ataque": "#56B4E9",       # celeste
    "Decaimiento": "#F0E442",  # amarillo
    "Sostenido": "#CC79A7",    # magenta
    "Liberación": "#009E73",   # verde azulado
}
t_ms = lambda n: np.arange(n) / FS * 1000
YLIM = (-0.55, 0.55)

fig, ax = plt.subplots(2, 3, figsize=(15, 8), dpi=150)
fig.suptitle("Por qué la envolvente ADSR evita el clic", fontsize=17, fontweight="bold")

# ---------------------------------------------------------------- a) señal completa
a = ax[0, 0]
t = np.arange(len(x)) / FS
a.axvspan(0, 1.0, color=AZUL, alpha=0.10)
a.axvspan(1.0, 1.3, color=GRIS, alpha=0.18)
a.axvspan(1.3, 2.3, color=NARANJA, alpha=0.10)
a.plot(t[:N], x[:N], color=AZUL, lw=0.4)
a.plot(t[N:N + NS], x[N:N + NS], color=GRIS, lw=1)
a.plot(t[N + NS:], x[N + NS:], color=NARANJA, lw=0.4)
a.set(title="Señal completa", xlabel="Tiempo (s)", ylabel="Amplitud", xlim=(0, 2.3), ylim=(-0.75, 0.75))
for xc, txt, c in ((0.5, "Tono crudo", AZUL), (1.15, "Silencio", "#555555"), (1.8, "Tono con ADSR", "#B37400")):
    a.text(xc, 0.66, txt, ha="center", va="center", fontsize=9.5, fontweight="bold", color=c)
a.text(1.15, 0.5, "0,3 s", ha="center", fontsize=8, color="#555555")

# ---------------------------------------------------------------- b) envolvente
b = ax[0, 1]
te = t_ms(len(env))
bordes = [0, A * 1000, (A + D) * 1000, 800, 1000]
nombres = list(TRAMOS)
rangos = ["0–20 ms", "20–120 ms", "120–800 ms", "800–1000 ms"]
for i, nom in enumerate(nombres):
    m = (te >= bordes[i]) & (te <= bordes[i + 1])
    b.fill_between(te[m], 0, env[m], color=TRAMOS[nom], alpha=0.55, lw=0)
    b.plot(te[m], env[m], color="black", lw=1.6)
b.axhline(S, color="black", ls=":", lw=1)
b.set_yticks([0, 0.25, 0.5, 0.7, 1.0])
b.set_yticklabels(["0", "0,25", "0,5", "0,7", "1,0"])
b.set(title="Envolvente ADSR (curva de volumen)", xlabel="Tiempo (ms)", ylabel="Volumen relativo",
      xlim=(0, 1000), ylim=(0, 1.38))
flecha = dict(arrowstyle="-", color="#555555", lw=0.8)
etiquetas = {  # nombre: (x del texto, y del texto, ha, x de la flecha, y de la flecha)
    "Ataque": (10, 1.27, "left", 10, 0.5),
    "Decaimiento": (300, 1.27, "center", 70, 0.85),
    "Liberación": (900, 1.0, "center", 900, 0.36),
}
for i, nom in enumerate(nombres):
    xc = (bordes[i] + bordes[i + 1]) / 2
    if nom == "Sostenido":
        b.text(xc, 0.3, f"{nom}\n{rangos[i]}", ha="center", va="center", fontsize=8.5, fontweight="bold")
    else:
        xt, yt, ha, xa, ya = etiquetas[nom]
        b.annotate(f"{nom}\n{rangos[i]}", (xa, ya), xytext=(xt, yt), ha=ha, va="center",
                   fontsize=8.5, fontweight="bold", arrowprops=flecha)
for xv in bordes[1:-1]:
    b.axvline(xv, color="#777777", lw=0.6, ls="--")
b.text(450, S + 0.03, "nivel de sostenido = 0,7", ha="center", fontsize=8)

# ---------------------------------------------------------------- c) tono × envolvente
c = ax[0, 2]
tc = np.arange(N) / FS
c.plot(tc, con_env, color=NARANJA, lw=0.4)
c.plot(tc, 0.5 * env, color="black", lw=0.9)
c.plot(tc, -0.5 * env, color="black", lw=0.9)
c.set(title="Tono con ADSR = tono × envolvente", xlabel="Tiempo (s)", ylabel="Amplitud",
      xlim=(0, 1), ylim=(-0.7, 0.7))
c.legend(handles=[Patch(color=NARANJA, label="Tono con ADSR"),
                  plt.Line2D([], [], color="black", lw=1, label="±envolvente (× 0,5)")],
         loc="upper right", fontsize=8, framealpha=0.95, ncol=2)

# ---------------------------------------------------------------- d) inicio
d = ax[1, 0]
n30 = int(0.030 * FS)
d.plot(t_ms(n30), crudo[:n30], color=AZUL, lw=1.2, label="Crudo: arranca con toda su amplitud")
d.plot(t_ms(n30), con_env[:n30], color=NARANJA, lw=1.2, label="Con ADSR: crece gradualmente")
d.axvline(A * 1000, color="black", ls=":", lw=1)
d.text(A * 1000, YLIM[1] + 0.02, "fin del ataque (20 ms)", fontsize=8, ha="center", va="bottom")
d.set(title="Inicio: primeros 30 ms", xlabel="Tiempo (ms)", ylabel="Amplitud", xlim=(0, 30), ylim=YLIM)
d.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), fontsize=8, ncol=1, frameon=False)

# ---------------------------------------------------------------- e) final
e = ax[1, 1]
n250 = int(0.250 * FS)
te250 = t_ms(n250) + (1000 - 250)
e.plot(te250, crudo[-n250:], color=AZUL, lw=1.0, label="Crudo: se corta de golpe")
e.plot(te250, con_env[-n250:], color=NARANJA, lw=1.0, label="Con ADSR: se apaga suavemente")
e.axvline(800, color="black", ls=":", lw=1)
e.text(800, YLIM[1] + 0.02, "inicio de la liberación (200 ms)", fontsize=8, ha="center", va="bottom")
e.set(title="Final del tono: últimos 250 ms", xlabel="Tiempo dentro del tono (ms)", ylabel="Amplitud",
      xlim=(750, 1000), ylim=YLIM)
e.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), fontsize=8, ncol=1, frameon=False)
for p in (d, e):
    p.title.set_position((0.5, 1.0))
    p.set_title(p.get_title(), pad=16)

# ---------------------------------------------------------------- f) clic
f = ax[1, 2]
nf = int(0.005 * FS)
malo = 0.5 * tono(440, 1.0 + 0.25 / 440)          # corta en el pico de la onda
malo_seg = np.concatenate([malo[-nf:], [0.0]])    # + la muestra de silencio que sigue
bueno_seg = np.concatenate([crudo[-nf:], [0.0]])
salto_malo = np.max(np.abs(np.diff(malo_seg)))
salto_bueno = np.max(np.abs(np.diff(bueno_seg)))
coma = lambda v, n=4: f"{v:.{n}f}".replace(".", ",")
tf = (np.arange(len(malo_seg)) - len(malo_seg) + 1) / FS * 1000   # ms; 0 = primera muestra de silencio
f.plot(tf[:-1], malo_seg[:-1], color=AZUL, lw=1.4, marker="o", ms=2.5, label="Crudo cortado en el pico")
f.plot(tf[-2:], malo_seg[-2:], color="black", lw=1.8, ls="--")
f.plot(tf[-1], 0, "o", color=GRIS, ms=5)
f.plot(tf[-2], malo_seg[-2], "o", mfc="none", mec="black", ms=14, mew=1.4)
f.axhline(0, color=GRIS, lw=0.6)
f.annotate(f"Salto = {coma(salto_malo)}", xy=(tf[-1] + 0.02, malo_seg[-2] / 2), xytext=(1.9, 0.25),
           fontsize=9.5, fontweight="bold", ha="center", va="center",
           arrowprops=dict(arrowstyle="->", color="black", lw=1.3))
f.text(0.3, -0.15,
       "Salto máx. al cortar:\n"
       f"1,0 s + ¼ ciclo: {coma(salto_malo)}\n"
       f"1,0 s exacto: {coma(salto_bueno)}\n"
       "Con ADSR: ≈ 0,00003",
       fontsize=8, va="top", ha="left", linespacing=1.5,
       bbox=dict(boxstyle="round", fc="white", ec="#888888"))
f.set(title="Corte del tono crudo con clic", xlabel="Tiempo respecto al corte (ms)",
      ylabel="Amplitud", xlim=(-5.2, 3.6), ylim=YLIM)
f.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), fontsize=8, frameon=False)
f.set_title(f.get_title(), pad=16)

fmt = FuncFormatter(lambda v, _: f"{v:g}".replace(".", ",").replace("-", "−"))
for p in ax.flat:
    p.grid(alpha=0.25)
    p.xaxis.set_major_formatter(fmt)
    if p is not b:
        p.yaxis.set_major_formatter(fmt)

fig.tight_layout(rect=(0, 0, 1, 0.95), h_pad=2.5)
fig.savefig("grafica_01_v2.png")
print(f"Guardado: grafica_01_v2.png")
print(f"Panel f: salto con corte a 1,0 s + 1/4 ciclo = {salto_malo:.5f}; "
      f"con 1,0 s exacto = {salto_bueno:.5f}; "
      f"último valor = {malo[-1]:+.5f} / {crudo[-1]:+.5f}")
