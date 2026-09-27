'use strict';
/* =====================================================================
   Escenas de vuelo libre (hiperespacio y nebulosas) y la galaxia.
   Cada escena: gpu() crea sus recursos, update(S) mueve la nave,
   render(S) dibuja. S trae la cámara, el tiempo y la música del cuadro.
   ===================================================================== */

// vuelo libre: la nave avanza por mot.T; con "voy hacia donde miro" el rumbo sigue la mirada
const mot = { T: [0, 0, -1], pos: [0, 0, 0], speed: 0 };
function freeFlight(S, base) {
  if (S.cfg.heading === 'follow' && S.started) {
    const k = ease(S.dt, 0.9), T = mot.T, f = S.fwd;
    mot.T = vnorm([T[0] + (f[0] - T[0]) * k, T[1] + (f[1] - T[1]) * k, T[2] + (f[2] - T[2]) * k]);
  }
  const target = S.started ? base * S.throttle : base * 0.12;
  mot.speed += (target - mot.speed) * ease(S.dt, S.started ? 2.2 : 1);
  for (let i = 0; i < 3; i++) { mot.pos[i] = (mot.pos[i] + mot.T[i] * mot.speed * S.dt) % WRAP; if (mot.pos[i] < 0) mot.pos[i] += WRAP; }
}

/* ------------------------------------------------------------------ hiperespacio */
const Hiper = {
  id: 'hiper', name: 'Hiperespacio', sub: 'Estelas a la velocidad de la luz', free: true, fovTurbo: 12,
  gpu() { this.cube = null; this.baked = ''; },
  bake(S) {
    const key = S.cfg.palette + S.cfg.quality;
    if (this.baked === key) return;
    this.cube = bakeCube(this.cube, PALETTES[S.cfg.palette].neb, S.cfg.quality === 'alta' ? 512 : 256, 3.7, 1);
    this.baked = key;
  },
  update(S) { freeFlight(S, 22); },
  render(S) {
    const pal = PALETTES[S.cfg.palette];
    if (S.cfg.nebula > 0.01) { this.bake(S); }
    if (S.cfg.nebula > 0.01 && this.cube) drawSkyCube(S, this.cube, S.cfg.nebula * (1 + S.kick * 0.25), mot.T, pal.c[0]);
    else { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    Stars.drawFar(S, S.bright, pal);
    Stars.drawStreaks(S, { pos: mot.pos, vel: vscale(mot.T, mot.speed), T: mot.T, streak: 0.12 * S.cfg.streak, bright: S.bright, pal });
  }
};

/* ------------------------------------------------------------------ nebulosas volumétricas */
// Una nube infinita de gas: ruido 3D retorcido con filamentos, núcleos que brillan y polvo que tapa.
// Se dibuja a baja resolución y se estira a la pantalla (la nube es suave, no se nota).
const NEB_FS = STEPS => fsPre() + GLSL_RAY + GLSL_NOISE + GLSL_TONE + `
uniform vec3 uRo; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCold; uniform vec3 uBg; uniform float uGain;
void main(){
  vec3 rd = viewRay();
  vec3 col = vec3(0.0); float tr = 1.0;
  float dt = 0.8;
  float t = 0.3 + hash12(gl_FragCoord.xy) * dt;
  for (int i = 0; i < ${STEPS}; i++) {
    vec3 q = (uRo + rd * t) * 0.05;
    q += (vec3(noise(q * 0.6), noise(q * 0.6 + 19.1), noise(q * 0.6 + 41.7)) - 0.5) * 2.2;   // nubes retorcidas
    float base = 0.62 * noise(q) + 0.38 * noise(q * 2.03 + vec3(1.3, 4.1, 2.7));
    float r1 = 1.0 - abs(2.0 * noise(q * 4.1 + vec3(7.2, 3.3, 1.1)) - 1.0);             // filamentos
    float r2 = 1.0 - abs(2.0 * noise(q * 8.7 + vec3(2.9, 8.1, 5.5)) - 1.0);
    float n = base + 0.22 * (r1 * r1 * 0.66 + r2 * r2 * 0.34) - 0.12;
    float dens = smoothstep(0.37, 0.62, n);
    if (dens > 0.001) {
      float core = smoothstep(0.55, 0.75, n);                                             // núcleos que brillan
      vec3 ecol = mix(mix(uCold, uMid, smoothstep(0.37, 0.52, n)), uHot, core);
      float dust = smoothstep(0.55, 0.72, noise(q * 1.3 + 50.0)) * (1.0 - core);          // polvo oscuro
      col += tr * ecol * (dens * dens * 0.07 + core * core * 0.55) * dt;
      tr *= exp(-(dens * 0.3 + core * 0.5 + dust * dens * 1.2) * dt);
      if (tr < 0.03) break;
    }
    t += dt; dt *= 1.05;
  }
  col += tr * uBg;
  gl_FragColor = vec4(tone(col * uGain), 1.0);
}`;
const NEB_STEPS = { alta: 44, media: 36, baja: 28 };
const NEB_PROGS = {};
function nebProg(q) { return NEB_PROGS[q] || (NEB_PROGS[q] = compile(TRI_VS, NEB_FS(NEB_STEPS[q] || 36))); }

// las estrellas dentro de la nebulosa: sin el túnel del hiperespacio y un poco más grandes
const NEB_LAYERS = [{ box: BOX, near: 0, squeeze: 1, rad: 0.07, bright: 1, seed: [0.11, 0.53, 0.29] },
                    { box: BOX * 4, near: BOX * 0.4, squeeze: 1, rad: 0.2, bright: 1.2, seed: [0.71, 0.23, 0.47] }];

function makeNebula(id, name, sub, C) {
  const starPal = { c: [C.mid, [0.92, 0.95, 1.0], C.hot], mix: [0.55, 0.85] };
  return {
    id, name, sub, free: true, fovTurbo: 10, pos: null,
    gpu() { this.target = makeTarget(); },
    enter() { if (!this.pos) this.pos = C.start.slice(); },   // cada una arranca frente a una vista elegida
    update(S) {
      freeFlight(S, 22);
      this.pos = vadd(this.pos, vscale(mot.T, mot.speed * S.dt * 0.14));   // la nube se cruza más despacio que las estrellas
    },
    render(S) {
      const P = nebProg(S.cfg.quality);
      drawVolume(this.target, S, () => {
        gl.useProgram(P.p); setView(P, S); bindTex(P, 'uNoise', G.noise, 0);
        gl.uniform3fv(P.u.uRo, this.pos);
        gl.uniform3fv(P.u.uHot, C.hot); gl.uniform3fv(P.u.uMid, C.mid); gl.uniform3fv(P.u.uCold, C.cold); gl.uniform3fv(P.u.uBg, C.bg);
        gl.uniform1f(P.u.uGain, C.gain * (1 + S.kick * 0.3));
        drawTri();
      });
      Stars.drawStreaks(S, { pos: mot.pos, vel: vscale(mot.T, mot.speed * 0.3), T: mot.T, streak: 0.12 * S.cfg.streak,
                             bright: 0.85 * S.bright, pal: starPal, layers: NEB_LAYERS });
    }
  };
}
// colores sacados de los videos: naranja con celeste, rosa con violeta, azul eléctrico, verde agua
const NebFuego = makeNebula('nebfuego', 'Nebulosa de fuego', 'Gas naranja y hielo azul', {
  hot: [1.0, 0.52, 0.22], mid: [0.25, 0.58, 1.0], cold: [0.08, 0.12, 0.45], bg: [0.01, 0.018, 0.05], gain: 1.5, start: [1224.1, 17.1, -1481.9] });
const NebRosa = makeNebula('nebrosa', 'Nebulosa rosa', 'Nubes de rosa y violeta', {
  hot: [1.0, 0.8, 0.95], mid: [0.95, 0.3, 0.75], cold: [0.18, 0.12, 0.5], bg: [0.016, 0.01, 0.045], gain: 1.5, start: [-1159.5, -26.7, 1586.5] });
const NebAzul = makeNebula('nebazul', 'Nebulosa azul', 'Tormenta de luz eléctrica', {
  hot: [0.78, 0.94, 1.0], mid: [0.2, 0.52, 1.0], cold: [0.05, 0.1, 0.42], bg: [0.008, 0.02, 0.06], gain: 1.6, start: [-1611.6, 101.3, -1475.6] });
const NebVerde = makeNebula('nebverde', 'Nebulosa esmeralda', 'Verde agua y dorado', {
  hot: [1.0, 0.78, 0.3], mid: [0.15, 0.85, 0.7], cold: [0.04, 0.22, 0.4], bg: [0.006, 0.025, 0.04], gain: 1.5, start: [4056.5, -123.4, -2094.5] });

/* ------------------------------------------------------------------ galaxia espiral */
const GAL_FS = STEPS => fsPre() + GLSL_RAY + GLSL_NOISE + GLSL_TONE + `
uniform vec3 uRo; uniform float uGain;
float armf(float r, float th, float off){ return 0.5 + 0.5 * cos(2.0 * (th - log(r + 1.0) * 2.4 + off)); }
void main(){
  vec3 rd = viewRay(), ro = uRo;
  vec3 col = vec3(0.0); float tr = 1.0;
  const float RB = 58.0, HB = 6.0;
  float b = dot(ro, rd), h = b * b - (dot(ro, ro) - RB * RB);
  if (h > 0.0) {
    h = sqrt(h);
    float t0 = max(-b - h, 0.0), t1 = -b + h;
    if (abs(rd.y) > 1e-4) { float ta = (-HB - ro.y) / rd.y, tb = (HB - ro.y) / rd.y; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
    else if (abs(ro.y) > HB) t1 = -1.0;
    if (t1 > t0) {
      float dt = (t1 - t0) / float(${STEPS});
      float t = t0 + dt * hash12(gl_FragCoord.xy);
      for (int i = 0; i < ${STEPS}; i++) {
        vec3 p = ro + rd * t;
        float r = length(p.xz), th = atan(p.z, p.x);
        float n = noise(p * 0.35) * 0.5 + noise(p * 0.8 + 7.0) * 0.3 + noise(p * 1.9 + 3.0) * 0.2;
        float arm = pow(armf(r, th, 0.0), 4.0);
        float dustA = pow(armf(r, th, -0.5), 8.0);
        float hz = 0.25 + r * 0.018;
        float disk = exp(-r / 11.0) * exp(-abs(p.y) / (hz * 2.2));
        float thin = exp(-r / 13.0) * exp(-abs(p.y) / hz);
        float bulge = exp(-length(vec3(p.x, p.y * 1.8, p.z)) / 2.6);
        vec3 armCol = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.92, 0.8), exp(-r / 9.0));
        vec3 e = vec3(1.0, 0.8, 0.52) * bulge * 4.0 + armCol * disk * (0.12 + 2.2 * arm * (0.4 + n));
        e += vec3(1.0, 0.35, 0.65) * pow(n, 5.0) * 18.0 * arm * thin * step(3.0, r);   // cunas de estrellas (rosadas)
        float sigma = thin * dustA * smoothstep(0.35, 0.65, n) * 5.0 * smoothstep(2.0, 5.0, r);  // polvo oscuro
        col += tr * e * dt;
        tr *= exp(-sigma * dt);
        t += dt;
      }
    }
  }
  gl_FragColor = vec4(tone(col * uGain), 1.0);
}`;
const GAL_STEPS = { alta: 56, media: 44, baja: 32 };
const GAL_PROGS = {};
function galProg(q) { return GAL_PROGS[q] || (GAL_PROGS[q] = compile(TRI_VS, GAL_FS(GAL_STEPS[q] || 44))); }

// estrellas sueltas de la galaxia (puntos con perspectiva) para que brille de cerca
const GSTAR_VS = HP + `
attribute vec3 aPos3; attribute vec3 aCol;
uniform mat3 uView; uniform mat4 uProj; uniform vec3 uEye; uniform float uFocal; uniform float uPx; uniform float uBright;
varying vec3 vCol;
void main(){
  vec3 v = uView * (aPos3 - uEye);
  gl_Position = uProj * vec4(v, 1.0);
  float z = max(-v.z, 0.1);
  gl_PointSize = clamp(0.09 * uFocal / z, 1.0, 5.0) * uPx;
  vCol = aCol * uBright * clamp(30.0 / z, 0.35, 1.6);
}`;
const GSTAR_FS = FP + `varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(vCol * a * a, 1.0); }`;

const Galaxia = {
  id: 'galaxia', name: 'Galaxia', sub: 'Una espiral de cien mil millones de soles', free: false, fovTurbo: 6,
  az: 0.6, ph: 0, eye: [0, 30, 80],
  gpu() {
    this.target = makeTarget();
    this.sp = compile(GSTAR_VS, GSTAR_FS, ['aPos3', 'aCol']);
    const N = 18000, data = new Float32Array(N * 6);
    const armf = (r, th) => 0.5 + 0.5 * Math.cos(2 * (th - Math.log(r + 1) * 2.4));
    let i = 0;
    while (i < N) {
      let x, y, z, c;
      if (Math.random() < 0.18) {                       // estrellas del núcleo
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2.2;
        x = g(); y = g() * 0.55; z = g(); c = [1.0, 0.82, 0.55];
      } else {
        const r = Math.min(-Math.log(1 - Math.random() * 0.97) * 11, 46), th = Math.random() * Math.PI * 2;
        if (Math.random() > 0.2 + 0.8 * Math.pow(armf(r, th), 4)) continue;
        x = Math.cos(th) * r; z = Math.sin(th) * r;
        y = (Math.random() + Math.random() - 1) * (0.25 + r * 0.018) * 1.5;
        const w = Math.exp(-r / 9);
        c = [0.6 + 0.4 * w, 0.72 + 0.2 * w, 1.0 - 0.2 * w];
        if (Math.random() < 0.04) c = [1.0, 0.45, 0.7];   // alguna rosada
      }
      const b = 0.25 + 0.75 * Math.pow(Math.random(), 3);
      data.set([x, y, z, c[0] * b, c[1] * b, c[2] * b], i * 6); i++;
    }
    this.n = N; this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  },
  update(S) {
    // la nave da vueltas alrededor de la galaxia, acercándose y alejándose despacio
    const k = S.started ? S.throttle : 0.4;
    this.az += S.dt * 0.035 * k;
    this.ph += S.dt * 0.05 * k;
    const D = 70 + 24 * Math.cos(this.ph), el = (30 + 16 * Math.sin(this.ph * 0.7)) * D2R;
    this.eye = [D * Math.cos(el) * Math.sin(this.az), D * Math.sin(el), D * Math.cos(el) * Math.cos(this.az)];
    this.ship = lookQuat(vsub([0, -2, 0], this.eye));
  },
  render(S) {
    const P = galProg(S.cfg.quality);
    drawVolume(this.target, S, () => {
      gl.useProgram(P.p); setView(P, S); bindTex(P, 'uNoise', G.noise, 0);
      gl.uniform3fv(P.u.uRo, this.eye); gl.uniform1f(P.u.uGain, 0.55 * (1 + S.kick * 0.3));
      drawTri();
    });
    Stars.drawFar(S, 0.7 * S.bright, PALETTES.blanco);
    const sp = this.sp; gl.useProgram(sp.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.disableVertexAttribArray(2);
    gl.uniformMatrix3fv(sp.u.uView, false, S.view); gl.uniformMatrix4fv(sp.u.uProj, false, S.P.m);
    gl.uniform3fv(sp.u.uEye, this.eye); gl.uniform1f(sp.u.uFocal, (S.H / 2) / S.P.ty);
    gl.uniform1f(sp.u.uPx, Math.max(1, S.dpr * 0.6)); gl.uniform1f(sp.u.uBright, 0.5 * S.bright);
    gl.drawArrays(gl.POINTS, 0, this.n);
    gl.disable(gl.BLEND);
  }
};
