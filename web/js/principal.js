/* Arranque de la página: une los módulos y registra el bucle único de animación. */
"use strict";

import * as audio from "./audio.js";
import * as vivo from "./vivo.js";
import { cargarPistas, cargarEquipo } from "./datos.js";
import { iniciarRocola, pistaActual, documentoActual, elegir, cambiar, refrescarIdioma } from "./rocola.js";
import * as idioma from "./idioma.js";
import { iniciarVisualizador, dibujar } from "./visualizador.js";
import { iniciarMiniGrafico, moverCursor, refrescarMini } from "./grafico.js";
import * as lectura from "./lectura.js";
import { iniciarGlobo, cuadro, depuracion } from "./globo.js";
import { iniciarAnimaciones } from "./animaciones.js";
import { iniciarTarjetas } from "./tarjetas.js";
import * as explorar from "./explorar.js";
import { iniciarMenu, listaEnfocableSiDesborda } from "./menu.js";

const $ = (id) => document.getElementById(id);
const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;

idioma.iniciar();                       // primero: fija el idioma de todo lo que se escriba después
audio.iniciar($("medio"));
vivo.iniciar();
iniciarVisualizador($("visualizador"), $("mini-espectro"));
lectura.iniciarLectura({ fecha: $("ahora-fecha"), fechaVideo: $("fecha-video"), texto: $("ahora-texto"), viva: $("lectura-viva"), casilla: $("anunciar") });

cargarPistas().then(iniciarRocola).catch((e) => { $("estado-rocola").textContent = e.message; });

let equipo = null;
function pintarEquipo() {
  const ul = $("lista-equipo");
  ul.textContent = "";
  for (const p of equipo.integrantes) {
    const li = document.createElement("li");
    li.className = "vidrio";
    li.dataset.brillo = "";
    const h = document.createElement("h3"); h.textContent = p.nombre;
    const c = document.createElement("p"); c.className = "carrera"; c.textContent = idioma.loc(p, "carrera");
    const a = document.createElement("p"); a.textContent = idioma.loc(p, "aporte");
    li.append(h, c);
    if (p.aporte) li.append(a);                // sin aporte escrito no se muestra nada (nunca un texto de relleno)
    ul.appendChild(li);
  }
}
cargarEquipo().then((eq) => { equipo = eq; pintarEquipo(); }).catch(() => { $("lista-equipo").textContent = idioma.t("equipo.error"); });

iniciarMiniGrafico($("mini-grafico"), $("mini-grafico-texto"));
refrescarIdioma();                      // los textos que escribe el código, ya en el idioma elegido
idioma.alCambiar(() => { refrescarMini(); if (equipo) pintarEquipo(); });
iniciarAnimaciones();
iniciarTarjetas();
iniciarMenu();
listaEnfocableSiDesborda(document.querySelector(".cifras"));

(window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => {
  iniciarGlobo($("globo"), { reducirMovimiento: reducir });
});

if (window.gsap) {
  window.gsap.ticker.add((_t, deltaMs) => {
    audio.muestrear();
    dibujar();
    const e = audio.estado();
    const p = pistaActual(), d = documentoActual();
    if (p && d && e.duracion) {
      moverCursor(e.tiempo / e.duracion);
      lectura.actualizar(p, d, e.tiempo, e.sonando);
    }
    cuadro(deltaMs / 1000, audio.amplitud(), audio.espectro());
  });
}

window.__web = { explorar, audio, vivo, idioma, globo: depuracion, rocola: { elegir, cambiar, pistaActual } };
