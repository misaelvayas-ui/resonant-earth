/* Pruebas de la web con Playwright y axe-core (V1 a V15).
   Uso:  NODE_PATH=<carpeta con node_modules> node web/pruebas/verificar.cjs <url> <carpeta de capturas>
   Imprime [PASA], [FALLA] u [OMITIDA] por comprobación y sale con código 1 si hay alguna [FALLA].

   El Chromium de Playwright no trae H.264 ni AAC (no reproduce los .mp4 de la web). Si defines WEBM_DIR,
   las peticiones a assets/<id>.mp4 se contestan con <WEBM_DIR>/<id>.webm (el mismo audio y video en VP8 y
   Opus), solo para estas pruebas:  ffmpeg -i web/assets/<id>.mp4 -c:v libvpx -b:v 400k -c:a libopus <id>.webm */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const url = (process.argv[2] || "http://localhost:8137/").replace(/\/?$/, "/");
const carpeta = process.argv[3] || "capturas";
const webm = process.env.WEBM_DIR;
fs.mkdirSync(carpeta, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
function informar(id, estado, texto) {
  if (estado === "FALLA") fallas++;
  console.log(`[${estado}] ${id} ${texto}`);
}
const comprobar = (id, ok, texto) => informar(id, ok ? "PASA" : "FALLA", texto);

async function nuevaPagina(browser, opciones, peticiones) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opciones });
  const page = await ctx.newPage();
  const registro = { consola: [], malas: [], peticiones: peticiones || [] };
  page.on("console", (m) => { if (m.type() === "error") registro.consola.push(m.text()); });
  page.on("pageerror", (e) => registro.consola.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) registro.malas.push(`${r.status()} ${r.url()}`); });
  page.on("request", (r) => registro.peticiones.push(r.url()));
  if (webm) {
    await page.route("**/assets/*.mp4", (route) => {
      const nombre = path.basename(new URL(route.request().url()).pathname, ".mp4");
      const f = path.join(webm, nombre + ".webm");
      if (fs.existsSync(f)) route.fulfill({ path: f, contentType: "video/webm" });
      else route.continue();
    });
  }
  return { ctx, page, registro };
}

async function desplazarTodo(page) {
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= alto; y += 500) { await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), y); await esperar(120); }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await esperar(1000);
}

(async () => {
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const pistasDoc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "pistas.json"), "utf8")).pistas;
  const rasgosG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "gistemp_1880_2023_rasgos.json"), "utf8"));
  const fechasG = rasgosG.rasgos.map((r) => String(r.fecha));

  const { ctx, page, registro } = await nuevaPagina(browser);
  await page.goto(url, { waitUntil: "load" });
  await esperar(2500);

  // V1
  comprobar("V1", registro.consola.length === 0 && registro.malas.length === 0,
    `carga a 1440x900: ${registro.consola.length} errores de consola, ${registro.malas.length} respuestas >= 400 ${registro.consola.concat(registro.malas).slice(0, 3).join(" | ")}`);

  // V4 y V5 (antes de interactuar)
  const botones = await page.$$eval("button.pista", (bs) => bs.map((b) => b.dataset.id));
  const prohibidos = registro.peticiones.filter((u) => /catalogo\.json|ejemplo_sintetico|logo/.test(u));
  comprobar("V4", botones.length === 2 && botones[0] === "gistemp-1880-2023" && botones[1] === "sst-ecco2-2007-2008" && prohibidos.length === 0,
    `pistas: ${botones.join(", ")}; peticiones de la web anterior: ${prohibidos.length}`);
  const mp4Antes = registro.peticiones.filter((u) => u.endsWith(".mp4"));
  const tresPedido = registro.peticiones.some((u) => u.includes("three.module.min.js"));
  const tresEnScript = await page.$$eval("script[src]", (ss) => ss.some((s) => s.src.includes("three")));
  comprobar("V5", mp4Antes.length === 0 && tresPedido && !tresEnScript,
    `antes de interactuar: ${mp4Antes.length} mp4 pedidos; three.module.min.js pedido: ${tresPedido}; <script src> con three: ${tresEnScript}`);

  // V12 globo gira
  const listo = await page.waitForFunction(() => window.__web && window.__web.globo().listo, null, { timeout: 12000 }).then(() => true).catch(() => false);
  if (!listo) {
    const vis = await page.$eval(".globo-respaldo", (e) => getComputedStyle(e).display !== "none");
    informar("V12", vis ? "OMITIDA" : "FALLA", `sin WebGL en este navegador; .globo-respaldo visible: ${vis}`);
  } else {
    const a = await page.evaluate(() => window.__web.globo().rotacionY);
    await esperar(1500);
    const b = await page.evaluate(() => window.__web.globo().rotacionY);
    comprobar("V12", Math.abs(b - a) > 0.01, `rotacionY ${a.toFixed(4)} -> ${b.toFixed(4)} en 1,5 s`);
  }
  await page.screenshot({ path: path.join(carpeta, "heroe-1440.png") });

  // V6 teclado
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.activeElement && document.activeElement.blur(); });
  await page.keyboard.press("Tab");
  const primero = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press("Enter");
  await esperar(600);
  const enRocola = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.press("Tab");
  const alPista = await page.evaluate(() => document.activeElement.className + "|" + document.activeElement.dataset.id);
  await page.keyboard.press("Enter");
  const suena = await page.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const estadoTxt = await page.$eval("#estado-rocola", (e) => e.textContent);
  comprobar("V6", primero.includes("saltar") && enRocola === "rocola" && alPista.startsWith("pista") && suena && estadoTxt.startsWith("Suena"),
    `primer Tab: ${primero}; Enter -> foco en #${enRocola}; Tab -> ${alPista}; suena: ${suena}; estado: «${estadoTxt}»`);

  // V7 reacción al audio
  let fuertes = 0, bandaMax = 0;
  for (let i = 0; i < 20; i++) {
    const r = await page.evaluate(() => ({ a: window.__web.audio.amplitud(), b: Math.max(...window.__web.audio.espectro()) }));
    if (r.a > 0.02) fuertes++;
    bandaMax = Math.max(bandaMax, r.b);
    await esperar(150);
  }
  comprobar("V7", fuertes >= 5 && bandaMax > 0.05, `amplitud > 0,02 en ${fuertes} de 20 lecturas; banda máxima ${bandaMax.toFixed(2)}`);

  // V8 lectura en vivo
  await esperar(1200);
  const fecha = await page.$eval("#ahora-fecha", (e) => e.textContent.trim());
  const texto = await page.$eval("#ahora-texto", (e) => e.textContent);
  comprobar("V8", fechasG.includes(fecha) && fecha !== fechasG[0] && texto.includes("°C"), `fecha «${fecha}»; texto «${texto}»`);
  await page.evaluate(() => document.querySelector(".rocola-rejilla").scrollIntoView({ behavior: "instant" }));
  await esperar(500);
  await page.screenshot({ path: path.join(carpeta, "rocola-1440.png") });

  // V9 avance y gráfico
  await page.evaluate(() => { const a = document.getElementById("avance"); a.value = 900; a.dispatchEvent(new Event("input", { bubbles: true })); });
  await esperar(800);
  const t9 = await page.evaluate(() => window.__web.audio.estado().tiempo);
  const x9 = await page.$eval(".cursor-linea", (l) => Number(l.getAttribute("x1")));
  comprobar("V9", t9 >= 26 && t9 <= 28.5 && x9 > 500, `tiempo ${t9.toFixed(1)} s; x del cursor ${x9.toFixed(0)} de 600`);

  // V10 cambio de pista
  await page.click("#btn-cambiar");
  const sst = await page.waitForFunction(() => window.__web.rocola.pistaActual().id === "sst-ecco2-2007-2008" && window.__web.audio.estado().sonando, null, { timeout: 15000 }).then(() => true).catch(() => false);
  await esperar(800);
  const t10 = await page.$eval("#ahora-texto", (e) => e.textContent);
  comprobar("V10", sst && t10.includes("índice"), `SST suena: ${sst}; lectura «${t10}»`);

  // V11 pausa
  await page.click("#btn-reproducir");
  const pausado = await page.waitForFunction(() => !window.__web.audio.estado().sonando && window.__web.audio.amplitud() < 0.02, null, { timeout: 2500 }).then(() => true).catch(() => false);
  comprobar("V11", pausado, "tras Pausar: sonando false y amplitud < 0,02 en menos de 2,5 s");

  // V13 globo en pausa fuera de pantalla
  if (listo) {
    await page.evaluate(() => document.getElementById("equipo").scrollIntoView({ behavior: "instant" }));
    await esperar(800);
    const c1 = await page.evaluate(() => window.__web.globo().cuadros);
    await esperar(1000);
    const c2 = await page.evaluate(() => window.__web.globo().cuadros);
    comprobar("V13", c1 === c2, `cuadros del globo fuera de pantalla: ${c1} -> ${c2}`);
  } else informar("V13", "OMITIDA", "sin WebGL");

  // V15 capturas de página completa (1440)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await desplazarTodo(page);
  await page.screenshot({ path: path.join(carpeta, "pagina-1440.png"), fullPage: true });

  // V2 axe 1440
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await esperar(800);
  const ax1 = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  // V3 desborde
  const anchos = [360, 390, 768, 1024, 1440];
  const desbordes = [];
  for (const w of anchos) {
    await page.setViewportSize({ width: w, height: 900 });
    await esperar(400);
    const r = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (r[0] > r[1]) desbordes.push(`${w}px: ${r[0]}`);
    if (w === 768) { await desplazarTodo(page); await page.screenshot({ path: path.join(carpeta, "pagina-768.png"), fullPage: true }); }
  }
  comprobar("V3", desbordes.length === 0, desbordes.length ? "desborde horizontal en " + desbordes.join(", ") : "sin desborde horizontal a 360, 390, 768, 1024 y 1440 px");
  await ctx.close();

  // móvil: axe y capturas
  const mov = await nuevaPagina(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mov.page.goto(url, { waitUntil: "load" });
  await esperar(2500);
  await mov.page.screenshot({ path: path.join(carpeta, "heroe-390.png") });
  const ax2 = await new AxeBuilder({ page: mov.page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  await desplazarTodo(mov.page);
  await mov.page.screenshot({ path: path.join(carpeta, "pagina-390.png"), fullPage: true });
  await mov.ctx.close();
  const resumen = (r) => r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(" ")}`).join("; ");
  comprobar("V2", ax1.violations.length === 0 && ax2.violations.length === 0,
    `axe 1440x900: ${ax1.violations.length} violaciones ${resumen(ax1)}; 390x844: ${ax2.violations.length} violaciones ${resumen(ax2)}`);

  // V14 movimiento reducido
  const red = await nuevaPagina(browser, { reducedMotion: "reduce" });
  await red.page.goto(url, { waitUntil: "load" });
  await esperar(2500);
  const listo2 = await red.page.waitForFunction(() => window.__web && window.__web.globo().listo, null, { timeout: 12000 }).then(() => true).catch(() => false);
  let rotOk = true, rotTxt = "sin WebGL";
  if (listo2) {
    const a = await red.page.evaluate(() => window.__web.globo().rotacionY);
    await esperar(1500);
    const b = await red.page.evaluate(() => window.__web.globo().rotacionY);
    rotOk = Math.abs(b - a) < 1e-6; rotTxt = `rotacionY ${a.toFixed(6)} -> ${b.toFixed(6)}`;
  }
  await desplazarTodo(red.page);
  const rr = await red.page.evaluate(() => ({
    revelar: [...document.querySelectorAll(".revelar")].filter((e) => Number(getComputedStyle(e).opacity) < 0.99).length,
    cifras: [...document.querySelectorAll(".cifra")].every((c) => c.textContent.trim() === c.dataset.valor),
    lineas: [...document.querySelectorAll(".linea-pipeline")].every((l) => Number(getComputedStyle(l).strokeDashoffset.replace("px", "")) === 0),
  }));
  comprobar("V14", rotOk && rr.revelar === 0 && rr.cifras && rr.lineas,
    `${rotTxt}; .revelar con opacidad < 1: ${rr.revelar}; cifras con su valor: ${rr.cifras}; líneas del pipeline dibujadas: ${rr.lineas}`);
  await red.ctx.close();

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLA` : "\nTodo PASA (o está OMITIDA)");
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
