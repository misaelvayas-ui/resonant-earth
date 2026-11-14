/* Rocola de la Tierra — arranque: idioma y tema ANTES de pintar la página.
   Se carga sin "defer" desde el <head> para que no haya un parpadeo de tema ni de idioma.
   Lo que define aquí (preferencias, idioma, tema) lo usan después textos.js y app.js. */
"use strict";

const CLAVE_PREFERENCIAS = "rocola-preferencias"; // un solo objeto JSON en este navegador
const IDIOMAS = ["es", "en"];
const TEMAS = ["sistema", "claro", "oscuro"];
const COLOR_BARRA = { claro: "#f3f1fa", oscuro: "#000000" }; // barra del navegador en móviles

/* localStorage puede no existir o fallar (ventana privada, almacenamiento bloqueado):
   la página funciona igual sin él, solo no recuerda. */
function leerPreferencias() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS)) || {};
  } catch (e) {
    return {};
  }
}

function guardarPreferencias(cambios) {
  try {
    localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ ...leerPreferencias(), ...cambios }));
  } catch (e) {
    /* sin almacenamiento: no se recuerda, nada más */
  }
}

/* Orden: ?lang=en en la dirección (para enlazar la versión en inglés) → lo guardado → el navegador. */
function idiomaInicial() {
  const pedido = new URLSearchParams(location.search).get("lang");
  if (IDIOMAS.includes(pedido)) return pedido;
  const guardado = leerPreferencias().idioma;
  if (IDIOMAS.includes(guardado)) return guardado;
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
}

function temaGuardado() {
  const tema = leerPreferencias().tema;
  return TEMAS.includes(tema) ? tema : "sistema";
}

/* "sistema" se resuelve a claro u oscuro según el sistema operativo. */
function temaResuelto(tema) {
  if (tema === "claro" || tema === "oscuro") return tema;
  return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "oscuro";
}

function aplicarTema(tema) {
  const resuelto = temaResuelto(tema);
  document.documentElement.dataset.tema = resuelto;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COLOR_BARRA[resuelto];
}

document.documentElement.lang = idiomaInicial();
aplicarTema(temaGuardado());
