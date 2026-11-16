# Cómo colaborar

## Flujo de trabajo
1. Haz un **fork** del repositorio (o pide ser colaborador al dueño).
2. Clona y crea una rama por cambio: `git checkout -b mi-cambio`.
3. Prepara el entorno:
   ```
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. Haz tus cambios y **ejecuta `python evaluar.py`**: debe dar 0 FALLA (tarda ~50 s). Si tocas `web/`, ejecuta también `node --test web/pruebas/` y `web/pruebas/verificar.cjs` (ver `web/README.md`, sección «Pruebas»).
5. Añade un bloque "RONDA N - <tema> (fecha)" al final de `docs/CAMBIOS.txt` con problema,
   corrección, archivos tocados y números antes/después.
6. Sube la rama y abre un **Pull Request** hacia `master` explicando qué cambia y por qué.

## Reglas
- Un PR = un tema. Commits en español, descriptivos.
- No subas archivos generados pesados (`*.wav`, `*.mp4`, `datos/`); están en `.gitignore`.
- No cambies parámetros de calibración sin justificar con los números de `evaluar.py`.
