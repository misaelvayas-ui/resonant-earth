/* Animaciones con GSAP + ScrollTrigger. Con prefers-reduced-motion solo hay fundidos. */
"use strict";

export function iniciarAnimaciones() {
  if (!window.gsap || !window.ScrollTrigger) {
    document.documentElement.classList.remove("js");       // sin GSAP todo queda visible
    return;
  }
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();

  const barra = document.querySelector(".barra");
  ScrollTrigger.create({ start: 80, end: "max", onToggle: (s) => barra.classList.toggle("barra--solida", s.isActive) });

  const marcarPasos = (progreso) => {
    document.querySelectorAll(".paso").forEach((p, i) => p.classList.toggle("activo", progreso >= i / 3 - 0.02));
  };

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // A1 carga del hero
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(".barra", { opacity: 0, duration: 0.6 }, 0)
      .from(".heroe-titulo .linea", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08 }, 0)
      .from(".heroe-cierre", { y: 16, opacity: 0, duration: 0.6 }, 0.35)
      .from(".escucha-lista > div", { x: -12, opacity: 0, duration: 0.5, stagger: 0.06 }, 0.5)
      .from(".cifra-ficha, .heroe-tarjetas > *", { y: 16, opacity: 0, duration: 0.6, stagger: 0.1, clearProps: "opacity,y" }, 0.7);
    // A2 contadores
    document.querySelectorAll(".cifra").forEach((c) => {
      const fin = Number(c.dataset.valor);
      const o = { v: 0 };
      tl.fromTo(o, { v: 0 }, { v: fin, duration: 1.4, ease: "power2.out",
        onUpdate: () => { c.textContent = Math.round(o.v); },
        onComplete: () => { c.textContent = fin; } }, 0.8);
    });
    // A3 entradas con scroll
    gsap.set(".revelar", { opacity: 0 });
    ScrollTrigger.batch(".revelar", {
      start: "top 85%", once: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", stagger: 0.08, overwrite: true }),
    });
    // A4 línea del pipeline
    const lineas = gsap.utils.toArray(".linea-pipeline");
    gsap.set(lineas, { strokeDashoffset: 1 });
    ScrollTrigger.create({
      trigger: ".pipeline", start: "top 70%", end: "bottom 60%", scrub: 0.6,
      onUpdate: (s) => { lineas.forEach((l) => { l.style.strokeDashoffset = String(1 - s.progress); }); marcarPasos(s.progress); },
    });
    // A5 paralaje del hero
    gsap.to(".heroe-contenido", { y: -60, opacity: 0.2, ease: "none", scrollTrigger: { trigger: "#inicio", start: "top top", end: "bottom top", scrub: true } });
    gsap.to("#globo", { scale: 1.06, ease: "none", scrollTrigger: { trigger: "#inicio", start: "top top", end: "bottom top", scrub: true } });
  });

  mm.add("(prefers-reduced-motion: reduce)", () => {
    gsap.from(".heroe", { opacity: 0, duration: 0.4 });
    gsap.set(".revelar", { opacity: 0 });
    ScrollTrigger.batch(".revelar", {
      start: "top 85%", once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, duration: 0.4, overwrite: true }),
    });
    document.querySelectorAll(".linea-pipeline").forEach((l) => { l.style.strokeDashoffset = "0"; });
    marcarPasos(1);
  });
}
