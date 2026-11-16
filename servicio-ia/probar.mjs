/* Prueba el servicio YA PUBLICADO con una frase de ejemplo, antes de conectarlo a la web.
   Uso (dentro de la carpeta servicio-ia):
       node probar.mjs https://rocola-guia-ia.TU-CUENTA.workers.dev
       node probar.mjs https://rocola-guia-ia.TU-CUENTA.workers.dev "llévame al año 1991"
   Gasta UNA petición de tu cupo gratuito de Gemini. No necesita ni muestra la clave. */
const [, , direccion, frase = "¿Por qué suena más agudo hacia el final?"] = process.argv;
if (!direccion || !/^https?:\/\//.test(direccion)) {
  console.log("Falta la dirección del servicio. Ejemplo:\n  node probar.mjs https://rocola-guia-ia.TU-CUENTA.workers.dev");
  process.exit(1);
}

// Un estado de página de ejemplo, con la misma forma que manda la web (web/guia-voz-ia.js).
const contexto = {
  pistas: [{ numero: 1, titulo: "Temperatura del planeta, 1880–2023" }, { numero: 2, titulo: "Corrientes y temperatura del mar, 2007–2008" }],
  pista: { numero: 1, titulo: "Temperatura del planeta, 1880–2023", de_que_trata: "Mapa mundial de anomalías de temperatura (GISTEMP, NASA). Cada anomalía compara la temperatura con el promedio de 1951–1980." },
  sonando: false, segundo: 22, duracion_segundos: 30, fecha_actual: 1991,
  lo_que_pasa_ahora: "Año 1991. Temperatura media: 0,43 °C por encima de la referencia. La zona caliente cubre el 14 % del mapa.",
  leyenda: "Temperatura media: altura de la nota, más aguda = más caliente. Tamaño de la zona caliente: volumen. Valor de referencia: tono grave fijo.",
  unidad: "°C", referencia: 0,
  serie_columnas: ["fecha o segundo", "media", "parte del mapa con zona caliente (0 a 1)"],
  serie: [[1881, -0.24, 0.01], [1911, -0.61, 0], [1951, -0.07, 0.02], [1981, 0.26, 0.06], [1991, 0.43, 0.14], [2011, 0.6, 0.2], [2023, 1.06, 0.57]],
  conversacion: [],
};

const AYUDA = {
  origen: "El servicio no acepta el origen de la prueba. En wrangler.toml, ORIGENES_PERMITIDOS debe incluir http://localhost:8000 (sin barra al final). Corrige y vuelve a publicar: npx wrangler deploy",
  sin_clave: "El servicio está publicado pero no tiene la clave. Guárdala con: npx wrangler secret put GEMINI_API_KEY",
  limite: "Se alcanzó un límite (del servicio o de Gemini). Espera un minuto y prueba otra vez. Si se repite, baja MAX_POR_MINUTO_GLOBAL o MAX_POR_DIA en wrangler.toml.",
  modelo: "Gemini respondió con error. Lo más probable: la clave no es válida, o el nombre del modelo (GEMINI_MODEL en wrangler.toml) ya no existe. Mira el detalle con: npx wrangler tail",
  tiempo: "Gemini tardó más de 5 segundos. Prueba otra vez.",
  respuesta_invalida: "Gemini respondió algo con una forma que el servicio no acepta. Prueba otra vez; si se repite, revisa callLLM() en src/nucleo.js.",
};

try {
  const salud = await fetch(direccion);
  console.log("1) ¿Está publicado?  ->", salud.status, await salud.text());
  const r = await fetch(direccion, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" }, body: JSON.stringify({ texto: frase, contexto }) });
  const cuerpo = await r.json().catch(() => ({}));
  console.log(`2) Frase de prueba: «${frase}»  ->  estado ${r.status}`);
  console.log(JSON.stringify(cuerpo, null, 2));
  if (r.ok && cuerpo.accion && typeof cuerpo.respuesta === "string") console.log("\nTODO BIEN: el servicio respondió con { accion, parametros, respuesta }. Ya puedes poner su dirección en web/guia-voz-config.js");
  else console.log("\nNO ESTÁ LISTO: " + (AYUDA[cuerpo.error] || "respuesta inesperada. Mira el detalle con: npx wrangler tail"));

  // 3) La voz humana (opcional). Gasta UNA petición del cupo del modelo de voz. Si falla, la web usa la voz del navegador.
  const t0 = Date.now();
  const v = await fetch(direccion.replace(/\/+$/, "") + "/voz", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" }, body: JSON.stringify({ texto: "Hola, soy Eco, la guía de Resonant Earth." }) });
  const ms = Date.now() - t0, tipo = v.headers.get("Content-Type") || "";
  if (v.ok && /^audio\//.test(tipo)) console.log(`\n3) Voz humana  ->  estado ${v.status}, ${tipo}, ${(await v.arrayBuffer()).byteLength} bytes en ${ms} ms.` + (ms > 3000 ? " OJO: tardó más de 3 s; la web usará casi siempre la voz del navegador." : " Bien."));
  else console.log(`\n3) Voz humana  ->  estado ${v.status} en ${ms} ms: ${JSON.stringify(await v.json().catch(() => ({})))}. La web usará la voz del navegador. Detalle con: npx wrangler tail`);
} catch (e) {
  console.log("No pude llegar al servicio. Revisa la dirección y tu conexión.\n  " + e.message);
  process.exit(1);
}
