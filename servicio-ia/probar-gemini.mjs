/* Aísla por qué Gemini no contesta a tiempo (504 "tiempo"). Corre tres pruebas con el tiempo medido y tope de 40 s cada una:
     A) la petición EXACTA que hace hoy callLLM() (API de Interacciones, mismo cuerpo y encabezados),
     B) la misma tarea con el endpoint clásico generateContent (con esquema y razonamiento "low"),
     C) una petición mínima de generateContent: «di hola».
   Uso (dentro de la carpeta servicio-ia):   node probar-gemini.mjs
   La clave se pide por la terminal con entrada oculta: nunca va por argumento, no se imprime y no se guarda.
   Gasta tres peticiones de tu cupo gratuito de Gemini.
   Documentación consultada el 15-nov-2026 (aistudio.google.com/api-reference/generate-content y /docs/thinking):
     generateContent usa systemInstruction, contents, generationConfig.responseMimeType, generationConfig.responseJsonSchema,
     generationConfig.maxOutputTokens y generationConfig.thinkingConfig.thinkingLevel (gemini-3.8-flash: low, medium, high; no minimal). */
import { PROMPT_SISTEMA, ESQUEMA, construirEntrada, callLLM, config } from "./src/nucleo.js";

const TOPE_MS = 40000;
const MODELO = process.env.GEMINI_MODEL || "gemini-3.8-flash";   // el nombre del modelo no es secreto

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

/* ---------- un contexto y un esquema reales pero cortos ---------- */
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
const FRASE = "¿Por qué suena más agudo hacia el final?";
const entrada = construirEntrada(FRASE, contexto);

/* ---------- utilidades de informe ---------- */
let CLAVE = "";
const sinClave = (t) => (CLAVE ? String(t).split(CLAVE).join("[clave]") : String(t));
const resumen = (texto) => sinClave(String(texto).replace(/\s+/g, " ").trim()).slice(0, 200);

function mensajeDeError(texto) {
  try {
    const e = JSON.parse(texto).error;
    if (e) return sinClave(`${e.status || e.code || ""}: ${String(e.message || "").replace(/\s+/g, " ").trim()}`.slice(0, 300));
  } catch (x) { /* no es JSON */ }
  return null;
}

/* Hace un fetch con tope, y devuelve { http, ms, texto, abortado, fallo }. */
async function pedir(url, opciones) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TOPE_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { ...opciones, signal: control.signal });
    const texto = await r.text();                       // el tiempo incluye leer toda la respuesta
    return { http: r.status, ms: Math.round(performance.now() - t0), texto };
  } catch (e) {
    return { http: null, ms: Math.round(performance.now() - t0), abortado: control.signal.aborted, fallo: sinClave(e && e.name ? e.name : "error") };
  } finally {
    clearTimeout(reloj);
  }
}

function informar(nombre, r, extraerTexto) {
  console.log(`\n${nombre}`);
  if (r.http === null) {
    console.log(`  HTTP: sin respuesta   Tiempo: ${r.ms} ms`);
    console.log(`  ${r.abortado ? `Pasaron ${TOPE_MS / 1000} s sin respuesta completa (tope de la prueba).` : "Falló la conexión: " + r.fallo}`);
    return;
  }
  console.log(`  HTTP: ${r.http}   Tiempo: ${r.ms} ms`);
  if (r.http >= 200 && r.http < 300) {
    let texto = r.texto;
    try { texto = extraerTexto(JSON.parse(r.texto)) || r.texto; } catch (x) { /* se muestra el cuerpo tal cual */ }
    console.log("  Respuesta (primeros 200 caracteres): " + resumen(texto));
  } else {
    console.log("  Error: " + (mensajeDeError(r.texto) || resumen(r.texto)));
  }
}

const textoInteraccion = (d) => (d.steps || []).filter((p) => p && p.type === "model_output").flatMap((p) => p.content || []).map((c) => c.text || "").join("") + (d.status && d.status !== "completed" ? `  [estado: ${d.status}]` : "");
const textoGenerar = (d) => ((d.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("") + ((d.candidates || [])[0]?.finishReason && d.candidates[0].finishReason !== "STOP" ? `  [finishReason: ${d.candidates[0].finishReason}]` : "");

const urlGenerar = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

/* ---------- las tres pruebas ---------- */
try {
  CLAVE = await pedirClaveOculta("Pega la clave de Gemini (no se verá) y pulsa Enter: ");
} catch (e) {
  console.log(e.message);
  process.exit(1);
}
if (!CLAVE) { console.log("No escribiste ninguna clave."); process.exit(1); }
console.log(`\nModelo: ${MODELO}. Tope por prueba: ${TOPE_MS / 1000} s. Las pruebas corren una detrás de otra.`);

// A) EXACTAMENTE lo que hace el servicio: se llama a la propia callLLM() con un fetch que mide y guarda lo que contesta Google.
{
  const env = { GEMINI_API_KEY: CLAVE, GEMINI_MODEL: MODELO, ESPERA_MODELO_MS: String(TOPE_MS) };
  const cfg = config(env);
  let visto = null;
  const t0 = performance.now();
  const medido = async (url, op) => {
    const r = await fetch(url, op);
    const texto = await r.clone().text();
    visto = { http: r.status, ms: Math.round(performance.now() - t0), texto };
    return r;
  };
  const avisos = [];
  const avisoOriginal = console.warn;
  console.warn = (...a) => avisos.push(sinClave(a.join(" ")));     // el registro de callLLM no se mezcla con el informe
  let fallo = null;
  try { await callLLM({ sistema: PROMPT_SISTEMA, entrada, esquema: ESQUEMA }, env, medido); } catch (e) { fallo = e; } finally { console.warn = avisoOriginal; }
  if (visto) {
    informar(`A) Interacciones (lo que hace callLLM hoy: razonamiento "${cfg.razonamiento}", tope de salida ${cfg.maxSalida})`, visto, textoInteraccion);
    if (fallo) console.log(`  callLLM terminó con: ${sinClave(fallo.message)}`);
    for (const a of avisos) console.log("  Registro del servicio: " + a);
  } else {
    informar("A) Interacciones (lo que hace callLLM hoy)", { http: null, ms: Math.round(performance.now() - t0), abortado: fallo && fallo.tipo === "tiempo", fallo: fallo ? sinClave(fallo.message) : "error" });
  }
}

// B) La misma tarea con generateContent.
{
  const cuerpo = {
    systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
    contents: [{ role: "user", parts: [{ text: entrada }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: ESQUEMA,
      maxOutputTokens: config({}).maxSalida,
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  };
  const r = await pedir(urlGenerar, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": CLAVE }, body: JSON.stringify(cuerpo) });
  informar('B) generateContent, misma tarea (systemInstruction, contents, responseMimeType + responseJsonSchema, thinkingLevel "LOW")', r, textoGenerar);
}

// C) Petición mínima.
{
  const cuerpo = { contents: [{ role: "user", parts: [{ text: "Di hola." }] }] };
  const r = await pedir(urlGenerar, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": CLAVE }, body: JSON.stringify(cuerpo) });
  informar("C) generateContent mínima: «Di hola.»", r, textoGenerar);
}

console.log("\nListo. La clave no se imprimió ni se guardó; cierra la terminal o bórrala del portapapeles.");
