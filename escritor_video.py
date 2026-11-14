"""escritor_video.py — escribe videos .mp4 fotograma a fotograma en Linux, Windows y macOS.

abrir_escritor(ruta, fps, (ancho, alto)) devuelve un objeto con write(frame_bgr) y release(), como
cv2.VideoWriter. Prueba, en este orden:
  1. OpenCV con 'mp4v' (MPEG-4 parte 2): el de siempre en Linux y Windows (backend FFMPEG de OpenCV).
  2. El programa ffmpeg con el mismo códec MPEG-4: el opencv-python de pip para macOS no trae el escritor
     FFMPEG, así que 'mp4v' no abre. ffmpeg ya es requisito de 08.
  3. OpenCV con 'avc1' (H.264 vía AVFoundation, solo macOS): comprime más y desplaza un poco los colores.
Antes, en macOS, cv2.VideoWriter fallaba EN SILENCIO (no creaba el archivo) y el error salía después en 05
("No se pudo abrir el video") o en evaluar.py (23 FALLA).
"""
import shutil
import subprocess
import sys

import cv2


class _EscritorFfmpeg:
    """Envía fotogramas BGR crudos a ffmpeg por la entrada estándar (códec mpeg4, calidad alta)."""

    def __init__(self, ruta, fps, tam):
        ancho, alto = tam
        self._proceso = subprocess.Popen(
            ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{ancho}x{alto}",
             "-r", str(fps), "-i", "-", "-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", "yuv420p", ruta],
            stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame):
        self._proceso.stdin.write(frame.tobytes())

    def release(self):
        _, error = self._proceso.communicate()
        if self._proceso.returncode != 0:
            sys.exit(f"ffmpeg no pudo escribir el video: {error.decode(errors='replace')[-300:]}")


def _abrir_opencv(ruta, fps, tam, codec):
    escritor = cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*codec), fps, tam)
    if escritor.isOpened():
        return escritor
    escritor.release()
    return None


def abrir_escritor(ruta, fps, tam):
    """Escritor de video para 'ruta' (.mp4); tam = (ancho, alto). Si nada funciona, termina con un mensaje
    claro en vez de seguir sin escribir nada."""
    escritor = _abrir_opencv(ruta, fps, tam, "mp4v")
    if escritor is None and shutil.which("ffmpeg"):
        escritor = _EscritorFfmpeg(ruta, fps, tam)
    if escritor is None:
        escritor = _abrir_opencv(ruta, fps, tam, "avc1")
    if escritor is None:
        sys.exit(f"No puedo escribir el video '{ruta}': OpenCV no abre 'mp4v' ni 'avc1' y no encontré ffmpeg.\n"
                 "Instala ffmpeg (macOS: brew install ffmpeg; Linux: sudo apt install ffmpeg) o reinstala las "
                 "dependencias:  pip install -r requirements.txt")
    return escritor
