"""fechas.py — lectura de archivos de fechas y etiquetas para mostrar en pantalla.

Dos formatos de archivo (una línea por fotograma del video):
  time.txt (GISTEMP)            "1881"                      -> solo el año
  flat_ecco2_dates.txt (ECCO2)  "23000  2007-03-25T12:00Z"  -> ID y fecha ISO UTC (se usa la 2.ª columna)

Etiquetas ('fechas_formato' del config):
  "anio" (por defecto)  2007           (int, igual que siempre con GISTEMP)
  "mes"                 "mar 2007"     (mes abreviado en español, sin depender del idioma del sistema)
Una línea que ya es un año suelto se devuelve como int en cualquier formato (no trae mes que mostrar).
"""
import re

MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
FORMATOS = ("anio", "mes")
_ISO = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$")


def leer_fechas(ruta):
    """Lista de textos crudos, uno por línea útil: la 2.ª columna si es una fecha ISO ("ID  fecha"), si no la 1.ª."""
    crudos = []
    with open(ruta) as fh:
        for linea in fh:
            partes = linea.split()
            if partes and not linea.lstrip().startswith("#"):
                crudos.append(partes[1] if len(partes) > 1 and _ISO.match(partes[1]) else partes[0])
    return crudos


def etiqueta(crudo, formato="anio"):
    """Texto crudo -> lo que se muestra/guarda ('fecha' de rasgos.json)."""
    if crudo.isdigit():
        return int(crudo)
    m = _ISO.match(crudo)
    if not m:
        return crudo                                  # formato desconocido: se muestra tal cual
    anio, mes = int(m.group(1)), int(m.group(2))
    if not 1 <= mes <= 12:
        return crudo                                  # fecha imposible: se muestra tal cual, sin detener 05
    return f"{MESES[mes - 1]} {anio}" if formato == "mes" else anio
