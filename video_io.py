"""
Escritura de video que funciona igual en Linux, macOS y Windows.

En Linux, OpenCV escribe 'mp4v' con su FFMPEG interno. En macOS el OpenCV de pip no trae FFMPEG y 'mp4v' no abre
(sin avisar del fallo). Aquí se prueba cada método con un video diminuto que se vuelve a leer, se elige el
primero que funciona y se recuerda. Si ninguno funciona, se aborta con un mensaje claro.

Uso:  out = abrir_escritor(ruta, fps, (ancho, alto)); out.write(frame_bgr); out.release()
"""
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

# (nombre, tipo, argumentos): en orden de preferencia. Los de ffmpeg reciben los fotogramas crudos por una tubería.
METODOS = [
    ("opencv mp4v", "cv2", "mp4v"),
    ("ffmpeg mpeg4", "ffmpeg", ["-c:v", "mpeg4", "-q:v", "1", "-pix_fmt", "yuv420p"]),
    ("ffmpeg h264 sin pérdida", "ffmpeg", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "0", "-pix_fmt", "yuv444p"]),
    ("ffmpeg h264", "ffmpeg", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "4", "-pix_fmt", "yuv420p"]),
    ("opencv avc1", "cv2", "avc1"),
]
_elegido = None


class _EscritorFfmpeg:
    def __init__(self, ruta, fps, tam, args):
        self.ruta = ruta
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{tam[0]}x{tam[1]}",
               "-r", str(fps), "-i", "-", *args, ruta]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def isOpened(self):
        return self.proc.poll() is None

    def write(self, frame):
        try:
            self.proc.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())
        except BrokenPipeError:
            pass                                   # el error real se informa en release()

    def release(self):
        try:
            self.proc.stdin.close()
        except BrokenPipeError:
            pass
        err = self.proc.stderr.read().decode(errors="replace")
        if self.proc.wait() != 0:
            sys.exit(f"No se pudo escribir el video {self.ruta}: {err.strip()[-300:]}")


def _crear(metodo, ruta, fps, tam):
    _nombre, tipo, arg = metodo
    if tipo == "cv2":
        return cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*arg), fps, tam)
    if not shutil.which("ffmpeg"):
        return None
    return _EscritorFfmpeg(ruta, fps, tam, arg)


def _sirve(metodo):
    """Escribe 6 fotogramas de 64x48 y comprueba que OpenCV los vuelve a leer."""
    with tempfile.TemporaryDirectory() as d:
        ruta = os.path.join(d, "prueba.mp4")
        try:
            out = _crear(metodo, ruta, 10, (64, 48))
            if out is None or not out.isOpened():
                return False
            for k in range(6):
                out.write(np.full((48, 64, 3), 40 * k, np.uint8))
            out.release()
        except (SystemExit, Exception):
            return False
        if not os.path.exists(ruta) or os.path.getsize(ruta) == 0:
            return False
        cap = cv2.VideoCapture(ruta)
        n = 0
        while cap.read()[0]:
            n += 1
        cap.release()
        return n >= 5


def metodo_video():
    """Nombre del método que se usará en esta máquina (para informes y documentación)."""
    global _elegido
    if _elegido is None:
        # OpenCV avisa por stderr cuando un códec no abre; durante el sondeo ese ruido no interesa
        nivel = cv2.getLogLevel() if hasattr(cv2, "getLogLevel") else None
        if nivel is not None:
            cv2.setLogLevel(0)
        try:
            _elegido = next((m for m in METODOS if _sirve(m)), None)
        finally:
            if nivel is not None:
                cv2.setLogLevel(nivel)
        if _elegido is None:
            sys.exit("No hay forma de escribir video en esta máquina: OpenCV no abre 'mp4v' ni 'avc1' y no se "
                     "encontró ffmpeg. Instala ffmpeg (macOS: brew install ffmpeg; Ubuntu: sudo apt install ffmpeg).")
    return _elegido[0]


def abrir_escritor(ruta, fps, tam):
    """Escritor con write(frame) y release(). Aborta con mensaje si no se puede abrir."""
    metodo_video()
    out = _crear(_elegido, ruta, fps, tam)
    if out is None or not out.isOpened():
        sys.exit(f"No se pudo abrir el video de salida {ruta} con '{_elegido[0]}'.")
    return out


def contar_fotogramas(ruta):
    """Fotogramas que OpenCV logra leer de 'ruta' (0 si no existe o no abre)."""
    if not os.path.exists(ruta):
        return 0
    cap = cv2.VideoCapture(ruta)
    n = 0
    while cap.read()[0]:
        n += 1
    cap.release()
    return n
