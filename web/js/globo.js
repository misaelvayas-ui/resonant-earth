/* Globo 3D: Tierra de día y de noche, atmósfera con glow Fresnel, órbitas con puntos y un anillo de sonido que
   se deforma con el espectro real del audio. Three.js se carga con import() solo cuando hace falta. */
"use strict";

const N = 256;                       // puntos del anillo
const RADIO_ANILLO = 1.22;
const DESPLAZAMIENTO_MAX = 0.16;
const VEL_ROTACION = 0.035;

const VERT_TIERRA = `
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vVistaW;
void main() {
  vUv = uv;
  vec4 pw = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vVistaW = cameraPosition - pw.xyz;
  gl_Position = projectionMatrix * viewMatrix * pw;
}`;
const FRAG_TIERRA = `
uniform sampler2D uDia; uniform sampler2D uNoche; uniform vec3 uSol; uniform float uPulso;
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vVistaW;
void main() {
  vec3 n = normalize(vNormalW);
  float luz = dot(n, normalize(uSol));
  float dia = smoothstep(-0.15, 0.35, luz);
  vec3 cDia = texture2D(uDia, vUv).rgb * (0.32 + 0.95 * max(luz, 0.0));
  vec3 cNoche = texture2D(uNoche, vUv).rgb * vec3(1.0, 0.86, 0.62) * 1.35;
  vec3 color = mix(cNoche, cDia, dia);
  float fres = pow(1.0 - max(dot(n, normalize(vVistaW)), 0.0), 3.0);
  color += vec3(0.30, 0.62, 1.0) * fres * (0.35 + 0.5 * uPulso);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;
const VERT_ATM = `
varying vec3 vNormalV;
void main() { vNormalV = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_ATM = `
uniform float uPulso; varying vec3 vNormalV;
void main() {
  float i = pow(max(0.0, 0.62 - dot(vNormalV, vec3(0.0, 0.0, 1.0))), 2.0);
  gl_FragColor = vec4(vec3(0.30, 0.62, 1.0) * i * (1.0 + 0.8 * uPulso), i);
}`;

let T = null;                        // módulo three
let renderer, escena, camara, grupo, tierra, anillo, geoAnillo, puntos = [], uniformes = [];
let listo = false, reducir = false, visible = true, oculta = false;
let rotacion = -0.20, fase = 0, t = 0, cuadros = 0;
let sol;

export function depuracion() {
  return { listo, rotacionY: rotacion, cuadros };
}

function circuloOrbita(radio, rx, rz, opacidad) {
  const pts = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    pts.push(new T.Vector3(radio * Math.cos(a), 0, radio * Math.sin(a)));
  }
  const geo = new T.BufferGeometry().setFromPoints(pts);
  const mat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: opacidad });
  const l = new T.LineLoop(geo, mat);
  l.rotation.x = rx; l.rotation.z = rz;
  return l;
}

function crearAnillo() {
  const pos = new Float32Array(N * 2 * 3);
  geoAnillo = new T.BufferGeometry();
  geoAnillo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = ((i + 1) % N) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  geoAnillo.setIndex(idx);
  const mat = new T.MeshBasicMaterial({ color: 0x86cdfa, side: T.DoubleSide, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
  anillo = new T.Mesh(geoAnillo, mat);
  anillo.rotation.x = -0.45; anillo.rotation.z = 0.22;
  anillo.frustumCulled = false;
}

function actualizarAnillo(nivel, bandas) {
  const pos = geoAnillo.attributes.position.array;
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N + fase;
    const k = i <= N / 2 ? i : N - i;
    const b = bandas ? bandas[Math.round((k / (N / 2)) * 63)] : 0;
    const reposo = 0.012 * Math.sin(6 * th + t * 1.2) * (1 - nivel);
    const r = RADIO_ANILLO + reposo + DESPLAZAMIENTO_MAX * b;
    const ri = r - 0.003, re = r + 0.003;
    pos[i * 6] = ri * Math.cos(th); pos[i * 6 + 1] = 0; pos[i * 6 + 2] = ri * Math.sin(th);
    pos[i * 6 + 3] = re * Math.cos(th); pos[i * 6 + 4] = 0; pos[i * 6 + 5] = re * Math.sin(th);
  }
  geoAnillo.attributes.position.needsUpdate = true;
}

function ajustarTamano(canvas) {
  const cap = canvas.parentElement;
  const w = Math.max(1, cap.clientWidth), h = Math.max(1, cap.clientHeight);
  renderer.setSize(w, h, false);
  const aspecto = w / h;
  camara.aspect = aspecto;
  let z = 2.6, y = -0.62;
  if (aspecto < 1.2) { z = Math.min(5.2, (2.6 * 1.2) / aspecto); y = -0.62 * (z / 2.6) * 0.9; }
  camara.position.set(0, 0, z);
  grupo.position.y = y;
  camara.updateProjectionMatrix();
  if (listo) renderer.render(escena, camara);
}

export async function iniciarGlobo(canvas, opciones = {}) {
  reducir = !!opciones.reducirMovimiento;
  try {
    T = await import("../vendor/three.module.min.js");
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return false;
  }
  try {
    const ancho = window.innerWidth;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ancho < 768 ? 1.5 : 2));
    const cargador = new T.TextureLoader();
    const [dia, noche] = await Promise.all([cargador.loadAsync("texturas/tierra-dia.jpg"), cargador.loadAsync("texturas/tierra-noche.jpg")]);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const tx of [dia, noche]) { tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = aniso; }

    escena = new T.Scene();
    camara = new T.PerspectiveCamera(35, 1.6, 0.1, 100);
    grupo = new T.Group();
    grupo.rotation.z = 0.41;
    escena.add(grupo);

    sol = new T.Vector3(0.8, 0.35, 0.8).normalize();
    const matTierra = new T.ShaderMaterial({
      uniforms: { uDia: { value: dia }, uNoche: { value: noche }, uSol: { value: sol }, uPulso: { value: 0 } },
      vertexShader: VERT_TIERRA, fragmentShader: FRAG_TIERRA,
    });
    tierra = new T.Mesh(new T.SphereGeometry(1, 96, 64), matTierra);
    tierra.rotation.y = rotacion;
    grupo.add(tierra);

    const matAtm = new T.ShaderMaterial({
      uniforms: { uPulso: { value: 0 } }, vertexShader: VERT_ATM, fragmentShader: FRAG_ATM,
      side: T.BackSide, blending: T.AdditiveBlending, transparent: true, depthWrite: false,
    });
    grupo.add(new T.Mesh(new T.SphereGeometry(1.045, 64, 48), matAtm));
    uniformes = [matTierra.uniforms.uPulso, matAtm.uniforms.uPulso];

    const o1 = circuloOrbita(1.42, -0.9, -0.35, 0.16);
    const o2 = circuloOrbita(1.62, -1.2, 0.5, 0.12);
    grupo.add(o1, o2);
    for (const [orb, radio, vel] of [[o1, 1.42, 0.25], [o2, 1.62, -0.18]]) {
      const m = new T.Mesh(new T.SphereGeometry(0.014, 12, 12), new T.MeshBasicMaterial({ color: 0xffffff }));
      orb.add(m);
      puntos.push({ m, radio, vel, ang: Math.random() * Math.PI * 2 });
    }
    crearAnillo();
    grupo.add(anillo);
    actualizarAnillo(0, null);

    ajustarTamano(canvas);
    new ResizeObserver(() => ajustarTamano(canvas)).observe(canvas.parentElement);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    document.addEventListener("visibilitychange", () => { oculta = document.hidden; });
    renderer.render(escena, camara);
    listo = true;
    canvas.classList.add("listo");
    return true;
  } catch (e) {
    console.warn("Globo 3D no disponible:", e);
    return false;
  }
}

export function cuadro(dt, nivel, bandas) {
  if (!listo || !visible || oculta || reducir) return;
  dt = Math.min(dt, 0.1);
  t += dt;
  fase += 0.10 * dt;
  rotacion += VEL_ROTACION * dt;
  tierra.rotation.y = rotacion;
  for (const p of puntos) {
    p.ang += p.vel * dt;
    p.m.position.set(p.radio * Math.cos(p.ang), 0, p.radio * Math.sin(p.ang));
  }
  actualizarAnillo(nivel, bandas);
  for (const u of uniformes) u.value = nivel;
  renderer.render(escena, camara);
  cuadros++;
}
