/* Pruebas de la web con Playwright y axe-core (V1 a V29).
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
  await page.evaluate(() => { const a = document.getElementById("avance"); a.value = 27; a.dispatchEvent(new Event("input", { bubbles: true })); });
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

  // ---- Pulido (V16 a V23) ----
  const pul = await nuevaPagina(browser, { viewport: { width: 1118, height: 800 } });
  const pg = pul.page;
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  // V21a: la lista "Qué vas a oír" nunca se ve vacía (se mide al instante, sin esperar a las animaciones)
  const lista0 = await pg.evaluate(() => [...document.querySelectorAll(".escucha-lista > div")].map((d) => Number(getComputedStyle(d).opacity)));
  await esperar(2500);
  const lista1 = await pg.evaluate(() => [...document.querySelectorAll(".escucha-lista > div")].map((d) => Number(getComputedStyle(d).opacity)));
  comprobar("V21", lista0.length === 4 && lista0.every((o) => o === 1) && lista1.every((o) => o === 1),
    `opacidad de "Qué vas a oír" al cargar ${lista0.join("/")} y a los 2,5 s ${lista1.join("/")}`);

  // V22: 1118 px, menú en una línea, cifra 344 sin montarse, botón de ancho fijo
  const geo = await pg.evaluate(() => {
    const caja = (e) => e.getBoundingClientRect();
    const enlaces = [...document.querySelectorAll(".barra nav li:not(.solo-menu) a")].map((a) => caja(a).height);
    const f = [...document.querySelectorAll(".cifra-ficha")].map(caja);
    const t = caja(document.getElementById("tarjeta-temperatura"));
    const solapa = f.some((c) => c.right > t.left && c.left < t.right && c.bottom > t.top && c.top < t.bottom);
    const colRight = caja(document.querySelector(".cifras")).right;
    return { altos: enlaces, solapa, fuera: Math.max(...f.map((c) => c.right)) - colRight, tarjetaIzq: t.left, fichaDer: Math.max(...f.map((c) => c.right)) };
  });
  const unaLinea = geo.altos.every((h) => h < 40);
  comprobar("V22", unaLinea && !geo.solapa && geo.fuera <= 1,
    `1118 px: altos de los enlaces ${geo.altos.map((h) => Math.round(h)).join("/")} (una línea < 40); cifras ${Math.round(geo.fichaDer)} px vs tarjeta desde ${Math.round(geo.tarjetaIzq)} px; solapan: ${geo.solapa}`);
  await pg.screenshot({ path: path.join(carpeta, "heroe-1118.png") });
  const cifrasTab = await pg.$eval(".cifras", (e) => e.getAttribute("tabindex"));

  // V16: textos y cifras
  await pg.click("button.pista >> nth=0");
  await pg.waitForFunction(() => window.__web.audio.estado().duracion > 0, null, { timeout: 15000 });
  const t1 = await pg.$eval("#titulo-pista", (e) => e.textContent);
  const fueraCredito = await pg.evaluate(() => { const c = document.querySelector("main").innerText + document.title + document.querySelector("meta[name=description]").content; return /1880/.test(c); });
  const mar = pistasDoc[1];
  const reloj0 = await pg.$eval("#tiempo", (e) => e.textContent);
  await pg.click("button.pista >> nth=1");
  await pg.waitForFunction(() => window.__web.rocola.pistaActual().id === "sst-ecco2-2007-2008" && window.__web.audio.estado().duracion > 0, null, { timeout: 15000 });
  const relojMar = await pg.$eval("#tiempo", (e) => e.textContent);
  const desc = await pg.$eval("#descripcion-pista", (e) => e.textContent);
  const leyenda = await pg.$eval("#leyenda-pista", (e) => e.textContent);
  const hero = await pg.$eval(".heroe-sub", (e) => e.textContent);
  comprobar("V16", t1.includes("1881–2023") && !fueraCredito && reloj0.endsWith("/ 0:30") && relojMar === "0:00,0 / 0:30,5" && desc.startsWith("344 días de océano (mar 2007–mar 2008)")
    && !/un año/i.test(desc + hero) && /índice relativo/.test(leyenda) && /colores del video original/.test(leyenda) && mar.duracion_s === 30.5,
    `título «${t1}»; "1880" fuera del crédito: ${fueraCredito}; reloj GISTEMP «${reloj0}», mar «${relojMar}»; descripción «${desc.slice(0, 48)}…»`);

  // V19: al terminar, el estado lo dice y el botón vuelve a "Reproducir" (pista del mar, 30,5 s)
  await pg.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 });   // elegir una pista ya la reproduce
  await pg.evaluate(() => window.__web.audio.buscar(28.8));
  await pg.waitForFunction(() => window.__web.audio.estado().terminado, null, { timeout: 15000 }).catch(() => {});
  await esperar(500);
  const fin = await pg.evaluate(() => ({ estado: document.getElementById("estado-rocola").textContent, boton: document.getElementById("btn-reproducir").textContent, tiempo: document.getElementById("tiempo").textContent }));
  comprobar("V19", fin.estado === `Terminó: ${mar.titulo}` && fin.boton === "Reproducir" && fin.tiempo === "0:30,5 / 0:30,5", `estado «${fin.estado}»; botón «${fin.boton}»; contador «${fin.tiempo}»`);

  // V17: gráfico accesible e interactivo
  const g = await pg.$eval("#grafico-pista", (e) => ({ rol: e.getAttribute("role"), etiqueta: e.getAttribute("aria-label"), oculto: e.getAttribute("aria-hidden"), tab: e.getAttribute("tabindex"), nota: e.getAttribute("aria-valuenow"), texto: e.getAttribute("aria-valuetext") }));
  const caja = await pg.$eval("#grafico-pista svg", (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await pg.evaluate(() => document.getElementById("grafico-pista").scrollIntoView({ block: "center", behavior: "instant" }));
  const caja2 = await pg.$eval("#grafico-pista svg", (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await pg.mouse.click(caja2.x + caja2.w * 0.5, caja2.y + caja2.h / 2);
  await esperar(400);
  const tClic = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  await pg.focus("#grafico-pista");
  for (let i = 0; i < 4; i++) await pg.keyboard.press("ArrowLeft");
  const aria = await pg.$eval("#grafico-pista", (e) => e.getAttribute("aria-valuetext"));
  await pg.keyboard.press("Enter");
  await esperar(400);
  const tEnter = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  comprobar("V17", g.rol === "slider" && !g.oculto && g.tab === "0" && /Enter/.test(g.etiqueta) && Math.abs(tClic - 15.25) < 0.8 && tEnter < tClic - 1 && /^\w+ 20\d\d: índice/.test(aria),
    `rol ${g.rol}, aria-hidden ${g.oculto}; clic al 50 % -> ${tClic.toFixed(1)} s; 4 flechas atrás + Enter -> ${tEnter.toFixed(1)} s; valuetext «${aria}»`);

  // V18: atajos globales
  await pg.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__web.audio.buscar(10); });
  await pg.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await esperar(300);
  await pg.keyboard.press("Space");
  await esperar(900);
  const suenaEsp = await pg.evaluate(() => window.__web.audio.estado().sonando);
  await pg.keyboard.press("Space");
  await esperar(300);
  const pausa = await pg.evaluate(() => !window.__web.audio.estado().sonando);
  const a0 = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  await pg.keyboard.press("ArrowRight"); await esperar(300);
  const a1 = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  await pg.keyboard.press("ArrowLeft"); await pg.keyboard.press("ArrowLeft"); await esperar(300);
  const a2 = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  await pg.focus("#volumen");
  const vol0 = await pg.$eval("#volumen", (e) => e.value);
  await pg.keyboard.press("ArrowLeft"); await esperar(300);
  const vol1 = await pg.$eval("#volumen", (e) => e.value);
  const a3 = await pg.evaluate(() => window.__web.audio.estado().tiempo);
  const paso = await pg.$eval("#avance", (e) => e.step);
  const atajoTxt = await pg.$eval("#accesibilidad", (e) => e.textContent);
  comprobar("V18", suenaEsp && pausa && Math.abs(a1 - a0 - 5) < 0.3 && Math.abs(a2 - a1 + 10) < 0.3 && vol1 !== vol0 && Math.abs(a3 - a2) < 0.1 && paso === "1" && /Espacio/.test(atajoTxt) && /5 s/.test(atajoTxt),
    `Espacio suena ${suenaEsp}/pausa ${pausa}; → ${(a1 - a0).toFixed(1)} s; ← ← ${(a2 - a1).toFixed(1)} s; con foco en el volumen las flechas cambian el volumen (${vol0} -> ${vol1}) y no el tiempo; paso del avance ${paso} s`);

  // V20: el aria-live no va atrasado ni se atasca con frases largas
  await pg.evaluate(() => { document.getElementById("anunciar").checked = true; window.__log = []; window.__w = 0;
    new MutationObserver(() => { const v = document.getElementById("lectura-viva").textContent; if (v) window.__log.push({ ms: Math.round(performance.now()), viva: v, panel: document.getElementById("ahora-fecha").textContent }); })
      .observe(document.getElementById("lectura-viva"), { childList: true, characterData: true, subtree: true }); });
  await pg.click("button.pista >> nth=0");
  await pg.waitForFunction(() => window.__web.rocola.pistaActual().id === "gistemp-1880-2023" && window.__web.audio.estado().duracion > 0, null, { timeout: 15000 });
  await pg.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 });
  await pg.evaluate(() => { window.__log.length = 0; window.__web.audio.buscar(0); });
  await esperar(16000);
  const reg = await pg.evaluate(() => window.__log);
  const iguales = reg.every((r) => r.viva.startsWith(r.panel));
  const cortas = reg.every((r) => r.viva.length <= 40);
  const huecos = reg.slice(1).map((r, i) => r.ms - reg[i].ms).slice(1);    // el primer hueco incluye el paso de pausa a reproducción
  comprobar("V20", reg.length >= 3 && iguales && cortas && huecos.every((h) => h >= 2900),
    `${reg.length} anuncios en 16 s; cada uno dice el año que muestra el panel en ese instante: ${iguales}; frases de ≤ 40 caracteres: ${cortas} («${(reg[reg.length - 1] || {}).viva}»); separación mínima ${Math.min(...huecos)} ms`);

  // V21b: fecha sobre el video
  const fv = await pg.evaluate(() => { const e = document.getElementById("fecha-video"); const c = getComputedStyle(e); const r = e.getBoundingClientRect(), m = document.querySelector(".marco").getBoundingClientRect();
    return { oculto: e.hidden, aria: e.getAttribute("aria-hidden"), texto: e.textContent, panel: document.getElementById("ahora-fecha").textContent, fondo: c.backgroundColor, dentro: r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom }; });
  comprobar("V21b", !fv.oculto && fv.aria === "true" && fv.texto === fv.panel && fv.dentro && /rgba\(0, 0, 0, 0\.7/.test(fv.fondo),
    `fecha sobre el video «${fv.texto}» = panel «${fv.panel}»; aria-hidden ${fv.aria}; fondo ${fv.fondo}; dentro del video: ${fv.dentro}`);

  // V22b: el botón y el gráfico no se mueven al pasar de Reproducir a Pausar
  const antes = await pg.evaluate(() => ({ b: document.getElementById("btn-reproducir").getBoundingClientRect().width, g: document.getElementById("grafico-pista").getBoundingClientRect().top + window.scrollY, t: document.getElementById("btn-reproducir").textContent }));
  await pg.click("#btn-reproducir");
  await esperar(500);
  const despues = await pg.evaluate(() => ({ b: document.getElementById("btn-reproducir").getBoundingClientRect().width, g: document.getElementById("grafico-pista").getBoundingClientRect().top + window.scrollY, t: document.getElementById("btn-reproducir").textContent }));
  await pg.click("#btn-reproducir");
  comprobar("V22b", antes.t !== despues.t && Math.abs(antes.b - despues.b) < 0.5 && Math.abs(antes.g - despues.g) < 0.5 && cifrasTab === null,
    `botón «${antes.t}» ${antes.b.toFixed(0)} px -> «${despues.t}» ${despues.b.toFixed(0)} px; el gráfico se movió ${(despues.g - antes.g).toFixed(1)} px; tabindex de .cifras a 1118 px: ${cifrasTab}`);
  await pul.ctx.close();

  // V23: menú móvil a 390 px
  const m3 = await nuevaPagina(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = m3.page;
  await mp.goto(url, { waitUntil: "load" });
  await esperar(2000);
  const cerrado = await mp.evaluate(() => ({ boton: getComputedStyle(document.getElementById("btn-menu")).display, exp: document.getElementById("btn-menu").getAttribute("aria-expanded"), nav: getComputedStyle(document.getElementById("menu-principal")).display }));
  await mp.tap("#btn-menu");
  await esperar(300);
  const abierto = await mp.evaluate(() => ({ exp: document.getElementById("btn-menu").getAttribute("aria-expanded"), nav: getComputedStyle(document.getElementById("menu-principal")).display, enlaces: [...document.querySelectorAll("#menu-principal a")].filter((a) => a.offsetParent).map((a) => a.textContent.trim()) }));
  await mp.screenshot({ path: path.join(carpeta, "menu-390.png") });
  await mp.keyboard.press("Escape");
  const trasEsc = await mp.evaluate(() => ({ exp: document.getElementById("btn-menu").getAttribute("aria-expanded"), foco: document.activeElement.id }));
  await mp.tap("#btn-menu"); await esperar(200);
  await mp.tap("#menu-principal a[href='#accesibilidad']"); await esperar(500);
  const trasElegir = await mp.evaluate(() => ({ exp: document.getElementById("btn-menu").getAttribute("aria-expanded"), y: Math.round(document.getElementById("accesibilidad").getBoundingClientRect().top) }));
  const esperados = ["La rocola", "Cómo funciona", "El porqué", "Accesibilidad", "Equipo", "Repositorio"];
  const cifras390 = await mp.$eval(".cifras", (e) => e.getAttribute("tabindex"));
  comprobar("V23", cerrado.boton !== "none" && cerrado.exp === "false" && cerrado.nav === "none" && abierto.exp === "true" && abierto.nav !== "none"
    && JSON.stringify(abierto.enlaces) === JSON.stringify(esperados) && trasEsc.exp === "false" && trasEsc.foco === "btn-menu" && trasElegir.exp === "false" && Math.abs(trasElegir.y) < 120 && cifras390 === "0",
    `menú cerrado: nav ${cerrado.nav}; abierto: ${abierto.enlaces.join(", ")}; Esc -> aria-expanded ${trasEsc.exp}, foco en #${trasEsc.foco}; al elegir -> ${trasElegir.exp}, sección a ${trasElegir.y} px; carrusel de cifras enfocable: ${cifras390}`);
  await m3.ctx.close();

  // ---- Sonido en vivo y gráfico (V24 a V29) ----
  const vi = await nuevaPagina(browser);
  const vp = vi.page;
  await vp.goto(url, { waitUntil: "load" });
  await esperar(2000);
  // V24: el AudioContext no existe hasta un gesto; el modo por defecto es la pista original
  const antes24 = await vp.evaluate(() => ({ ctx: window.__web.audio.contexto(), modo: window.__web.audio.modo(), selector: document.getElementById("modo-sonido").disabled, rasgos: document.getElementById("rasgos-vivo").disabled }));
  await vp.click("button.pista >> nth=0");
  await vp.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 });
  await esperar(500);
  const des24 = await vp.evaluate(() => ({ ctx: window.__web.audio.contexto() && window.__web.audio.contexto().state, modo: window.__web.audio.modo(), selector: document.getElementById("modo-sonido").disabled, rasgos: document.getElementById("rasgos-vivo").disabled,
    marcado: document.querySelector('input[name="modo-sonido"]:checked').value, ayuda: document.getElementById("modo-ayuda").textContent }));
  comprobar("V24", antes24.ctx === null && antes24.modo === "original" && antes24.selector === true && antes24.rasgos === true && des24.rasgos === true && des24.ctx === "running" && des24.modo === "original" && des24.selector === false && des24.marcado === "original" && /Pista original/.test(des24.ayuda),
    `antes de tocar nada: AudioContext ${antes24.ctx}, selector deshabilitado ${antes24.selector}; tras elegir pista: contexto ${des24.ctx}, modo ${des24.modo}, marcado «${des24.marcado}», selector habilitado ${!des24.selector}`);

  // V25: sonido en vivo con teclado; pausa, búsqueda, velocidad y final
  await vp.click("#btn-reproducir");                                             // pausa la pista original
  await vp.focus('input[name="modo-sonido"][value="original"]');
  await vp.keyboard.press("ArrowRight");                                         // → «Sonido en vivo»
  await esperar(300);
  const modo25 = await vp.evaluate(() => ({ modo: window.__web.audio.modo(), activo: window.__web.vivo.estado().activo, estado: document.getElementById("estado-rocola").textContent }));
  await vp.evaluate(() => window.__web.audio.buscar(0));
  await vp.click("#btn-reproducir");
  let fuertes25 = 0, maxAmp25 = 0;
  for (let i = 0; i < 20; i++) { const a = await vp.evaluate(() => window.__web.audio.amplitud()); if (a > 0.02) fuertes25++; maxAmp25 = Math.max(maxAmp25, a); await esperar(150); }
  const sonando25 = await vp.evaluate(() => ({ ...window.__web.vivo.estado(), t: window.__web.audio.estado().tiempo }));
  // pausa
  await vp.click("#btn-reproducir");
  const calla = await vp.waitForFunction(() => window.__web.audio.amplitud() < 0.02, null, { timeout: 1000 }).then(() => true).catch(() => false);
  const p1 = await vp.evaluate(() => window.__web.vivo.estado().programados); await esperar(600);
  const p2 = await vp.evaluate(() => window.__web.vivo.estado().programados);
  // búsqueda
  await vp.click("#btn-reproducir");
  await esperar(400);
  await vp.evaluate(() => { window.__web.audio.buscar(20); });
  const salto = await vp.waitForFunction(() => { const u = window.__web.vivo.estado().ultimo; return u && u.t >= 19.9; }, null, { polling: 20, timeout: 3000 }).then(() => true).catch(() => false);
  const ult20 = await vp.evaluate(() => window.__web.vivo.estado().ultimo);
  // velocidad ×2
  await vp.evaluate(() => window.__web.audio.buscar(8)); await esperar(700);
  const v0 = await vp.evaluate(() => ({ p: window.__web.vivo.estado().programados, t: window.__web.audio.estado().tiempo }));
  await vp.evaluate(() => { document.getElementById("medio").playbackRate = 2; });
  await esperar(2000);
  const v1 = await vp.evaluate(() => ({ p: window.__web.vivo.estado().programados, t: window.__web.audio.estado().tiempo }));
  await vp.evaluate(() => { document.getElementById("medio").playbackRate = 1; });
  const golpesTramo = await vp.evaluate(async ([a, b]) => { const M = await import("/js/mapeo.js"); const D = await import("/js/datos.js"); const pi = (await D.cargarPistas())[0]; const m = await D.cargarMapeo(pi);
    return M.eventos(m, M.calcularSerie(m, (await D.cargarRasgos(pi)).rasgos)).filter((x) => x.t >= a && x.t < b).length; }, [v0.t, v1.t]);
  // final
  await vp.evaluate(() => window.__web.audio.buscar(29));
  await vp.waitForFunction(() => window.__web.audio.estado().terminado, null, { timeout: 15000 }).catch(() => {});
  await esperar(400);
  const fin25 = await vp.evaluate(() => ({ sonando: window.__web.vivo.estado().sonando, estado: document.getElementById("estado-rocola").textContent, boton: document.getElementById("btn-reproducir").textContent }));
  comprobar("V25", modo25.modo === "vivo" && modo25.activo && /Sonido en vivo/.test(modo25.estado) && fuertes25 >= 5 && sonando25.programados > 3 && Math.abs(sonando25.ultimo.t - sonando25.t) < 0.3
    && calla && p2 === p1 && salto && ult20.t >= 19.9 && ult20.t <= 20.6 && Math.abs((v1.p - v0.p) - golpesTramo) <= 2 && v1.t - v0.t > 3.5
    && fin25.sonando === false && fin25.estado === "Terminó: Temperatura del planeta" && fin25.boton === "Reproducir",
    `teclado → modo ${modo25.modo}; amplitud > 0,02 en ${fuertes25} de 20 (máx ${maxAmp25.toFixed(2)}), ${sonando25.programados} golpes, último a ${Math.abs(sonando25.ultimo.t - sonando25.t).toFixed(2)} s del video; pausa: calla ${calla}, golpes ${p1} -> ${p2}; buscar(20): último golpe ${ult20 && ult20.t}; ×2: ${(v1.t - v0.t).toFixed(1)} s de pista en 2 s, ${v1.p - v0.p} golpes de ${golpesTramo}; final: sonando ${fin25.sonando}, «${fin25.estado}»`);

  // V26: casillas de rasgos (siguen en la misma pista, ahora en vivo)
  await vp.evaluate(() => window.__web.audio.buscar(0));
  await vp.click("#btn-reproducir");
  await vp.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 5000 });
  const hab26 = await vp.evaluate(() => !document.getElementById("rasgos-vivo").disabled);
  await vp.uncheck("#rasgo-tono"); await vp.uncheck("#rasgo-volumen"); await vp.uncheck("#rasgo-paneo");
  const txt26a = await vp.$eval("#estado-rocola", (e) => e.textContent);
  await esperar(500);
  const g0 = await vp.evaluate(() => window.__web.vivo.estado().programados);
  let amp26 = 0;
  for (let i = 0; i < 8; i++) { amp26 = Math.max(amp26, await vp.evaluate(() => window.__web.audio.amplitud())); await esperar(125); }
  const g1 = await vp.evaluate(() => window.__web.vivo.estado().programados);
  await vp.check("#rasgo-tono"); await vp.check("#rasgo-volumen"); await vp.check("#rasgo-paneo");
  await vp.focus("#rasgo-dron");
  await vp.keyboard.press("Space");                                              // el dron se apaga con el teclado
  await esperar(300);
  const r26 = await vp.evaluate(() => window.__web.vivo.estado().rasgos);
  const txt26b = await vp.$eval("#estado-rocola", (e) => e.textContent);
  const h0 = await vp.evaluate(() => window.__web.vivo.estado().programados); await esperar(1200);
  const h1 = await vp.evaluate(() => window.__web.vivo.estado().programados);
  await vp.keyboard.press("Space");
  await vp.uncheck("#rasgo-tono"); await vp.uncheck("#rasgo-volumen"); await vp.uncheck("#rasgo-paneo"); await vp.uncheck("#rasgo-dron");
  const txt26c = await vp.$eval("#estado-rocola", (e) => e.textContent);
  await vp.evaluate(() => window.__web.audio.pausar());
  await vp.check("#rasgo-tono"); await vp.check("#rasgo-volumen"); await vp.check("#rasgo-paneo"); await vp.check("#rasgo-dron");
  comprobar("V26", hab26 && /^Suenan: Dron\.?$/.test(txt26a) && g1 === g0 && amp26 > 0.02 && r26.dron === false && r26.tono && /Suenan: Melodía, Volumen, Paneo\./.test(txt26b) && h1 > h0 && txt26c === "No suena ningún rasgo.",
    `solo dron: «${txt26a}», amplitud ${amp26.toFixed(2)}, golpes ${g0} -> ${g1}; sin dron (teclado): «${txt26b}», golpes ${h0} -> ${h1}; nada: «${txt26c}»`);


  // V28: render sin conexión de las dos pistas: dron ~7 dB bajo la melodía y dron continuo (ESPEC §6)
  const r28 = await vp.evaluate(async () => {
    const D = await import("/js/datos.js"); const salida = [];
    const potDb = (bf, a, z) => { let t = 0; for (let c = 0; c < bf.numberOfChannels; c++) { const d = bf.getChannelData(c); for (let i = a; i < z; i++) t += d[i] * d[i]; } return 10 * Math.log10(t / (z - a) + 1e-20); };
    for (const pi of await D.cargarPistas()) {
      const m = await D.cargarMapeo(pi), R = (await D.cargarRasgos(pi)).rasgos, V = window.__web.vivo;
      const todo = await V.renderizar(m, R);
      const mel = await V.renderizar(m, R, { tono: true, volumen: true, paneo: true, dron: false });
      const dron = await V.renderizar(m, R, { tono: false, volumen: false, paneo: false, dron: true });
      const w = Math.round(todo.sampleRate * 0.5), n = Math.floor(todo.length / w);
      const db = Array.from({ length: n }, (_, k) => potDb(todo, k * w, (k + 1) * w));
      salida.push({ id: pi.id, dif: potDb(mel, 0, mel.length) - potDb(dron, 0, dron.length), minimo: Math.min(...db), caida: Math.max(...db.slice(1).map((v, i) => db[i] - v)) });
    }
    return salida;
  });
  comprobar("V28", r28.length === 2 && r28.every((r) => r.dif >= 5.5 && r.dif <= 8.5 && r.minimo > -40 && r.caida <= 12),
    r28.map((r) => `${r.id}: dron ${r.dif.toFixed(2)} dB bajo la melodía (5,5 a 8,5), ventana más baja ${r.minimo.toFixed(1)} dB (> −40), mayor caída ${r.caida.toFixed(1)} dB (≤ 12)`).join("; "));


  // V29: aria-valuenow/valuetext del gráfico siguen al video sin saturar al lector (máx. 1 por segundo) y cambian al instante con el clic
  const g29 = await nuevaPagina(browser);
  const gp = g29.page;
  await gp.goto(url, { waitUntil: "load" });
  await esperar(2000);
  await gp.click("button.pista >> nth=0");
  await gp.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 });
  await gp.evaluate(() => { window.__aria = []; new MutationObserver((ms) => ms.forEach((m) => { if (m.attributeName === "aria-valuetext") window.__aria.push(performance.now()); }))
    .observe(document.getElementById("grafico-pista"), { attributes: true }); });
  await esperar(6000);
  const marcas = await gp.evaluate(() => window.__aria.slice());
  const hueco29 = marcas.slice(1).map((t, i) => t - marcas[i]);
  await gp.evaluate(() => document.getElementById("grafico-pista").scrollIntoView({ block: "center", behavior: "instant" }));
  const c29 = await gp.$eval("#grafico-pista svg", (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await gp.mouse.click(c29.x + c29.w * 0.75, c29.y + c29.h / 2);
  await esperar(150);
  const clic29 = await gp.$eval("#grafico-pista", (e) => ({ now: e.getAttribute("aria-valuenow"), texto: e.getAttribute("aria-valuetext") }));
  comprobar("V29", marcas.length >= 3 && marcas.length <= 7 && hueco29.every((h) => h >= 950) && clic29.now === "45" && /^1993:/.test(clic29.texto),
    `en 6 s de reproducción: ${marcas.length} cambios de aria-valuetext (3 a 7), separación mínima ${Math.round(Math.min(...hueco29))} ms (≥ 950); clic al 75 %: valuenow ${clic29.now}, valuetext «${clic29.texto}»`);
  await g29.ctx.close();

  // V27: modo recordado por pista, axe con los controles habilitados, y 390 px
  await vp.click("#modo-sonido input[value=vivo]");
  await vp.click("button.pista >> nth=1");
  await vp.waitForFunction(() => window.__web.rocola.pistaActual().id === "sst-ecco2-2007-2008" && !document.getElementById("modo-sonido").disabled, null, { timeout: 15000 });
  await esperar(500);
  const sst27 = await vp.evaluate(() => ({ marcado: document.querySelector('input[name="modo-sonido"]:checked').value, modo: window.__web.audio.modo(), rasgos: document.getElementById("rasgos-vivo").disabled }));
  await vp.click("#modo-sonido input[value=vivo]");
  await esperar(300);
  await vp.click("button.pista >> nth=0");
  await vp.waitForFunction(() => window.__web.rocola.pistaActual().id === "gistemp-1880-2023" && !document.getElementById("modo-sonido").disabled, null, { timeout: 15000 });
  await esperar(500);
  const gis27 = await vp.evaluate(() => ({ marcado: document.querySelector('input[name="modo-sonido"]:checked').value, modo: window.__web.audio.modo(), activo: window.__web.vivo.estado().activo, rasgos: document.getElementById("rasgos-vivo").disabled }));
  await vp.evaluate(() => window.__web.audio.pausar());
  await vp.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));      // como V2: el hero atenuado por el paralaje falsearía el contraste
  await esperar(800);
  const axe27 = await new AxeBuilder({ page: vp }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const mv = await nuevaPagina(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mv.page.goto(url, { waitUntil: "load" });
  await esperar(2000);
  await mv.page.tap("button.pista >> nth=0");
  await mv.page.waitForFunction(() => window.__web.audio.estado().sonando, null, { timeout: 15000 });
  const alto = () => mv.page.evaluate(() => ["rasgos-vivo", "grafico-pista"].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top + window.scrollY)));
  await esperar(1500);                                                           // que termine de asentarse el layout tras elegir la pista
  const antesVivo27 = await alto();
  await mv.page.tap("#modo-sonido input[value=vivo]");
  await esperar(600);
  const trasVivo27 = await alto();
  await mv.page.tap("#modo-sonido input[value=original]");
  await esperar(400);
  const trasOriginal27 = await alto();
  await mv.page.tap("#modo-sonido input[value=vivo]");
  await esperar(400);
  const mov27 = await mv.page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth, modo: window.__web.audio.modo(), rasgos: !document.getElementById("rasgos-vivo").disabled }));
  await mv.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await esperar(800);
  const axeM27 = await new AxeBuilder({ page: mv.page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  await mv.page.screenshot({ path: path.join(carpeta, "vivo-390.png") });
  await mv.ctx.close();
  const resumen27 = (r) => r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(" ")}`).join("; ");
  comprobar("V27", sst27.marcado === "original" && sst27.modo === "original" && sst27.rasgos === true && gis27.marcado === "vivo" && gis27.modo === "vivo" && gis27.activo && gis27.rasgos === false
    && axe27.violations.length === 0 && axeM27.violations.length === 0 && mov27.ancho <= mov27.ventana && mov27.modo === "vivo" && mov27.rasgos
    && antesVivo27.join() === trasVivo27.join() && antesVivo27.join() === trasOriginal27.join(),
    `SST: «${sst27.marcado}»; GISTEMP al volver: «${gis27.marcado}» (modo ${gis27.modo}); axe 1440 ${axe27.violations.length} ${resumen27(axe27)}, 390 ${axeM27.violations.length} ${resumen27(axeM27)}; 390 px: ancho ${mov27.ancho}/${mov27.ventana}; posición de las casillas y del gráfico (original / vivo / original): ${antesVivo27.join("+")} / ${trasVivo27.join("+")} / ${trasOriginal27.join("+")}`);
  await vi.ctx.close();

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLA` : "\nTodo PASA (o está OMITIDA)");
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
