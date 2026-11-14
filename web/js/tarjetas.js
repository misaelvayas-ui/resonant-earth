/* Brillo del borde que sigue al cursor y una inclinación sutil en las tarjetas con data-brillo / data-inclinar. */
"use strict";

export function iniciarTarjetas() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let pendiente = null;
  document.addEventListener("pointermove", (ev) => {
    const t = ev.target.closest && ev.target.closest("[data-brillo]");
    if (!t) return;
    pendiente = { t, x: ev.clientX, y: ev.clientY };
    requestAnimationFrame(() => {
      if (!pendiente) return;
      const { t: el, x, y } = pendiente;
      pendiente = null;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${x - r.left}px`);
      el.style.setProperty("--my", `${y - r.top}px`);
      if (el.hasAttribute("data-inclinar")) {
        const a = ((y - r.top) / r.height - 0.5) * -6;
        const b = ((x - r.left) / r.width - 0.5) * 6;
        el.style.transform = `perspective(900px) rotateX(${a.toFixed(2)}deg) rotateY(${b.toFixed(2)}deg)`;
      }
    });
  });
  document.addEventListener("pointerout", (ev) => {
    const t = ev.target.closest && ev.target.closest("[data-brillo]");
    if (!t || (ev.relatedTarget && t.contains(ev.relatedTarget))) return;
    t.style.setProperty("--mx", "-999px");
    t.style.setProperty("--my", "-999px");
    if (t.hasAttribute("data-inclinar")) t.style.transform = "";
  });
}
