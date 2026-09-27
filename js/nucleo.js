'use strict';
/* =====================================================================
   Núcleo de UNIVERSO: rotaciones, utilidades de WebGL y las piezas que
   comparten las escenas (estelas, estrellas lejanas, cielos, volúmenes).
   ===================================================================== */

const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);   // suavizado independiente de los fps
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

/* ------------------------------------------------------------------ vectores y cuaterniones */
// [x, y, z, w]; mundo con Y hacia arriba, la cámara mira hacia -Z
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
          aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
function qaxis(ax, ang) { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; }
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { d = -d; b = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qnorm(a.map((x, i) => x + (b[i] - x) * t));
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((x, i) => x * wa + b[i] * wb);
}
// matriz 3x3 por columnas (lo que espera WebGL): local -> mundo
function qmat3(q) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([1 - (yy + zz), xy + wz, xz - wy, xy - wz, 1 - (xx + zz), yz + wx, xz + wy, yz - wx, 1 - (xx + yy)]);
}
const transpose3 = m => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
const yawOf = v => Math.atan2(-v[0], -v[2]);   // ángulo horizontal de una dirección (0 = -Z)

// cuaternión a partir de los tres ejes (columnas de la matriz de rotación)
function qFromBasis(X, Y, Z) {
  const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const tr = m00 + m11 + m22; let x, y, z, w, s;
  if (tr > 0) { s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  return qnorm([x, y, z, w]);
}
// orientación de una cámara que mira hacia dir
function lookQuat(dir, up = [0, 1, 0]) {
  const Z = vnorm(vscale(dir, -1));
  let X = vcross(up, Z); X = vlen(X) < 1e-6 ? [1, 0, 0] : vnorm(X);
  return qFromBasis(X, vcross(Z, X), Z);
}

// deviceorientation (alfa, beta, gama en grados) -> orientación de la cámara.
// Es la convención de three.js: la cámara mira por la parte de atrás del teléfono.
const Q_BACK = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
function sensorQuat(alpha, beta, gamma, screenDeg) {
  const x = beta * D2R / 2, y = alpha * D2R / 2, z = -gamma * D2R / 2;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  q = qmul(q, Q_BACK);
  return qmul(q, qaxis([0, 0, 1], -screenDeg * D2R));
}
function screenAngle() {
  const o = screen.orientation;
  if (o && typeof o.angle === 'number') return o.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

// el campo de visión se aplica al lado corto de la pantalla (vertical u horizontal da igual)
function projection(fov, aspect) {
  const ts = Math.tan(fov * D2R / 2), tx = aspect < 1 ? ts : ts * aspect, ty = aspect < 1 ? ts / aspect : ts;
  const n = 0.05, f = 2000;
  return { tx, ty, m: new Float32Array([1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]) };
}

/* ------------------------------------------------------------------ WebGL */
const canvas = $('#c');
const GLOPT = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
const gl = canvas.getContext('webgl', GLOPT) || canvas.getContext('experimental-webgl', GLOPT);
const EXT = { deriv: null, aniso: null, anisoMax: 1 };
const G = {};   // recursos compartidos (se rehacen si se pierde el contexto)

const HP = 'precision highp float;\n';
const FP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const fsPre = () => (EXT.deriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n' : '') + FP;

const TRI_VS = HP + 'attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }';

// ruido 3D con una sola lectura de textura por octava (truco de Íñigo Quílez)
const GLSL_NOISE = `
uniform sampler2D uNoise;
float noise(vec3 x){
  vec3 p = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
  vec2 rg = texture2D(uNoise, (uv + 0.5) / 256.0).yx;
  return mix(rg.x, rg.y, f.z);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
const GLSL_RAY = `
varying vec2 vNdc; uniform mat3 uCam; uniform vec2 uTan;
vec3 viewRay(){ return normalize(uCam * vec3(vNdc * uTan, -1.0)); }
`;
// coordenadas de un mapa equirectangular sin la costura donde atan salta de 1 a 0
const GLSL_SPH = `
vec2 sphUV(vec3 d){ return vec2(atan(d.x, d.z) * 0.15915494 + 0.5, acos(clamp(d.y, -1.0, 1.0)) * 0.31830989); }
vec4 texSph(sampler2D s, vec2 uv){
#ifdef HAS_DERIV
  float a = fract(uv.x), b = fract(uv.x + 0.5) - 0.5;
  return texture2D(s, vec2(fwidth(a) < fwidth(b) - 0.001 ? a : b, uv.y));
#else
  return texture2D(s, vec2(fract(uv.x), uv.y));
#endif
}
`;
// satura sin perder el color: los núcleos brillantes quedan naranjas o rosados, no blancos
const GLSL_TONE = `vec3 tone(vec3 c){ float m = max(max(c.r, c.g), c.b); vec3 h = c * ((1.0 - exp(-m)) / max(m, 1e-4)); return mix(h, 1.0 - exp(-c), 0.35); }`;

function compile(vs, fs, attrs) {
  const p = gl.createProgram();
  for (const [src, type] of [[vs, gl.VERTEX_SHADER], [fs, gl.FRAGMENT_SHADER]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  (attrs || ['aPos']).forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

function bindTri() {
  gl.bindBuffer(gl.ARRAY_BUFFER, G.triBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
}
function drawTri() { bindTri(); gl.drawArrays(gl.TRIANGLES, 0, 3); }

// uniformes que casi todos los pases de pantalla completa necesitan
function setView(prog, S) {
  if (prog.u.uCam) gl.uniformMatrix3fv(prog.u.uCam, false, S.cam);
  if (prog.u.uTan) gl.uniform2f(prog.u.uTan, S.P.tx, S.P.ty);
  if (prog.u.uTime) gl.uniform1f(prog.u.uTime, S.time);
}
function bindTex(prog, name, tex, unit, target) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target || gl.TEXTURE_2D, tex);
  if (prog.u[name]) gl.uniform1i(prog.u[name], unit);
}

// textura de ruido: el canal G es el R desplazado (37, 17) para interpolar en z con una sola lectura
// siempre el mismo ruido: así las nebulosas y los planetas inventados son iguales en cada viaje
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoiseTex() {
  const N = 256, r = new Uint8Array(N * N), data = new Uint8Array(N * N * 4), rnd = rng(20260926);
  for (let i = 0; i < r.length; i++) r[i] = rnd() * 256 | 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = r[y * N + x]; data[i + 1] = r[((y - 17) & 255) * N + ((x - 37) & 255)];
    data[i + 2] = rnd() * 256 | 0; data[i + 3] = 255;
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

// imágenes: se descargan una vez y quedan en memoria; la textura de GL se puede rehacer
const IMGS = {};
function loadImage(url) {
  if (!IMGS[url]) IMGS[url] = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { delete IMGS[url]; rej(new Error(url)); };
    im.src = url;
  });
  return IMGS[url];
}
function texFromImage(im) {
  const t = gl.createTexture(), mip = !!EXT.deriv;   // sin derivadas no hay arreglo de costura: sin mipmaps
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  if (EXT.aniso) gl.texParameterf(gl.TEXTURE_2D, EXT.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, EXT.anisoMax));
  return t;
}

// destino de dibujo a baja resolución para los volúmenes (nebulosas, galaxia)
function makeTarget() { return { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0 }; }
function sizeTarget(t, w, h) {
  if (t.w === w && t.h === h) return;
  t.w = w; t.h = h;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

const BLIT_FS = FP + `
varying vec2 vNdc; uniform sampler2D uTex;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c = texture2D(uTex, vNdc * 0.5 + 0.5).rgb;
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.006, max(c.r, max(c.g, c.b)));
  gl_FragColor = vec4(c, 1.0);
}`;

// volumen a baja resolución -> pantalla completa
function drawVolume(target, S, draw) {
  const w = Math.max(16, Math.round(S.W * S.volScale)), h = Math.max(16, Math.round(S.H * S.volScale));
  sizeTarget(target, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  draw();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, S.W, S.H);
  gl.useProgram(G.blit.p);
  bindTex(G.blit, 'uTex', target.tex, 0);
  drawTri();
}

/* ------------------------------------------------------------------ estelas y estrellas */
// Cada estrella es un rectángulo en pantalla que va de donde estaba (cola) a donde está (cabeza).
// Las estrellas viven en una caja que se repite alrededor de la cámara: el viaje nunca termina.
const STAR_VS = HP + `
attribute vec3 aBase; attribute vec2 aCorner; attribute vec2 aRand;
uniform vec3 uOff; uniform float uBox; uniform mat3 uView; uniform mat4 uProj;
uniform vec3 uVel; uniform float uStreak; uniform vec2 uRes; uniform float uFocal;
uniform float uRad; uniform float uMinPx; uniform float uBright; uniform float uNear; uniform vec3 uT; uniform float uSqueeze;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec2 uMix; uniform float uRainbow;
varying vec3 vCol; varying vec3 vGeo; varying float vR;
// adelante y a lo lejos las estrellas se juntan hacia el eje del viaje: el cúmulo denso del centro
vec3 tunnel(vec3 q){ float a = dot(q, uT); float s = mix(1.0, uSqueeze, smoothstep(uBox * 0.06, uBox * 0.42, a)); return uT * a + (q - uT * a) * s; }
vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main(){
  vec3 p = (fract(aBase - uOff + 0.5) - 0.5) * uBox;
  float dist = length(p);
  float fade = (1.0 - smoothstep(uBox * 0.27, uBox * 0.47, dist)) * (uNear > 0.0 ? smoothstep(uNear * 0.6, uNear, dist) : 1.0);
  vec3 h = uView * tunnel(p);
  vec3 t = uView * tunnel(p + uVel * uStreak);
  const float NZ = -0.06;
  if (fade <= 0.0 || (h.z > NZ && t.z > NZ)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vCol = vec3(0.0); vGeo = vec3(0.0); vR = 1.0; return; }
  if (h.z > NZ) h = mix(t, h, (NZ - t.z) / (h.z - t.z));
  if (t.z > NZ) t = mix(h, t, (NZ - h.z) / (t.z - h.z));
  vec4 ch = uProj * vec4(h, 1.0), ct = uProj * vec4(t, 1.0);
  vec2 sh = ch.xy / ch.w * 0.5 * uRes, st = ct.xy / ct.w * 0.5 * uRes;
  float depth = -h.z;
  float sz = 0.35 + 1.65 * aRand.y * aRand.y * aRand.y;
  float r = uRad * sz * uFocal / depth, k = 1.0;
  if (r < uMinPx) { k = sqrt(r / uMinPx); r = uMinPx; }
  r = min(r, uMinPx * 9.0);
  vec2 d = sh - st; float L = length(d);
  vec2 dir = L > 0.001 ? d / L : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float E = r * 3.0;
  float along = aCorner.y > 0.5 ? L + E : -E;
  gl_Position = vec4((st + dir * along + nrm * aCorner.x * E) / (0.5 * uRes), 0.0, 1.0);
  vGeo = vec3(along, aCorner.x * E, L); vR = r;
  float s = aRand.x; vec3 c;
  if (uRainbow > 0.5) c = mix(hue(fract(s * 7.13)), vec3(1.0), 0.2);
  else if (s < uMix.x) c = uC0; else if (s < uMix.y) c = uC1; else c = uC2;
  c *= 0.7 + 0.6 * fract(s * 91.7);
  vCol = c * fade * k * uBright * smoothstep(0.15, 1.6, depth) * mix(1.0, 0.55, smoothstep(40.0, 900.0, L));
}`;
const STAR_FS = FP + `
varying vec3 vCol; varying vec3 vGeo; varying float vR;
void main(){
  float x = clamp(vGeo.x, 0.0, vGeo.z);
  float r = length(vec2(vGeo.x - x, vGeo.y)) / vR;
  float t = vGeo.z > 0.0 ? x / vGeo.z : 1.0;
  float g = 0.05 + 0.95 * t * t;                       // la cola se apaga, la cabeza brilla
  float core = 1.0 - smoothstep(0.2, 1.0, r);
  float halo = exp(-r * r * 0.9) * 0.35;
  vec3 col = vCol * (core + halo) * g + vec3(core * core * g * 0.55) * dot(vCol, vec3(0.333));
  gl_FragColor = vec4(col, 1.0);
}`;
// estrellas lejanas: puntos fijos en el infinito; solo giran con la vista
const FAR_VS = HP + `
attribute vec3 aDir; attribute vec3 aInfo;
uniform mat3 uView; uniform mat4 uProj; uniform float uPx; uniform float uTime; uniform float uBright;
uniform vec3 uC0; uniform vec3 uC2;
varying vec3 vCol;
void main(){
  gl_Position = uProj * vec4(uView * aDir, 1.0);
  gl_PointSize = aInfo.x * uPx;
  float tw = 0.72 + 0.28 * sin(uTime * (0.6 + aInfo.z * 2.4) + aInfo.z * 57.0);
  vCol = mix(vec3(0.86, 0.9, 1.0), aInfo.z < 0.7 ? uC0 : uC2, 0.35) * aInfo.y * tw * uBright;
}`;
const FAR_FS = FP + `
varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(vCol * a * a, 1.0); }`;

const BOX = 120, WRAP = BOX * 4;
// dos capas con las mismas estrellas: cerca (estelas largas) y a lo lejos (el cúmulo del centro, más lento)
const LAYERS = [{ box: BOX, near: 0, squeeze: 1, rad: 0.06, bright: 1, seed: [0, 0, 0] },
                { box: BOX * 4, near: BOX * 0.4, squeeze: 0.16, rad: 0.15, bright: 1.3, seed: [0.37, 0.61, 0.13] }];

const Stars = {
  n: 0, farN: 0,
  gpu() {
    this.star = compile(STAR_VS, STAR_FS, ['aBase', 'aCorner', 'aRand']);
    this.far = compile(FAR_VS, FAR_FS, ['aDir', 'aInfo']);
    this.buf = gl.createBuffer(); this.idx = gl.createBuffer(); this.farBuf = gl.createBuffer();
    this.build(this.want || 9000); this.buildFar(2200);
  },
  build(n) {
    this.want = n;
    if (!this.buf) return;
    n = clamp(Math.round(n), 500, 16000);          // índices de 16 bits: 4 vértices por estrella
    const data = new Float32Array(n * 4 * 7), idx = new Uint16Array(n * 6);
    const corners = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (let i = 0, o = 0; i < n; i++) {
      const bx = Math.random(), by = Math.random(), bz = Math.random(), cs = Math.random(), ss = Math.random();
      for (const [cx, cy] of corners) { data[o++] = bx; data[o++] = by; data[o++] = bz; data[o++] = cx; data[o++] = cy; data[o++] = cs; data[o++] = ss; }
      const b = i * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    }
    this.n = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  },
  buildFar(n) {
    const data = new Float32Array(n * 6);
    const band = [0.35, 0.85, 0.4], bl = Math.hypot(...band);
    for (let i = 0, o = 0; i < n; i++) {
      let x, y, z, l;
      do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
      l = Math.sqrt(l); x /= l; y /= l; z /= l;
      // la mitad se acerca a la franja de la "vía láctea" para que el cielo tenga forma
      if (i % 2) { const k = 0.8 * (x * band[0] + y * band[1] + z * band[2]) / bl;
        x -= band[0] / bl * k; y -= band[1] / bl * k; z -= band[2] / bl * k; l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; }
      const r = Math.random();
      data[o++] = x; data[o++] = y; data[o++] = z;
      data[o++] = 1.4 + 2.6 * r * r * r;                    // tamaño en px
      data[o++] = 0.10 + 0.75 * Math.pow(Math.random(), 3); // brillo
      data[o++] = Math.random();                            // color y titileo
    }
    this.farN = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.farBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  },
  drawFar(S, bright, pal) {
    const F = this.far; gl.useProgram(F.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.farBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.disableVertexAttribArray(2);
    gl.uniformMatrix3fv(F.u.uView, false, S.view); gl.uniformMatrix4fv(F.u.uProj, false, S.P.m);
    gl.uniform1f(F.u.uPx, Math.max(1, S.dpr * 0.8)); gl.uniform1f(F.u.uTime, S.time); gl.uniform1f(F.u.uBright, bright);
    gl.uniform3fv(F.u.uC0, pal.c[0]); gl.uniform3fv(F.u.uC2, pal.c[2]);
    gl.drawArrays(gl.POINTS, 0, this.farN);
  },
  // o: { pos, vel, T, streak, bright, pal, rad }
  drawStreaks(S, o) {
    const St = this.star, pal = o.pal; gl.useProgram(St.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);      // luz que se suma: brillo sin fondo gris
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idx);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.uniformMatrix3fv(St.u.uView, false, S.view); gl.uniformMatrix4fv(St.u.uProj, false, S.P.m);
    gl.uniform3fv(St.u.uVel, o.vel); gl.uniform1f(St.u.uStreak, o.streak);
    gl.uniform2f(St.u.uRes, S.W, S.H); gl.uniform1f(St.u.uFocal, (S.H / 2) / S.P.ty);
    gl.uniform1f(St.u.uMinPx, Math.max(0.9, S.dpr * 0.75)); gl.uniform3fv(St.u.uT, o.T);
    gl.uniform3fv(St.u.uC0, pal.c[0]); gl.uniform3fv(St.u.uC1, pal.c[1]); gl.uniform3fv(St.u.uC2, pal.c[2]);
    gl.uniform2fv(St.u.uMix, pal.mix); gl.uniform1f(St.u.uRainbow, pal.rainbow ? 1 : 0);
    for (const Ly of o.layers || LAYERS) {
      gl.uniform3f(St.u.uOff, o.pos[0] / Ly.box + Ly.seed[0], o.pos[1] / Ly.box + Ly.seed[1], o.pos[2] / Ly.box + Ly.seed[2]);
      gl.uniform1f(St.u.uBox, Ly.box); gl.uniform1f(St.u.uNear, Ly.near); gl.uniform1f(St.u.uSqueeze, Ly.squeeze);
      gl.uniform1f(St.u.uRad, Ly.rad * (o.rad || 1)); gl.uniform1f(St.u.uBright, o.bright * Ly.bright);
      gl.drawElements(gl.TRIANGLES, this.n * 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.BLEND);
  }
};

/* ------------------------------------------------------------------ cielo de nebulosa horneado */
const BAKE_FS = HP + `
varying vec2 vNdc;
uniform vec3 uU; uniform vec3 uV; uniform vec3 uN; uniform vec3 uN0; uniform vec3 uN1; uniform vec3 uN2; uniform float uSeed; uniform float uGain;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vNdc.x * uU + vNdc.y * uV + uN);
  vec3 p = d * 1.7 + uSeed;
  float n = fbm(p), n2 = fbm(p * 2.3 + 7.1), lanes = fbm(p * 3.4 - 3.3);
  float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.85, 0.4))) * 2.3, 2.0));
  float c1 = smoothstep(0.40, 0.85, n), c2 = smoothstep(0.48, 0.92, n2);
  vec3 col = uN0 * c1 * (0.30 + 1.0 * band) + uN1 * c1 * c2 * 1.1 + uN2 * pow(c2, 4.0) * band * 0.8;
  col *= 0.45 + 0.55 * smoothstep(0.30, 0.70, lanes);
  gl_FragColor = vec4(col * 0.42 * uGain, 1.0);
}`;
const SKY_FS = FP + GLSL_RAY + `
uniform samplerCube uSky; uniform float uNeb; uniform vec3 uT; uniform vec3 uGlow;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 d = viewRay();
  vec3 c = textureCube(uSky, d).rgb * uNeb;
  float f = max(dot(d, uT), 0.0);
  c += uGlow * (pow(f, 120.0) * 0.12 + pow(f, 14.0) * 0.012) * uNeb;
  float m = max(c.r, max(c.g, c.b));
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * step(1.5 / 255.0, m);   // tramado: sin escalones, negro puro sigue apagado
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;
const FACES = [
  [[0, 0, -1], [0, -1, 0], [1, 0, 0]], [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
  [[1, 0, 0], [0, 0, 1], [0, 1, 0]],   [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[1, 0, 0], [0, -1, 0], [0, 0, 1]],  [[-1, 0, 0], [0, -1, 0], [0, 0, -1]]
];
// hornea la nebulosa en las 6 caras de un cubemap (una vez por paleta)
function bakeCube(tex, neb, size, seed, gain) {
  tex = tex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(), P = G.bake;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.useProgram(P.p); gl.disable(gl.BLEND); gl.viewport(0, 0, size, size);
  gl.uniform3fv(P.u.uN0, neb[0]); gl.uniform3fv(P.u.uN1, neb[1]); gl.uniform3fv(P.u.uN2, neb[2]);
  gl.uniform1f(P.u.uSeed, seed); gl.uniform1f(P.u.uGain, gain);
  let ok = true;
  for (let i = 0; i < 6; i++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { ok = false; break; }
    gl.uniform3fv(P.u.uU, FACES[i][0]); gl.uniform3fv(P.u.uV, FACES[i][1]); gl.uniform3fv(P.u.uN, FACES[i][2]);
    drawTri();
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
  return ok ? tex : null;
}
function drawSkyCube(S, tex, intensity, T, glow) {
  const P = G.sky; gl.useProgram(P.p); gl.disable(gl.BLEND);
  setView(P, S);
  bindTex(P, 'uSky', tex, 0, gl.TEXTURE_CUBE_MAP);
  gl.uniform1f(P.u.uNeb, intensity); gl.uniform3fv(P.u.uT, T); gl.uniform3fv(P.u.uGlow, glow);
  drawTri();
}

function gpuCore() {
  EXT.deriv = gl.getExtension('OES_standard_derivatives');
  EXT.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  if (EXT.aniso) EXT.anisoMax = gl.getParameter(EXT.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
  G.triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, G.triBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  G.noise = makeNoiseTex();
  G.blackCube = gl.createTexture();                  // para los pases que no usan cubemap
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, G.blackCube);
  for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  G.blit = compile(TRI_VS, BLIT_FS);
  G.bake = compile(TRI_VS, BAKE_FS);
  G.sky = compile(TRI_VS, SKY_FS);
  Stars.gpu();
}
