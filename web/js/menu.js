/* Menú desplegable de la barra (≤ 899 px): botón con aria-expanded; se cierra con Esc, al elegir una opción y al pulsar fuera. */
"use strict";

export function iniciarMenu() {
  const boton = document.getElementById("btn-menu");
  const menu = document.getElementById("menu-principal");
  const barra = document.querySelector(".barra");
  if (!boton || !menu) return;

  const abierto = () => boton.getAttribute("aria-expanded") === "true";
  const poner = (si) => {
    boton.setAttribute("aria-expanded", String(si));
    menu.classList.toggle("abierto", si);
    barra.classList.toggle("barra--menu", si);
  };

  boton.addEventListener("click", () => poner(!abierto()));
  menu.addEventListener("click", (ev) => { if (ev.target.closest("a")) poner(false); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && abierto()) { poner(false); boton.focus(); }
  });
  document.addEventListener("click", (ev) => { if (abierto() && !barra.contains(ev.target)) poner(false); });
  matchMedia("(max-width: 899px)").addEventListener("change", () => poner(false));
}

/* Una lista que se desplaza con el teclado tiene que poder enfocarse; si todo cabe, no es un punto de parada más. */
export function listaEnfocableSiDesborda(lista) {
  const ajustar = () => {
    if (lista.scrollWidth > lista.clientWidth + 1) lista.setAttribute("tabindex", "0");
    else lista.removeAttribute("tabindex");
  };
  ajustar();
  new ResizeObserver(ajustar).observe(lista);
}
