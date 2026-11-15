/* Resonant Earth — adaptador de la guía por voz: el único archivo de la guía que conoce la web.

   La web nueva (módulos en js/) ya deja a la vista lo necesario en window.__web (lo crea js/principal.js):
     __web.audio   -> estado(), reproducir(), buscar(), fijarVolumen()
     __web.rocola  -> elegir(id, { reproducir }), pistaActual()
   y pinta sus textos en elementos con id fijo (#ahora-texto, #leyenda-pista, #volumen…).
   Este adaptador usa solo eso: NO cambia ningún módulo de js/. Las pistas y sus datos los lee él mismo de
   pistas.json y de los _rasgos.json (los mismos archivos que usa la página).
   Si la web cambia, se cambia este archivo y nada más.

   Lo que la guía le pide (todo lo demás es asunto de guia-voz.js):
     listo()            la pista ya cargó y se puede reproducir
     pistas(idioma)     [{ id, titulo }] en el orden de la página (con "en", el título en inglés)
     indiceActual()     posición de la pista elegida (−1 si no hay)
     elegir(i, sonar)   elige la pista i; devuelve una promesa que termina cuando cargó
     reproducir() / pausar() / sonando()
     tiempo() / duracion() / irA(segundo)
     fechas()           [{ t, fecha }]: en qué segundo empieza cada fecha (para "año 1990")
     descripcion(idioma) la frase de "Ahora" (la lectura en vivo de la página); con "en", la misma lectura en inglés
     leyenda(idioma)    "Qué vas a oír" y los colores del mapa
     textosWeb()        los textos fijos de la página (qué es, cómo funciona, por qué, accesibilidad, equipo, pistas),
                        recortados, para que la IA conteste dudas sobre la web usando solo eso
     volumen() / ponerVolumen(0..100)
     atenuar(factor)    baja la música (0..1) sin mover el control de volumen
     paginaAnuncia(que) true si la página ya avisa al lector de pantalla al "elegir", "pausar" o "saltar"
     paginaHablaSola()  true si la página dice cosas con su propia voz (esta web no lo hace)
     detalle(i)         de qué trata la pista i (sin i, la elegida), unidad, referencia y la serie [{ t, fecha, media, area }]
     ancla()            el elemento de la página antes del cual se coloca el panel de la guía */
"use strict";

window.GuiaVozAdaptador = (() => {
  const $ = (id) => document.getElementById(id);
  const texto = (nodo) => (nodo ? nodo.textContent.replace(/\s+/g, " ").trim() : "");
  const conPunto = (s) => (s && !/[.!?]$/.test(s) ? s + "." : s);
  const web = () => window.__web || null;
  const audio = () => (web() ? web().audio.estado() : { id: null, cargando: false, sonando: false, tiempo: 0, duracion: 0 });

  let lista = [];                    // las pistas de pistas.json
  const series = {};                 // id -> { referencia, rasgos } con los rasgos ordenados por t_video

  const leer = (ruta) => fetch(ruta).then((r) => { if (!r.ok) throw new Error(ruta); return r.json(); });
  const cargado = leer("pistas.json").then(async (doc) => {
    lista = Array.isArray(doc.pistas) ? doc.pistas : [];
    await Promise.all(lista.map(async (p) => {
      try {
        const d = await leer(p.rasgos);
        series[p.id] = { referencia: d.referencia ?? null,
          rasgos: d.rasgos.map((r, i) => ({ ...r, t_video: r.t_video ?? i * 0.5 })).sort((a, b) => a.t_video - b.t_video) };
      } catch (e) { /* sin datos: esa pista no tendrá fechas */ }
    }));
  }).catch(() => { lista = []; });

  /* La web está en español y no se traduce. Lo que la guía DICE en inglés sobre la página vive aquí. */
  const EN = {
    titulos: { "gistemp-1880-2023": "Planet temperature", "sst-ecco2-2007-2008": "Ocean currents and sea temperature" },
    queOiras: "Pitch: higher when the map is warmer. Volume: louder when the warm area grows. Side: to the left if the heat is in the south, to the right if it is in the north. Fixed low note: the reference average, so you can hear how far the data moves from it.",
    colores: {
      "gistemp-1880-2023": "Map colours. Blue: colder than the 1951–1980 average. White: near the average. Red and yellow: warmer.",
      "sst-ecco2-2007-2008": "Map colours. Each line is a current. Blue: cold water (0 °C). Green: 10 to 20 °C. Yellow: about 25 °C. Red: 32 °C. Grey: land.",
    },
    meses: { ene: "January", feb: "February", mar: "March", abr: "April", may: "May", jun: "June", jul: "July", ago: "August", sep: "September", oct: "October", nov: "November", dic: "December" },
  };
  const fechaEn = (f) => String(f).replace(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i, (m) => EN.meses[m.toLowerCase()]);
  const recorte = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  /* La lectura de "Ahora" en inglés, con los mismos datos que usa la página (el rasgo que toca en este segundo). */
  function lecturaEn() {
    const p = pista(), rasgos = serie().rasgos, t = audio().tiempo || 0;
    if (!p || !rasgos.length) return "";
    let r = rasgos[0];
    for (const x of rasgos) { if (x.t_video <= t + 1e-6) r = x; else break; }
    if (r.media == null) return `${fechaEn(r.fecha)}: no data at this moment.`;
    const signo = (n) => (Number(Math.abs(n).toFixed(2)) === 0 ? "" : n < 0 ? "−" : "+") + Math.abs(n).toFixed(2), area = Math.round((r.area ?? 0) * 100);
    if (/índice/i.test(p.lectura && p.lectura.plantilla || "")) {
      return `${fechaEn(r.fecha)}: index ${r.media.toFixed(2)}, ${signo(r.media - (serie().referencia ?? 0))} compared with the average of the period. ${area}% of the measured water is above 25 °C.`;
    }
    return `${fechaEn(r.fecha)}: ${signo(r.media)} °C compared with the 1951–1980 average. ${area}% of the map is more than 1 °C above it.`;
  }

  const indice = () => {
    const p = web() && web().rocola.pistaActual();
    return p ? lista.findIndex((x) => x.id === p.id) : -1;
  };
  const pista = () => lista[indice()] || null;
  const serie = () => (pista() && series[pista().id]) || { referencia: null, rasgos: [] };

  return {
    cargado,
    listo: () => { const e = audio(); return !!pista() && e.id === pista().id && !e.cargando && !$("btn-reproducir").disabled; },
    pistas: (idioma) => lista.map((p) => ({ id: p.id, titulo: (idioma === "en" && EN.titulos[p.id]) || p.titulo })),
    indiceActual: indice,
    elegir: (i, sonar = true) => web().rocola.elegir(lista[i].id, { reproducir: sonar }),

    reproducir: () => web().audio.reproducir(),
    // pausar con el botón de la página: así ella misma escribe "En pausa" y actualiza la lectura
    pausar: () => { if (audio().sonando) $("btn-reproducir").click(); },
    sonando: () => audio().sonando,

    tiempo: () => audio().tiempo || 0,
    duracion: () => audio().duracion || (pista() ? pista().duracion_s : 0),
    irA: (segundo) => web().audio.buscar(segundo),
    fechas: () => serie().rasgos.filter((r) => r.fecha != null).map((r) => ({ t: r.t_video, fecha: r.fecha })),

    descripcion: (idioma) => { if (idioma === "en") return lecturaEn(); const t = texto($("ahora-texto")); return pista() && !/^Sin lectura/.test(t) ? t : ""; },
    leyenda: (idioma) => idioma === "en" ? [EN.queOiras, pista() ? EN.colores[pista().id] || "" : ""].filter(Boolean).join(" ") : [
      ...[...document.querySelectorAll(".escucha-lista > div")].map((d) => conPunto(`${texto(d.querySelector("dt"))}: ${texto(d.querySelector("dd"))}`)),
      pista() ? "Colores del mapa. " + conPunto(texto($("leyenda-pista"))) : "",
    ].filter(Boolean).join(" "),

    volumen: () => Number($("volumen").value),
    ponerVolumen: (n) => {
      $("volumen").value = String(n);
      $("volumen").dispatchEvent(new Event("input", { bubbles: true }));     // la página lo aplica y actualiza su texto
    },
    atenuar: (factor) => { if (web()) web().audio.fijarVolumen((Number($("volumen").value) / 100) * factor); },

    // elegir y pausar: la página lo escribe siempre en #estado-rocola (role="status").
    // saltar: lo anuncia la lectura en vivo, solo si su casilla está marcada.
    paginaAnuncia: (que) => (que === "elegir" || que === "pausar" ? true : $("anunciar").checked),
    paginaHablaSola: () => false,

    detalle: (i = indice()) => {
      const p = lista[i] || null, s = (p && series[p.id]) || { referencia: null, rasgos: [] };
      if (!p) return { descripcionPista: "", unidad: "", referencia: null, serie: [] };
      const indiceRelativo = /índice/i.test(p.lectura && p.lectura.plantilla || "");
      return {
        descripcionPista: [p.descripcion, p.descripcion_accesible].filter(Boolean).join(" "),
        unidad: indiceRelativo ? "índice relativo (no son grados reales del mar)" : "°C de diferencia con el " + (p.grafico && p.grafico.etiqueta_ref || "promedio"),
        indiceRelativo,
        referencia: s.referencia,
        serie: s.rasgos.map((r) => ({ t: r.t_video, fecha: r.fecha ?? null, media: r.media ?? null, area: r.area ?? null })),
      };
    },

    /* Textos fijos de la página, tal como están en index.html, pistas.json y equipo.json (en español), recortados. */
    textosWeb: () => {
      const seccion = (id) => texto($(id));
      const equipo = [...document.querySelectorAll("#lista-equipo li")].map((li) => [texto(li.querySelector("h3")), texto(li.querySelector(".carrera"))].filter(Boolean).join(", "));
      return {
        que_es: recorte([texto(document.querySelector(".heroe-sub")), texto(document.querySelector(".heroe-reto")), texto(document.querySelector("#rocola .entrada"))].join(" "), 500),
        como_funciona: recorte(seccion("como-funciona"), 800),
        por_que: recorte(seccion("porque"), 950),
        accesibilidad: recorte(seccion("accesibilidad"), 500),
        equipo: recorte([texto(document.querySelector("#equipo .entrada")), ...equipo].join(" | "), 450),
        pistas: lista.map((p) => recorte(`${p.titulo} (${p.periodo}; ${p.fuente}; ${p.resumen}): ${p.descripcion}`, 260)),
        creditos: recorte(texto(document.querySelector(".pie")), 420),
      };
    },

    ancla: () => $("rocola"),
  };
})();
