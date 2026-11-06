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
