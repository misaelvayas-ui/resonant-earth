/* Pruebas de la guía por voz que no necesitan navegador.
   Uso (desde la raíz del proyecto):  node --test web/pruebas/guia-voz.test.js
   Cubren el intérprete de comandos (función pura), la búsqueda de fechas y pistas, y la ejecución
   de las acciones contra un reproductor de mentira (el mismo contrato que guia-voz-adaptador.js). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { interpretarComando, normalizar, buscarFecha, buscarPista, ejecutar } = require("../guia-voz.js");

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
  ["¿por qué sube el tono cuando hace calor?", { tipo: "desconocido", texto: "por que sube el tono cuando hace calor" }],   // pregunta: no toca el volumen
  ["¿cómo pauso esto?", { tipo: "desconocido", texto: "como pauso esto" }],
  ["por qué suena más agudo hacia el final", { tipo: "desconocido", texto: "por que suena mas agudo hacia el final" }],   // pregunta, no salto
  // leer
  ["¿qué pasa ahora?", { tipo: "descripcion" }],
  ["describe", { tipo: "descripcion" }],
  ["léeme la descripción", { tipo: "descripcion" }],
  ["lee la leyenda", { tipo: "leyenda" }],
  ["qué significan los colores", { tipo: "leyenda" }],
  ["que estoy escuchando", { tipo: "leyenda" }],
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
