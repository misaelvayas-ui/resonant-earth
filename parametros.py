"""parametros.py — único lugar con las constantes que comparten varios scripts.

Las usan 05 (qué claves musicales copia a rasgos.json), 06 (tempo, MIDI y valores por defecto),
herramientas/exportar_mapeo.py y web/preparar_datos.py. Sin dependencias: solo números y nombres,
para que cualquier script pueda importarlo.

Cambiar un valor aquí cambia el sonido de todas las pistas: justifícalo con evaluar.py.
"""

# --- tiempo -----------------------------------------------------------------
SEG_POR_FOTOGRAMA = 0.5          # tempo: cuánto dura cada fotograma en el audio
TPB, BPM = 480, 120              # ticks por negra y pulsos por minuto: 1 s = 960 ticks
TICKS_F = int(SEG_POR_FOTOGRAMA * TPB * BPM / 60)     # ticks MIDI de un fotograma

# --- escala de la melodía ---------------------------------------------------
TONICA_MIDI, OCTAVAS = 48, 3     # pentatónica mayor de Do3 a Do6 (16 notas)

# --- articulación -----------------------------------------------------------
VEL_FUERTE = 100                 # velocidad MIDI mínima del ataque en un cambio brusco
SEMILLA_HUMANIZAR = 12345        # semilla fija: el mismo resultado en cada ejecución

# --- ajustes musicales opcionales de 06 y su valor por defecto ---------------
# (van en el config de 05, que los copia a rasgos.json; ver la cabecera de 06)
DEFECTOS = {"ligar": True, "suavizado": 3, "densidad": True, "octava": 1, "humanizar": True,
            "instrumento_melodia": 13, "dron_programa": 89, "dron_octava": 0, "dron_nivel": 0.048,
            "reverb": 50, "paneo": "x", "regolpe_ligado": 2, "regolpe_vel": 0.4, "umbral_evento": None}

# --- claves que 05 copia del config a rasgos.json ----------------------------
# EL ORDEN IMPORTA: es el orden en que quedan escritas en rasgos.json. No lo cambies.
CLAVES_MUSICALES = ("vmin_sonido", "vmax_sonido", "densidad_umbrales", "dron_octava", "dron_nivel",
                    "instrumento_melodia", "reverb", "ligar", "suavizado", "densidad", "octava",
                    "dron_programa", "humanizar", "regolpe_ligado", "regolpe_vel", "umbral_evento", "paneo")
