"""rutas.py — único lugar que conoce las carpetas del proyecto.

Todos los scripts se ejecutan DESDE LA RAÍZ del proyecto (donde está sintesis.py).
Variables de entorno opcionales (las usa evaluar.py para no tocar salidas/):
  ROCOLA_SALIDAS  carpeta de archivos generados   (por defecto: salidas)
  ROCOLA_CONFIG   carpeta de configuración        (por defecto: config)
"""
import os
import sys

if not os.path.exists("sintesis.py"):
    sys.exit("Ejecuta los scripts desde la raíz del proyecto (la carpeta que contiene "
             f"sintesis.py). Carpeta actual: {os.getcwd()}")

SALIDAS = os.environ.get("ROCOLA_SALIDAS", "salidas")
CONFIG = os.environ.get("ROCOLA_CONFIG", "config")


def _en(carpeta, nombre):
    os.makedirs(carpeta, exist_ok=True)
    return os.path.join(carpeta, nombre)


def sal(nombre):
    """Ruta (str) de un archivo generado."""
    return _en(SALIDAS, nombre)


def cfg_ruta(nombre):
    """Ruta (str) de un archivo de configuración."""
    return _en(CONFIG, nombre)
