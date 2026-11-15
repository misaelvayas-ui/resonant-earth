/* Carga de pistas.json, equipo.json, y los rasgos y el mapeo (modo en vivo) de cada pista. */
"use strict";

const CLAVES_PISTA = ["id", "titulo", "periodo", "fuente", "fuente_url", "resumen", "descripcion", "descripcion_accesible",
  "leyenda", "fotograma", "video", "rasgos", "duracion_s", "lectura", "grafico"];
const memoria = new Map();
const memoriaMapeo = new Map();

async function leerJson(ruta) {
  const r = await fetch(ruta, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}`);
  return r.json();
}

export async function cargarPistas() {
  let doc;
  try {
    doc = await leerJson("pistas.json");
  } catch (e) {
    throw new Error("No pude leer la lista de pistas. Abre la página con un servidor: en la carpeta web/ ejecuta «python -m http.server 8001» y entra a http://localhost:8001");
  }
  const lista = doc && doc.pistas;
  if (!Array.isArray(lista) || lista.length !== 2 || lista.some((p) => CLAVES_PISTA.some((k) => !(k in p)))) {
    throw new Error("No pude leer la lista de pistas.");
  }
  return lista;
}

/* → {referencia, rasgos} con los rasgos ordenados por t_video; null si no se pueden leer */
export async function cargarRasgos(pista) {
  if (memoria.has(pista.id)) return memoria.get(pista.id);
  try {
    const doc = await leerJson(pista.rasgos);
    const rasgos = doc.rasgos.map((r, i) => ({ ...r, t_video: r.t_video ?? i * 0.5 }))
      .sort((a, b) => a.t_video - b.t_video);
    const res = { referencia: doc.referencia ?? null, rasgos };
    memoria.set(pista.id, res);
    return res;
  } catch (e) {
    return null;
  }
}

/* → el <id>_mapeo.json de la pista, o null si la pista no lo declara o no se puede leer (entonces no hay modo en vivo) */
export async function cargarMapeo(pista) {
  if (!pista.mapeo) return null;
  if (memoriaMapeo.has(pista.id)) return memoriaMapeo.get(pista.id);
  try {
    const m = await leerJson(pista.mapeo);
    if (!m || !m.escala || !m.paneo || !m.volumen) throw new Error("mapeo incompleto");
    memoriaMapeo.set(pista.id, m);
    return m;
  } catch (e) {
    return null;
  }
}

export async function cargarEquipo() {
  return leerJson("equipo.json");
}
