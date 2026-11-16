/* Interfaz de la rocola: las dos tarjetas de pista, el escenario y sus controles. */
"use strict";

import * as audio from "./audio.js";
import { cargarRasgos, cargarMapeo } from "./datos.js";
import * as vivo from "./vivo.js";
import { dibujarGraficoPista } from "./grafico.js";
import * as lectura from "./lectura.js";
import * as explorar from "./explorar.js";
import * as idioma from "./idioma.js";

const { t, loc } = idioma;

const $ = (id) => document.getElementById(id);
let pistas = [];
let actual = null;
let doc = null;
let arrastrando = false;
let mapeoActual = null;             // <id>_mapeo.json de la pista elegida (null: no hay sonido en vivo)
const modos = new Map();            // id de pista → "original" | "vivo" (solo durante la sesión)
const AYUDA = { sinPista: "ayuda.sinPista", original: "ayuda.original", vivo: "ayuda.vivo", sinMapeo: "ayuda.sinMapeo", sinWebAudio: "ayuda.sinWebAudio" };   // claves de textos.js
let ayudaClave = AYUDA.sinPista;     // la ayuda que se ve ahora (para repetirla al cambiar de idioma)
let ultimoAudio = null;             // el último estado del audio (para repintar los botones al cambiar de idioma)
let ultimoDecir = null;             // { clave, vars } del último aviso
const hayWebAudio = () => !!(window.AudioContext || window.webkitAudioContext);

const SALTO = 5;                    // segundos que mueven las flechas izquierda y derecha

/* m:ss, o m:ss,d si la pista dura una fracción (30,5 s): el contador y el total se redondean igual */
function reloj(seg, decimales) {
  const f = decimales ? 10 : 1;
  const v = Math.floor(seg * f + 1e-6) / f;
  const m = Math.floor(v / 60), r = v - m * 60;
  return `${m}:${decimales ? idioma.decimal(r.toFixed(1)).padStart(4, "0") : String(r).padStart(2, "0")}`;
}
const durTotal = (d) => Math.round(d * 10) / 10;
function tiempoTexto(t, dur) {
  const total = durTotal(dur);
  const dec = !Number.isInteger(total);
  return `${reloj(Math.min(t, total), dec)} / ${reloj(total, dec)}`;
}

/* #estado-rocola es un role="status": solo se reescribe si el texto cambia, para no repetirlo al lector */
function decir(clave, vars) {
  ultimoDecir = { clave, vars };
  const e = $("estado-rocola");
  const texto = t(clave, vars);
  if (e.textContent !== texto) e.textContent = texto;
}

export const pistaActual = () => actual;
export const documentoActual = () => doc;

function pintarTarjetas() {
  const cont = $("lista-pistas");
  cont.textContent = "";
  for (const p of pistas) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pista vidrio";
    b.dataset.id = p.id;
    b.dataset.brillo = "";
    b.setAttribute("aria-pressed", "false");
    const img = document.createElement("img");
    img.src = p.fotograma; img.alt = ""; img.width = 640; img.height = 320; img.loading = "lazy";
    const ti = document.createElement("span"); ti.className = "pista-titulo"; ti.textContent = loc(p, "titulo");
    const d = document.createElement("span"); d.className = "pista-detalle"; d.textContent = `${p.periodo}. ${loc(p, "fuente")}`;
    const r = document.createElement("span"); r.className = "pista-resumen";
    const rt = document.createElement("span"); rt.textContent = loc(p, "resumen");
    const f = document.createElement("span"); f.className = "pista-ficha"; f.textContent = t("pista.elegida");
    r.append(rt, f);
    b.append(img, ti, d, r);
    b.addEventListener("click", () => { audio.desbloquear(); elegir(p.id, { reproducir: true }); });
    cont.appendChild(b);
  }
}

function marcarFichas(sonando) {
  for (const b of $("lista-pistas").querySelectorAll(".pista")) {
    const es = actual && b.dataset.id === actual.id;
    b.setAttribute("aria-pressed", es ? "true" : "false");
    const f = b.querySelector(".pista-ficha");
    if (f) f.textContent = es && sonando ? t("pista.sonando") : t("pista.elegida");
  }
}

function alAudio(e) {
  pintarAudio(e);
  if (e.terminado && actual) decir("estado.termino", { titulo: loc(actual, "titulo") });
}

function pintarAudio(e) {
  ultimoAudio = e;
  const dur = e.duracion || (actual ? actual.duracion_s : 0);
  $("btn-reproducir").textContent = e.sonando ? t("btn.pausar") : t("btn.reproducir");
  $("tiempo").textContent = tiempoTexto(e.tiempo, dur);
  const av = $("avance");
  if (dur && Number(av.max) !== dur) av.max = String(dur);
  if (!arrastrando && dur) {
    av.value = String(Math.min(e.tiempo, dur));
    av.setAttribute("aria-valuetext", tiempoTexto(e.tiempo, dur).replace(" / ", " de "));
  }
  marcarFichas(e.sonando);
  $("sonando-titulo").textContent = e.sonando && actual ? loc(actual, "titulo") : t("sonando.nada");
  $("btn-muestra").textContent = e.sonando ? t("btn.pausar") : t("muestra.escuchar");
}

const RASGOS = ["tono", "volumen", "paneo", "dron"];
const rasgosMarcados = () => Object.fromEntries(RASGOS.map((k) => [k, $(`rasgo-${k}`).checked]));

/* Habilita o no el selector de sonido según lo que haya cargado */
function estadoSelector(habilitado, ayuda) {
  $("modo-sonido").disabled = !habilitado;
  if (!habilitado) $("rasgos-vivo").disabled = true;
  ayudaClave = ayuda;
  $("modo-ayuda").textContent = t(ayuda);
}

/* Pone el modo de sonido ("original" o "vivo"); si el vivo no es posible vuelve al original */
function ponerModo(modo, anunciar) {
  if (modo === "vivo") {
    const ok = !!mapeoActual && !!doc && audio.fijarModo("vivo") && vivo.activar(true);
    if (!ok) { modo = "original"; vivo.activar(false); audio.fijarModo("original"); }
  } else {
    vivo.activar(false);
    audio.fijarModo("original");
  }
  if (actual) modos.set(actual.id, modo);
  $("rasgos-vivo").disabled = modo !== "vivo";
  document.querySelector(`input[name="modo-sonido"][value="${modo}"]`).checked = true;
  ayudaClave = AYUDA[modo];
  $("modo-ayuda").textContent = t(ayudaClave);
  if (anunciar) decir(ayudaClave);
}

/* Cuando ya hay rasgos y mapeo de la pista: prepara el motor en vivo y recupera el modo que tenía esa pista */
function prepararModo(p) {
  if (!hayWebAudio()) { estadoSelector(false, AYUDA.sinWebAudio); return; }
  if (!mapeoActual || !doc) { estadoSelector(false, AYUDA.sinMapeo); return; }
  vivo.cargar(mapeoActual, doc.rasgos);       // usa las casillas tal como están: vivo.fijarRasgos las mantiene al día
  estadoSelector(true, AYUDA.original);
  ponerModo(modos.get(p.id) || "original", false);
}

/* Título, fuente, descripción, descripción accesible y leyenda de la pista elegida, o los textos de «elige una pista» */
function textosPista() {
  const p = actual;
  $("titulo-pista").textContent = p ? `${loc(p, "titulo")} ${p.periodo}` : t("pista.elige");
  const f = $("fuente-pista");
  f.textContent = "";
  if (p) {
    const a = document.createElement("a");
    a.href = p.fuente_url; a.textContent = loc(p, "fuente");
    f.appendChild(a);
  }
  $("descripcion-pista").textContent = p ? loc(p, "descripcion") : "";
  $("descripcion-accesible").textContent = p ? loc(p, "descripcion_accesible") : t("pista.eligeDesc");
  $("leyenda-pista").textContent = p ? loc(p, "leyenda") : t("pista.eligeLeyenda");
}

/* Al cambiar de idioma: vuelve a escribir todo lo que puso el código (los textos fijos los cambia idioma.js) */
function refrescarIdioma() {
  if (pistas.length) { pintarTarjetas(); marcarFichas(!!(ultimoAudio && ultimoAudio.sonando)); }
  else if ($("lista-pistas").querySelector(".nota")) $("lista-pistas").querySelector(".nota").textContent = t("pista.cargando");
  textosPista();
  if (ultimoAudio) pintarAudio(ultimoAudio); else { $("btn-reproducir").textContent = t("btn.reproducir"); $("sonando-titulo").textContent = t("sonando.nada"); $("btn-muestra").textContent = t("muestra.escuchar"); }
  $("modo-ayuda").textContent = t(ayudaClave);
  const vars = ultimoDecir && ultimoDecir.vars && "titulo" in ultimoDecir.vars && actual ? { ...ultimoDecir.vars, titulo: loc(actual, "titulo") } : ultimoDecir && ultimoDecir.vars;
  decir(ultimoDecir ? ultimoDecir.clave : "estado.inicial", vars);
  if (actual && doc) {
    dibujarGraficoPista($("grafico-pista"), actual, doc, saltarA);
    lectura.refrescar(actual, doc, audio.estado().tiempo);
  } else {
    $("resumen-grafico").textContent = actual ? "" : t("grafico.resumenInicial");
    lectura.refrescar(null, null, 0);
  }
  explorar.refrescarIdioma();
}
idioma.alCambiar(refrescarIdioma);
export { refrescarIdioma };

export async function elegir(id, opciones = {}) {
  const p = pistas.find((x) => x.id === id);
  if (!p) return;
  actual = p;
  doc = null;
  mapeoActual = null;
  vivo.activar(false);                 // la pista anterior deja de sonar en vivo hasta saber qué trae esta
  explorar.fijarPista(null, null);
  audio.fijarModo("original");
  estadoSelector(false, AYUDA.sinPista);
  marcarFichas(false);
  textosPista();
  $("btn-reproducir").disabled = false;
  $("btn-cambiar").disabled = false;
  $("btn-comparar").disabled = false;
  comparacion = null;
  $("avance").disabled = false;
  $("avance").max = String(p.duracion_s);
  $("avance").value = 0;
  decir("estado.cargando", { titulo: loc(p, "titulo"), pct: 0 });
  lectura.limpiar();
  const rasgos = Promise.all([cargarRasgos(p), cargarMapeo(p)]).then(([d, m]) => {
    if (actual !== p) return;
    doc = d;
    mapeoActual = d ? m : null;
    explorar.fijarPista(p, mapeoActual);
    dibujarGraficoPista($("grafico-pista"), p, d, saltarA);
    if (d) lectura.actualizar(p, d, 0, false, true); else lectura.sinLectura();
    prepararModo(p);
  });
  const ok = await audio.cargar(p, (fr) => { if (actual === p) decir("estado.cargando", { titulo: loc(p, "titulo"), pct: Math.round(fr * 100) }); });
  await rasgos;
  if (actual !== p) return;
  if (!ok) {
    decir("estado.noCargo", { titulo: loc(p, "titulo"), archivo: p.video });
    $("btn-reproducir").disabled = true;
    $("btn-cambiar").disabled = false;
    return;
  }
  decir("estado.listo");
  if (opciones.reproducir) {
    const sono = await audio.reproducir();
    if (actual === p) decir(sono ? "estado.suena" : "estado.pulsa", { titulo: loc(p, "titulo") });
  }
}

export async function cambiar() {
  // la siguiente de la lista, en ciclo (sirve con 2 pistas o con más)
  const i = actual ? pistas.findIndex((x) => x.id === actual.id) : -1;
  const otra = pistas[(i + 1) % pistas.length];
  const sonaba = audio.estado().sonando;
  await elegir(otra.id, { reproducir: sonaba });
}

/* Mueve el video a 'seg' (gráfico, flechas) y deja la lectura en ese momento */
function saltarA(seg) {
  audio.buscar(seg);
  if (actual && doc) lectura.actualizar(actual, doc, seg, false, true);
}

/* «Antes y después»: suenan los primeros TRAMO s de la pista y, enseguida, los últimos. Así se oye el cambio sin esperar. */
const TRAMO = 5;
let comparacion = null;             // null, o { fase: 1 | 2, inicio2 }
async function comparar() {
  if (!actual) return;
  audio.desbloquear();                      // primero y sin await: es un gesto del usuario
  const dur = audio.estado().duracion || actual.duracion_s;
  if (dur < 2 * TRAMO + 1) return;
  comparacion = null;
  saltarA(0);
  const ok = await audio.reproducir();
  if (!ok) { decir("estado.pulsa"); return; }
  comparacion = { fase: 1, inicio2: dur - TRAMO };
  decir("estado.antes", { n: TRAMO, titulo: loc(actual, "titulo") });
}
function seguirComparacion(e) {
  if (!comparacion) return;
  if (!e.sonando) { comparacion = null; return; }           // pausa, final o cambio de pista: se cancela
  if (comparacion.fase === 1 && e.tiempo >= TRAMO) {
    comparacion.fase = 2;
    saltarA(comparacion.inicio2);
    decir("estado.despues", { n: TRAMO });
  }
}

async function alternar() {
  audio.desbloquear();                      // primero y sin await: el gesto del usuario tiene que seguir activo
  if (audio.estado().sonando) {
    audio.pausar();
    if (actual && doc) lectura.actualizar(actual, doc, audio.estado().tiempo, false, true);
    decir("estado.pausa", { titulo: loc(actual, "titulo") });
  } else {
    const ok = await audio.reproducir();
    decir(ok ? "estado.suena" : "estado.pulsa", { titulo: loc(actual, "titulo") });
  }
}

/* Atajos globales: Espacio y flechas, salvo en campos de texto, controles que ya usan esas teclas, botones y enlaces */
function atajos(ev) {
  if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || !actual) return;
  const t = ev.target instanceof Element ? ev.target : document.body;
  if (t.closest("input, textarea, select, [contenteditable], [role='slider'], [role='textbox'], [role='spinbutton']")) return;
  if (ev.key === " ") {
    if (t.closest("button, a[href], summary, [role='button']") || $("btn-reproducir").disabled) return;
    ev.preventDefault();
    alternar();
  } else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
    const e = audio.estado();
    if (!e.duracion) return;
    ev.preventDefault();
    const adelante = ev.key === "ArrowRight";
    const destino = Math.max(0, Math.min(e.duracion, e.tiempo + (adelante ? SALTO : -SALTO)));
    saltarA(destino);
    decir(adelante ? "estado.adelantado" : "estado.retrocedido", { t: reloj(destino, false) });
  }
}

export function iniciarRocola(lista) {
  pistas = lista;
  pintarTarjetas();
  audio.alCambiar(alAudio);
  $("btn-reproducir").addEventListener("click", alternar);
  document.addEventListener("keydown", atajos);
  $("btn-cambiar").addEventListener("click", cambiar);
  $("btn-comparar").addEventListener("click", comparar);
  explorar.iniciarExplorar({ boton: $("btn-explorar"), zona: $("zona-explorar"), mira: $("mira"), texto: $("explorar-texto"), video: $("medio") },
    { alSalir: () => { if (actual && !audio.estado().sonando) decir("estado.pausa", { titulo: loc(actual, "titulo") }); } });
  audio.alCambiar(seguirComparacion);
  $("volumen").addEventListener("input", (ev) => {
    audio.fijarVolumen(ev.target.value / 100);
    ev.target.setAttribute("aria-valuetext", `${ev.target.value} %`);
  });
  const av = $("avance");
  av.addEventListener("pointerdown", () => { arrastrando = true; });
  av.addEventListener("pointerup", () => { arrastrando = false; });
  av.addEventListener("input", () => saltarA(Number(av.value)));
  av.addEventListener("change", () => { arrastrando = false; });
  $("btn-muestra").addEventListener("click", async () => {
    audio.desbloquear();
    const e = audio.estado();
    if (e.sonando) { audio.pausar(); return; }
    if (!actual) await elegir(pistas[0].id, { reproducir: true });
    else { const ok = await audio.reproducir(); if (ok) decir("estado.suena", { titulo: loc(actual, "titulo") }); }
  });
  let sonabaAntes = false;
  audio.alCambiar((e) => { if (e.sonando && !sonabaAntes && actual) decir("estado.suena", { titulo: loc(actual, "titulo") }); sonabaAntes = e.sonando; });
  $("rasgos-vivo").addEventListener("change", () => {
    const marcados = rasgosMarcados();
    vivo.fijarRasgos(marcados);
    const suenan = RASGOS.filter((k) => marcados[k]).map((k) => t(`rasgo.${k}`));
    if (suenan.length) decir("estado.suenan", { lista: suenan.join(", ") }); else decir("estado.ninguno");
  });
  $("modo-sonido").addEventListener("change", (ev) => {
    audio.desbloquear();                  // primero y sin await: es un gesto del usuario
    ponerModo(ev.target.value, true);
  });
}
