"""web/hacer_icono.py — dibuja por código el ícono de la pestaña: un círculo oscuro con una onda de lila a turquesa.

Uso (desde la raíz del proyecto):  python web/hacer_icono.py   (necesita Pillow)
Resultado: web/assets/icono-64.png (fondo transparente) e icono-180.png (fondo negro).
"""
import math
import os

from PIL import Image, ImageDraw

AQUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
PANEL, LILA, TURQUESA = (10, 11, 18), (205, 191, 255), (168, 236, 228)
SOBRE = 8          # se dibuja 8 veces más grande y se reduce: bordes suaves


def mezcla(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def icono(lado, fondo):
    n = lado * SOBRE
    im = Image.new("RGBA", (n, n), fondo)
    d = ImageDraw.Draw(im)
    m = n * 0.03                                             # margen del círculo
    d.ellipse([m, m, n - m, n - m], fill=PANEL + (255,), outline=mezcla(LILA, TURQUESA, 0.5) + (255,),
              width=round(n * 0.035))
    # onda: una sinusoide de 2 ciclos que crece en el centro y se apaga en los bordes
    x0, x1, grosor = n * 0.2, n * 0.8, n * 0.085
    pasos = 240
    for i in range(pasos + 1):
        t = i / pasos
        x = x0 + (x1 - x0) * t
        y = n / 2 - math.sin(t * 4 * math.pi) * n * 0.23 * math.sin(t * math.pi) ** 0.6
        r = grosor / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=mezcla(LILA, TURQUESA, t) + (255,))
    return im.resize((lado, lado), Image.LANCZOS)


icono(64, (0, 0, 0, 0)).save(os.path.join(AQUI, "icono-64.png"), optimize=True)
icono(180, (0, 0, 0, 255)).convert("RGB").save(os.path.join(AQUI, "icono-180.png"), optimize=True)
print("Íconos escritos en", AQUI)
