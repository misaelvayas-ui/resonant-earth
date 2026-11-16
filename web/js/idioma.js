/* Idioma de la página (español o inglés): elección, textos fijos de index.html (data-t, data-t-attr) y textos del código (t). */
"use strict";

import { EN } from "./textos_en.js";
import { DINAMICOS } from "./textos.js";

const IDIOMAS = ["es", "en"];
const CLAVE = "idioma";
const MESES_EN = { ene: "Jan", abr: "Apr", ago: "Aug", dic: "Dec" };
const textosEs = new Map();              // elemento con data-t → su texto en español (innerHTML)
const attrsEs = new Map();               // elemento con data-t-attr → { atributo: valor en español }
const oyentes = [];
let lang = "es";

export const actual = () => lang;

/* Texto del código en el idioma actual; cada {dato} se cambia por vars.dato */
export function t(clave, vars = {}) {
  const base = DINAMICOS[lang][clave] ?? DINAMICOS.es[clave] ?? clave;
  return base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/* Campo de un objeto de pistas.json: en inglés usa «<campo>_en» si existe */
export const loc = (obj, campo) => (lang === "en" && obj[`${campo}_en`] != null ? obj[`${campo}_en`] : obj[campo]);

/* Número con signo opcional, el menos tipográfico y la coma decimal en español */
export function num(v, dec, signo = false) {
  const txt = Math.abs(v).toFixed(dec);
  const nulo = Number(txt) === 0;
  const sep = lang === "en" ? txt : txt.replace(".", ",");
  return nulo ? sep : (v < 0 ? "−" : signo ? "+" : "") + sep;
}

/* «mar 2007» → «Mar 2007» en inglés; los años y cualquier otra etiqueta no cambian */
export function fechaLoc(f) {
  const s = String(f);
  if (lang !== "en") return s;
  const m = /^([a-z]{3}) (\d{4})$/.exec(s);
  if (!m) return s;
  const mes = MESES_EN[m[1]] || m[1][0].toUpperCase() + m[1].slice(1);
  return `${mes} ${m[2]}`;
}

/* La coma decimal de un reloj o una cifra: «0:30,5» → «0:30.5» en inglés */
export const decimal = (txt) => (lang === "en" ? txt.replace(",", ".") : txt);

function aplicarTextos() {
  for (const el of document.querySelectorAll("[data-t]")) {
    if (!textosEs.has(el)) textosEs.set(el, el.innerHTML);
    const es = textosEs.get(el);
    const txt = lang === "en" ? (EN[es.trim()] ?? es) : es;
    if (el.innerHTML !== txt) el.innerHTML = txt;
  }
  for (const el of document.querySelectorAll("[data-t-attr]")) {
    if (!attrsEs.has(el)) attrsEs.set(el, Object.fromEntries(el.getAttribute("data-t-attr").split(/\s+/).map((a) => [a, el.getAttribute(a) ?? ""])));
    for (const [a, es] of Object.entries(attrsEs.get(el))) el.setAttribute(a, lang === "en" ? (EN[es.trim()] ?? es) : es);
  }
  const og = document.querySelector('meta[property="og:locale"]');
  if (og) og.setAttribute("content", lang === "en" ? "en_US" : "es_EC");
  document.documentElement.lang = lang;
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
}

export function establecer(nuevo, guardar = true) {
  if (!IDIOMAS.includes(nuevo)) return;
  lang = nuevo;
  if (guardar) { try { localStorage.setItem(CLAVE, nuevo); } catch (e) { /* sin almacenamiento: no se recuerda */ } }
  aplicarTextos();
  for (const f of oyentes) f(lang);
}

export const alCambiar = (f) => { oyentes.push(f); };

/* Elige el idioma (?lang=en, o el recordado, o español), pone los textos fijos y conecta el selector */
export function iniciar() {
  let l = null;
  try { l = new URLSearchParams(location.search).get("lang"); } catch (e) { /* sin URLSearchParams */ }
  if (!IDIOMAS.includes(l)) {
    l = null;
    try { l = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  }
  lang = IDIOMAS.includes(l) ? l : "es";
  aplicarTextos();
  for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => establecer(b.dataset.lang));
}

/* Para las pruebas: textos fijos en español que no tienen traducción */
export function sinTraducir() {
  const falta = [];
  for (const es of textosEs.values()) if (!(es.trim() in EN)) falta.push(es.trim().slice(0, 60));
  for (const m of attrsEs.values()) for (const es of Object.values(m)) if (!(es.trim() in EN)) falta.push(es.slice(0, 60));
  return falta;
}
