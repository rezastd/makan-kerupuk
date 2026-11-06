import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- Audio (WebAudio oscillator, no assets) ----------
const AudioFX = {
  ctx: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  blip(freq = 440, dur = 0.12, type = 'square', vol = 0.08) {
    this.ensure(); if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  },
  crunch() { this.blip(180 + Math.random() * 120, 0.15, 'sawtooth', 0.12); this.blip(900 + Math.random() * 400, 0.08, 'square', 0.05); },
  miss() { this.blip(160, 0.12, 'sine', 0.06); },
  cheer() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.12), i * 130)); },
  sad() { [400, 340, 280].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sine', 0.1), i * 150)); }
};

// ---------- Renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// ---------- realism helpers: anisotropy + procedural normal maps + bloom sprite ----------
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
function normalFromTexture(tex, strength = 2.0) {
  const src = tex.image, w = src.width, h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d'), img = octx.createImageData(w, h);
  const lum = (x, y) => {
    const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const nx = -dx, ny = dy, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * w + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.repeat.copy(tex.repeat); t.offset.copy(tex.offset);
  t.anisotropy = MAX_ANISO;
  return t;
}
function prepareTexture(tex) { tex.anisotropy = MAX_ANISO; return tex; }
function glowTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,250,235,1)');
  gr.addColorStop(0.22, 'rgba(255,238,196,0.62)');
  gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function dotTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}


const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc7d3d2, 26, 82);
// Gradient sky dome (procedural canvas texture) + faint cirrus
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 64; skyCanvas.height = 512;
{
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#1f60a6');
  grad.addColorStop(0.32, '#5d9bd5');
  grad.addColorStop(0.52, '#a4c8e3');
  grad.addColorStop(0.62, '#dcd2b8');
  grad.addColorStop(0.72, '#c9b691');
  grad.addColorStop(1.00, '#8f7c5e');
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 512);
  for (let i = 0; i < 50; i++) {
    sg.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.045})`;
    sg.fillRect(Math.random() * 64, 40 + Math.random() * 230, 12 + Math.random() * 44, 0.8 + Math.random() * 1.5);
  }
}
const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 3.2, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.maxDistance = 25; controls.minDistance = 3;
let followCam = true;

// ---------- Lights: warm sun + IBL sky + soft contact shadows ----------
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x7a6040, 0.30));
scene.add(new THREE.AmbientLight(0xffe8c8, 0.07));
const sun = new THREE.DirectionalLight(0xffe2b4, 2.7);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3.5;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xffc9a8, 0.22);
rim.position.set(-8, 5, -6); scene.add(rim);

// prefiltered environment → real sky reflections on the cracker, stools and puddles
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2cf).multiplyScalar(9) }));
  sunBall.position.copy(sun.position).normalize().multiplyScalar(30); es.add(sunBall);
  es.add(new THREE.Mesh(new THREE.SphereGeometry(39, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x6f7a44, side: THREE.BackSide })));
  const rt = pmrem.fromScene(es, 0.03);
  scene.environment = rt.texture;
  pmrem.dispose();
  es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(160), transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false, fog: false, opacity: 0.85,
}));
sunGlow.position.copy(sun.position).normalize().multiplyScalar(72);
sunGlow.scale.set(34, 34, 1);
scene.add(sunGlow);

// ---------- Ground (canvas texture) ----------
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a8a5a'; g.fillRect(0, 0, 512, 512);
  // layer: patches (dirt / dry grass)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${140 + Math.random() * 50 | 0},${110 + Math.random() * 40 | 0},70,${0.12 + Math.random() * 0.2})`;
    g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 12 + Math.random() * 30, Math.random() * 3, 0, 7); g.fill();
  }
  // street strip
  g.fillStyle = '#8d8578'; g.fillRect(0, 200, 512, 120);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(60,55,50,${Math.random() * 0.25})`; g.fillRect(Math.random() * 512, 200 + Math.random() * 120, 3, 2); }
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.setLineDash([24, 18]);
  g.beginPath(); g.moveTo(0, 260); g.lineTo(512, 260); g.stroke();
  g.setLineDash([]);
  // grass noise speckles
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${40 + Math.random() * 30 | 0},.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,240,180,${Math.random() * 0.18})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const groundMap = prepareTexture(groundTexture());
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(150, 150),
  new THREE.MeshStandardMaterial({
    map: groundMap, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.6,
    normalMap: normalFromTexture(groundMap, 1.4), normalScale: new THREE.Vector2(0.6, 0.6),
  })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
// macro blotch layer: hides texture tiling and adds real ground variation
{
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 30 + Math.random() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.55;
    gr.addColorStop(0, dark ? 'rgba(38,56,28,0.30)' : 'rgba(176,168,94,0.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, envMapIntensity: 0.4 }));
  layer.rotation.x = -Math.PI / 2; layer.position.y = 0.006;
  layer.receiveShadow = true; scene.add(layer);
}
// Scattered props: grass tufts / stones / puddles (shared geo+mat, no per-frame alloc)
const _tuftGeo = new THREE.ConeGeometry(0.09, 0.35, 5);
const _tuftMat = new THREE.MeshStandardMaterial({ color: 0x4d7c3a, roughness: 0.95 });
const _stoneGeo = new THREE.DodecahedronGeometry(0.12, 0);
const _stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.95 });
const _puddleMat = new THREE.MeshStandardMaterial({ color: 0x4d5854, roughness: 0.1, metalness: 0.0, envMapIntensity: 1.1 });
for (let i = 0; i < 70; i++) {
  const kind = i % 7;
  const px = -22 + Math.random() * 44, pz = -8 + Math.random() * 16;
  if (Math.abs(px) < 6 && pz > -1 && pz < 3) continue;
  if (kind === 0) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.35 + Math.random() * 0.4, 14), _puddleMat);
    p.rotation.x = -Math.PI / 2; p.position.set(px, 0.015, pz); p.receiveShadow = true; scene.add(p);
  } else if (kind < 3) {
    const s = new THREE.Mesh(_stoneGeo, _stoneMat);
    s.position.set(px, 0.06, pz); s.scale.setScalar(0.6 + Math.random()); s.castShadow = true; scene.add(s);
  } else {
    const tu = new THREE.Mesh(_tuftGeo, _tuftMat);
    tu.position.set(px, 0.16, pz); tu.rotation.z = (Math.random() - 0.5) * 0.4; tu.castShadow = true; scene.add(tu);
  }
}
// Drifting low-poly clouds
const clouds = [];
const _cloudMat = new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 1, transparent: true, opacity: 0.9 });
const _cloudGeo = new THREE.SphereGeometry(1, 14, 10);
for (let i = 0; i < 7; i++) {
  const cl = new THREE.Group();
  for (let j = 0; j < 4; j++) {
    const m = new THREE.Mesh(_cloudGeo, _cloudMat);
    m.position.set(j * 1.1 - 1.6, Math.random() * 0.3, Math.random() * 0.5);
    m.scale.set(1.7 + Math.random() * 1.1, 1.0 + Math.random() * 0.45, 1.2); cl.add(m);
  }
  cl.position.set(-35 + Math.random() * 70, 13 + Math.random() * 6, -22 - Math.random() * 18);
  cl.userData.speed = 0.25 + Math.random() * 0.4;
  clouds.push(cl); scene.add(cl);
}
// Distant silhouette layer: trees / houses / tents
const _silMat = new THREE.MeshBasicMaterial({ color: 0x4a6b8a, fog: true });
for (let i = 0; i < 14; i++) {
  const sx = -38 + i * 5.6 + (Math.random() - 0.5) * 2, sz = -30 - Math.random() * 8;
  if (i % 3 === 0) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 5), _silMat);
    trunk.position.set(sx, 1.1, sz); scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.4, 6), _silMat);
    crown.position.set(sx, 3.8, sz); scene.add(crown);
  } else if (i % 3 === 1) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2), _silMat);
    h.position.set(sx, 0.9, sz); scene.add(h);
    const r = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 4), _silMat);
    r.position.set(sx, 2.5, sz); r.rotation.y = Math.PI / 4; scene.add(r);
  } else {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2, 1.8, 4), _silMat);
    tent.position.set(sx, 0.9, sz); tent.rotation.y = Math.PI / 4; scene.add(tent);
  }
}

// ---------- Kerupuk texture (bumpy disc) ----------
function kerupukTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f3e2c2'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const r = 2 + Math.random() * 7;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(190,140,90,.55)' : 'rgba(255,250,235,.8)';
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 7); g.fill();
  }
  // lattice bump pattern (woven cracker surface)
  g.strokeStyle = 'rgba(170,115,60,.5)'; g.lineWidth = 2;
  for (let i = -8; i < 16; i++) {
    g.beginPath(); g.moveTo(i * 24, 0); g.lineTo(i * 24 + 128, 256); g.stroke();
    g.beginPath(); g.moveTo(i * 24 + 128, 0); g.lineTo(i * 24, 256); g.stroke();
  }
  g.strokeStyle = '#c89b62'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const KRUPUK_TEX = prepareTexture(kerupukTexture());
const KRUPUK_NRM = normalFromTexture(KRUPUK_TEX, 2.6);

// ---------- Village backdrop: houses, gate, flags, bunting ----------
const redMat = new THREE.MeshStandardMaterial({ color: 0xd21f26, roughness: 0.6 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.6 });

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3a44, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b3f21, roughness: 0.8 });
function makeHouse(x, z, w, h, color) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, envMapIntensity: 0.6 }));
  base.position.y = h / 2; base.castShadow = base.receiveShadow = true; grp.add(base);
  // roof with a slight eaves overhang
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, h * 0.72, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a4a2b, roughness: 0.9, envMapIntensity: 0.5 }));
  roof.position.y = h + h * 0.34; roof.rotation.y = Math.PI / 4; roof.castShadow = true; grp.add(roof);
  // door + two windows on the face toward the street
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.85), doorMat);
  door.position.set(0, 0.93, 2.005); grp.add(door);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), glassMat);
    win.position.set(sx * w * 0.28, h * 0.62, 2.005); grp.add(win);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.82),
      new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.8 }));
    frame.position.set(sx * w * 0.28, h * 0.62, 2.0); grp.add(frame);
    win.position.z = 2.008;
  }
  grp.position.set(x, 0, z);
  scene.add(grp);
}
makeHouse(-12, -12, 6, 3, 0xe8dcc3); makeHouse(-4, -14, 7, 3.4, 0xd9e6f2);
makeHouse(5, -14, 6, 3, 0xf2e3c9); makeHouse(13, -12, 7, 3.6, 0xe3d5e8);
makeHouse(-18, -4, 5, 2.8, 0xdcebd4); makeHouse(18, -4, 5, 2.8, 0xf5d9c8);

// 17-Agustus gate (gapura)
function makeGate() {
  const g = new THREE.Group();
  const pilMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
  [-4.5, 4.5].forEach(x => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.4, 0.7), pilMat);
    p.position.set(x, 2.7, 0); p.castShadow = true; g.add(p);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.1, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.6 }));
  beam.position.y = 5.4; beam.castShadow = true; g.add(beam);
  const txt = document.createElement('canvas'); txt.width = 512; txt.height = 64;
  const tg = txt.getContext('2d');
  tg.fillStyle = '#b91c1c'; tg.fillRect(0, 0, 512, 64);
  tg.fillStyle = '#fff'; tg.font = 'bold 34px sans-serif'; tg.textAlign = 'center';
  tg.fillText('DIRGAHAYU RI • 17 AGUSTUS', 256, 43);
  const tt = new THREE.CanvasTexture(txt); tt.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 0.95),
    new THREE.MeshBasicMaterial({ map: tt }));
  banner.position.set(0, 5.4, 0.45); g.add(banner);
  // flags on top
  for (let i = -2; i <= 2; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), whiteMat);
    pole.position.set(i * 2, 6.7, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xd21f26, side: THREE.DoubleSide }));
    flag.position.set(i * 2 + 0.45, 7.1, 0); flag.userData.flag = true; g.add(flag);
  }
  g.position.set(0, 0, -9);
  scene.add(g);
}
makeGate();
// Waving red-white flags (plane geometry, vertex sin wave)
const wavingFlags = [];
function makeWavingFlag(x, y, z, w = 1.1, h = 0.7) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 4);
  const grp = new THREE.Group();
  const top = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({ color: 0xd21f26, side: THREE.DoubleSide, roughness: 0.7 }));
  top.position.y = h / 4;
  const bot = new THREE.Mesh(geo.clone(), whiteMat.clone()); bot.material.side = THREE.DoubleSide;
  bot.position.y = -h / 4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), whiteMat);
  pole.position.x = -w / 2; pole.position.y = -0.4;
  grp.add(top, bot, pole); grp.position.set(x, y, z);
  grp.userData = { top, bot, phase: Math.random() * 6.28 };
  wavingFlags.push(grp); scene.add(grp); return grp;
}
makeWavingFlag(-7, 3.6, -2); makeWavingFlag(7, 3.6, -2); makeWavingFlag(-7, 3.6, 4); makeWavingFlag(7, 3.6, 4);
// Kampung street: parked motorbike (wheels + body boxes)
{
  const bike = new THREE.Group();
  const wheelGeo = new THREE.TorusGeometry(0.28, 0.07, 8, 18);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  [-0.65, 0.65].forEach(wx => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(wx, 0.28, 0); w.castShadow = true; bike.add(w); });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.28), new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.3 }));
  body.position.y = 0.55; body.castShadow = true; bike.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.26), wheelMat); seat.position.set(-0.15, 0.78, 0); bike.add(seat);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), wheelMat);
  handle.rotation.x = Math.PI / 2; handle.position.set(0.62, 0.95, 0); bike.add(handle);
  bike.position.set(9.5, 0, 3.5); bike.rotation.y = -0.5; scene.add(bike);
}
// Stalls with awnings
function makeStall(x, z, color) {
  const s = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x9a6a3b, roughness: 0.85 }));
  counter.position.y = 0.45; counter.castShadow = true; s.add(counter);
  const awnGeo = new THREE.PlaneGeometry(2.1, 1.1, 6, 1);
  const awn = new THREE.Mesh(awnGeo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
  awn.position.set(0, 1.85, 0.15); awn.rotation.x = -0.45; awn.castShadow = true; s.add(awn);
  [-0.85, 0.85].forEach(px => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), counter.material); p.position.set(px, 0.95, 0); s.add(p); });
  s.position.set(x, 0, z); scene.add(s); return awn;
}
const stallAwnings = [makeStall(-9.5, 3.8, 0xd21f26), makeStall(10.5, -3, 0xf8f8f8), makeStall(-10.5, -3.5, 0x2563eb)];

// Bunting: two catenary rows of red-white triangles
const buntingFlags = [];
function buntingRow(z0, y0, z1, y1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -9 + 18 * t;
    const sag = Math.sin(t * Math.PI) * -0.9;
    const y = y0 + (y1 - y0) * t + sag;
    const z = z0 + (z1 - z0) * t;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.02, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b3a1e }));
  scene.add(rope);
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, 0); shape.lineTo(0.22, 0); shape.lineTo(0, -0.5); shape.closePath();
  const triGeo = new THREE.ShapeGeometry(shape);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const m = new THREE.Mesh(triGeo, new THREE.MeshStandardMaterial({
      color: i % 2 ? 0xffffff : 0xd21f26, side: THREE.DoubleSide, roughness: 0.7 }));
    m.position.copy(pts[i]);
    m.userData.phase = Math.random() * 6.28;
    buntingFlags.push(m); scene.add(m);
  }
}
buntingRow(2.5, 5.6, -9, 6.1, 22);
buntingRow(3.5, 5.2, -9, 5.9, 22);

// Bamboo pole frame (lashed poles, procedural bamboo texture)
function bambooTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c2a15a'; g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(120,90,40,${Math.random() * 0.3})`; g.fillRect(Math.random() * 128, Math.random() * 32, 4, 1); }
  g.fillStyle = '#8a6d2f'; g.fillRect(30, 0, 5, 32); g.fillRect(78, 0, 5, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bambooTex = prepareTexture(bambooTexture());
const bambooMat = new THREE.MeshStandardMaterial({
  map: bambooTex, roughness: 0.7,
  normalMap: normalFromTexture(bambooTex, 2.4), normalScale: new THREE.Vector2(1.0, 1.0),
});
const lashMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.95 });
const barY = 3.1;
[-6, 6].forEach(x => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, barY + 0.4, 10), bambooMat);
  post.position.set(x, (barY + 0.4) / 2, 1.2); post.castShadow = true; scene.add(post);
  // lashing at top joint
  const lash = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12), lashMat);
  lash.rotation.x = Math.PI / 2; lash.position.set(x, barY - 0.05, 1.2); scene.add(lash);
});
const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12.6, 10), bambooMat);
bar.rotation.z = Math.PI / 2; bar.position.set(0, barY, 1.2); bar.castShadow = true; scene.add(bar);

// ---------- Low-poly humans (seated, hands behind back) ----------
function skinTone(i) { return [0xc68e5e, 0xa06a3c, 0x8a5632, 0xd9a066, 0x6b4423][i % 5]; }
function shirtColor(i) { return [0xd21f26, 0x1d4ed8, 0x16a34a, 0xeab308][i % 4]; }
function shortsColor(i) { return [0x1f2937, 0x7c2d12, 0x14532d, 0x1e3a5f][i % 4]; }
const _eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
const _eyeGeo = new THREE.SphereGeometry(0.028, 8, 6);

function makeHuman(idx, x, isPlayer) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinTone(idx), roughness: 0.6 });
  const shirt = new THREE.MeshPhysicalMaterial({
    color: shirtColor(idx), roughness: 0.84, sheen: 0.4, sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0xffffff),
  });
  const pants = new THREE.MeshStandardMaterial({ color: shortsColor(idx), roughness: 0.9 });

  // plastic stool (colored, legs)
  const stoolMat = new THREE.MeshStandardMaterial({ color: [0x2563eb, 0xd21f26, 0x16a34a, 0xeab308][idx % 4], roughness: 0.5 });
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.30, 0.08, 14), stoolMat);
  stool.position.y = 0.48; stool.castShadow = stool.receiveShadow = true; g.add(stool);
  [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.48, 6), stoolMat);
    leg.position.set(lx, 0.24, lz); g.add(leg);
  });
  // torso group with pivot at waist (lean driven by effort)
  const torsoG = new THREE.Group(); torsoG.position.y = 0.52; g.add(torsoG);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.55, 6, 12), shirt);
  torso.position.y = 0.53; torso.castShadow = true; torsoG.add(torso);
  // numbered bib cloth on the chest (woven plane so it can flutter)
  const bibTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, 128, 160);
    g.strokeStyle = '#d0ccc0'; g.lineWidth = 4; g.strokeRect(3, 3, 122, 154);
    g.fillStyle = '#c1121f'; g.font = 'bold 86px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('17', 64, 88);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42, 4, 3),
    new THREE.MeshStandardMaterial({ map: bibTex, side: THREE.DoubleSide, roughness: 0.92 }));
  bib.position.set(0, 0.55, 0.29); bib.rotation.x = -0.08; torsoG.add(bib);
  // legs: hip pivots -> thigh, knee pivots -> shin (articulated)
  const legPivots = [];
  [-0.16, 0.16].forEach(sx => {
    const hip = new THREE.Group(); hip.position.set(sx, 0.62, 0.05); g.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), pants);
    thigh.position.set(0, -0.05, 0.22); thigh.rotation.x = Math.PI / 2.2; thigh.castShadow = true; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -0.02, 0.44); hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.36, 4, 8), pants);
    shin.position.y = -0.22; shin.castShadow = true; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.22), skin);
    foot.position.set(0, -0.46, 0.05); knee.add(foot);
    legPivots.push({ hip, knee });
  });
  // arms: shoulder pivots posed behind back (hands behind back)
  const armPivots = [];
  [-1, 1].forEach(side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.32, 1.42, 0); g.add(sh);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), shirt);
    arm.position.y = -0.22; arm.castShadow = true; sh.add(arm);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), skin);
    fore.position.set(0, -0.48, -0.14); fore.rotation.x = -1.1; sh.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), skin);
    hand.position.set(0, -0.63, -0.33); sh.add(hand);
    sh.rotation.x = 0.85; sh.rotation.z = side * -0.35; // behind back
    armPivots.push(sh);
  });
  // neck pivot -> head group (lunge bites from neck)
  const neckG = new THREE.Group(); neckG.position.y = 1.58; g.add(neckG);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 8), skin);
  neck.position.y = 0.02; neckG.add(neck);
  const headG = new THREE.Group(); headG.position.y = 0.14; neckG.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skin);
  head.position.y = 0.14; head.castShadow = true; headG.add(head);
  // face: eyes, nose, ears
  [-0.09, 0.09].forEach(ex => {
    const eye = new THREE.Mesh(_eyeGeo, _eyeMat);
    eye.position.set(ex, 0.175, 0.222); headG.add(eye);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skin);
  nose.position.set(0, 0.12, 0.243); headG.add(nose);
  for (const ex of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
    ear.position.set(ex * 0.225, 0.145, 0.02); ear.scale.set(0.55, 1, 0.8); headG.add(ear);
  }
  // hair / cap variation
  if (idx % 2 === 0) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.242, 20, 12, 0, Math.PI * 2, 0, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 }));
    hair.position.y = 0.20; hair.rotation.x = -0.12; headG.add(hair);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, 1.0),
      new THREE.MeshStandardMaterial({ color: shirtColor(idx), roughness: 0.7 }));
    cap.position.y = 0.18; headG.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 10), cap.material);
    brim.position.set(0, 0.24, 0.22); headG.add(brim);
  }
  // mouth (bite target indicator)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 }));
  mouth.position.set(0, 0.04, 0.21); headG.add(mouth);
  // headband merah-putih for player
  if (isPlayer) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xd21f26, roughness: 0.6 }));
    band.rotation.x = Math.PI / 2 - 0.25; band.position.y = 0.24; headG.add(band);
  }
  g.position.set(x, 0, 0);
  scene.add(g);
  return { group: g, headG, neckG, torsoG, bib, legPivots, armPivots, mouth, phase: Math.random() * 6.28, biteAnim: 0, swingVel: 0 };
}

// ---------- Racers: player + 3 AI ----------
const NAMES = ['KAMU / YOU', 'AI Budi', 'AI Siti', 'AI Agus'];
const AI_SPEED = [0, 0.62, 0.78, 0.95];      // bites/sec baseline
const AI_BITE = [0, 7.5, 8.5, 10];           // damage per bite
const XS = [-4.5, -1.5, 1.5, 4.5];
const racers = [];
for (let i = 0; i < 4; i++) {
  const isPlayer = i === 0;
  const h = makeHuman(i, XS[i], isPlayer);
  // string + kerupuk disc
  const stringLen = barY - 2.05;
  const strGeo = new THREE.CylinderGeometry(0.015, 0.015, stringLen, 6);
  const str = new THREE.Mesh(strGeo, new THREE.MeshStandardMaterial({ color: 0xeee7d3 }));
  str.position.set(XS[i], barY - stringLen / 2, 1.2);
  scene.add(str);
  // irregular rim: displaced circle geometry
  const kGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 28);
  {
    const pos = kGeo.attributes.position;
    for (let vi = 0; vi < pos.count; vi++) {
      const vx = pos.getX(vi), vz = pos.getZ(vi);
      const d = Math.hypot(vx, vz);
      if (d > 0.3) { const n = 1 + (Math.sin(vi * 12.9898) * 0.5) * 0.09; pos.setX(vi, vx * n); pos.setZ(vi, vz * n); }
    }
    kGeo.computeVertexNormals();
  }
  const kMat = new THREE.MeshStandardMaterial({
    map: KRUPUK_TEX, roughness: 0.78, metalness: 0.03,
    normalMap: KRUPUK_NRM, normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: KRUPUK_TEX, envMapIntensity: 0.8,
  });
  const cracker = new THREE.Mesh(kGeo, kMat);
  cracker.rotation.x = Math.PI / 2 - 0.15;
  cracker.castShadow = true;
  scene.add(cracker);
  // progress ring under cracker
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 32),
    new THREE.MeshBasicMaterial({ color: isPlayer ? 0x22c55e : 0xfbbf24, transparent: true, opacity: 0.45 }));
  scene.add(ring);
  racers.push({
    i, name: NAMES[i], isPlayer, human: h, string: str, cracker, ring,
    size: 100, swingPhase: Math.random() * 6.28, swingAmp: i === 0 ? 0.12 : 0.35 + Math.random() * 0.3,
    swingSpeed: 1.2 + Math.random() * 1.2, headYaw: 0, stamina: 100,
    pendAngle: (Math.random() - 0.5) * 0.5, pendVel: 0, biteCount: 0,
    aiTimer: 1 / (AI_SPEED[i] || 1), finished: false, finishTime: 0, crumbs: []
  });
}

// ---------- Particles: instanced crumbs + dust bursts + confetti (capped, pooled) ----------
const CRUMB_MAX = 150;
const crumbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.02, 0.05),
  new THREE.MeshStandardMaterial({ color: 0xe8cf9f, roughness: 0.9 }), CRUMB_MAX);
crumbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); crumbMesh.castShadow = true; crumbMesh.count = 0; scene.add(crumbMesh);
const crumbs = []; // {pos,vel,life,rot}
const _dummy = new THREE.Object3D();
let cameraShake = 0;
function spawnCrumbs(pos, n = 8) {
  for (let k = 0; k < n && crumbs.length < CRUMB_MAX; k++) {
    crumbs.push({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 2.4, vy: Math.random() * 2.2 + 0.5, vz: (Math.random() - 0.5) * 2.4, life: 1.4, rot: Math.random() * 6.28 });
  }
  spawnDust(pos, 4);
}
// Dust burst pool (Points)
const DUST_MAX = 120;
const dustPos = new Float32Array(DUST_MAX * 3); const dustVel = new Float32Array(DUST_MAX * 3); const dustLife = new Float32Array(DUST_MAX);
for (let di = 0; di < DUST_MAX; di++) dustPos[di * 3 + 1] = -10;
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0xd8c8a8, size: 0.12, map: dotTexture(), transparent: true, opacity: 0.55,
  depthWrite: false, alphaTest: 0.02,
}));
scene.add(dust); let dustCursor = 0;
function spawnDust(pos, n = 6) {
  for (let k = 0; k < n; k++) {
    const i = dustCursor; dustCursor = (dustCursor + 1) % DUST_MAX;
    dustPos[i * 3] = pos.x; dustPos[i * 3 + 1] = Math.max(0.05, pos.y - 1.2); dustPos[i * 3 + 2] = pos.z;
    dustVel[i * 3] = (Math.random() - 0.5) * 1.2; dustVel[i * 3 + 1] = 0.6 + Math.random(); dustVel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    dustLife[i] = 0.7;
  }
}
// Confetti on win (instanced, capped)
const CONF_MAX = 120;
const confMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_MAX);
confMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); confMesh.count = 0; scene.add(confMesh);
const confetti = [];
const _confColors = [new THREE.Color(0xd21f26), new THREE.Color(0xffffff), new THREE.Color(0xfbbf24), new THREE.Color(0x22c55e)];
function spawnConfetti() {
  confetti.length = 0;
  for (let i = 0; i < CONF_MAX; i++) {
    confetti.push({ x: (Math.random() - 0.5) * 10, y: 5 + Math.random() * 3, z: 1 + (Math.random() - 0.5) * 3, vy: -0.8 - Math.random(), rot: Math.random() * 6.28, rs: (Math.random() - 0.5) * 4, life: 4 });
    confMesh.setColorAt(i, _confColors[i % 4]);
  }
  if (confMesh.instanceColor) confMesh.instanceColor.needsUpdate = true;
}

// ---------- Ambience: wind, crowd murmur, cicadas (synthesised, no assets) ----------
const Amb = {
  master: null, on: true,
  start() {
    const ctx = AudioFX.ctx; if (!ctx || this.master) return;
    const master = ctx.createGain();
    master.gain.value = 0.0001; master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 4);
    this.master = master;
    const len = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.6; }
    const layer = (type, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(master); src.start();
      return g;
    };
    const wind = layer('lowpass', 450, 0.7, 0.05);
    layer('bandpass', 760, 1.4, 0.02);
    layer('bandpass', 2000, 0.8, 0.005);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.028;
    lfo.connect(lfoG).connect(wind.gain); lfo.start();
    const chirp = () => {
      if (!this.on) { setTimeout(chirp, 1600); return; }
      const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 4200 + Math.random() * 900;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.011, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      o.connect(g).connect(master); o.start(t0); o.stop(t0 + 0.2);
      setTimeout(chirp, 1500 + Math.random() * 3000);
    };
    setTimeout(chirp, 1200);
  },
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.5 : 0.0001, this.master.context.currentTime, 0.25);
    if (v) this.start();
  },
};
addEventListener('pointerdown', () => { AudioFX.ensure(); Amb.start(); }, { once: true });
addEventListener('keydown', () => { AudioFX.ensure(); Amb.start(); }, { once: true });
addEventListener('keydown', (e) => { if (e.code === 'KeyM') Amb.setOn(!Amb.on); });

// ---------- Ambient life: birds + wind-blown leaves ----------
const birds = [];
{
  const wingGeo = new THREE.PlaneGeometry(0.44, 0.17, 2, 1);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 2, 6), birdMat);
    body.rotation.z = Math.PI / 2; b.add(body);
    const pivL = new THREE.Group(); const wL = new THREE.Mesh(wingGeo, birdMat); wL.position.x = -0.21; pivL.add(wL); b.add(pivL);
    const pivR = new THREE.Group(); const wR = new THREE.Mesh(wingGeo, birdMat); wR.position.x = 0.21; pivR.add(wR); b.add(pivR);
    b.userData = { pivL, pivR, r: 15 + i * 3.5, y: 10 + (i % 3) * 2.6, a: Math.random() * 6.28, speed: 0.06 + Math.random() * 0.05 };
    scene.add(b); birds.push(b);
  }
}
const LEAF_N = 24;
const leafGeo = new THREE.BufferGeometry();
const leafPos = new Float32Array(LEAF_N * 3);
const leafSeed = new Float32Array(LEAF_N);
for (let i = 0; i < LEAF_N; i++) {
  leafPos[i * 3] = (Math.random() - 0.5) * 26;
  leafPos[i * 3 + 1] = 0.2 + Math.random() * 4;
  leafPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
  leafSeed[i] = Math.random() * 6.28;
}
leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({
  color: 0xc7a35c, size: 0.1, transparent: true, opacity: 0.75, depthWrite: false,
}));
leaves.frustumCulled = false; scene.add(leaves);

// ---------- Game state ----------
const TIME_LIMIT = 60;
let state = 'menu'; // menu | play | over
let timeLeft = TIME_LIMIT, elapsed = 0;
let biteHeld = false, biteCooldown = 0;
let mouseNX = 0; // -1..1 from mouse/touch

const $ = id => document.getElementById(id);
const overlay = $('overlay'), resultEl = $('result'), resultsTable = $('results-table');

function buildRacerHUD() {
  const wrap = $('racers'); wrap.innerHTML = '';
  racers.forEach(r => {
    const d = document.createElement('div');
    d.className = 'racer' + (r.isPlayer ? ' me' : '');
    d.id = 'racer-' + r.i;
    d.innerHTML = `<b>${r.name}</b> <span>100%</span><div class="bar"><i style="width:100%"></i></div>`;
    wrap.appendChild(d);
  });
}

function startGame() {
  AudioFX.ensure();
  racers.forEach(r => {
    r.size = 100; r.stamina = r.isPlayer ? 100 : 999;
    r.finished = false; r.finishTime = 0;
    r.aiTimer = 1 / (AI_SPEED[r.i] || 1);
    r.swingPhase = Math.random() * 6.28;
    r.pendAngle = (Math.random() - 0.5) * 0.5; r.pendVel = 0; r.biteCount = 0;
    r.cracker.rotation.set(Math.PI / 2 - 0.15, 0, 0);
  });
  crumbs.length = 0; confetti.length = 0;
  timeLeft = TIME_LIMIT; elapsed = 0; biteCooldown = 0;
  state = 'play';
  overlay.style.display = 'none';
  $('hud').classList.remove('hidden');
  $('touch-controls').classList.remove('hidden');
  buildRacerHUD();
  AudioFX.blip(659, 0.15, 'triangle', 0.1);
}

function endGame(reason) {
  state = 'over';
  const order = [...racers].sort((a, b) => (a.size - b.size) || ((a.finishTime || 99) - (b.finishTime || 99)));
  const playerRank = order.indexOf(racers[0]) + 1;
  const win = playerRank === 1;
  if (win) { AudioFX.cheer(); spawnConfetti(); cameraShake = 0.35; } else AudioFX.sad();
  overlay.style.display = 'flex';
  $('btn-start').textContent = 'MAIN LAGI / RESTART';
  const verdict = win ? '🏆 MENANG! Kamu tercepat! / YOU WIN!' : `Kalah — peringkat #${playerRank}. / You placed #${playerRank}.`;
  resultEl.textContent = (reason === 'time' ? '⏱ Waktu habis! / Time up! ' : '') + verdict;
  resultsTable.classList.remove('hidden');
  resultsTable.innerHTML = order.map((r, k) =>
    `<div><span>${['🥇', '🥈', '🥉', '4.'][k]} ${r.name}</span><span>${r.size <= 0 ? 'HABIS! 🎉' : Math.ceil(r.size) + '% tersisa'}${r.finishTime ? ' • ' + r.finishTime.toFixed(1) + 's' : ''}</span></div>`
  ).join('');
}

// Player bite: only lands when cracker near mouth (|offset| small)
function playerBite() {
  const p = racers[0];
  if (state !== 'play' || p.finished || biteCooldown > 0) return;
  biteCooldown = 0.32;
  const tired = p.stamina < 25;
  p.human.biteAnim = 1;
  // how aligned is head vs cracker swing?
  const crackerX = p.cracker.position.x;
  const mouthX = p.human.group.position.x + p.headYaw * 0.9;
  const miss = Math.abs(crackerX - mouthX);
  if (miss < 0.30) {
    const depth = 1 - miss / 0.30;                 // 1 = mouthful, 0 = graze
    const dmg = (tired ? 3 : 5.5) + depth * 5.5 + Math.random() * 1.6;
    p.size = Math.max(0, p.size - dmg);
    p.biteCount++; p.pendVel += (Math.random() - 0.5) * 1.2; // bite knocks pendulum
    p.cracker.rotation.y += 0.6; // jagged rim rotation reveals fresh notch
    p.stamina = Math.max(0, p.stamina - 9);
    spawnCrumbs(p.cracker.position, 10);
    cameraShake = Math.max(cameraShake, 0.12);
    AudioFX.crunch();
    if (p.size <= 0) { p.finished = true; p.finishTime = elapsed; }
  } else {
    p.stamina = Math.max(0, p.stamina - 3);
    AudioFX.miss();
  }
}

// ---------- Input: mouse + touch + keyboard ----------
addEventListener('pointermove', e => { mouseNX = (e.clientX / innerWidth) * 2 - 1; });
addEventListener('touchmove', e => {
  if (e.touches[0]) mouseNX = (e.touches[0].clientX / innerWidth) * 2 - 1;
}, { passive: true });
canvas.addEventListener('pointerdown', () => { AudioFX.ensure(); biteHeld = true; playerBite(); });
addEventListener('pointerup', () => { biteHeld = false; });
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) playerBite(); biteHeld = true; }
  if (e.code === 'ArrowLeft') mouseNX = Math.max(-1, mouseNX - 0.2);
  if (e.code === 'ArrowRight') mouseNX = Math.min(1, mouseNX + 0.2);
  if (e.code === 'Enter' && state !== 'play') startGame();
});
addEventListener('keyup', e => { if (e.code === 'Space') biteHeld = false; });

// touch buttons
const hold = (id, down, up) => {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); down(); });
  el.addEventListener('pointerup', () => up && up());
  el.addEventListener('pointerleave', () => up && up());
};
let swingDir = 0;
hold('btn-left', () => swingDir = -1, () => swingDir = 0);
hold('btn-right', () => swingDir = 1, () => swingDir = 0);
hold('btn-bite', () => { biteHeld = true; playerBite(); }, () => biteHeld = false);
setInterval(() => { if (biteHeld && state === 'play') playerBite(); }, 340);
$('btn-start').addEventListener('click', startGame);
window.__booted = true;
$('btn-cam').addEventListener('click', e => {
  followCam = !followCam;
  e.target.textContent = followCam ? 'Kamera: Ikuti / Follow' : 'Kamera: Bebas / Orbit';
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Animation loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ambient motion always (menu shows lively scene)
  const gust = 0.72 + 0.34 * Math.sin(t * 0.42) + 0.16 * Math.sin(t * 1.9 + 0.9);
  buntingFlags.forEach(f => { f.rotation.y = Math.sin(t * 2 + f.userData.phase) * 0.4 * gust; });
  scene.traverse(o => { if (o.userData.flag) o.rotation.y = Math.sin(t * 3 + o.position.x) * 0.3 * gust; });
  clouds.forEach(cl => { cl.position.x += cl.userData.speed * gust * dt; if (cl.position.x > 45) cl.position.x = -45; });
  // birds wheel overhead; leaves ride the gust
  for (const b of birds) {
    const u = b.userData;
    u.a += u.speed * dt * (1 + gust * 0.5);
    b.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.7 + u.a) * 0.9, Math.sin(u.a) * u.r * 0.7 - 2);
    b.rotation.y = -u.a + Math.PI / 2;
    const flap = Math.sin(t * 9 + u.a * 3) * 0.62;
    u.pivL.rotation.z = flap; u.pivR.rotation.z = -flap;
  }
  for (let i = 0; i < LEAF_N; i++) {
    leafPos[i * 3] += (0.3 + gust * 0.8) * dt;
    leafPos[i * 3 + 1] += Math.sin(t * 1.6 + leafSeed[i]) * dt * 0.25;
    leafPos[i * 3 + 2] += Math.cos(t * 1.05 + leafSeed[i]) * dt * 0.2;
    if (leafPos[i * 3] > 14) { leafPos[i * 3] = -14; leafPos[i * 3 + 2] = (Math.random() - 0.5) * 16; }
  }
  leafGeo.attributes.position.needsUpdate = true;
  // waving flags: vertex sin wave (reuse position attribute, no alloc)
  wavingFlags.forEach(wf => {
    [wf.userData.top, wf.userData.bot].forEach(mesh => {
      const p = mesh.geometry.attributes.position;
      for (let vi = 0; vi < p.count; vi++) {
        const vx = p.getX(vi);
        p.setZ(vi, Math.sin(vx * 4 + t * 6 + wf.userData.phase) * 0.08 * gust * (vx + 0.55));
      }
      p.needsUpdate = true; mesh.geometry.computeVertexNormals();
    });
  });
  stallAwnings.forEach((awn, ai) => { awn.rotation.x = -0.45 + Math.sin(t * 2 + ai) * 0.04; });

  if (swingDir !== 0) mouseNX = THREE.MathUtils.clamp(mouseNX + swingDir * dt * 1.6, -1, 1);

  racers.forEach(r => {
    // pendulum physics: angle + angular velocity, gravity restore + damping
    const pendLen = 1.05;
    r.pendVel += (-9.8 / pendLen * Math.sin(r.pendAngle) - 0.35 * r.pendVel) * dt;
    // gentle drive keeps it swinging; player head movement adds impulse (below)
    r.pendVel += Math.sin(t * 0.9 + r.swingPhase) * dt * (r.isPlayer ? 0.25 : 0.9);
    r.pendAngle = THREE.MathUtils.clamp(r.pendAngle + r.pendVel * dt, -0.65, 0.65);
    const cx = XS[r.i] + Math.sin(r.pendAngle) * pendLen * 1.6;
    const cy = 2.02 + (1 - Math.cos(r.pendAngle)) * 0.35;
    r.cracker.position.set(cx, cy, 1.0);
    r.cracker.rotation.z = -r.pendAngle * 0.7;
    // shrink as eaten
    const s = 0.25 + 0.75 * (r.size / 100);
    r.cracker.scale.set(s, 1, s);
    r.cracker.visible = r.size > 0;
    // string follows cracker top
    const topY = barY;
    const len = topY - cy;
    r.string.scale.y = len / (barY - 2.05);
    r.string.position.set(cx + (XS[r.i] - cx) * 0.15, (topY + cy) / 2, 1.12);
    // progress ring
    r.ring.position.set(XS[r.i], 0.62, 1.55);
    r.ring.rotation.x = -Math.PI / 2 + 0.2;
    const frac = r.size / 100;
    r.ring.material.color.setHSL(0.33 * frac, 0.9, 0.5);
    r.ring.scale.setScalar(0.6 + 0.4 * frac);
    r.ring.visible = state === 'play' && r.size > 0;

    // head/neck/torso animation driven by velocity & effort (biteAnim, stamina)
    const h = r.human;
    const effort = r.isPlayer ? (1 - (r.stamina ?? 100) / 100) : 0.4;
    const swingPhaseAnim = t * (3 + effort * 2) + h.phase;
    if (r.isPlayer) {
      const prevYaw = r.headYaw;
      r.headYaw += ((mouseNX * 0.55) - r.headYaw) * Math.min(1, dt * 6);
      r.pendVel += (r.headYaw - prevYaw) * 2.2; // head movement adds pendulum impulse
      h.headG.rotation.y = r.headYaw;
      h.neckG.rotation.x = -0.3 + Math.sin(t * 2.2) * 0.05 - h.biteAnim * 0.55; // neck lunge
      h.neckG.rotation.y = r.headYaw * 0.5;
      h.headG.rotation.x = -0.1 - h.biteAnim * 0.3;
      h.headG.position.x = r.headYaw * 0.2;
      h.torsoG.rotation.x = 0.12 + h.biteAnim * 0.35 + Math.sin(swingPhaseAnim) * 0.03; // torso lean
      h.torsoG.rotation.y = r.headYaw * 0.3;
    } else {
      const track = THREE.MathUtils.clamp((cx - XS[r.i]) * 2.2, -0.5, 0.5);
      h.headG.rotation.y += (track - h.headG.rotation.y) * Math.min(1, dt * (2 + r.i));
      h.neckG.rotation.x = -0.3 + Math.sin(t * (2 + r.i * 0.5) + h.phase) * 0.1 - h.biteAnim * 0.55;
      h.headG.rotation.x = -0.1 - h.biteAnim * 0.3;
      h.torsoG.rotation.x = 0.12 + h.biteAnim * 0.35;
    }
    // head bob + limb swing tied to swing phase, bib flutter
    h.group.position.y = Math.abs(Math.sin(swingPhaseAnim)) * (0.02 + effort * 0.02);
    h.legPivots.forEach((lp, li) => { lp.knee.rotation.x = Math.sin(swingPhaseAnim + li * Math.PI) * 0.08 * (0.5 + effort); });
    h.armPivots.forEach(ap => { ap.rotation.x = 0.85 + Math.sin(swingPhaseAnim) * 0.05; });
    if (h.bib) { const bp = h.bib.geometry.attributes.position; for (let vi = 0; vi < bp.count; vi++) bp.setZ(vi, Math.sin(t * 5 + vi + h.phase) * 0.015); bp.needsUpdate = true; }
    h.biteAnim = Math.max(0, h.biteAnim - dt * 4);
    h.group.position.x = XS[r.i];
  });

  // gameplay timers
  if (state === 'play') {
    elapsed += dt; timeLeft -= dt;
    biteCooldown = Math.max(0, biteCooldown - dt);
    const p = racers[0];
    p.stamina = Math.min(100, p.stamina + dt * 11); // regen
    // AI eat on their own clocks
    racers.slice(1).forEach(r => {
      if (r.finished) return;
      r.aiTimer -= dt;
      if (r.aiTimer <= 0) {
        r.aiTimer = 1 / AI_SPEED[r.i] * (0.85 + Math.random() * 0.3);
        r.size = Math.max(0, r.size - AI_BITE[r.i] * (0.8 + Math.random() * 0.4));
        r.biteCount++; r.pendVel += (Math.random() - 0.5) * 0.8; r.cracker.rotation.y += 0.6;
        r.human.biteAnim = 1;
        spawnCrumbs(r.cracker.position, 5);
        if (r.size <= 0) { r.finished = true; r.finishTime = elapsed; }
      }
    });
    // HUD
    $('hud-timer').textContent = Math.max(0, timeLeft).toFixed(1);
    $('hud-progress').textContent = Math.ceil(p.size) + '%';
    $('stamina-fill').style.width = p.stamina + '%';
    racers.forEach(r => {
      const el = $('racer-' + r.i);
      if (el) {
        el.querySelector('span').textContent = r.finished ? 'HABIS! 🎉' : Math.ceil(r.size) + '%';
        el.querySelector('i').style.width = r.size + '%';
      }
    });
    const order = [...racers].sort((a, b) => a.size - b.size);
    $('hud-rank').textContent = '#' + (order.indexOf(p) + 1) + ' / 4';

    if (p.finished && order[0] === p) endGame('win');
    else if (racers.every(r => r.finished)) endGame('all');
    else if (timeLeft <= 0) endGame('time');
  }

  // crumbs physics: gravity + floor bounce, instanced rendering
  for (let i = crumbs.length - 1; i >= 0; i--) {
    const c = crumbs[i];
    c.vy -= 6 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.life -= dt; c.rot += dt * 3;
    if (c.y < 0.03) { c.y = 0.03; c.vy *= -0.35; c.vx *= 0.7; c.vz *= 0.7; }
    if (c.life <= 0) crumbs.splice(i, 1);
  }
  crumbs.forEach((c, i) => { _dummy.position.set(c.x, c.y, c.z); _dummy.rotation.set(c.rot, c.rot * 0.7, 0); _dummy.scale.setScalar(Math.min(1, c.life)); _dummy.updateMatrix(); crumbMesh.setMatrixAt(i, _dummy.matrix); });
  crumbMesh.count = crumbs.length; crumbMesh.instanceMatrix.needsUpdate = true;
  // dust update
  for (let i = 0; i < DUST_MAX; i++) {
    if (dustLife[i] <= 0) continue;
    dustLife[i] -= dt; dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt; dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
    if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -10;
  }
  dustGeo.attributes.position.needsUpdate = true;
  // confetti update
  confetti.forEach((c, i) => { c.y += c.vy * dt; c.rot += c.rs * dt; c.life -= dt; _dummy.position.set(c.x, Math.max(0.05, c.y), c.z); _dummy.rotation.set(c.rot, c.rot * 0.6, 0); _dummy.scale.setScalar(c.life > 0 ? 1 : 0); _dummy.updateMatrix(); confMesh.setMatrixAt(i, _dummy.matrix); });
  confMesh.count = confetti.length; if (confetti.length) confMesh.instanceMatrix.needsUpdate = true;

  // camera + subtle shake on impact
  cameraShake = Math.max(0, cameraShake - dt * 1.2);
  if (followCam && state === 'play') {
    const swayX = Math.sin(t * 0.62) * 0.05 + Math.sin(t * 1.83 + 0.4) * 0.02;
    const swayY = Math.sin(t * 0.94 + 1.1) * 0.035;
    tmpV.set(racers[0].human.group.position.x * 0.5 + swayX, 2.6 + swayY, 7.5);
    camera.position.lerp(tmpV, Math.min(1, dt * 2));
    tmpV.set(racers[0].human.group.position.x * 0.5 + swayX * 0.4, 1.7 + swayY, 0.8);
    controls.target.lerp(tmpV, Math.min(1, dt * 2));
  }
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake * 0.15;
    camera.position.y += (Math.random() - 0.5) * cameraShake * 0.12;
  }
  controls.update();
  renderer.render(scene, camera);
}
buildRacerHUD();
animate();

