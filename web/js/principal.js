/* Arranque de la página: une los módulos y registra el bucle único de animación. */
"use strict";

import * as audio from "./audio.js";
import { cargarPistas, cargarEquipo } from "./datos.js";
import { iniciarRocola, pistaActual, documentoActual, elegir, cambiar } from "./rocola.js";
import { iniciarVisualizador, dibujar } from "./visualizador.js";
import { iniciarMiniGrafico, moverCursor } from "./grafico.js";
import * as lectura from "./lectura.js";
import { iniciarGlobo, cuadro, depuracion } from "./globo.js";
import { iniciarAnimaciones } from "./animaciones.js";
import { iniciarTarjetas } from "./tarjetas.js";
import { iniciarMenu, listaEnfocableSiDesborda } from "./menu.js";

const $ = (id) => document.getElementById(id);
const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;

audio.iniciar($("medio"));
iniciarVisualizador($("visualizador"), $("mini-espectro"));
lectura.iniciarLectura({ fecha: $("ahora-fecha"), fechaVideo: $("fecha-video"), texto: $("ahora-texto"), viva: $("lectura-viva"), casilla: $("anunciar") });

cargarPistas().then(iniciarRocola).catch((e) => { $("estado-rocola").textContent = e.message; });

cargarEquipo().then((eq) => {
  const ul = $("lista-equipo");
  for (const p of eq.integrantes) {
    const li = document.createElement("li");
    li.className = "vidrio";
    li.dataset.brillo = "";
    const h = document.createElement("h3"); h.textContent = p.nombre;
    const c = document.createElement("p"); c.className = "carrera"; c.textContent = p.carrera;
    const a = document.createElement("p"); a.textContent = p.aporte;
    li.append(h, c, a);
    ul.appendChild(li);
  }
}).catch(() => { $("lista-equipo").textContent = "No pude leer equipo.json."; });

iniciarMiniGrafico($("mini-grafico"), $("mini-grafico-texto"));
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

window.__web = { audio, globo: depuracion, rocola: { elegir, cambiar, pistaActual } };
