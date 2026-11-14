"""exportar_mapeo.py — exporta el mapeo rasgo -> sonido de 06 para el modo en vivo de la web (Web Audio).

Uso (desde la raíz):  python -m herramientas.exportar_mapeo [--gistemp salidas_gistemp] [--sst salidas_sst]
                                                         [--destino web/assets]
Por pista (id del catálogo) lee <carpeta>/rasgos.json, control.json y rocola.mid (los de 05 y 06) y escribe
  <destino>/<id>_mapeo.json     TODOS los números que necesita el JS (escala, rango de sonido, dron, paneo, volumen...)
  <destino>/<id>_esperado.json  por fotograma: t, nota, notas (arpegio), dron, pan, ganancia (lo que debe dar el JS)

Las funciones construir_mapeo() y aplicar_mapeo() son las FÓRMULAS de docs/ESPEC_MODO_EN_VIVO.md en Python
sin numpy (bucles y listas, para pasarlas tal cual a JavaScript). Antes de escribir, la exportación comprueba que
aplicar_mapeo() reproduce control.json (notas exactas, pan con error < 1e-6) y que el .mid concuerda; si no, aborta.
evaluar.py (prueba I1) repite esa comprobación.

No modifica ningún script del pipeline: replica la lógica de 06_rasgos_a_audio.py (la especificación cita la
función de 06 de la que sale cada regla) y la compara con su resultado real. Las constantes comunes (tempo,
valores por defecto) se importan de parametros.py, igual que en 06.
"""
import argparse
import json
import math
import os
import sys

from parametros import DEFECTOS, SEG_POR_FOTOGRAMA, TICKS_F, TONICA_MIDI, VEL_FUERTE
from parametros import OCTAVAS as _OCTAVAS

GRADOS = (0, 2, 4, 7, 9)           # sintesis.PENTATONICA_MAYOR (aquí sin numpy)
TONICA, OCTAVAS = TONICA_MIDI, _OCTAVAS
PISTAS = {"gistemp_1880_2023": "gistemp", "sst_ecco2_2007_2008": "sst"}


# ---------------------------------------------------------------------------- utilidades (portables a JS)
def redondear(x):
    """Redondeo al par en los empates (np.round / round de Python 3). En JS: ver ESPEC, redondearPar()."""
    return round(x)


def limitar(x, lo, hi):
    return min(max(x, lo), hi)


def rellenar(v, defecto):
    """None/NaN -> último valor válido (o 'defecto' al inicio). Igual que rellenar() de 06."""
    salida, ultimo = [], defecto
    for x in v:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            salida.append(ultimo)
        else:
            salida.append(float(x))
            ultimo = float(x)
    return salida


def media_movil(x, n):
    """Media móvil centrada de n fotogramas; en los bordes la ventana se acorta. Igual que media_movil() de 06."""
    h = (int(n) | 1) // 2
    out = []
    for i in range(len(x)):
        v = x[max(0, i - h): i + h + 1]
        out.append(sum(v) / len(v))
    return out


def percentil(v, q):
    """Percentil con interpolación lineal (numpy por defecto). q en 0..100."""
    s = sorted(v)
    pos = (len(s) - 1) * q / 100
    lo = math.floor(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def escala_notas():
    """sintesis.escala(): tónica + 12*o + grado para 3 octavas, más la tónica 3 octavas arriba (16 notas)."""
    return [TONICA + 12 * o + g for o in range(OCTAVAS) for g in GRADOS] + [TONICA + 12 * OCTAVAS]


def indice_nota(x, v0, v1, n_notas):
    """sintesis.valor_a_nota(), devolviendo el ÍNDICE en la escala."""
    t = limitar((x - v0) / (v1 - v0 + 1e-12), 0.0, 1.0)
    return redondear(t * (n_notas - 1))


def db_a_lineal(db):
    return 10 ** (db / 20)


# ---------------------------------------------------------------------------- mapeo
def construir_mapeo(doc, id_="pista"):
    """Todos los parámetros que el JS necesita, a partir del rasgos.json (doc) de la pista."""
    R = doc["rasgos"]
    cfg = {**DEFECTOS, **{k: doc[k] for k in DEFECTOS if doc.get(k) is not None}}      # 06: leer_ajustes()
    notas = escala_notas()
    v0, v1 = doc.get("vmin_sonido", doc["vmin"]), doc.get("vmax_sonido", doc["vmax"])  # 06: rango_sonido()
    relleno = (doc["vmin"] + doc["vmax"]) / 2
    media = rellenar([r.get("media") for r in R], relleno)                              # 06: mapear()
    area = rellenar([r.get("area") for r in R], 0.0)                                    # 06: mapear()
    media_s = media_movil(media, cfg["suavizado"]) if int(cfg["suavizado"]) > 1 else media   # 06: mapear()
    octava = int(cfg["octava"])
    ref = doc.get("referencia")
    idx_ref = indice_nota(ref, v0, v1, len(notas)) if ref is not None else indice_nota(media_s[0], v0, v1, len(notas))
    nota_ref = notas[idx_ref]                                                           # 06: nota_del_dron()
    nota_dron = int(limitar(nota_ref + 12 * octava - 12 + 12 * int(cfg["dron_octava"]), 0, 127))   # 06: nota_del_dron()
    umbral_evento = cfg["umbral_evento"] if cfg["umbral_evento"] is not None else (v1 - v0) / 12     # 06: leer_ajustes()
    u1, u2 = doc.get("densidad_umbrales") or (v0 + 0.5 * (v1 - v0), v0 + 13 / 18 * (v1 - v0))      # 06: umbrales_densidad()
    # paneo (06: calcular_paneo())
    eje = cfg["paneo"]
    if eje == "y" and not any("centroide_y" in r for r in R):
        eje = "x"
    campo = "centroide_x" if eje == "x" else "centroide_y"
    c_eje = rellenar([r.get(campo) for r in R], 0.5)
    c_suave = media_movil(c_eje, 3)
    p5, p95 = percentil(c_suave, 5), percentil(c_suave, 95)
    return {
        "id": id_,
        "fuente": doc.get("fuente"),
        "n_fotogramas": len(R),
        "seg_por_fotograma": SEG_POR_FOTOGRAMA,
        "relleno_media": relleno,                      # valor si el primer fotograma no trae media
        "suavizado_fotogramas": int(cfg["suavizado"]),
        "escala": {"tonica_midi": TONICA, "octavas": OCTAVAS, "grados": list(GRADOS), "notas_base": notas,
                   "octava": octava, "notas_sonando": [n + 12 * octava for n in notas],
                   "nota_min": notas[0] + 12 * octava, "nota_max": notas[-1] + 12 * octava},
        "vmin_sonido": v0, "vmax_sonido": v1,
        "referencia": ref, "nota_referencia_base": nota_ref,
        "dron": {"nota_midi": nota_dron, "hz": 440.0 * 2 ** ((nota_dron - 69) / 12), "dron_octava": int(cfg["dron_octava"]),
                 "velocidad": int(limitar(round(45 * cfg["dron_nivel"] / 0.08), 1, 127)), "nivel": cfg["dron_nivel"]},
        "volumen": {"db_min": -6.0, "db_max": 0.0, "area_max": max(area), "area_max_minimo": 1e-6,
                    "ganancia_min": db_a_lineal(-6.0), "ganancia_max": 1.0, "velocidad_max": 127,
                    "velocidad_fuerte": VEL_FUERTE},
        "densidad": {"activa": bool(cfg["densidad"]), "umbrales": [u1, u2], "notas_por_fotograma": [1, 2, 4]},
        "paneo": {"eje": eje, "campo": campo, "suavizado_fotogramas": 3, "p5": p5, "p95": p95,
                  "centro": (p5 + p95) / 2, "umbral_rama": 0.1, "ancho_rama_estrecha": 0.1,
                  "rama": "amplia" if p95 - p5 >= 0.1 else "estrecha", "suavizado_s": 0.15, "ley": "potencia_constante"},
        "articulacion": {"umbral_evento": umbral_evento, "ligar": bool(cfg["ligar"]),
                         "regolpe_ligado": int(cfg["regolpe_ligado"]), "regolpe_vel": cfg["regolpe_vel"],
                         "duracion_nota": 0.95},
        "opcional": {"instrumento_melodia": int(cfg["instrumento_melodia"]), "dron_programa": int(cfg["dron_programa"]),
                     "reverb_cc91": int(cfg["reverb"]), "humanizar": bool(cfg["humanizar"]),
                     "humanizar_semilla": 12345, "humanizar_ms": 10, "humanizar_vel": 0.1},
    }


def aplicar_mapeo(rasgos, m):
    """Por fotograma: nota (melodía, ya con octava), notas (arpegio), dron, pan (-1..1), ganancia, velocidad,
    evento_fuerte. 'rasgos' = lista de rasgos de rasgos.json; 'm' = construir_mapeo()."""
    esc, v0, v1 = m["escala"]["notas_base"], m["vmin_sonido"], m["vmax_sonido"]
    oct12 = 12 * m["escala"]["octava"]
    media = rellenar([r.get("media") for r in rasgos], m["relleno_media"])
    area = rellenar([r.get("area") for r in rasgos], 0.0)
    c_eje = rellenar([r.get(m["paneo"]["campo"]) for r in rasgos], 0.5)
    media_s = media_movil(media, m["suavizado_fotogramas"]) if m["suavizado_fotogramas"] > 1 else media
    c_suave = media_movil(c_eje, m["paneo"]["suavizado_fotogramas"])
    u1, u2 = m["densidad"]["umbrales"]
    a_max = max(m["volumen"]["area_max"], m["volumen"]["area_max_minimo"])
    p = m["paneo"]
    salida = []
    for i in range(len(rasgos)):
        idx = indice_nota(media_s[i], v0, v1, len(esc))
        k = (1 if media_s[i] < u1 else (2 if media_s[i] <= u2 else 4)) if m["densidad"]["activa"] else 1
        arp = [esc[min(idx + j, len(esc) - 1)] + oct12 for j in range(k)]
        if p["rama"] == "amplia":
            c_pan = limitar((c_suave[i] - p["p5"]) / (p["p95"] - p["p5"]), 0.0, 1.0)
        else:
            c_pan = limitar(0.5 + (c_suave[i] - p["centro"]) / p["ancho_rama_estrecha"], 0.0, 1.0)
        a_n = limitar(area[i] / a_max, 0.0, 1.0)
        ganancia = db_a_lineal(m["volumen"]["db_min"] + (m["volumen"]["db_max"] - m["volumen"]["db_min"]) * a_n)
        salida.append({
            "nota": esc[idx] + oct12, "notas": arp, "dron": m["dron"]["nota_midi"], "pan": 2 * c_pan - 1,
            "ganancia": ganancia, "velocidad": redondear(m["volumen"]["velocidad_max"] * ganancia),
            "evento_fuerte": bool(i > 0 and abs(media[i] - media[i - 1]) > m["articulacion"]["umbral_evento"]),
        })
    return salida


def comparar_con_control(calc, ctl, tol_pan=1e-6):
    """Lista de discrepancias entre aplicar_mapeo() y control.json (vacía = reproduce)."""
    fallas = []
    if len(calc) != len(ctl["midi"]):
        return [f"{len(calc)} fotogramas calculados frente a {len(ctl['midi'])} en control.json"]
    for i, c in enumerate(calc):
        if c["nota"] != ctl["midi"][i]:
            fallas.append(f"f{i}: nota {c['nota']} != {ctl['midi'][i]}")
        if c["notas"] != ctl["notas"][i]:
            fallas.append(f"f{i}: arpegio {c['notas']} != {ctl['notas'][i]}")
        if c["dron"] != ctl["dron"]:
            fallas.append(f"f{i}: dron {c['dron']} != {ctl['dron']}")
        if abs(c["pan"] - ctl["pan"][i]) > tol_pan:
            fallas.append(f"f{i}: pan {c['pan']:.4f} != {ctl['pan'][i]:.4f}")
        if c["evento_fuerte"] != ctl["evento_fuerte"][i]:
            fallas.append(f"f{i}: evento_fuerte {c['evento_fuerte']} != {ctl['evento_fuerte'][i]}")
    return fallas


def comprobar_mid(ruta_mid, ctl, calc):
    """Contra el .mid real: CC10 de cada fotograma = round(64 + 63*pan) y velocidades de los ataques normales
    dentro de la humanización (+-10 %). Devuelve lista de discrepancias."""
    import mido
    fallas, cc10, ataques = [], {}, []
    t = 0
    for m in mido.merge_tracks(mido.MidiFile(ruta_mid).tracks):
        t += m.time
        if m.type == "control_change" and m.channel == 0 and m.control == 10 and t % TICKS_F == 0:
            cc10[t // TICKS_F] = m.value        # en el tick 0 el CC10 del fotograma 0 va después del de arranque (64): gana el último
        if m.type == "note_on" and m.velocity > 0 and m.channel == 0:
            ataques.append(m.velocity)
    for i, c in enumerate(calc):
        esperado = max(0, min(127, round(64 + 63 * c["pan"])))
        if i in cc10 and cc10[i] != esperado:
            fallas.append(f"f{i}: CC10 {cc10[i]} != {esperado}")
    if len(ataques) != ctl["ataques"]:
        fallas.append(f"{len(ataques)} ataques en el .mid frente a {ctl['ataques']}")
    else:
        for v, tipo, ini in zip(ataques, ctl["tipo_ataque"], ctl["inicio_ticks"]):
            if tipo == "ataque":
                nominal = calc[min(ini // TICKS_F, len(calc) - 1)]["velocidad"]
                if not 0.88 * nominal - 1 <= v <= 1.12 * nominal + 1:
                    fallas.append(f"velocidad {v} fuera de +-10 % de {nominal} (tick {ini})")
    return fallas


# ---------------------------------------------------------------------------- exportación
def exportar(id_, carpeta, destino):
    for n in ("rasgos.json", "control.json", "rocola.mid"):
        if not os.path.exists(os.path.join(carpeta, n)):
            sys.exit(f"Falta {os.path.join(carpeta, n)} (pista {id_}): corre 05 y 06 con ROCOLA_SALIDAS={carpeta}.")
    with open(os.path.join(carpeta, "rasgos.json")) as fh:
        doc = json.load(fh)
    with open(os.path.join(carpeta, "control.json")) as fh:
        ctl = json.load(fh)
    m = construir_mapeo(doc, id_)
    calc = aplicar_mapeo(doc["rasgos"], m)
    fallas = comparar_con_control(calc, ctl) + comprobar_mid(os.path.join(carpeta, "rocola.mid"), ctl, calc)
    if fallas:
        sys.exit(f"{id_}: el mapeo NO reproduce el resultado de 06 ({len(fallas)} discrepancias); primeras:\n  "
                 + "\n  ".join(fallas[:8]) + "\nNo se escribió nada. ¿Cambió 06 o los rasgos.json no son los de control.json?")
    esperado = {"id": id_, "seg_por_fotograma": SEG_POR_FOTOGRAMA, "tolerancia_pan": 0.02,
                "nota": "nota/notas/dron/pan salen de control.json (lo que sonó); ganancia = 10^((-6 + 6*area/area_max)/20) "
                        "(velocidad MIDI nominal = round(127*ganancia)); t = inicio del fotograma en el audio (s)",
                "fotogramas": [{"i": i, "t": round(i * SEG_POR_FOTOGRAMA, 3), "nota": ctl["midi"][i], "notas": ctl["notas"][i],
                                "dron": ctl["dron"], "pan": round(ctl["pan"][i], 6), "ganancia": round(c["ganancia"], 6),
                                "velocidad": c["velocidad"], "evento_fuerte": ctl["evento_fuerte"][i],
                                "ataque": ctl["ataque_en_fotograma"][i]} for i, c in enumerate(calc)]}
    os.makedirs(destino, exist_ok=True)
    for sufijo, datos in (("mapeo", m), ("esperado", esperado)):
        ruta = os.path.join(destino, f"{id_}_{sufijo}.json")
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(datos, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print(f"{ruta}  ({os.path.getsize(ruta) / 1000:.1f} KB)")
    print(f"  {id_}: {len(calc)} fotogramas; notas {m['escala']['nota_min']}-{m['escala']['nota_max']}, "
          f"dron {m['dron']['nota_midi']}, paneo {m['paneo']['eje']} (rama {m['paneo']['rama']}), "
          f"vmin/vmax_sonido {m['vmin_sonido']}..{m['vmax_sonido']}  -> reproduce control.json y .mid")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--gistemp", default="salidas_gistemp", help="carpeta con rasgos.json, control.json y rocola.mid de GISTEMP")
    ap.add_argument("--sst", default="salidas_sst", help="ídem para SST (ECCO2)")
    ap.add_argument("--destino", default=os.path.join("web", "assets"))
    a = ap.parse_args()
    if not os.path.exists("sintesis.py"):
        sys.exit("Ejecuta desde la raíz del proyecto:  python -m herramientas.exportar_mapeo")
    for id_, carpeta in ((i, getattr(a, c)) for i, c in PISTAS.items()):
        exportar(id_, carpeta, a.destino)


if __name__ == "__main__":
    main()
