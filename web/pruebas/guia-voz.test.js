/* Pruebas de la guía por voz que no necesitan navegador.
   Uso (desde la raíz del proyecto):  node --test web/pruebas/guia-voz.test.js
   Cubren el intérprete de comandos (función pura), la búsqueda de fechas y pistas, y la ejecución
   de las acciones contra un reproductor de mentira (el mismo contrato que guia-voz-adaptador.js). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { interpretarComando, normalizar, buscarFecha, buscarPista, ejecutar, resumenSerie, guionRecorrido, valorDicho, ACCIONES_RECORRIDO, SUGERENCIAS,
  elegirVozDe, fechaDicha, normalizarEN, TEXTOS, INTERFAZ, TONO_VOZ, VELOCIDAD_VOZ, AYUDA, AYUDA_EN } = require("../guia-voz.js");
const SUGERENCIAS_ES = SUGERENCIAS.es;

/* frase -> acción esperada. Incluye errores típicos del reconocimiento: sin tildes ni ñ, mayúsculas,
   signos, números en cifras o en palabras, palabras de relleno y palabras parecidas. */
const FRASES = [
  // reproducir y pausar
  ["reproduce", { tipo: "reproducir" }],
  ["Reproducir.", { tipo: "reproducir" }],
  ["dale play", { tipo: "reproducir" }],
  ["ponle plei por favor", { tipo: "reproducir" }],
  ["continúa", { tipo: "reproducir" }],
  ["sigue", { tipo: "reproducir" }],
  ["pon la música", { tipo: "reproducir" }],
  ["no pares", { tipo: "reproducir" }],
  ["pon una pista", { tipo: "reproducir" }],              // "una" es artículo, no el número 1
  ["pausa", { tipo: "pausar" }],
  ["Pausa, por favor.", { tipo: "pausar" }],
  ["posa", { tipo: "pausar" }],                         // "pausa" mal oído
  ["para", { tipo: "pausar" }],
  ["detente", { tipo: "pausar" }],
  ["stop", { tipo: "pausar" }],
  ["dale pausa", { tipo: "pausar" }],
  // pistas
  ["siguiente pista", { tipo: "siguiente" }],
  ["la siguiente", { tipo: "siguiente" }],
  ["próxima", { tipo: "siguiente" }],
  ["cambia de pista", { tipo: "siguiente" }],
  ["pista anterior", { tipo: "anterior" }],
  ["pista dos", { tipo: "elegir", numero: 2 }],
  ["pista número 3", { tipo: "elegir", numero: 3 }],
  ["pon la segunda pista", { tipo: "elegir", numero: 2 }],
  ["la primera", { tipo: "elegir", numero: 1 }],
  ["última pista", { tipo: "elegir", numero: -1 }],
  ["pon el mar", { tipo: "elegir", nombre: "mar" }],
  ["quiero escuchar la temperatura del planeta", { tipo: "elegir", nombre: "temperatura del planeta" }],
  ["¿qué pistas hay?", { tipo: "pistas" }],
  ["cuales videos tienes", { tipo: "pistas" }],
  // saltar a un año
  ["año 1990", { tipo: "saltar_anio", anio: 1990 }],
  ["ano 1990", { tipo: "saltar_anio", anio: 1990 }],                       // sin ñ
  ["Año mil novecientos noventa", { tipo: "saltar_anio", anio: 1990 }],
  ["ve al año dos mil siete", { tipo: "saltar_anio", anio: 2007 }],
  ["salta para el año 1.990", { tipo: "saltar_anio", anio: 1990 }],        // con punto de millar
  ["1990", { tipo: "saltar_anio", anio: 1990 }],
  ["llévame a mil ochocientos ochenta y uno", { tipo: "saltar_anio", anio: 1881 }],
  ["año 90", { tipo: "saltar_anio", anio: 90 }],
  ["marzo de 2007", { tipo: "saltar_anio", anio: 2007, mes: 3 }],
  ["ve a octubre del dos mil siete", { tipo: "saltar_anio", anio: 2007, mes: 10 }],
  // saltar a un tiempo
  ["diez segundos", { tipo: "saltar_tiempo", segundos: 10 }],
  ["segundo diez", { tipo: "saltar_tiempo", segundos: 10 }],
  ["ve al segundo 25", { tipo: "saltar_tiempo", segundos: 25 }],
  ["minuto uno", { tipo: "saltar_tiempo", segundos: 60 }],
  ["1:30", { tipo: "saltar_tiempo", segundos: 90 }],
  ["ve a los treinta y cinco segundos", { tipo: "saltar_tiempo", segundos: 35 }],
  ["avanza diez segundos", { tipo: "saltar_relativo", segundos: 10 }],
  ["adelanta 5 segundos", { tipo: "saltar_relativo", segundos: 5 }],
  ["avanza un minuto y medio", { tipo: "saltar_relativo", segundos: 90 }],
  ["avanza", { tipo: "saltar_relativo", segundos: 10 }],
  ["retrocede cinco segundos", { tipo: "saltar_relativo", segundos: -5 }],
  ["retrocede 5", { tipo: "saltar_relativo", segundos: -5 }],
  ["atrás", { tipo: "saltar_relativo", segundos: -10 }],
  ["vuelve al inicio", { tipo: "inicio" }],
  ["desde el principio", { tipo: "inicio" }],
  ["reinicia", { tipo: "inicio" }],
  ["ve al final", { tipo: "final" }],
  ["¿por qué sube el tono cuando hace calor?", { tipo: "explicar_tono" }],   // pregunta: no toca el volumen
  ["¿Por qué sube el tono?", { tipo: "explicar_tono" }],
  ["por qué suena más agudo al final", { tipo: "explicar_tono" }],
  ["¿por qué el cielo es azul?", { tipo: "desconocido", texto: "por que el cielo es azul" }],
  // el año más cálido, explicar y el recorrido
  ["Llévame al año más cálido", { tipo: "saltar_extremo", cual: "max" }],
  ["ve al momento más caliente", { tipo: "saltar_extremo", cual: "max" }],
  ["cuál es la temperatura más alta", { tipo: "saltar_extremo", cual: "max" }],
  ["llévame al año más frío", { tipo: "saltar_extremo", cual: "min" }],
  ["el punto más bajo", { tipo: "saltar_extremo", cual: "min" }],
  ["más alto", { tipo: "volumen", delta: 20 }],            // sin "año" ni "momento": es el volumen
  ["Explícame lo que oigo", { tipo: "explicar" }],
  ["qué es ese sonido", { tipo: "explicar" }],
  ["explícame la leyenda", { tipo: "leyenda" }],
  ["Dame un recorrido", { tipo: "recorrido" }],
  ["quiero una visita guiada", { tipo: "recorrido" }],
  ["detén el recorrido", { tipo: "detener_recorrido" }],
  ["para el recorrido", { tipo: "detener_recorrido" }],
  ["¿cómo pauso esto?", { tipo: "desconocido", texto: "como pauso esto" }],
  ["por qué suena más agudo hacia el final", { tipo: "explicar_tono" }],   // pregunta, no salto
  // leer
  ["¿qué pasa ahora?", { tipo: "descripcion" }],
  ["describe", { tipo: "descripcion" }],
  ["léeme la descripción", { tipo: "descripcion" }],
  ["lee la leyenda", { tipo: "leyenda" }],
  ["qué significan los colores", { tipo: "leyenda" }],
  ["que estoy escuchando", { tipo: "explicar" }],
  ["¿Qué estoy escuchando?", { tipo: "explicar" }],
  ["¿dónde estoy?", { tipo: "donde" }],
  ["cuanto falta", { tipo: "donde" }],
  // volumen
  ["sube el volumen", { tipo: "volumen", delta: 20 }],
  ["más fuerte", { tipo: "volumen", delta: 20 }],
  ["baja el volumen", { tipo: "volumen", delta: -20 }],
  ["volumen cincuenta", { tipo: "volumen", valor: 50 }],
  // la guía
  ["ayuda", { tipo: "ayuda" }],
  ["¿qué puedo decir?", { tipo: "ayuda" }],
  ["repite", { tipo: "repetir" }],
  ["silencio", { tipo: "callar" }],
  ["cállate", { tipo: "callar" }],
  ["sí", { tipo: "afirmar" }],
  ["Sí, uso lector de pantalla", { tipo: "lector", usa: true }],
  ["uso un lector de pantalla", { tipo: "lector", usa: true }],
  ["no", { tipo: "negar" }],
  ["no uso lector", { tipo: "lector", usa: false }],
  // idioma, "no entendí" y preguntas sobre la web
  ["habla en inglés", { tipo: "idioma", idioma: "en" }],
  ["en español, por favor", { tipo: "idioma", idioma: "es" }],
  ["no entendí", { tipo: "repetir" }],
  ["más simple", { tipo: "repetir" }],
  ["otra vez", { tipo: "repetir" }],
  ["más despacio", { tipo: "repetir" }],
  ["empieza de nuevo", { tipo: "inicio" }],
  ["¿qué puedes hacer?", { tipo: "ayuda" }],
  ["¿cómo funciona?", { tipo: "sobre_web", tema: "como_funciona" }],
  ["¿qué es este proyecto?", { tipo: "sobre_web", tema: "proyecto" }],
  ["¿por qué escuchar el clima?", { tipo: "sobre_web", tema: "por_que" }],
  ["¿es accesible para personas ciegas?", { tipo: "sobre_web", tema: "accesibilidad" }],
  ["¿quiénes son?", { tipo: "sobre_web", tema: "equipo" }],
];

test(`intérprete: ${FRASES.length} frases en español`, () => {
  assert.ok(FRASES.length >= 30);
  for (const [frase, esperado] of FRASES) assert.deepEqual(interpretarComando(frase), esperado, `«${frase}»`);
});

test("intérprete: lo que no entiende no se convierte en una acción", () => {
  for (const frase of ["", "   ", "banana", "hace calor hoy", "10", "uno dos tres"]) {
    const a = interpretarComando(frase);
    assert.ok(["desconocido", "nada", "elegir"].includes(a.tipo), `«${frase}» -> ${a.tipo}`);
    if (a.tipo === "elegir") assert.ok(a.nombre, `«${frase}» no debe elegir un número`);
  }
  assert.equal(interpretarComando("¿qué pasa ahora?").tipo, "descripcion");   // "pasa" no es avanzar
  assert.equal(interpretarComando(null).tipo, "nada");
});

test("normalizar: tildes, signos y números en palabras", () => {
  assert.equal(normalizar("¡Año Mil Novecientos Noventa!"), "ano 1990");
  assert.equal(normalizar("dos mil veintitrés"), "2023");
  assert.equal(normalizar("ciento veinte segundos"), "120 segundos");
  assert.equal(normalizar("veintiún segundos"), "21 segundos");
  assert.equal(normalizar("una pista"), "una pista");
});

const GISTEMP = [1881, 1883, 1886, 1990, 1993, 2023].map((fecha, i) => ({ t: i * 0.5, fecha }));
const MAR = ["mar 2007", "abr 2007", "oct 2007", "ene 2008", "mar 2008"].map((fecha, i) => ({ t: i * 0.5, fecha }));

test("buscarFecha: exacta, la más cercana, fuera de rango y sin fechas", () => {
  assert.deepEqual(buscarFecha(GISTEMP, 1990), { t: 1.5, fecha: 1990, exacto: true });
  assert.deepEqual(buscarFecha(GISTEMP, 1991), { t: 1.5, fecha: 1990, exacto: false });
  assert.deepEqual(buscarFecha(GISTEMP, 90), { t: 1.5, fecha: 1990, exacto: true });            // "año 90"
  assert.equal(buscarFecha(GISTEMP, 1700).fuera, true);
  assert.equal(buscarFecha([], 1990).vacio, true);
  assert.deepEqual(buscarFecha(MAR, 2007, 10), { t: 1, fecha: "oct 2007", exacto: true });
  assert.deepEqual(buscarFecha(MAR, 2007), { t: 0, fecha: "mar 2007", exacto: true });
  assert.equal(buscarFecha(MAR, 2007, 12).fecha, "ene 2008");                                    // diciembre: el más cercano
});

const PISTAS = [{ titulo: "Temperatura del planeta, 1880–2023" }, { titulo: "Corrientes y temperatura del mar, 2007–2008" },
  { titulo: "Mancha de calor viajera (ejemplo)" }];

test("buscarPista: por palabras del título", () => {
  assert.equal(buscarPista(PISTAS, "mar"), 1);
  assert.equal(buscarPista(PISTAS, "temperatura del planeta"), 0);
  assert.equal(buscarPista(PISTAS, "mancha"), 2);
  assert.equal(buscarPista(PISTAS, "jazz"), -1);
});

/* Reproductor de mentira con el mismo contrato que el adaptador. */
function reproductorFalso({ anuncia = true } = {}) {
  const r = { actual: 0, t: 5, sonando: false, vol: 80, llamadas: [] };
  r.A = {
    listo: () => true, pistas: () => PISTAS.map((p, i) => ({ id: String(i), titulo: p.titulo })), indiceActual: () => r.actual,
    elegir: async (i, sonar) => { r.actual = i; r.sonando = sonar; r.t = 0; r.llamadas.push("elegir " + i); },
    reproducir: async () => { r.sonando = true; }, pausar: () => { r.sonando = false; }, sonando: () => r.sonando,
    tiempo: () => r.t, duracion: () => 30, irA: (s) => { r.t = s; },
    fechas: () => (r.actual === 0 ? GISTEMP : r.actual === 1 ? MAR : []),
    descripcion: () => "Año 1990. Temperatura media: 0,40 °C por encima de la referencia.",
    leyenda: () => "Temperatura media: altura de la nota.",
    volumen: () => r.vol, ponerVolumen: (n) => { r.vol = n; }, atenuar: () => {},
    paginaAnuncia: () => anuncia, paginaHablaSola: () => false,
  };
  return r;
}

test("ejecutar: cada acción mueve el reproductor y responde en español", async () => {
  const r = reproductorFalso();
  const decir = async (frase) => ejecutar(interpretarComando(frase), r.A, {});
  assert.match((await decir("reproduce")).texto, /^Reproduciendo Temperatura/); assert.equal(r.sonando, true);
  assert.equal((await decir("pausa")).texto, "En pausa."); assert.equal(r.sonando, false);
  assert.equal((await decir("pausa")).texto, "Ya está en pausa.");
  assert.match((await decir("siguiente pista")).texto, /^Pista 2 de 3: Corrientes/); assert.equal(r.actual, 1);
  assert.match((await decir("marzo de 2008")).texto, /mar 2008/); assert.ok(Math.abs(r.t - 2.01) < 1e-9);
  assert.match((await decir("año 1990")).texto, /va de 2007 a 2008/);
  assert.match((await decir("pista uno")).texto, /^Pista 1 de 3/);
  assert.equal((await decir("año mil novecientos noventa")).texto, "1990."); assert.ok(Math.abs(r.t - 1.51) < 1e-9);
  assert.match((await decir("año 1991")).texto, /más cercano: 1990/);
  assert.equal((await decir("segundo diez")).texto, "10 segundos."); assert.equal(r.t, 10);
  await decir("avanza cinco segundos"); assert.equal(r.t, 15);
  await decir("retrocede"); assert.equal(r.t, 5);
  assert.match((await decir("minuto dos")).texto, /dura 30 segundos/); assert.equal(r.t, 5);
  assert.match((await decir("pon la mancha")).texto, /^Pista 3 de 3: Mancha/);
  assert.match((await decir("año 1990")).texto, /no tiene fechas/);
  assert.match((await decir("pista nueve")).texto, /Solo hay 3 pistas/);
  assert.match((await decir("pon el jazz")).texto, /No encontré/);
  assert.match((await decir("qué pasa ahora")).texto, /^Año 1990/);
  assert.match((await decir("lee la leyenda")).texto, /altura de la nota/);
  assert.match((await decir("qué pistas hay")).texto, /^Hay 3 pistas: 1, Temperatura/);
  assert.match((await decir("dónde estoy")).texto, /Pista 3 de 3.*Está sonando/);
  assert.equal((await decir("volumen cincuenta")).texto, "Volumen al 50 por ciento."); assert.equal(r.vol, 50);
  await decir("sube el volumen"); await decir("sube el volumen"); await decir("sube el volumen"); assert.equal(r.vol, 100);
  assert.match((await decir("banana")).texto, /No entendí «banana»/);
  assert.equal((await decir("silencio")).callar, true);
});

test("ejecutar: avisa cuando la página ya lo anuncia al lector (para no repetirlo)", async () => {
  const con = reproductorFalso({ anuncia: true }), sin = reproductorFalso({ anuncia: false });
  for (const frase of ["siguiente pista", "segundo diez", "año 1990"]) {
    con.actual = sin.actual = 0;
    assert.equal((await ejecutar(interpretarComando(frase), con.A, {})).paginaAnuncia, true, frase);
    assert.equal((await ejecutar(interpretarComando(frase), sin.A, {})).paginaAnuncia, false, frase);
  }
  for (const frase of ["qué pasa ahora", "lee la leyenda", "ayuda", "dónde estoy", "reproduce"]) {
    assert.ok(!(await ejecutar(interpretarComando(frase), con.A, {})).paginaAnuncia, frase);   // esto lo dice la guía
  }
});

/* ------------------------------------------------------------------ Fase 2: cifras calculadas, explicar y recorrido */

/* Las series reales de la web (los mismos _rasgos.json que lee el adaptador). */
const serieReal = (archivo) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", archivo), "utf8")).rasgos
  .map((r, i) => ({ t: r.t_video ?? i * 0.5, fecha: r.fecha ?? null, media: r.media ?? null, area: r.area ?? null }));
const SERIES = [serieReal("gistemp_1880_2023_rasgos.json"), serieReal("sst_ecco2_2007_2008_rasgos.json")];

/* Reproductor de mentira con las dos pistas reales y sus datos. */
function reproductorReal({ actual = -1 } = {}) {
  const r = { actual, t: 0, sonando: false, llamadas: [] };
  const titulos = ["Temperatura del planeta", "Corrientes y temperatura del mar"];
  r.A = {
    listo: () => r.actual >= 0, pistas: (idioma) => (idioma === "en" ? ["Planet temperature", "Ocean currents and sea temperature"] : titulos).map((titulo, i) => ({ id: String(i), titulo })), indiceActual: () => r.actual,
    elegir: async (i, sonar) => { r.actual = i; r.sonando = sonar; r.t = 0; r.llamadas.push("elegir " + i); },
    reproducir: async () => { r.sonando = true; }, pausar: () => { r.sonando = false; }, sonando: () => r.sonando,
    tiempo: () => r.t, duracion: () => 30, irA: (s) => { r.t = s; r.llamadas.push("irA " + s.toFixed(1)); },
    fechas: () => (SERIES[r.actual] || []).map((x) => ({ t: x.t, fecha: x.fecha })),
    descripcion: (idioma) => (r.actual !== 0 ? "" : idioma === "en" ? "1976: −0.02 °C compared with the 1951–1980 average." : "1976: −0,02 °C respecto al promedio de 1951–1980."),
    leyenda: (idioma) => (idioma === "en" ? "Pitch: higher when the map is warmer." : "Tono: más agudo cuando el mapa está más caliente."),
    volumen: () => 80, ponerVolumen: () => {}, atenuar: () => {}, paginaAnuncia: () => true, paginaHablaSola: () => false,
    detalle: (i = r.actual) => ({ descripcionPista: "", unidad: "", indiceRelativo: i === 1, referencia: null, serie: SERIES[i] || [] }),
  };
  return r;
}

test("resumenSerie: máximo, mínimo, mayor cambio y tendencia salen de los datos, sin inventar", () => {
  const g = resumenSerie(SERIES[0]), m = resumenSerie(SERIES[1]);
  const medias = SERIES[0].map((r) => r.media);
  assert.equal(g.maximo.valor, Math.round(Math.max(...medias) * 100) / 100); assert.equal(g.maximo.fecha, "2023");
  assert.equal(g.minimo.valor, Math.round(Math.min(...medias) * 100) / 100); assert.equal(g.minimo.fecha, "1911");   // el mismo que dice pistas.json
  assert.equal(g.tendencia.inicio.fecha, "1881"); assert.equal(g.tendencia.fin.fecha, "2023"); assert.equal(g.tendencia.direccion, "sube");
  assert.equal(g.tendencia.cambio, Math.round((medias.at(-1) - medias[0]) * 100) / 100);
  const saltos = medias.slice(1).map((v, i) => Math.abs(v - medias[i]));
  assert.equal(Math.abs(g.mayor_cambio.cambio), Math.round(Math.max(...saltos) * 100) / 100);
  assert.equal(m.maximo.fecha, "mar 2007"); assert.equal(m.minimo.fecha, "nov 2007"); assert.equal(m.tendencia.direccion, "sube y baja");
  assert.equal(resumenSerie([]), null); assert.equal(resumenSerie([{ t: 0, media: null }, { t: 1, media: 2 }]), null);
  assert.equal(valorDicho(1.0564), "más 1,06 grados"); assert.equal(valorDicho(-0.61), "menos 0,61 grados"); assert.equal(valorDicho(22.44, { indiceRelativo: true }), "índice 22,44");
});

test("las tres frases sugeridas tienen respuesta sin IA, con cifras que están en los datos", async () => {
  assert.deepEqual(SUGERENCIAS_ES, ["¿Qué estoy escuchando?", "¿Por qué sube el tono?", "Llévame al año más cálido"]);
  const r = reproductorReal();
  const decir = async (frase) => ejecutar(interpretarComando(frase), r.A, {});
  assert.match((await decir(SUGERENCIAS_ES[0])).texto, /Todavía no suena nada/);                 // sin pista elegida
  const calido = await decir(SUGERENCIAS_ES[2]);                                                  // sin pista: carga la primera y salta
  assert.equal(r.actual, 0); assert.equal(r.sonando, true); assert.ok(Math.abs(r.t - 29.01) < 1e-9);
  assert.equal(calido.texto, "El momento más cálido de esta pista es 2023: más 1,06 grados. Te llevo ahí.");
  assert.match((await decir(SUGERENCIAS_ES[0])).texto, /^Suena la pista Temperatura del planeta\. Ahora, 1976: −0,02 °C.*más alto de la pista es 2023 y el más bajo, 1911/);
  assert.match((await decir(SUGERENCIAS_ES[1])).texto, /cuanto más caliente, más agudo.*de menos 0,24 grados en 1881 a más 1,06 grados en 2023, por eso la melodía termina más aguda/);
  assert.match((await decir("llévame al año más frío")).texto, /más frío de esta pista es 1911: menos 0,61 grados/);
  await decir("pista dos");
  assert.match((await decir(SUGERENCIAS_ES[2])).texto, /^El índice más alto de esta pista es mar 2007: índice 22,44/);   // en el mar no se dicen grados
  assert.match((await decir(SUGERENCIAS_ES[1])).texto, /índice 22,39 en mar 2007 a índice 22,12 en feb 2008: sube y baja/);
  // toda cifra dicha está en los datos (redondeada a dos decimales)
  const permitidas = new Set(SERIES.flat().map((x) => Math.abs(x.media).toFixed(2).replace(".", ",")));
  for (const f of [SUGERENCIAS_ES[1], SUGERENCIAS_ES[2], "llévame al año más frío"]) for (const i of [0, 1]) {
    r.actual = i;
    for (const cifra of (await decir(f)).texto.match(/\d+,\d\d/g) || []) assert.ok(permitidas.has(cifra), `${f}: ${cifra} no está en los datos`);
  }
});

test("recorrido: guion fijo, solo acciones permitidas, cifras de los datos y unos 40 segundos", async () => {
  const { ACCIONES, validarRespuesta, aAccionLocal } = require("../guia-voz-ia.js");
  const r = reproductorReal();
  const pasos = guionRecorrido(r.A);
  assert.equal(pasos.length, 5);
  assert.deepEqual(pasos.map((p) => (p.accion ? p.accion.tipo : null)), [null, "elegir", "saltar_tiempo", "elegir", null]);
  for (const p of pasos.filter((x) => x.accion)) {
    assert.ok(ACCIONES_RECORRIDO.includes(p.accion.tipo) && ACCIONES.includes(p.accion.tipo), p.accion.tipo);
    // cada paso pasa la MISMA validación que una acción pedida por la IA
    const { tipo, ...parametros } = p.accion;
    const v = validarRespuesta({ accion: tipo, parametros, respuesta: "x" }, { pistas: r.A.pistas(), duracion_segundos: 30 });
    assert.ok(v, JSON.stringify(p.accion)); assert.deepEqual(aAccionLocal(v), { ...p.accion, ...(tipo === "saltar_tiempo" ? {} : {}) });
    await ejecutar(p.accion, r.A, {});
  }
  assert.deepEqual(r.llamadas, ["elegir 0", "irA 22.0", "elegir 1"]);                         // GISTEMP, su momento clave, y el mar
  const texto = pasos.map((p) => p.texto).join(" ");
  assert.match(texto, /bienvenida a Resonant Earth/); assert.match(texto, /Salto hacia 2023: más 1,06 grados/); assert.match(texto, /punto más bajo es nov 2007/); assert.match(texto, /Fin del recorrido/);
  const palabras = texto.split(/\s+/).length, segundos = palabras / 2.5 + pasos.reduce((a, p) => a + p.pausa, 0) / 1000;
  assert.ok(segundos > 30 && segundos < 50, `duración estimada ${segundos.toFixed(0)} s (${palabras} palabras)`);
  assert.equal((await ejecutar(interpretarComando("dame un recorrido"), r.A, {})).recorrido, true);
  // sin datos, el recorrido sigue saliendo (sin cifras)
  const sinDatos = guionRecorrido({ ...r.A, detalle: () => ({ serie: [] }) });
  assert.ok(sinDatos.length >= 4 && !/\d,\d\d/.test(sinDatos.map((p) => p.texto).join(" ")));
});

/* ------------------------------------------------------------------ Ronda 35: inglés, voz, repetir y preguntas sobre la web */

const FRASES_EN = [
  ["play", { tipo: "reproducir" }], ["Play, please.", { tipo: "reproducir" }], ["resume", { tipo: "reproducir" }], ["don't stop", { tipo: "reproducir" }],
  ["pause", { tipo: "pausar" }], ["stop", { tipo: "pausar" }], ["hold on", { tipo: "pausar" }],
  ["next track", { tipo: "siguiente" }], ["previous track", { tipo: "anterior" }], ["track two", { tipo: "elegir", numero: 2 }], ["the first track", { tipo: "elegir", numero: 1 }],
  ["play the ocean", { tipo: "elegir", nombre: "ocean" }], ["what tracks are there?", { tipo: "pistas" }],
  ["year 1990", { tipo: "saltar_anio", anio: 1990 }], ["year nineteen ninety", { tipo: "saltar_anio", anio: 1990 }], ["go to two thousand seven", { tipo: "saltar_anio", anio: 2007 }],
  ["November 2007", { tipo: "saltar_anio", anio: 2007, mes: 11 }], ["second ten", { tipo: "saltar_tiempo", segundos: 10 }], ["minute 1", { tipo: "saltar_tiempo", segundos: 60 }],
  ["forward ten seconds", { tipo: "saltar_relativo", segundos: 10 }], ["go back", { tipo: "saltar_relativo", segundos: -10 }], ["start over", { tipo: "inicio" }],
  ["What am I hearing?", { tipo: "explicar" }], ["explain what I hear", { tipo: "explicar" }], ["Why does the pitch rise?", { tipo: "explicar_tono" }],
  ["Take me to the warmest year", { tipo: "saltar_extremo", cual: "max" }], ["the coldest year", { tipo: "saltar_extremo", cual: "min" }],
  ["Give me a tour", { tipo: "recorrido" }], ["stop the tour", { tipo: "detener_recorrido" }],
  ["read the legend", { tipo: "leyenda" }], ["what do the colours mean", { tipo: "leyenda" }], ["where am I?", { tipo: "donde" }], ["what's happening now?", { tipo: "descripcion" }],
  ["volume 50", { tipo: "volumen", valor: 50 }], ["louder", { tipo: "volumen", delta: 20 }], ["turn it down", { tipo: "volumen", delta: -20 }],
  ["repeat", { tipo: "repetir" }], ["I didn't understand", { tipo: "repetir" }], ["simpler, please", { tipo: "repetir" }], ["again", { tipo: "repetir" }], ["say that again", { tipo: "repetir" }],
  ["help", { tipo: "ayuda" }], ["What can you do?", { tipo: "ayuda" }], ["quiet", { tipo: "callar" }],
  ["what is this project?", { tipo: "sobre_web", tema: "proyecto" }], ["how does it work?", { tipo: "sobre_web", tema: "como_funciona" }], ["who made this?", { tipo: "sobre_web", tema: "equipo" }],
  ["is it accessible for blind people?", { tipo: "sobre_web", tema: "accesibilidad" }], ["why listen to the climate?", { tipo: "sobre_web", tema: "por_que" }],
  ["español", { tipo: "idioma", idioma: "es" }], ["speak Spanish", { tipo: "idioma", idioma: "es" }], ["I use a screen reader", { tipo: "lector", usa: true }], ["I don't use a screen reader", { tipo: "lector", usa: false }],
  ["why is the sky blue?", { tipo: "desconocido", texto: "why is the sky blue" }], ["blah blah", { tipo: "desconocido", texto: "blah blah" }],
];

test(`intérprete en inglés: ${FRASES_EN.length} frases dan los mismos tipos de acción que en español`, () => {
  for (const [frase, esperado] of FRASES_EN) assert.deepEqual(interpretarComando(frase, "en"), esperado, `«${frase}»`);
  assert.equal(normalizarEN("twenty twenty three, one hundred and five, thirty five"), "2023 105 35");
  assert.deepEqual(interpretarComando("reproduce", "es"), interpretarComando("reproduce"));      // sin idioma: español, como siempre
  const tipos = (lista, idioma) => new Set(lista.map(([f]) => interpretarComando(f, idioma).tipo));
  for (const t of tipos(FRASES_EN, "en")) assert.ok(tipos(FRASES, "es").has(t), "tipo solo en inglés: " + t);
});

test("en inglés: las frases sugeridas, las respuestas fijas y el recorrido salen en inglés, con las mismas cifras", async () => {
  assert.deepEqual(SUGERENCIAS.en, ["What am I hearing?", "Why does the pitch rise?", "Take me to the warmest year"]);
  const r = reproductorReal();
  const decir = async (frase) => ejecutar(interpretarComando(frase, "en"), r.A, {}, "en");
  assert.match((await decir(SUGERENCIAS.en[0])).texto, /^Nothing is playing yet/);
  assert.equal((await decir(SUGERENCIAS.en[2])).texto, "The warmest moment of this track is 2023: plus 1.06 degrees. Taking you there.");
  assert.equal(r.actual, 0); assert.ok(Math.abs(r.t - 29.01) < 1e-9);
  assert.match((await decir(SUGERENCIAS.en[0])).texto, /^Now playing: the track Planet temperature\. Right now, 1976: −0\.02 °C.*highest point of the track is 2023 and the lowest is 1911/);
  assert.match((await decir(SUGERENCIAS.en[1])).texto, /the warmer it is, the higher the note.*from minus 0\.24 degrees in 1881 to plus 1\.06 degrees in 2023, so the melody ends higher/);
  assert.match((await decir("track two")).texto, /^Track 2 of 2: Ocean currents and sea temperature\./);
  assert.match((await decir(SUGERENCIAS.en[2])).texto, /^The highest index of this track is March 2007: index 22\.44/);     // en el mar tampoco se dicen grados
  assert.match((await decir("November 2007")).texto, /^November 2007\.$/);
  assert.match((await decir("year 1990")).texto, /runs from 2007 to 2008/);
  assert.match((await decir("where am I")).texto, /^Track 2 of 2.*It is (playing|paused)\.$/);
  assert.equal((await decir("pause")).texto, "Paused."); assert.equal((await decir("pause")).texto, "It is already paused.");
  assert.match((await decir("volume 50")).texto, /^Volume at 50 percent/);
  assert.equal((await decir("help")).texto, AYUDA_EN); assert.equal((await decir("help")).ayuda, true);
  assert.match((await decir("xyzzy")).texto, /^I did not understand “xyzzy”/);
  assert.equal(fechaDicha("nov 2007", "en"), "November 2007"); assert.equal(fechaDicha("nov 2007", "es"), "nov 2007"); assert.equal(fechaDicha(1990, "en"), "1990");
  assert.equal(valorDicho(-0.61, {}, "en"), "minus 0.61 degrees"); assert.equal(valorDicho(22.44, { indiceRelativo: true }, "en"), "index 22.44");
  // toda cifra dicha en inglés está en los datos
  const permitidas = new Set(SERIES.flat().map((x) => Math.abs(x.media).toFixed(2)));
  for (const f of [SUGERENCIAS.en[1], SUGERENCIAS.en[2], "the coldest year"]) for (const i of [0, 1]) {
    r.actual = i;
    for (const cifra of (await decir(f)).texto.match(/\d+\.\d\d/g) || []) assert.ok(permitidas.has(cifra), `${f}: ${cifra} no está en los datos`);
  }
  // el recorrido: mismo guion y mismas acciones, textos en inglés
  const es = guionRecorrido(reproductorReal().A, "es"), en = guionRecorrido(reproductorReal().A, "en");
  assert.deepEqual(en.map((p) => p.accion), es.map((p) => p.accion));
  const texto = en.map((p) => p.texto).join(" ");
  assert.match(texto, /^Welcome to Resonant Earth/); assert.match(texto, /First track: Planet temperature, starting in 1881/); assert.match(texto, /Jumping towards 2023: plus 1\.06 degrees/);
  assert.match(texto, /rises and falls: its lowest point is November 2007/); assert.match(texto, /End of the tour/);
  assert.ok(!/[áéíóúñ¿¡«»]/i.test(texto), "el recorrido en inglés no lleva español");
  // los dos idiomas tienen exactamente los mismos textos
  const claves = (o) => Object.keys(o).sort().join();
  assert.equal(claves(TEXTOS.es), claves(TEXTOS.en)); assert.equal(claves(TEXTOS.es.web), claves(TEXTOS.en.web));
  assert.equal(claves(INTERFAZ.es), claves(INTERFAZ.en)); assert.equal(claves(INTERFAZ.es.errores), claves(INTERFAZ.en.errores));
});

test("«repite» y «no entendí» sin IA repiten más despacio; las preguntas sobre la web tienen un texto corto fijo", async () => {
  const r = reproductorReal({ actual: 0 });
  const rep = await ejecutar(interpretarComando("no entendí"), r.A, { ultima: "El tono sigue al valor medio." });
  assert.equal(rep.texto, "El tono sigue al valor medio."); assert.equal(rep.lento, true);
  const nada = await ejecutar(interpretarComando("repite"), r.A, {});
  assert.equal(nada.texto, "Todavía no he dicho nada."); assert.equal(nada.lento, false);
  assert.equal((await ejecutar(interpretarComando("again", "en"), r.A, { ultima: "Paused." }, "en")).lento, true);
  for (const [frase, tema] of [["qué es este proyecto", "proyecto"], ["cómo funciona", "como_funciona"], ["por qué escuchar el clima", "por_que"], ["es accesible", "accesibilidad"], ["quiénes son", "equipo"]]) {
    const es = (await ejecutar(interpretarComando(frase), r.A, {})).texto;
    assert.equal(es, TEXTOS.es.web[tema]); assert.ok(es.length > 60 && es.length < 320, tema);
    assert.ok(TEXTOS.en.web[tema].length > 60 && TEXTOS.en.web[tema].length < 320, tema + " en inglés");
  }
  assert.equal((await ejecutar(interpretarComando("who made this?", "en"), r.A, {}, "en")).texto, TEXTOS.en.web.equipo);
  assert.equal((await ejecutar(interpretarComando("ayuda"), r.A, {})).texto, AYUDA);
  assert.ok(!/ayuda/i.test(INTERFAZ.es.saludo + INTERFAZ.es.inicial) && INTERFAZ.es.saludo.split(/[.?!]/).filter((x) => x.trim()).length <= 2, "el saludo es corto y no recita la ayuda");
});

test("voz: elige sola una voz masculina según el idioma (británica en inglés), serena", () => {
  const v = (name, lang, extra = {}) => ({ name, lang, ...extra });
  const windows = [v("Microsoft Zira - English (United States)", "en-US", { default: true }), v("Microsoft David - English (United States)", "en-US"), v("Microsoft Hazel - English (United Kingdom)", "en-GB"),
    v("Microsoft George - English (United Kingdom)", "en-GB"), v("Microsoft Helena - Spanish (Spain)", "es-ES"), v("Microsoft Pablo - Spanish (Spain)", "es-ES"), v("Microsoft Sabina - Spanish (Mexico)", "es-MX"), v("Microsoft Raul - Spanish (Mexico)", "es-MX")];
  assert.equal(elegirVozDe(windows, "en").name, "Microsoft George - English (United Kingdom)");
  assert.equal(elegirVozDe(windows, "es").name, "Microsoft Pablo - Spanish (Spain)");
  const chrome = [v("Google US English", "en-US"), v("Google UK English Female", "en-GB"), v("Google UK English Male", "en-GB"), v("Google español", "es-ES"), v("Google español de Estados Unidos", "es-US")];
  assert.equal(elegirVozDe(chrome, "en").name, "Google UK English Male");
  assert.equal(elegirVozDe(chrome, "es").name, "Google español de Estados Unidos");          // sin voz masculina con nombre: una en español, no de España primero
  const edge = [v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB"), v("Microsoft Ryan Online (Natural) - English (United Kingdom)", "en-GB"), v("Microsoft Guy Online (Natural) - English (United States)", "en-US"),
    v("Microsoft Dalia Online (Natural) - Spanish (Mexico)", "es-MX"), v("Microsoft Jorge Online (Natural) - Spanish (Mexico)", "es-MX"), v("Microsoft Luis Online (Natural) - Spanish (Ecuador)", "es-EC")];
  assert.match(elegirVozDe(edge, "en").name, /Ryan/); assert.match(elegirVozDe(edge, "es").name, /Jorge/);
  const mac = [v("Samantha", "en-US"), v("Daniel", "en-GB"), v("Karen", "en-AU"), v("Mónica", "es-ES"), v("Paulina", "es-MX"), v("Juan", "es-MX")];
  assert.equal(elegirVozDe(mac, "en").name, "Daniel"); assert.equal(elegirVozDe(mac, "es").name, "Juan");
  assert.equal(elegirVozDe([v("Microsoft David - English (United States)", "en-US"), v("Microsoft Zira", "en-US")], "en").name, "Microsoft David - English (United States)");   // sin británica: masculina de otro país
  assert.equal(elegirVozDe([v("Samantha", "en-US"), v("Kate", "en-GB")], "en").name, "Kate");                                    // sin masculina: británica
  assert.equal(elegirVozDe(windows, "en", "Microsoft Zira - English (United States)|en-US").name, "Microsoft Zira - English (United States)");   // la elegida a mano gana
  assert.equal(elegirVozDe(windows.filter((x) => x.lang.startsWith("es")), "en"), null); assert.equal(elegirVozDe([], "es"), null);
  assert.equal(VELOCIDAD_VOZ, 0.95); assert.ok(TONO_VOZ < 1 && TONO_VOZ >= 0.7);
});
