/* Mide qué modelos de Gemini responden bien AHORA (para elegir el orden de GEMINI_MODELOS en wrangler.toml).
   Uso (dentro de la carpeta servicio-ia):   node probar-gemini.mjs
   La clave se pide por la terminal con entrada oculta: nunca va por argumento, no se imprime y no se guarda.
   Qué hace:
     0) Te dice cuántos caracteres recibió la clave (solo el número), para confirmar que el pegado funcionó.
     1) Pide la lista de modelos (GET /v1beta/models: solo nombre y métodos admitidos).
     2) Se queda con los de las familias Flash y Flash-Lite que admiten generateContent (máximo 6; sin imagen, voz,
        embeddings, live ni versiones con fecha) y a cada uno le hace dos pruebas, con tope de 15 s cada una:
          «Di hola»  y  la tarea real del servicio (la misma petición que arma callLLM: instrucciones, contexto, esquema JSON).
     3) Imprime una tabla modelo / prueba / HTTP / ms / resultado.
     4) Prueba además callLLM() completo con la configuración por defecto del servicio (con su lista de respaldo).
   Gasta unas 13 peticiones de tu cupo gratuito de Gemini.
   Documentación consultada el 15-nov-2026: aistudio.google.com/api-reference/generate-content (generateContent, ListModels)
   y aistudio.google.com/docs/thinking (gemini-3.8-flash admite thinkingLevel LOW, MEDIUM y HIGH; no MINIMAL). */
import { PROMPT_SISTEMA, ESQUEMA, construirEntrada, callLLM, config, armarPeticion } from "./src/nucleo.js";

const TOPE_MS = 15000;
const MAX_MODELOS = 6;
const BASE = "https://generativelanguage.googleapis.com/v1beta";

/* ---------- pedir la clave sin mostrarla ---------- */
function pedirClaveOculta(pregunta) {
  return new Promise((resolver, rechazar) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return rechazar(new Error("Hace falta una terminal interactiva: la clave no se acepta por argumento ni por tubería."));
    stdout.write(pregunta);
    let clave = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const alTecla = (t) => {
      for (const c of t) {
        if (c === "\u0003") { stdin.setRawMode(false); stdout.write("\n"); process.exit(130); }        // Ctrl+C
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", alTecla); stdout.write("\n");
          return resolver(clave.trim());
        }
        if (c === "\u007f" || c === "\b") clave = clave.slice(0, -1); else if (c >= " ") clave += c;
      }
    };
    stdin.on("data", alTecla);
  });
}

let CLAVE = "";
const sinClave = (t) => (CLAVE ? String(t).split(CLAVE).join("[clave]") : String(t));
const corto = (t, n) => sinClave(String(t).replace(/\s+/g, " ").trim()).slice(0, n);

function mensajeDeError(texto) {
  try {
    const e = JSON.parse(texto).error;
    if (e) return corto(`${e.status || e.code || ""}: ${e.message || ""}`, 120);
  } catch (x) { /* no es JSON */ }
  return null;
}

/* fetch con tope: { http, ms, texto } o { http: null, ms, motivo } */
async function pedir(url, opciones, tope = TOPE_MS) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tope);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { ...opciones, signal: control.signal, headers: { ...(opciones.headers || {}), "x-goog-api-key": CLAVE } });
    const texto = await r.text();                                  // el tiempo incluye leer toda la respuesta
    return { http: r.status, ms: Math.round(performance.now() - t0), texto };
  } catch (e) {
    return { http: null, ms: Math.round(performance.now() - t0), motivo: control.signal.aborted ? `sin respuesta en ${tope / 1000} s` : "falló la conexión" };
  } finally {
    clearTimeout(reloj);
  }
}

const textoDe = (d) => {
  const c = (d.candidates || [])[0] || {};
  const t = ((c.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  return t + (c.finishReason && c.finishReason !== "STOP" ? ` [${c.finishReason}]` : "");
};
function resultado(r, cuerpoUtil) {
  if (r.http === null) return r.motivo;
  if (r.http < 200 || r.http >= 300) return mensajeDeError(r.texto) || corto(r.texto, 120);
  try { return cuerpoUtil(JSON.parse(r.texto)); } catch (x) { return "respuesta ilegible: " + corto(r.texto, 80); }
}

/* ---------- la tarea real: contexto y esquema reales pero cortos ---------- */
const contexto = {
  idioma: "es",
  pistas: [{ numero: 1, titulo: "Temperatura del planeta, 1880–2023" }, { numero: 2, titulo: "Corrientes y temperatura del mar, 2007–2008" }],
  pista: { numero: 1, titulo: "Temperatura del planeta, 1880–2023", de_que_trata: "Mapa mundial de anomalías de temperatura (GISTEMP, NASA)." },
  sonando: false, segundo: 22, duracion_segundos: 30, fecha_actual: 1991,
  lo_que_pasa_ahora: "Año 1991. Temperatura media: 0,43 °C por encima de la referencia. La zona caliente cubre el 14 % del mapa.",
  leyenda: "Temperatura media: altura de la nota, más aguda = más caliente. Tamaño de la zona caliente: volumen.",
  calculado: { momento_actual: 0.43, maximo: { fecha: 2023, valor: 1.06 }, minimo: { fecha: 1911, valor: -0.61 } },
  conversacion: [],
};
const pedidoReal = { sistema: PROMPT_SISTEMA, entrada: construirEntrada("¿Por qué suena más agudo hacia el final?", contexto), esquema: ESQUEMA };

/* ---------- elegir los modelos ---------- */
const NO_SIRVEN = /image|imagen|veo|tts|audio|speech|live|embed|robot|computer|gemma|learnlm|aqa|vision|exp\b|-exp|deep-research|customtools|latest/i;
const CON_FECHA = /-(\d{3,}|\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/;
function elegirModelos(lista) {
  const buenos = lista
    .map((m) => ({ nombre: String(m.name || "").replace(/^models\//, ""), metodos: m.supportedGenerationMethods || [] }))
    .filter((m) => /^gemini-[\d.]+-flash(-lite)?(-preview)?(-[a-z]+)?$/.test(m.nombre) && /flash/.test(m.nombre))
    .filter((m) => m.metodos.includes("generateContent") && !NO_SIRVEN.test(m.nombre) && !CON_FECHA.test(m.nombre));
  const version = (n) => parseFloat(/^gemini-([\d.]+)/.exec(n)[1]);
  buenos.sort((a, b) => version(b.nombre) - version(a.nombre) || (a.nombre.includes("lite") ? 1 : 0) - (b.nombre.includes("lite") ? 1 : 0) || a.nombre.localeCompare(b.nombre));
  return buenos.slice(0, MAX_MODELOS);
}

/* ---------- ejecución ---------- */
try {
  CLAVE = await pedirClaveOculta("Pega la clave de Gemini (no se verá) y pulsa Enter: ");
} catch (e) {
  console.log(e.message);
  process.exit(1);
}
console.log(`Caracteres recibidos: ${CLAVE.length}  (una clave de Gemini suele tener unos 39; si ves 0 o un número muy distinto, el pegado no funcionó)`);
if (!CLAVE) process.exit(1);

// 1) lista de modelos
let modelos = [];
{
  const todos = [];
  let pagina = "";
  for (let i = 0; i < 10; i++) {
    const r = await pedir(`${BASE}/models?pageSize=200${pagina ? "&pageToken=" + encodeURIComponent(pagina) : ""}`, { method: "GET" });
    if (r.http !== 200) { console.log(`\nNo se pudo pedir la lista de modelos: HTTP ${r.http ?? "-"}, ${r.ms} ms, ${resultado(r, () => "")}`); break; }
    let d = {}; try { d = JSON.parse(r.texto); } catch (x) { /* queda vacío */ }
    todos.push(...(d.models || []));
    pagina = d.nextPageToken || "";
    if (!pagina) break;
  }
  console.log(`\nLa cuenta ve ${todos.length} modelos. Los de generateContent (nombre y métodos):`);
  for (const m of todos.filter((x) => (x.supportedGenerationMethods || []).includes("generateContent") && /flash/i.test(x.name)).slice(0, 60)) {
    console.log(`  ${String(m.name).replace(/^models\//, "")}  [${(m.supportedGenerationMethods || []).join(", ")}]`);
  }
  modelos = elegirModelos(todos);
  if (!modelos.length) console.log("\nNo encontré modelos Flash o Flash-Lite que admitan generateContent con esos filtros.");
}

// 2) las pruebas, una detrás de otra
const cfg = config({});
const filas = [];
for (const { nombre } of modelos) {
  const url = `${BASE}/models/${encodeURIComponent(nombre)}:generateContent`;
  const cabeceras = { "Content-Type": "application/json" };
  const hola = await pedir(url, { method: "POST", headers: cabeceras, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Di hola." }] }] }) });
  filas.push({ nombre, prueba: "di hola", r: hola, texto: resultado(hola, (d) => `«${corto(textoDe(d), 40)}»`) });
  const { cuerpo } = armarPeticion(nombre, pedidoReal, cfg);
  const tarea = await pedir(url, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) });
  filas.push({ nombre, prueba: "tarea real", r: tarea, texto: resultado(tarea, (d) => { const t = textoDe(d); try { const o = JSON.parse(t); return `JSON ok, acción «${o.accion}»`; } catch (x) { return "no es JSON: " + corto(t, 60); } }) });
}

// 3) la tabla
const col = (t, n) => String(t).padEnd(n).slice(0, n);
if (filas.length) {
  console.log("\n" + col("modelo", 30) + col("prueba", 12) + col("HTTP", 6) + col("ms", 8) + "resultado");
  console.log("-".repeat(100));
  for (const f of filas) console.log(col(f.nombre, 30) + col(f.prueba, 12) + col(f.r.http ?? "-", 6) + col(f.r.ms, 8) + f.texto);
  const buenos = [...new Set(filas.map((f) => f.nombre))].filter((n) => filas.filter((f) => f.nombre === n).every((f) => f.r.http === 200 && !/^no es JSON|ilegible|^\[/.test(f.texto)));
  console.log(`\nResponden bien las dos pruebas: ${buenos.length ? buenos.join(", ") : "ninguno"}.`);
  console.log("Para elegir el orden, pon en wrangler.toml, por ejemplo:  GEMINI_MODELOS = \"primero,segundo\"  y publica de nuevo.");
}

// 4) el servicio completo (callLLM con su lista y su presupuesto por defecto)
{
  const t0 = performance.now();
  const avisos = [], aviso = console.warn;
  console.warn = (...a) => avisos.push(sinClave(a.join(" ")));
  let fin;
  try { const o = await callLLM(pedidoReal, { GEMINI_API_KEY: CLAVE }, fetch); fin = `bien, acción «${o.accion}»`; } catch (e) { fin = "falló: " + sinClave(e.message); } finally { console.warn = aviso; }
  console.log(`\ncallLLM() con la configuración por defecto (${cfg.modelos.join(", ")}; presupuesto ${cfg.esperaModeloMs} ms): ${fin} en ${Math.round(performance.now() - t0)} ms`);
  for (const a of avisos) console.log("  registro del servicio: " + a);
}

console.log("\nListo. La clave no se imprimió ni se guardó.");
