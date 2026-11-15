/* Pruebas de la guía por voz que no necesitan navegador.
   Uso (desde la raíz del proyecto):  node --test web/pruebas/guia-voz.test.js
   Cubren el intérprete de comandos (función pura), la búsqueda de fechas y pistas, y la ejecución
   de las acciones contra un reproductor de mentira (el mismo contrato que guia-voz-adaptador.js). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { interpretarComando, normalizar, buscarFecha, buscarPista, ejecutar, resumenSerie, guionRecorrido, valorDicho, ACCIONES_RECORRIDO, SUGERENCIAS } = require("../guia-voz.js");

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
  ["Sí, uso lector de pantalla", { tipo: "afirmar" }],
  ["no", { tipo: "negar" }],
  ["no uso lector", { tipo: "negar" }],
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
    listo: () => r.actual >= 0, pistas: () => titulos.map((titulo, i) => ({ id: String(i), titulo })), indiceActual: () => r.actual,
    elegir: async (i, sonar) => { r.actual = i; r.sonando = sonar; r.t = 0; r.llamadas.push("elegir " + i); },
    reproducir: async () => { r.sonando = true; }, pausar: () => { r.sonando = false; }, sonando: () => r.sonando,
    tiempo: () => r.t, duracion: () => 30, irA: (s) => { r.t = s; r.llamadas.push("irA " + s.toFixed(1)); },
    fechas: () => (SERIES[r.actual] || []).map((x) => ({ t: x.t, fecha: x.fecha })),
    descripcion: () => (r.actual === 0 ? "1976: −0,02 °C respecto al promedio de 1951–1980." : ""), leyenda: () => "Tono: más agudo cuando el mapa está más caliente.",
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
  assert.deepEqual(SUGERENCIAS, ["¿Qué estoy escuchando?", "¿Por qué sube el tono?", "Llévame al año más cálido"]);
  const r = reproductorReal();
  const decir = async (frase) => ejecutar(interpretarComando(frase), r.A, {});
  assert.match((await decir(SUGERENCIAS[0])).texto, /Todavía no suena nada/);                 // sin pista elegida
  const calido = await decir(SUGERENCIAS[2]);                                                  // sin pista: carga la primera y salta
  assert.equal(r.actual, 0); assert.equal(r.sonando, true); assert.ok(Math.abs(r.t - 29.01) < 1e-9);
  assert.equal(calido.texto, "El momento más cálido de esta pista es 2023: más 1,06 grados. Te llevo ahí.");
  assert.match((await decir(SUGERENCIAS[0])).texto, /^Suena la pista Temperatura del planeta\. Ahora, 1976: −0,02 °C.*más alto de la pista es 2023 y el más bajo, 1911/);
  assert.match((await decir(SUGERENCIAS[1])).texto, /cuanto más caliente, más agudo.*de menos 0,24 grados en 1881 a más 1,06 grados en 2023, por eso la melodía termina más aguda/);
  assert.match((await decir("llévame al año más frío")).texto, /más frío de esta pista es 1911: menos 0,61 grados/);
  await decir("pista dos");
  assert.match((await decir(SUGERENCIAS[2])).texto, /^El índice más alto de esta pista es mar 2007: índice 22,44/);   // en el mar no se dicen grados
  assert.match((await decir(SUGERENCIAS[1])).texto, /índice 22,39 en mar 2007 a índice 22,12 en feb 2008: sube y baja/);
  // toda cifra dicha está en los datos (redondeada a dos decimales)
  const permitidas = new Set(SERIES.flat().map((x) => Math.abs(x.media).toFixed(2).replace(".", ",")));
  for (const f of [SUGERENCIAS[1], SUGERENCIAS[2], "llévame al año más frío"]) for (const i of [0, 1]) {
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
