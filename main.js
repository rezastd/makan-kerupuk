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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, 25, 90);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 3.2, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.maxDistance = 25; controls.minDistance = 3;
let followCam = true;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x5a4a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -10;
sun.shadow.camera.far = 50; sun.shadow.bias = -0.0004;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xff9999, 0.4);
rim.position.set(-8, 5, -6); scene.add(rim);

// ---------- Ground (canvas texture) ----------
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a8a5a'; g.fillRect(0, 0, 512, 512);
  // street strip
  g.fillStyle = '#8d8578'; g.fillRect(0, 200, 512, 120);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.setLineDash([24, 18]);
  g.beginPath(); g.moveTo(0, 260); g.lineTo(512, 260); g.stroke();
  g.setLineDash([]);
  // grass noise
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${40 + Math.random() * 30 | 0},.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

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
  g.strokeStyle = '#c89b62'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const KRUPUK_TEX = kerupukTexture();

// ---------- Village backdrop: houses, gate, flags, bunting ----------
const redMat = new THREE.MeshStandardMaterial({ color: 0xd21f26, roughness: 0.6 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.6 });

function makeHouse(x, z, w, h, color) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  base.position.y = h / 2; base.castShadow = base.receiveShadow = true; grp.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, h * 0.7, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a4a2b, roughness: 0.9 }));
  roof.position.y = h + h * 0.35; roof.rotation.y = Math.PI / 4; roof.castShadow = true; grp.add(roof);
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

// Hanging bar (tali + wood frame)
const barY = 3.1;
[-6, 6].forEach(x => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, barY + 0.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 }));
  post.position.set(x, (barY + 0.4) / 2, 1.2); post.castShadow = true; scene.add(post);
});
const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12.6, 10),
  new THREE.MeshStandardMaterial({ color: 0x7c5228, roughness: 0.8 }));
bar.rotation.z = Math.PI / 2; bar.position.set(0, barY, 1.2); bar.castShadow = true; scene.add(bar);

// ---------- Low-poly humans (seated, hands behind back) ----------
function skinTone(i) { return [0xc68e5e, 0xa06a3c, 0x8a5632, 0xd9a066][i % 4]; }
function shirtColor(i) { return [0xd21f26, 0x1d4ed8, 0x16a34a, 0xeab308][i % 4]; }

function makeHuman(idx, x, isPlayer) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinTone(idx), roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor(idx), roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });

  // stool
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x9a6a3b, roughness: 0.85 }));
  stool.position.y = 0.25; stool.castShadow = stool.receiveShadow = true; g.add(stool);
  // torso (seated)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.55, 6, 12), shirt);
  torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
  // legs (thighs forward = seated)
  [-0.16, 0.16].forEach(sx => {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.4, 4, 8), pants);
    thigh.position.set(sx, 0.62, 0.30); thigh.rotation.x = Math.PI / 2.2; thigh.castShadow = true; g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), pants);
    shin.position.set(sx, 0.32, 0.52); shin.castShadow = true; g.add(shin);
  });
  // arms tied behind back (visible behind torso)
  [-0.34, 0.34].forEach(sx => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.42, 4, 8), sx < 0 ? shirt : skin);
    arm.position.set(sx, 1.0, -0.30); arm.rotation.x = 0.5; arm.castShadow = true; g.add(arm);
  });
  // head group (swings)
  const headG = new THREE.Group(); headG.position.y = 1.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skin);
  head.castShadow = true; headG.add(head);
  // hair cap
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.245, 20, 12, 0, Math.PI * 2, 0, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
  hair.position.y = 0.03; headG.add(hair);
  // mouth (bite target indicator)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 }));
  mouth.position.set(0, -0.10, 0.21); headG.add(mouth);
  // headband merah-putih for player
  if (isPlayer) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xd21f26, roughness: 0.6 }));
    band.rotation.x = Math.PI / 2 - 0.25; band.position.y = 0.10; headG.add(band);
  }
  g.add(headG);
  g.position.set(x, 0, 0);
  scene.add(g);
  return { group: g, headG, mouth, phase: Math.random() * 6.28, biteAnim: 0 };
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
  const kGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 24);
  const kMat = new THREE.MeshStandardMaterial({ map: KRUPUK_TEX, roughness: 0.75, metalness: 0.05, bumpMap: KRUPUK_TEX, bumpScale: 0.6 });
  const cracker = new THREE.Mesh(kGeo, kMat);
  cracker.rotation.x = Math.PI / 2 - 0.15;
  cracker.castShadow = true;
  scene.add(cracker);
  // progress ring under cracker
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 32),
    new THREE.MeshBasicMaterial({ color: isPlayer ? 0x22c55e : 0xfbbf24 }));
  scene.add(ring);
  racers.push({
    i, name: NAMES[i], isPlayer, human: h, string: str, cracker, ring,
    size: 100, swingPhase: Math.random() * 6.28, swingAmp: i === 0 ? 0.12 : 0.35 + Math.random() * 0.3,
    swingSpeed: 1.2 + Math.random() * 1.2, headYaw: 0, stamina: 100,
    aiTimer: 1 / (AI_SPEED[i] || 1), finished: false, finishTime: 0, crumbs: []
  });
}

// ---------- Crumbs particles ----------
const crumbGeo = new THREE.SphereGeometry(0.03, 6, 5);
const crumbMat = new THREE.MeshStandardMaterial({ color: 0xe8cf9f, roughness: 0.9 });
const crumbs = [];
function spawnCrumbs(pos, n = 8) {
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(crumbGeo, crumbMat);
    m.position.copy(pos);
    m.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4);
    m.userData.life = 1.2;
    scene.add(m); crumbs.push(m);
  }
}

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
  });
  crumbs.forEach(c => scene.remove(c)); crumbs.length = 0;
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
  if (win) AudioFX.cheer(); else AudioFX.sad();
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
    const dmg = (tired ? 4 : 9) + Math.random() * 3;
    p.size = Math.max(0, p.size - dmg);
    p.stamina = Math.max(0, p.stamina - 9);
    spawnCrumbs(p.cracker.position, 10);
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
  buntingFlags.forEach(f => { f.rotation.y = Math.sin(t * 2 + f.userData.phase) * 0.4; });
  scene.traverse(o => { if (o.userData.flag) o.rotation.y = Math.sin(t * 3 + o.position.x) * 0.3; });

  if (swingDir !== 0) mouseNX = THREE.MathUtils.clamp(mouseNX + swingDir * dt * 1.6, -1, 1);

  racers.forEach(r => {
    // cracker pendulum swing
    const sw = Math.sin(t * r.swingSpeed + r.swingPhase) * r.swingAmp;
    const cx = XS[r.i] + sw;
    const cy = 2.02 + Math.abs(Math.sin(t * r.swingSpeed + r.swingPhase)) * 0.06;
    r.cracker.position.set(cx, cy, 1.0);
    r.cracker.rotation.z += dt * (r.i % 2 ? 0.8 : -0.8);
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

    // head animation
    const h = r.human;
    if (r.isPlayer) {
      r.headYaw += ((mouseNX * 0.55) - r.headYaw) * Math.min(1, dt * 6);
      h.headG.rotation.y = r.headYaw;
      h.headG.rotation.x = -0.35 + Math.sin(t * 2.2) * 0.06 - h.biteAnim * 0.45;
      h.headG.position.x = r.headYaw * 0.35;
      h.group.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
    } else {
      // AI bob + auto-track their cracker (skill varies)
      const track = THREE.MathUtils.clamp((cx - XS[r.i]) * 2.2, -0.5, 0.5);
      h.headG.rotation.y += (track - h.headG.rotation.y) * Math.min(1, dt * (2 + r.i));
      h.headG.rotation.x = -0.35 + Math.sin(t * (2 + r.i * 0.5) + h.phase) * 0.12 - h.biteAnim * 0.45;
      h.group.position.y = Math.abs(Math.sin(t * (2.4 + r.i * 0.3) + h.phase)) * 0.03;
    }
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

  // crumbs physics
  for (let i = crumbs.length - 1; i >= 0; i--) {
    const c = crumbs[i];
    c.userData.vel.y -= 6 * dt;
    c.position.addScaledVector(c.userData.vel, dt);
    c.userData.life -= dt;
    if (c.position.y < 0.02 || c.userData.life <= 0) { scene.remove(c); crumbs.splice(i, 1); }
  }

  // camera
  if (followCam && state === 'play') {
    tmpV.set(racers[0].human.group.position.x * 0.5, 2.6, 7.5);
    camera.position.lerp(tmpV, Math.min(1, dt * 2));
    controls.target.lerp(new THREE.Vector3(racers[0].human.group.position.x * 0.5, 1.7, 0.8), Math.min(1, dt * 2));
  }
  controls.update();
  renderer.render(scene, camera);
}
buildRacerHUD();
animate();

