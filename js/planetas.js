'use strict';
/* =====================================================================
   Recorridos de planetas: la nave va en línea recta y los planetas le
   salen al paso. Frena cerca de cada uno y acelera entre ellos (ahí
   aparecen las estelas). Cada planeta es una esfera exacta calculada
   por píxel: borde perfecto, atmósfera, nubes, anillos y sus sombras.
   ===================================================================== */

// fsType: 'EARTH' (mapas de la Tierra), 'TEX' (Luna, Marte, Júpiter, Saturno), 'PROC' (planetas inventados)
const PLANET_FS = type => fsPre() + `#define TYPE_${type} 1\n` + GLSL_RAY + GLSL_SPH + GLSL_NOISE + `
uniform vec3 uC; uniform float uR; uniform mat3 uRot; uniform vec3 uL; uniform vec3 uSunCol; uniform vec3 uNr;
uniform vec3 uAtm; uniform float uAtmK; uniform float uPix; uniform float uLommel; uniform float uLimb; uniform float uTime;
uniform float uRing; uniform vec2 uRingR; uniform float uKind; uniform vec3 uA; uniform vec3 uB; uniform vec3 uCc; uniform float uSeed; uniform float uGain;
uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uRingTex;

float fbmN(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec3(1.3, 4.1, 2.7); a *= 0.5; } return s; }
// color del aire según el sol: azul de día, naranja en el atardecer, nada de noche
vec3 atmoColor(float s){ return mix(vec3(1.0, 0.42, 0.18), uAtm, smoothstep(-0.05, 0.35, s)) * smoothstep(-0.3, 0.15, s); }

// anillo en el radio rr (en radios del planeta); devuelve color premultiplicado y opacidad
vec4 ringAt(float rr, vec3 pRel, vec3 rd){
  float u = (rr - uRingR.x) / (uRingR.y - uRingR.x);
  if (u < 0.0 || u > 1.0) return vec4(0.0);
#ifdef TYPE_PROC
  float a = smoothstep(0.0, 0.04, u) * smoothstep(1.0, 0.92, u) * (0.3 + 0.7 * noise(vec3(u * 70.0, 0.5, uSeed))) * (0.55 + 0.45 * noise(vec3(u * 9.0, 2.0, uSeed)));
  vec3 c = mix(uA, uB, noise(vec3(u * 23.0, 1.0, uSeed))); c *= c;
#else
  vec4 tx = texture2D(uRingTex, vec2(u, 0.5)); float a = tx.a; vec3 c = tx.rgb * tx.rgb;
#endif
  float sameSide = sign(dot(uNr, uL)) * sign(dot(uNr, -rd));
  float lit = sameSide > 0.0 ? 1.0 : 0.4;                       // por detrás el anillo solo deja pasar algo de luz
  float bb = dot(-pRel, uL), cc2 = dot(pRel, pRel) - uR * uR;
  float sh = (bb > 0.0 && bb * bb - cc2 > 0.0) ? 0.06 : 1.0;      // sombra del planeta sobre el anillo
  return vec4(sqrt(c * lit * sh * uSunCol * (0.25 + 0.9 * abs(dot(uNr, uL)))) * a, a);
}
// sombra de los anillos sobre el planeta
float ringShadow(vec3 pr){
  if (uRing < 0.5) return 1.0;
  float den = dot(uL, uNr);
  if (abs(den) < 1e-4) return 1.0;
  float t2 = -dot(pr, uNr) / den;
  if (t2 <= 0.0) return 1.0;
  float rr = length(pr + uL * t2) / uR;
  float u = (rr - uRingR.x) / (uRingR.y - uRingR.x);
  if (u < 0.0 || u > 1.0) return 1.0;
#ifdef TYPE_PROC
  float a = 0.6 * (0.55 + 0.45 * noise(vec3(u * 9.0, 2.0, uSeed)));
#else
  float a = texture2D(uRingTex, vec2(u, 0.5)).a;
#endif
  return 1.0 - 0.75 * a;
}

vec3 surface(vec3 n, vec3 rd, vec3 pr){
  vec3 nb = uRot * n;
  float ndl = dot(n, uL), mu = max(dot(n, -rd), 0.0), dif = max(ndl, 0.0);
  vec3 col;
#ifdef TYPE_EARTH
  vec2 uv = sphUV(nb);
  vec3 dayS = texSph(uTex0, uv).rgb, day = dayS * dayS;
  vec3 night = texSph(uTex1, uv).rgb; night *= night;
  vec2 cuv = uv + vec2(uTime * 0.0008, 0.0);
  float cl = smoothstep(0.08, 0.85, texSph(uTex2, cuv).r);
  float clS = smoothstep(0.1, 0.9, texSph(uTex2, cuv + vec2(-0.0025, 0.0015)).r);
  float ocean = smoothstep(0.02, 0.09, dayS.b - max(dayS.r, dayS.g));
  col = day * (dif * 1.25 + 0.01) * (1.0 - 0.45 * clS * (1.0 - cl));
  col += uSunCol * pow(max(dot(n, normalize(uL - rd)), 0.0), 70.0) * ocean * (1.0 - cl) * smoothstep(0.0, 0.1, ndl) * 0.9;
  col = mix(col, vec3(dif * 1.15 + 0.012), cl);
  col += night * vec3(1.0, 0.78, 0.5) * 1.6 * (1.0 - smoothstep(-0.18, 0.04, ndl)) * (1.0 - cl * 0.85);   // ciudades de noche
  float rim = pow(1.0 - mu, 3.0);
  col = col * (1.0 - rim * 0.55) + atmoColor(ndl) * (rim * 0.9 + 0.06 * dif);
#endif
#ifdef TYPE_TEX
  vec3 c = texSph(uTex0, sphUV(nb)).rgb; c *= c;
  if (uLommel > 0.5) { float m0 = max(ndl, 0.0); dif = min(2.0 * m0 / (m0 + mu + 1e-4), 1.25) * smoothstep(-0.02, 0.06, ndl); }  // la Luna: sin oscurecer el borde
  if (uLimb > 0.0) dif *= mix(1.0, pow(mu, 0.35), uLimb);
  col = c * (dif * 1.3 + 0.004) * uSunCol * ringShadow(pr) * uGain;
  if (uAtmK > 0.0) col += atmoColor(ndl) * pow(1.0 - mu, 3.0) * uAtmK * 0.8;
#endif
#ifdef TYPE_PROC
  vec3 p = nb * 2.2 + uSeed;
  vec3 alb, emit = vec3(0.0); float spec = 0.0;
  if (uKind < 0.5) {                     // lava: costra negra con grietas encendidas
    float f = fbmN(p * 1.3);
    float c1 = abs(noise(p * 2.4) - 0.5), c2 = abs(noise(p * 5.3 + 2.0) - 0.5);
    float crack = (1.0 - smoothstep(0.0, 0.035, c1)) + 0.6 * (1.0 - smoothstep(0.0, 0.025, c2));   // red de grietas unidas
    alb = mix(uA, uB, f);
    emit = uCc * (crack * (0.6 + 1.4 * smoothstep(0.4, 0.7, f)) + smoothstep(0.62, 0.75, f) * 0.8) * 1.5;
  } else if (uKind < 1.5) {              // gigante gaseoso: bandas, remolinos y una tormenta
    float turb = fbmN(p * vec3(1.0, 3.0, 1.0));
    float band = nb.y * 7.0 + turb * 1.6 + sin(nb.y * 23.0) * 0.25;
    alb = mix(uA, uB, 0.5 + 0.5 * sin(band * 1.7));
    alb = mix(alb, uCc, smoothstep(0.55, 0.9, 0.5 + 0.5 * sin(band * 3.1 + turb * 4.0)) * 0.6);
    float ds = length((nb - normalize(vec3(0.6, -0.25, 0.75))) * vec3(1.0, 2.2, 1.0));
    alb = mix(alb, uCc * 1.25, smoothstep(0.22, 0.08, ds + (turb - 0.5) * 0.12));
    dif *= mix(1.0, pow(mu, 0.35), 0.7);
  } else if (uKind < 2.5) {              // hielo con grietas azules
    float f = fbmN(p * 1.6);
    float cr = abs(noise(p * 4.0) * 2.0 - 1.0);
    alb = mix(uA, uB, smoothstep(0.35, 0.7, f));
    alb = mix(alb, uCc, (1.0 - smoothstep(0.0, 0.07, cr)) * 0.8);
    spec = 0.45;
  } else if (uKind < 3.5) {              // océano con continentes y nubes
    float f = fbmN(p * 1.2);
    float land = smoothstep(0.52, 0.56, f);
    alb = mix(uA, mix(uB, uCc, smoothstep(0.56, 0.7, f)), land);
    spec = (1.0 - land) * 0.9;
    float cl = smoothstep(0.5, 0.75, fbmN(nb * 3.0 + vec3(uTime * 0.01, 0.0, 0.0) + 11.0));
    alb = mix(alb, vec3(0.95), cl); spec *= 1.0 - cl;
  } else {                               // desierto carmesí con cañones y casquetes
    float f = fbmN(p * 1.1);
    float cr = abs(noise(p * 2.2) * 2.0 - 1.0);
    alb = mix(uA, uB, f) * (0.55 + 0.45 * smoothstep(0.0, 0.12, cr));
    alb = mix(alb, vec3(0.95, 0.9, 0.88), smoothstep(0.8, 0.9, abs(nb.y)));
  }
  alb *= alb;
  col = alb * (dif * 1.3 + 0.005) * uSunCol * ringShadow(pr);
  if (spec > 0.0) col += uSunCol * pow(max(dot(n, normalize(uL - rd)), 0.0), 60.0) * spec * smoothstep(0.0, 0.1, ndl);
  col += emit * emit;
  if (uAtmK > 0.0) col += atmoColor(ndl) * pow(1.0 - mu, 3.0) * uAtmK * 0.8;
#endif
#ifdef TYPE_SUN
  vec2 uv = sphUV(nb);
  vec2 w = vec2(noise(nb * 5.0 + uTime * 0.04), noise(nb * 5.0 + 17.0 - uTime * 0.03)) - 0.5;
  vec3 s1 = texSph(uTex0, uv + w * 0.012).rgb;
  float gran = noise(nb * 60.0 + uTime * 0.35) * 0.6 + noise(nb * 140.0 - uTime * 0.5) * 0.4;   // granos que hierven
  col = (s1 * s1 * 1.7 + gran * 0.2) * vec3(1.0, 0.6, 0.22) * (0.3 + 0.7 * pow(mu, 0.5)) * 2.4;
  return 1.0 - exp(-col);
#endif
  return sqrt(max(col, 0.0));
}

// corona y protuberancias alrededor del disco del Sol
vec3 sunHalo(vec3 rd, float b, float dp){
  float x = max(dp - uR, 0.0) / uR;
  vec3 cb = uRot * ((rd * b - uC) / max(dp, 1e-5));
  float prom = smoothstep(0.5, 0.78, fbmN(cb * 3.5 + vec3(x * 5.0, -uTime * 0.03, uTime * 0.02))) * exp(-x * 7.0);
  float cor = (exp(-x * 5.0) * 0.55 + exp(-x * 2.2) * 0.12) * (0.7 + 0.6 * noise(cb * 8.0 + x * 2.0));
  return 1.0 - exp(-(vec3(1.0, 0.33, 0.08) * prom * 3.2 + vec3(1.0, 0.6, 0.3) * cor));
}

void main(){
  vec3 rd = viewRay();
  float b = dot(uC, rd), cc = dot(uC, uC);
  float d2 = max(cc - b * b, 0.0), dp = sqrt(d2);
  vec4 res = vec4(0.0); vec3 add = vec3(0.0);
  float tHit = 1e20;
  if (b > 0.0) {
    float cov = clamp((uR - dp) / (b * uPix) + 0.5, 0.0, 1.0);   // borde suavizado a un píxel
    if (cov > 0.0) {
      tHit = b - sqrt(max(uR * uR - d2, 0.0));
      vec3 pr = rd * tHit - uC;
      res = vec4(surface(normalize(pr), rd, pr) * cov, cov);
    }
#ifdef TYPE_SUN
    add = sunHalo(rd, b, dp);
#endif
    if (uAtmK > 0.0) {                                           // el halo del aire alrededor del borde
      float x = max(dp - uR, 0.0) / (uR * 0.05);
      vec3 cn = (rd * b - uC) / max(dp, 1e-5);
      add = atmoColor(dot(cn, uL)) * exp(-x) * uAtmK * 0.9;
    }
  }
  if (uRing > 0.5) {
    float den = dot(rd, uNr);
    if (abs(den) > 1e-5) {
      float tr = dot(uC, uNr) / den;
      if (tr > 0.0) {
        vec3 pRel = rd * tr - uC;
        vec4 rg = ringAt(length(pRel) / uR, pRel, rd);
        if (rg.a > 0.0) res = tr < tHit ? rg + res * (1.0 - rg.a) : res + rg * (1.0 - res.a);
      }
    }
  }
  gl_FragColor = vec4(res.rgb + add * (1.0 - res.a), res.a);
}`;

// cielo de los recorridos: vía láctea (foto) o nebulosa horneada, y el sol con su textura y su resplandor
const TOURSKY_FS = fsPre() + GLSL_RAY + GLSL_SPH + GLSL_TONE + `
uniform sampler2D uMilky; uniform float uMilkyK; uniform samplerCube uCube; uniform float uCubeK;
uniform sampler2D uSunTex; uniform float uSunTexK; uniform vec3 uLs; uniform vec3 uSunCol; uniform float uSunR; uniform float uTime;
void main(){
  vec3 d = viewRay();
  vec3 c = vec3(0.0);
  if (uMilkyK > 0.0) { vec3 m = texSph(uMilky, sphUV(d)).rgb; c += m * m * uMilkyK; }
  if (uCubeK > 0.0) c += textureCube(uCube, d).rgb * uCubeK;
  float ang = acos(clamp(dot(d, uLs), -1.0, 1.0));
  if (ang < uSunR * 1.02) {
    vec3 e1 = normalize(cross(uLs, abs(uLs.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(uLs, e1);
    vec2 xy = vec2(dot(d, e1), dot(d, e2)) / sin(uSunR);
    float r2 = dot(xy, xy), z = sqrt(max(1.0 - r2, 0.0));
    float a = uTime * 0.012;
    vec3 sn = vec3(cos(a) * xy.x - sin(a) * z, xy.y, sin(a) * xy.x + cos(a) * z);
    vec3 st = uSunTexK > 0.0 ? texSph(uSunTex, sphUV(sn)).rgb : vec3(0.8);
    float limb = 0.35 + 0.65 * pow(z, 0.45);
    c += (st * st * 2.0 + 0.25) * vec3(1.0, 0.6, 0.22) * limb * (1.0 - smoothstep(0.96, 1.0, sqrt(r2))) * 2.6;
  }
  c += uSunCol * (exp(-max(ang - uSunR, 0.0) / (uSunR * 0.5)) * 0.9 + exp(-ang * 2.5) * 0.12 + exp(-ang * 9.0) * 0.3);
  gl_FragColor = vec4(tone(c), 1.0);
}`;

const PLANET_PROGS = {};
const planetProg = type => PLANET_PROGS[type] || (PLANET_PROGS[type] = compile(TRI_VS, PLANET_FS(type)));

// recorte de pantalla alrededor de la esfera (así el cálculo por píxel solo corre donde está el planeta)
function sphereScissor(S, C, Rb) {
  const v = S.view, cx = v[0] * C[0] + v[3] * C[1] + v[6] * C[2], cy = v[1] * C[0] + v[4] * C[1] + v[7] * C[2], cz = v[2] * C[0] + v[5] * C[1] + v[8] * C[2];
  if (cz - Rb > -0.05) {
    if (cz - Rb > 0) return null;                     // todo detrás de la cámara
    return [0, 0, S.W, S.H];
  }
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  for (let i = 0; i < 8; i++) {
    const x = cx + (i & 1 ? Rb : -Rb), y = cy + (i & 2 ? Rb : -Rb), z = cz + (i & 4 ? Rb : -Rb);
    const nx = x / -z / S.P.tx, ny = y / -z / S.P.ty;
    x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
  }
  x0 = clamp(x0, -1, 1); x1 = clamp(x1, -1, 1); y0 = clamp(y0, -1, 1); y1 = clamp(y1, -1, 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const px = Math.floor((x0 * 0.5 + 0.5) * S.W), py = Math.floor((y0 * 0.5 + 0.5) * S.H);
  return [px, py, Math.ceil((x1 * 0.5 + 0.5) * S.W) - px + 1, Math.ceil((y1 * 0.5 + 0.5) * S.H) - py + 1];
}

/* ------------------------------------------------------------------ recorrido genérico */
function makeTour(def) {
  return {
    id: def.id, name: def.name, sub: def.sub, free: false, fovTurbo: 8, groups: null, v: 0, starPos: [0, 0, 0],
    gpu() {
      this.tex = {};
      this.cube = def.cube ? bakeCube(null, def.cube.neb, 256, def.cube.seed, def.cube.gain) : null;
    },
    enter() {
      const urls = new Set();
      def.groups.forEach(g => g.items.forEach(it => { (it.tex || []).forEach(u => urls.add(u)); if (it.ringTex) urls.add(it.ringTex); }));
      if (def.sky.milky) urls.add(def.sky.milky);
      if (def.sky.sunTex) urls.add(def.sky.sunTex);
      loadTextures(this, [...urls]);
      if (!this.groups) this.reset();
    },
    exit() { freeTextures(this); },   // libera la memoria de la tarjeta gráfica (las fotos quedan en caché)
    reset() {
      this.groups = def.groups.map(g => ({ g, z: 0, shown: false }));
      let z = -def.first;
      this.groups.forEach((G2, i) => { if (i) z -= gapBetween(this.groups[i - 1].g, G2.g); G2.z = z; });
    },
    update(S) {
      // velocidad según lo cerca que está la superficie más próxima: lento al pasar, rápido entre planetas
      let dmin = 1e9;
      for (const G2 of this.groups) for (const it of G2.g.items) {
        const c = [it.off[0], it.off[1], G2.z + it.off[2]];
        dmin = Math.min(dmin, vlen(c) - it.R);
      }
      const base = clamp(0.28 * dmin, 0.05, 900);
      const target = base * (S.started ? S.throttle : 0.4);
      this.v += (target - this.v) * ease(S.dt, 3);
      const dz = this.v * S.dt;
      for (const G2 of this.groups) G2.z += dz;
      // el grupo que quedó muy atrás vuelve a ponerse al final de la fila
      const first = this.groups[0], rmax = Math.max(...first.g.items.map(it => it.R));
      if (first.z > rmax * 25 + 40) {
        this.groups.shift();
        const last = this.groups[this.groups.length - 1];
        first.z = last.z - gapBetween(last.g, first.g); first.shown = false;
        this.groups.push(first);
      }
      for (const G2 of this.groups) {
        const main = G2.g.items[0];
        if (!G2.shown && -G2.z < main.R * 40 && -G2.z > 0) { G2.shown = true; if (S.started) caption(G2.g.name, G2.g.sub); }
      }
      this.starPos = this.starPos.map((p, i) => i === 2 ? ((p - this.v * 0.6 * S.dt) % WRAP + WRAP) % WRAP : p);
    },
    render(S) {
      drawTourSky(S, def.sky, this.tex, this.cube);
      Stars.drawFar(S, def.sky.farK * S.bright, PALETTES.blanco);
      // en los tramos rápidos aparecen las estelas
      const warp = smooth(4, 40, this.v);
      if (warp > 0.01) Stars.drawStreaks(S, { pos: this.starPos, vel: [0, 0, -this.v * 0.6], T: [0, 0, -1], streak: 0.12 * S.cfg.streak,
                                             bright: warp * S.bright * 0.8, pal: PALETTES.blanco, layers: [LAYERS[0]] });
      // planetas de lejos a cerca
      const list = [];
      for (const G2 of this.groups) for (const it of G2.g.items) {
        const C = [it.off[0], it.off[1], G2.z + it.off[2]];
        list.push({ it, C, d: vlen(C) });
      }
      list.sort((a, b) => b.d - a.d);
      for (const { it, C, d } of list) if (d < it.R * 2500) drawBody(S, it, C, this.tex, def.sky);   // más lejos: menos de un píxel
    }
  };
}

function drawTourSky(S, sky, tex, cube) {
  const P = G.tsky || (G.tsky = compile(TRI_VS, TOURSKY_FS));
  gl.useProgram(P.p); gl.disable(gl.BLEND); setView(P, S);
  const milky = sky.milky && tex[sky.milky], sunT = sky.sunTex && tex[sky.sunTex];
  bindTex(P, 'uMilky', milky || G.noise, 0); gl.uniform1f(P.u.uMilkyK, milky ? sky.milkyK : 0);
  bindTex(P, 'uCube', cube || G.blackCube, 1, gl.TEXTURE_CUBE_MAP); gl.uniform1f(P.u.uCubeK, cube ? sky.cubeK : 0);
  bindTex(P, 'uSunTex', sunT || G.noise, 2); gl.uniform1f(P.u.uSunTexK, sunT ? 1 : 0);
  gl.uniform3fv(P.u.uLs, sky.L); gl.uniform3fv(P.u.uSunCol, sky.sunCol); gl.uniform1f(P.u.uSunR, sky.sunR);
  drawTri();
}

// un planeta (o el Sol) calculado por píxel, recortado a su rectángulo en pantalla
function drawBody(S, it, C, tex, sky) {
  const texs = (it.tex || []).map(u => tex[u]);
  if (texs.some(t => !t) || (it.ringTex && !tex[it.ringTex])) return;          // todavía cargando
  const Rb = it.R * (it.ring ? it.ring[1] * 1.02 : it.type === 'SUN' ? 2.4 : (it.atmK ? 1.18 : 1.02));
  const sc = sphereScissor(S, C, Rb);
  if (!sc) return;
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(sc[0], sc[1], sc[2], sc[3]);
  const Pp = planetProg(it.type); gl.useProgram(Pp.p); setView(Pp, S);
  const qb = qmul(qaxis([0, 0, 1], (it.tilt || 0) * D2R), qaxis([0, 1, 0], (it.spin || 0) * S.time + (it.phase || 0)));
  gl.uniform3fv(Pp.u.uC, C); gl.uniform1f(Pp.u.uR, it.R);
  gl.uniformMatrix3fv(Pp.u.uRot, false, transpose3(qmat3(qb)));
  const f1 = (n, v) => { if (Pp.u[n]) gl.uniform1f(Pp.u[n], v); }, f3 = (n, v) => { if (Pp.u[n]) gl.uniform3fv(Pp.u[n], v); };
  f3('uNr', qrot(qb, [0, 1, 0])); f3('uL', sky.L); f3('uSunCol', sky.sunCol); f3('uAtm', it.atm || [0, 0, 0]);
  f1('uAtmK', it.atmK || 0); f1('uPix', 2 * S.P.ty / S.H);
  f1('uLommel', it.lommel ? 1 : 0); f1('uLimb', it.limb || 0); f1('uGain', it.gain || 1);
  f1('uRing', it.ring ? 1 : 0); if (Pp.u.uRingR) gl.uniform2fv(Pp.u.uRingR, it.ring || [0, 1]);
  f1('uKind', it.kind || 0); f1('uSeed', it.seed || 0);
  f3('uA', it.a || [0, 0, 0]); f3('uB', it.b || [0, 0, 0]); f3('uCc', it.c || [0, 0, 0]);
  bindTex(Pp, 'uNoise', G.noise, 0);
  bindTex(Pp, 'uTex0', texs[0] || G.noise, 1); bindTex(Pp, 'uTex1', texs[1] || G.noise, 2); bindTex(Pp, 'uTex2', texs[2] || G.noise, 3);
  bindTex(Pp, 'uRingTex', (it.ringTex && tex[it.ringTex]) || G.noise, 4);
  drawTri();
  gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
}

// descarga fotos y las sube a la GPU a medida que llegan
function loadTextures(owner, urls) {
  owner.loading = owner.loading || 0;
  urls.forEach(u => {
    if (owner.tex[u]) return;
    owner.loading++;
    loadImage(u).then(im => { if (!owner.tex[u]) owner.tex[u] = texFromImage(im); })
      .catch(() => { owner.failed = true; })
      .finally(() => { owner.loading--; });
  });
  if (owner.loading) setTimeout(() => { if (owner.loading && currentScene === owner) toast('Cargando imágenes…'); }, 400);
}
function freeTextures(owner) { for (const u in owner.tex) gl.deleteTexture(owner.tex[u]); owner.tex = {}; }

function gapBetween(a, b) {
  const ra = Math.max(...a.items.map(it => it.R)), rb = Math.max(...b.items.map(it => it.R));
  return 90 + 28 * (ra + rb);
}

/* ------------------------------------------------------------------ el sistema solar */
// tamaños reales relativos (Tierra = 1); las distancias están acortadas para que el viaje dure minutos
const Solar = makeTour({
  id: 'solar', name: 'Sistema solar', sub: 'La Tierra, la Luna, Marte, Júpiter y Saturno', first: 120,
  sky: { milky: 'tex/2k_stars_milky_way.jpg', milkyK: 1.1, sunTex: 'tex/2k_sun.jpg', L: vnorm([0.85, 0.22, 0.3]),
         sunCol: [1.0, 0.9, 0.75], sunR: 0.07, farK: 0.55 },
  groups: [
    { name: 'La Tierra', sub: 'y la Luna, nuestra vecina', items: [
      { type: 'EARTH', R: 1, off: [-2.2, -0.3, 0], tilt: 23.4, spin: 0.012, phase: 2.2, atm: [0.33, 0.58, 1.0], atmK: 1,
        tex: ['tex/2k_earth_daymap.jpg', 'tex/2k_earth_nightmap.jpg', 'tex/2k_earth_clouds.jpg'] },
      { type: 'TEX', R: 0.273, off: [-0.9, 1.2, 14], tilt: 6.7, spin: 0.003, phase: 1.3, lommel: 1, gain: 1.1, tex: ['tex/2k_moon.jpg'] }] },
    { name: 'Marte', sub: 'el planeta rojo', items: [
      { type: 'TEX', R: 0.53, off: [-1.35, 0.25, 0], tilt: 25, spin: 0.012, atm: [0.95, 0.62, 0.48], atmK: 0.35, gain: 1.7, tex: ['tex/2k_mars.jpg'] }] },
    { name: 'Júpiter', sub: 'el gigante: once veces más ancho que la Tierra', items: [
      { type: 'TEX', R: 11.2, off: [-27, -6, 0], tilt: 3, spin: 0.02, limb: 0.8, atm: [0.95, 0.85, 0.7], atmK: 0.3, gain: 1.15, tex: ['tex/2k_jupiter.jpg'] }] },
    { name: 'Saturno', sub: 'y sus anillos de hielo y roca', items: [
      { type: 'TEX', R: 9.45, off: [23, -15, 0], tilt: -8, spin: 0.02, limb: 0.7, atm: [0.95, 0.88, 0.7], atmK: 0.25, gain: 1.25,
        tex: ['tex/2k_saturn.jpg'], ringTex: 'tex/2k_saturn_ring_alpha.png', ring: [1.16, 2.36] }] }
  ]
});

/* ------------------------------------------------------------------ planetas inventados */
const Alien = makeTour({
  id: 'alien', name: 'Planetas lejanos', sub: 'Mundos de lava, hielo, océano y gas', first: 120,
  cube: { neb: [[0.5, 0.1, 0.6], [0.9, 0.25, 0.5], [0.1, 0.5, 0.9]], seed: 8.1, gain: 1.8 },
  sky: { cubeK: 0.9, L: vnorm([-0.7, 0.35, 0.5]), sunCol: [1.0, 0.74, 0.52], sunR: 0.08, farK: 0.8 },
  groups: [
    { name: 'Planeta océano', sub: 'agua, nubes y una luna de hielo', items: [
      { type: 'PROC', kind: 3, R: 1.4, off: [-3.0, -0.5, 0], tilt: 15, spin: 0.015, seed: 3.1, atm: [0.4, 0.9, 0.85], atmK: 0.9,
        a: [0.03, 0.26, 0.36], b: [0.16, 0.45, 0.2], c: [0.62, 0.52, 0.32] },
      { type: 'PROC', kind: 2, R: 0.35, off: [1.3, 0.8, 12], tilt: 5, spin: 0.01, seed: 7.7, atm: [0.5, 0.8, 1.0], atmK: 0.3,
        a: [0.75, 0.88, 1.0], b: [0.95, 0.98, 1.0], c: [0.15, 0.45, 0.8] }] },
    { name: 'Mundo de lava', sub: 'un planeta que todavía arde', items: [
      { type: 'PROC', kind: 0, R: 1.1, off: [2.3, 0.4, 0], tilt: 10, spin: 0.01, seed: 1.7, atm: [1.0, 0.35, 0.12], atmK: 0.6,
        a: [0.06, 0.04, 0.04], b: [0.22, 0.07, 0.04], c: [1.0, 0.38, 0.08] }] },
    { name: 'Gigante violeta', sub: 'tormentas del tamaño de la Tierra', items: [
      { type: 'PROC', kind: 1, R: 8, off: [-19, -12, 0], tilt: 15, spin: 0.02, seed: 5.3, atm: [0.8, 0.5, 1.0], atmK: 0.3, ring: [1.3, 2.3],
        a: [0.55, 0.3, 0.75], b: [0.95, 0.75, 0.85], c: [0.35, 0.12, 0.5] }] },
    { name: 'Mundo de hielo', sub: 'grietas azules bajo un sol naranja', items: [
      { type: 'PROC', kind: 2, R: 0.9, off: [1.8, -0.6, 0], tilt: 20, spin: 0.01, seed: 9.2, atm: [0.5, 0.8, 1.0], atmK: 0.6,
        a: [0.72, 0.86, 1.0], b: [0.95, 0.98, 1.0], c: [0.12, 0.42, 0.8] }] },
    { name: 'Desierto carmesí', sub: 'cañones rojos y polos helados', items: [
      { type: 'PROC', kind: 4, R: 0.8, off: [-1.6, 0.5, 0], tilt: 12, spin: 0.012, seed: 4.4, atm: [1.0, 0.5, 0.4], atmK: 0.35,
        a: [0.55, 0.12, 0.08], b: [0.85, 0.35, 0.2] }] }
  ]
});

/* ------------------------------------------------------------------ el Sol de cerca */
// la nave da vueltas alrededor del Sol, acercándose y alejándose; en el borde se ven las protuberancias
const SOL_SKY = { milky: 'tex/2k_stars_milky_way.jpg', milkyK: 0.8, L: [0, 1, 0], sunCol: [0, 0, 0], sunR: 0.001, farK: 0.5 };
const Sol = {
  id: 'sol', name: 'El Sol', sub: 'Nuestra estrella, de cerca', free: false, fovTurbo: 8, az: 0.4, ph: 2.4, eye: [0, 0, 40],
  body: { type: 'SUN', R: 10, tilt: 7, spin: 0.01, tex: ['tex/2k_sun.jpg'] },
  gpu() { this.tex = {}; },
  enter() { loadTextures(this, ['tex/2k_sun.jpg', SOL_SKY.milky]); },
  exit() { freeTextures(this); },
  update(S) {
    const k = S.started ? S.throttle : 0.4, R = this.body.R;
    this.az += S.dt * 0.018 * k; this.ph += S.dt * 0.035 * k;
    const D = R * (3.4 + 1.2 * Math.cos(this.ph)), el = 10 * D2R * Math.sin(this.ph * 0.7);
    this.eye = [D * Math.cos(el) * Math.sin(this.az), D * Math.sin(el), D * Math.cos(el) * Math.cos(this.az)];
    this.ship = lookQuat(vscale(this.eye, -1));
  },
  render(S) {
    drawTourSky(S, SOL_SKY, this.tex, null);
    Stars.drawFar(S, SOL_SKY.farK * S.bright, PALETTES.blanco);
    drawBody(S, this.body, vscale(this.eye, -1), this.tex, SOL_SKY);
  }
};
