/*
 * describir(rasgo, contexto, opciones) -> texto simple de lo que muestra el video en ese momento.
 *
 * Está sola en este archivo para poder reemplazarla luego (por ejemplo, por una IA).
 * Debe devolver un string (o una Promise<string>: app.js acepta ambas).
 *
 * rasgo:    { fecha?, media, area, centroide_x, centroide_y?, salto?, ... }  (un registro de rasgos.json;
 *           app.js añade salto = true si el valor cambió de golpe respecto al momento anterior)
 * contexto: { unidad, vmin, vmax, referencia, paneo, idioma }
 *           referencia = valor del tono grave fijo; paneo = "x" (izquierda/derecha del mapa) o
 *           "y" (sur/norte): el mismo eje que mueve el sonido entre los dos altavoces;
 *           idioma = "es" (por defecto) o "en".
 * opciones: { breve: true } -> solo la fecha y el valor (para la narración con voz mientras suena).
 */
"use strict";

const FRASES = {
  es: {
    meses: { ene: "enero", feb: "febrero", mar: "marzo", abr: "abril", may: "mayo", jun: "junio",
             jul: "julio", ago: "agosto", sep: "septiembre", oct: "octubre", nov: "noviembre", dic: "diciembre" },
    anio: (a) => `Año ${a}.`,
    mesAnio: (mes, a) => `${mes[0].toUpperCase()}${mes.slice(1)} de ${a}.`,
    fecha: (f) => `Fecha: ${f}.`,
    temperatura: "Temperatura media",
    valor: "Valor medio",
    igualRef: "(igual a la referencia)",
    encimaRef: "por encima de la referencia",
    debajoRef: "por debajo de la referencia",
    escala: (a, b) => ` (en una escala de ${a} a ${b})`,
    comaIgual: ", igual a la referencia",
    comaEncima: (n) => `, ${n} por encima de la referencia`,
    comaDebajo: (n) => `, ${n} por debajo de la referencia`,
    sinZona: "Casi no hay zona caliente.",
    zona: (pct, lugar) => `La zona caliente cubre ${pct < 1 ? "menos del 1" : "el " + pct} % del mapa${lugar}.`,
    norte: ", sobre todo en el hemisferio norte",
    sur: ", sobre todo en el hemisferio sur",
    ambos: ", repartida entre los dos hemisferios",
    izquierda: ", sobre todo a la izquierda del mapa",
    derecha: ", sobre todo a la derecha del mapa",
    centro: ", sobre todo en el centro del mapa",
    salto: "Cambio brusco: suena un golpe fuerte.",
  },
  en: {
    meses: { ene: "January", feb: "February", mar: "March", abr: "April", may: "May", jun: "June",
             jul: "July", ago: "August", sep: "September", oct: "October", nov: "November", dic: "December" },
    anio: (a) => `Year ${a}.`,
    mesAnio: (mes, a) => `${mes} ${a}.`,
    fecha: (f) => `Date: ${f}.`,
    temperatura: "Average temperature",
    valor: "Average value",
    igualRef: "(equal to the reference)",
    encimaRef: "above the reference",
    debajoRef: "below the reference",
    escala: (a, b) => ` (on a scale from ${a} to ${b})`,
    comaIgual: ", equal to the reference",
    comaEncima: (n) => `, ${n} above the reference`,
    comaDebajo: (n) => `, ${n} below the reference`,
    sinZona: "There is almost no hot area.",
    zona: (pct, lugar) => `The hot area covers ${pct < 1 ? "less than 1" : pct}% of the map${lugar}.`,
    norte: ", mostly in the northern hemisphere",
    sur: ", mostly in the southern hemisphere",
    ambos: ", split between both hemispheres",
    izquierda: ", mostly on the left of the map",
    derecha: ", mostly on the right of the map",
    centro: ", mostly in the centre of the map",
    salto: "Sudden change: you hear a stronger hit.",
  },
};

/* 1881 -> "Año 1881."; "mar 2007" -> "Marzo de 2007."; cualquier otro texto se muestra tal cual.
   (El pipeline guarda los meses abreviados en español: ver fechas.py.) */
function fraseFecha(fecha, F) {
  if (typeof fecha === "number") return F.anio(fecha);
  const m = /^([a-z]{3}) (\d{4})$/.exec(String(fecha));
  if (m && F.meses[m[1]]) return F.mesAnio(F.meses[m[1]], m[2]);
  return F.fecha(fecha);
}

/* La misma fecha, corta, para ejes y botones: 1881 -> "1881"; "mar 2007" -> "mar 2007" / "Mar 2007". */
function fechaCorta(fecha, idioma = "es") {
  const m = /^([a-z]{3}) (\d{4})$/.exec(String(fecha));
  if (idioma === "es" || !m || !FRASES[idioma]?.meses[m[1]]) return String(fecha);
  return `${FRASES[idioma].meses[m[1]].slice(0, 3)} ${m[2]}`;
}

function fraseValor(rasgo, contexto, F, idioma) {
  const unidad = contexto.unidad ? " " + contexto.unidad : "";
  const num = (x) => x.toLocaleString(idioma, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const corto = (x) => x.toLocaleString(idioma, { maximumFractionDigits: 2 });
  const nombre = contexto.unidad === "°C" ? F.temperatura : F.valor;

  if (contexto.referencia === 0) {
    // los datos ya son diferencias con la referencia (p. ej. anomalías): no repetir el número
    const lado = Math.abs(rasgo.media) < 0.005 ? F.igualRef : rasgo.media > 0 ? F.encimaRef : F.debajoRef;
    return `${nombre}: ${num(Math.abs(rasgo.media))}${unidad} ${lado}.`;
  }
  let frase = `${nombre}: ${num(rasgo.media)}${unidad}`;
  if (contexto.vmin != null && contexto.vmax != null && !contexto.unidad) {
    frase += F.escala(corto(contexto.vmin), corto(contexto.vmax));
  }
  if (contexto.referencia != null) {
    const dif = rasgo.media - contexto.referencia;
    const cuanto = `${num(Math.abs(dif))}${unidad}`;
    frase += Math.abs(dif) < 0.005 ? F.comaIgual : dif > 0 ? F.comaEncima(cuanto) : F.comaDebajo(cuanto);
  }
  return frase + ".";
}

/* El valor solo, corto, para los botones de "Momentos clave": "+0,26 °C" si los datos ya son
   diferencias con la referencia (anomalías); si no, "24,31" con su unidad. */
function valorCorto(rasgo, contexto = {}) {
  const idioma = FRASES[contexto.idioma] ? contexto.idioma : "es";
  const unidad = contexto.unidad ? " " + contexto.unidad : "";
  const num = (x) => x.toLocaleString(idioma, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (contexto.referencia === 0) {
    const signo = Math.abs(rasgo.media) < 0.005 ? "" : rasgo.media > 0 ? "+" : "−";
    return `${signo}${num(Math.abs(rasgo.media))}${unidad}`;
  }
  return `${num(rasgo.media).replace("-", "−")}${unidad}`;
}

/* Dónde está lo caliente, en el mismo eje que el paneo del sonido. */
function fraseLugar(rasgo, paneo, F) {
  if (paneo === "y" && rasgo.centroide_y != null) {
    // 0 = polo sur, 0,5 = ecuador, 1 = polo norte (latitud media de la zona caliente)
    if (rasgo.centroide_y > 0.53) return F.norte;
    if (rasgo.centroide_y < 0.47) return F.sur;
    return F.ambos;
  }
  if (rasgo.centroide_x != null) {
    if (rasgo.centroide_x < 0.4) return F.izquierda;
    if (rasgo.centroide_x > 0.6) return F.derecha;
    return F.centro;
  }
  return "";
}

function fraseZona(rasgo, paneo, F) {
  if (rasgo.area < 0.01) return F.sinZona;
  return F.zona(Math.round(rasgo.area * 100), fraseLugar(rasgo, paneo, F));
}

function describir(rasgo, contexto = {}, opciones = {}) {
  const idioma = FRASES[contexto.idioma] ? contexto.idioma : "es";
  const F = FRASES[idioma];
  const partes = [];
  if (rasgo.fecha != null) partes.push(fraseFecha(rasgo.fecha, F));
  if (rasgo.media != null) partes.push(fraseValor(rasgo, contexto, F, idioma));
  if (opciones.breve) return partes.join(" ");
  if (rasgo.area != null) partes.push(fraseZona(rasgo, contexto.paneo, F));
  if (rasgo.salto) partes.push(F.salto);
  return partes.join(" ");
}
