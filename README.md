# 🍘 Makan Kerupuk 3D — Simulator 17 Agustus 🇮🇩

Realistic 3D browser simulator of the Indonesian Independence Day game **Makan Kerupuk** (hanging cracker eating, hands behind back). You vs 3 AI — fastest to finish the cracker wins!

## Run

```bash
cd makan-kerupuk
python3 -m http.server 8000
# open http://localhost:8000
```

No build step. Needs internet (Three.js CDN: `unpkg three@0.160.0` via importmap).

## Files

- `index.html` — scene canvas, HUD (timer/progress/stamina/rank), overlays, touch buttons, importmap
- `main.js` — full Three.js game (scene, humans, AI, physics, audio, controls)
- `style.css` — HUD/overlay/touch styling
- `README.md` — this file

## Controls

| Input | Action |
|---|---|
| Mouse move / touch drag / ◀ ▶ buttons / ← → | Swing head (aim mouth at cracker) |
| `SPACE` / click-hold / 😬 GIGIT button | Bite (rhythmic; 0.32s cooldown) |
| `ENTER` | Start / restart |
| Drag background (orbit) | Free camera (toggle Kamera button for follow cam) |

A bite only lands when the cracker is close to your mouth — watch the swing! Each bite drains stamina; low stamina = weak bites. Stamina regenerates over time.

## Features

- **3D**: hemisphere + shadowed directional lighting, fog, canvas ground texture, PBR-ish materials, animated low-poly seated humans, crumb particles
- **Scene**: hanging bar with 4 swinging kerupuk discs (bumpy canvas texture, shrink as eaten), bite progress rings, village houses, DIRGAHAYU RI gate, waving flags, red-white bunting
- **HUD**: timer (60s), cracker %, stamina bar, live rank + per-racer bars
- **Overlays**: Indonesian + English start/win/results panel with restart
- **Sound**: WebAudio oscillators (crunch/miss/cheer/sad), no assets
- **AI**: Budi / Siti / Agus with varied bite speed & damage

## Realism Upgrade

- **Renderer**: ACESFilmic tone mapping (exposure 1.1), sRGB output, PCFSoft shadows.
- **Sky & environment**: gradient sky dome, drifting low-poly clouds, distant tree/house/tent silhouettes, kampung street with houses, parked motorbike, stalls with fluttering awnings, afternoon shadows.
- **Ground**: multi-layer procedural canvas texture (base + dirt patches + speckles) with scattered grass tufts, stones, and reflective puddles.
- **Kerupuk**: lattice bump texture, irregular displaced rim, true pendulum physics (angle + angular velocity; head movement and bites add impulse). Each bite shrinks the disc, rotates the jagged rim, and spawns instanced crumb chips with gravity and floor bounce.
- **Characters**: articulated head/neck/torso/hip/knee/shoulder pivots, varied skin tones and shirt/shorts colors, eyes, hair or cap, plastic stools, hands behind back, bib cloth, neck-lunge bite animation, torso lean and head bob tied to swing phase and stamina effort.
- **Lighting & flags**: warm sun + hemisphere + ambient bounce; red-white waving flags use plane geometry with per-vertex sine wave; bunting and stall awnings flutter.
- **Feedback**: dust bursts on bites, subtle camera shake on impact, confetti on win.
- **Performance**: shared geometries/materials, capped instanced particle pools (150 crumbs / 120 dust / 120 confetti), reused temp vectors and dummy object — no per-frame allocations in the hot loop.
- **Frame**: bamboo poles with lashing and procedural bamboo texture replace the plain wooden bar.
