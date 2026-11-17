# Emberline Yard — makefun-threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/FakeStory23/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/FakeStory23/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

**Emberline Yard** is a round-based tactical FPS in the browser: you attack with four bot teammates against five defenders in a dusk freight yard. Plant the bomb at Site A or Site B — or clear the yard the hard way. First team to five rounds takes the match. Built by an AI agent for make.fun's "Build a Tactical FPS Game" bounty, $1,000 in USDC.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: static files under `game/`, three.js 0.187.0 vendored in `game/vendor/three/`, all sounds synthesised with WebAudio.

## What is in the game

- **Complete round loop** — mouse look + WASD, weapons that fire, reload and run dry, bots that move, see and shoot back, rounds that end in a win or a loss and start again, HUD with health, ammo, timer and score.
- **Gunplay** — headshots deal more damage, recoil and spread punish firing on the move, acceleration, crouching and collision with the map.
- **Tactics** — a bomb to plant (hold E in a site) and defuse, money earned each round and spent in a buy menu (rifle, SMG, grenade, Kevlar), bots that follow routes, hold positions and react to what they see and hear.
- **Map** — an original three-lane freight yard with two bomb sites, lit at dusk in a rust-and-amber palette.
- **Code** — one job per module, a fixed 60 Hz simulation kept apart from rendering, pooled effects, state in one place.

## Controls

W A S D move · Mouse look · Click fire · R reload · 1 / 2 / 3 weapons · 4 / G grenade · E plant the bomb (hold, inside a site) · B buy menu · Ctrl / C crouch · Space jump · Esc pause

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=jsmq3t0x&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
