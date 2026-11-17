// Emberline Yard — the game itself. This file owns the loop: a fixed 60 Hz
// simulation step kept apart from rendering, the shooting that player and bots
// both use, grenades, the bomb channel, and the ?shot= staging for screenshots.
// Everything else lives in its own module; this file only wires them together.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { MAP, createCollision } from './map.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import {
  WEAPONS, GRENADE, ARMOR_PRICE, createOwnedWeapon, weaponStep, weaponReady,
  weaponFire, weaponReload, weaponSpread, buildViewModel,
} from './weapons.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS, DEFUSE_SECONDS, PLANT_SECONDS, ECONOMY } from './rounds.js';
import { createEffects } from './effects.js';
import { createHUD } from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') ?? 7);
// ?fx=low turns shadows off and renders at pixel ratio 1: the same game, for
// slow machines (and for headless testing under software rendering).
const LOWFX = params.get('fx') === 'low';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWFX, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOWFX ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 120);
scene.add(camera);

const random = mulberry32(SEED);
const collision = createCollision(MAP);
const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(collision);
const bots = createBots(scene, collision, random);
const rounds = createRounds();
const hud = createHUD(buyItem);

const S = {
  time: 0,
  random,
  started: false,
  paused: false,
  over: false,
  money: ECONOMY.startMoney,
  owned: new Map(),
  current: 'pistol',
  grenades: 0,
  heat: 0,
  grenadesLive: [],
  menuOpen: false,
  prevFiring: false,
  plantBeepAt: 0,
  bombBeepAt: 0,
  minimapAt: 0,
  frozen: false,
};

const raycaster = new THREE.Raycaster();
const losRaycaster = new THREE.Raycaster();
const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();

let viewModel = null;
function rebuildViewModel() {
  if (viewModel) viewModel.dispose();
  viewModel = buildViewModel(camera, WEAPONS[S.current]);
}
S.owned.set('pistol', createOwnedWeapon(WEAPONS.pistol));
rebuildViewModel();

const input = createInput(canvas, (locked) => {
  if (locked) {
    audio.unlock();
    if (S.menuOpen) {
      // The buy menu needs the cursor: a lock that engages while it is open
      // (the PLAY click's request racing the menu's exit) is released at once.
      document.exitPointerLock?.();
      return;
    }
    if (S.paused) {
      S.paused = false;
      hud.hidePause();
    }
  } else if (S.started && !S.over && !S.menuOpen && (rounds.state.phase === 'buy' || rounds.state.phase === 'live') && !SHOT) {
    S.paused = true;
    hud.showPause();
  }
});

// Clicking the yard re-locks the pointer after it was released (e.g. by the
// buy menu), so mouse look comes back without reopening an overlay.
canvas.addEventListener('click', () => {
  if (S.started && !S.over && !S.paused && !S.menuOpen && (rounds.state.phase === 'buy' || rounds.state.phase === 'live')) {
    input.requestLock();
  }
});

function openBuyMenu() {
  hud.refreshBuy(S.money, { armor: player.state.armor, weapons: new Set(S.owned.keys()) }, S.grenades);
  hud.setBuyVisible(true);
  S.menuOpen = true;
  document.exitPointerLock?.();
}

function closeBuyMenu() {
  hud.setBuyVisible(false);
  if (!S.menuOpen) return;
  S.menuOpen = false;
  if (S.started && !S.over && !SHOT) input.requestLock();
}

function currentOwned() {
  return S.owned.get(S.current);
}

function switchWeapon(id) {
  if (!S.owned.has(id) || S.current === id) return;
  S.current = id;
  rebuildViewModel();
  hud.setWeapon(WEAPONS[id].name);
  hud.setAmmo(currentOwned().mag, currentOwned().reserve);
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy' || !player.state.alive) return;
  if (id === 'grenade') {
    if (S.grenades >= 2) return;
    if (S.money < GRENADE.price) {
      hud.toast('Not enough money');
      return;
    }
    S.money -= GRENADE.price;
    S.grenades += 1;
    audio.buy();
    hud.toast('Frag grenade bought — press 4 or G to throw');
  } else if (id === 'armor') {
    if (player.state.armor) return;
    if (S.money < ARMOR_PRICE) {
      hud.toast('Not enough money');
      return;
    }
    S.money -= ARMOR_PRICE;
    player.state.armor = true;
    audio.buy();
    hud.toast('Kevlar vest equipped');
  } else {
    if (S.owned.has(id)) return;
    const def = WEAPONS[id];
    if (S.money < def.price) {
      hud.toast('Not enough money');
      return;
    }
    S.money -= def.price;
    S.owned.set(id, createOwnedWeapon(def));
    switchWeapon(id);
    audio.buy();
    hud.toast(`${def.name} bought — press 2 to switch`);
  }
  hud.setMoney(S.money);
  hud.refreshBuy(S.money, { armor: player.state.armor, weapons: new Set(S.owned.keys()) }, S.grenades);
}

function resetPositions() {
  const [x, z] = MAP.spawns.attack[0];
  player.reset(x, z, 0);
  bots.resetRound();
  S.grenadesLive = [];
  S.heat = 0;
  S.plantBeepAt = 0;
}

function startMatch() {
  S.started = true;
  S.over = false;
  S.money = ECONOMY.startMoney;
  S.owned = new Map([['pistol', createOwnedWeapon(WEAPONS.pistol)]]);
  S.current = 'pistol';
  S.grenades = 0;
  rebuildViewModel();
  rounds.startMatch();
  resetPositions();
  hud.hideStart();
  hud.showHud(true);
  hud.setWeapon(WEAPONS.pistol.name);
  hud.setMoney(S.money);
  hud.setScore(0, 0);
  openBuyMenu();
  hud.banner('ROUND 1 — BUY PHASE', 'Spend your $800, then take a site', 'info');
}

function resetForRound() {
  const keep = new Map(S.owned);
  S.owned = keep;
  resetPositions();
  hud.setWeapon(WEAPONS[S.current].name);
  hud.setMoney(S.money);
  hud.setScore(rounds.state.score[0], rounds.state.score[1]);
  openBuyMenu();
  hud.banner(`ROUND ${rounds.state.round} — BUY PHASE`, 'Buy up, then take a site', 'info');
}

function endRound(winner, reason) {
  if (rounds.state.phase !== 'live') return;
  rounds.endRound(winner, reason);
  S.money += winner === 0 ? ECONOMY.win : ECONOMY.loss;
  hud.setMoney(S.money);
  hud.setScore(rounds.state.score[0], rounds.state.score[1]);
  if (winner === 0) audio.roundWin();
  else audio.roundLose();
  hud.showEnd(winner === 0 ? 'ROUND WON' : 'ROUND LOST', reason);
  hud.setBomb('');
  hud.setPlant(null);
}

function hasLOS(from, to) {
  tmpDir.copy(to).sub(from);
  const dist = tmpDir.length();
  if (dist < 0.01) return true;
  tmpDir.multiplyScalar(1 / dist);
  losRaycaster.set(from, tmpDir);
  losRaycaster.far = dist - 0.05;
  return losRaycaster.intersectObjects(world.shootables, false).length === 0;
}

function raySphere(origin, dir, center, radius) {
  tmpPoint.copy(center).sub(origin);
  const along = tmpPoint.dot(dir);
  if (along < 0) return Infinity;
  const d2 = tmpPoint.lengthSq() - along * along;
  if (d2 > radius * radius) return Infinity;
  return along - Math.sqrt(radius * radius - d2);
}

function applyDamageToBot(bot, damage, part, killer, killerName) {
  if (!bot.alive) return;
  const final = bot.armor ? damage * 0.55 : damage;
  bot.health -= final;
  bot.flashTimer = 0.12;
  if (killer === 'player') {
    hud.hitmarker(part === 'head');
    audio.hit(part === 'head');
  }
  if (bot.health > 0) return;
  bots.kill(bot);
  const head = part === 'head' ? ' — headshot' : '';
  hud.killfeed(`${killerName}  ⌖  ${bot.name}${head}`, killer === 'player' ? 'good' : 'bad');
  if (killer === 'player') {
    S.money += ECONOMY.kill;
    hud.setMoney(S.money);
  }
}

// One shooting function for everyone: a ray from a muzzle along a direction.
// Returns the hit point (or the ray's end) so tracers and impacts agree.
function fire(origin, dir, def, owner, ownerName) {
  raycaster.set(origin, dir);
  raycaster.far = def.range;
  const targets = world.shootables.concat(bots.hitMeshes());
  const hits = raycaster.intersectObjects(targets, false);
  let endDistance = def.range;
  let hitPoint = null;
  if (hits.length) {
    endDistance = hits[0].distance;
    hitPoint = hits[0].point;
  }
  // The player is a pair of spheres, not a mesh: test the ray against them.
  if (owner !== 'player' && player.state.alive) {
    const chest = raySphere(origin, dir, tmpPoint.set(player.state.position.x, player.state.position.y + 1.2, player.state.position.z), 0.42);
    const head = raySphere(origin, dir, tmpPoint.set(player.state.position.x, player.state.position.y + 1.55, player.state.position.z), 0.2);
    const nearest = Math.min(chest, head);
    if (nearest < endDistance) {
      const damage = def.damage * (head < chest ? def.headMult : 1);
      damagePlayer(damage, origin, ownerName);
      endDistance = nearest;
      hitPoint = null;
    }
  }
  if (hitPoint) {
    const hit = hits[0];
    const info = hit.object.userData.hit;
    if (info) {
      const damage = def.damage * (info.part === 'head' ? def.headMult : 1);
      effects.blood(hitPoint);
      applyDamageToBot(info.bot, damage, info.part, owner, ownerName);
    } else {
      effects.impact(hitPoint);
    }
  }
  tmpPoint.copy(origin).addScaledVector(dir, endDistance);
  return tmpPoint;
}

function damagePlayer(damage, fromPos, killerName) {
  const p = player.state;
  if (!p.alive) return;
  const final = p.armor ? damage * 0.55 : damage;
  p.health -= final;
  audio.hurt();
  effects.addShake(0.18);
  const dx = fromPos.x - p.position.x;
  const dz = fromPos.z - p.position.z;
  const worldAngle = Math.atan2(dx, dz);
  const relative = worldAngle - p.yaw;
  hud.damageFrom((relative * 180) / Math.PI);
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
    hud.killfeed(killerName ? `${killerName}  ⌖  YOU` : `☠  YOU were eliminated`, 'bad');
    checkRoundEnd();
  }
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const attackersAlive = (player.state.alive ? 1 : 0) + bots.aliveCount(0);
  const defendersAlive = bots.aliveCount(1);
  const bomb = rounds.state.bomb;
  if (attackersAlive === 0) {
    if (bomb.state === 'planted') return; // the fuse decides now
    endRound(1, 'Your team was wiped out');
  } else if (defendersAlive === 0) {
    if (bomb.state === 'planted') return; // the fuse decides now
    endRound(0, 'Site cleared — all defenders down');
  }
}

function throwGrenade() {
  if (S.grenades <= 0 || (rounds.state.phase !== 'live' && rounds.state.phase !== 'buy') || !player.state.alive) return;
  S.grenades -= 1;
  audio.grenadePin();
  player.eyePosition(tmpEye);
  camera.getWorldDirection(tmpDir);
  tmpDir.y += 0.35;
  tmpDir.normalize();
  S.grenadesLive.push({
    pos: tmpEye.clone(),
    vel: tmpDir.clone().multiplyScalar(14).add(player.state.velocity),
    fuse: GRENADE.fuse,
  });
}

function explodeGrenade(grenade) {
  const pos = grenade.pos;
  effects.explosion(pos);
  audio.explosion();
  bots.hearNoise(pos.x, pos.z, 30, 'live', S.time);
  const victims = [];
  if (player.state.alive) victims.push({ kind: 'player', pos: player.state.position, y: 1.2 });
  for (const bot of bots.bots) {
    if (bot.alive) victims.push({ kind: 'bot', bot, pos: bot.pos, y: 1.2 });
  }
  for (const victim of victims) {
    const dx = victim.pos.x - pos.x;
    const dy = (victim.pos.y + victim.y) - pos.y;
    const dz = victim.pos.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > GRENADE.radius) continue;
    let damage = GRENADE.maxDamage + ((GRENADE.minDamage - GRENADE.maxDamage) * dist) / GRENADE.radius;
    if (!hasLOS(pos, tmpPoint.set(victim.pos.x, victim.pos.y + victim.y, victim.pos.z))) damage *= 0.5;
    if (victim.kind === 'player') damagePlayer(damage, pos);
    else applyDamageToBot(victim.bot, damage, 'torso', 'player', 'YOU');
  }
  checkRoundEnd();
}

function stepGrenades(dt) {
  for (let i = S.grenadesLive.length - 1; i >= 0; i -= 1) {
    const grenade = S.grenadesLive[i];
    grenade.vel.y -= 18 * dt;
    const [nx, nz] = collision.move(grenade.pos.x, grenade.pos.z, 0.15, grenade.pos.y, 0.3, grenade.vel.x * dt, grenade.vel.z * dt);
    if (nx === grenade.pos.x) grenade.vel.x *= -0.35;
    if (nz === grenade.pos.z) grenade.vel.z *= -0.35;
    grenade.pos.x = nx;
    grenade.pos.z = nz;
    grenade.pos.y += grenade.vel.y * dt;
    if (grenade.pos.y < 0.1) {
      grenade.pos.y = 0.1;
      grenade.vel.y *= -0.35;
      grenade.vel.x *= 0.7;
      grenade.vel.z *= 0.7;
    }
    grenade.fuse -= dt;
    if (grenade.fuse <= 0) {
      S.grenadesLive.splice(i, 1);
      explodeGrenade(grenade);
    }
  }
}

function playerShoot() {
  const owned = currentOwned();
  if (!weaponReady(owned)) return;
  weaponFire(owned);
  S.heat = Math.min(1, S.heat + 0.22);
  audio.shot(owned.def.kind);
  player.eyePosition(tmpEye);
  camera.getWorldDirection(tmpDir);
  const spread = weaponSpread(owned, player.groundSpeed(), S.heat);
  tmpDir.x += (S.random() - 0.5) * 2 * spread;
  tmpDir.y += (S.random() - 0.5) * 2 * spread;
  tmpDir.z += (S.random() - 0.5) * 2 * spread;
  tmpDir.normalize();
  tmpMuzzle.copy(tmpEye).addScaledVector(tmpDir, 0.6);
  tmpMuzzle.y -= 0.12;
  const hit = fire(tmpEye, tmpDir, owned.def, 'player', 'YOU');
  effects.tracer(tmpMuzzle, hit);
  player.recoil(owned.def.recoil, (S.random() - 0.5) * owned.def.recoil * 0.6);
  bots.hearNoise(tmpEye.x, tmpEye.z, 26, rounds.state.phase, S.time);
}

function botShoot(bot, muzzle, aim) {
  // muzzle and aim are the bot module's scratch vectors: copy them now.
  const origin = muzzle.clone();
  const target = aim.clone();
  tmpDir.copy(target).sub(origin);
  const dist = tmpDir.length();
  tmpDir.multiplyScalar(1 / (dist || 1));
  const spread = 0.018 + dist * 0.0006;
  tmpDir.x += (S.random() - 0.5) * 2 * spread;
  tmpDir.y += (S.random() - 0.5) * 2 * spread;
  tmpDir.z += (S.random() - 0.5) * 2 * spread;
  tmpDir.normalize();
  audio.shot('rifle');
  const hit = fire(origin, tmpDir, WEAPONS.rifle, bot.name, bot.name);
  effects.tracer(origin, hit);
  bots.hearNoise(origin.x, origin.z, 26, rounds.state.phase, S.time);
}

const botCtx = {
  get time() { return S.time; },
  get phase() { return rounds.state.phase; },
  // The bots see the player through the same shape as a bot: a pos vector and
  // an alive flag. (player.state keeps its position under .position.)
  player: {
    get pos() { return player.state.position; },
    get alive() { return player.state.alive; },
  },
  get bomb() { return rounds.state.bomb; },
  audio,
  hasLOS,
  fireBot: botShoot,
  onDefuseTick(dt) {
    const bomb = rounds.state.bomb;
    bomb.defuseProgress += dt / DEFUSE_SECONDS;
    if (bomb.defuseProgress >= 1) {
      bomb.state = 'defused';
      bomb.defuseProgress = 1;
      endRound(1, 'Bomb defused — site held');
    }
  },
};

function stepPlant(dt, keys) {
  const bomb = rounds.state.bomb;
  if (rounds.state.phase !== 'live' || bomb.state !== 'carried' || !player.state.alive) {
    if (bomb.state === 'carried') {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
      if (bomb.plantProgress === 0) hud.setPlant(null);
    }
    return;
  }
  let site = null;
  for (const candidate of MAP.sites) {
    const dx = player.state.position.x - candidate.x;
    const dz = player.state.position.z - candidate.z;
    if (dx * dx + dz * dz < candidate.r * candidate.r) site = candidate;
  }
  const planting = site && keys.has('KeyE') && player.groundSpeed() < 2.5;
  if (planting) {
    bomb.plantProgress += dt / PLANT_SECONDS;
    if (S.time - S.plantBeepAt > 1) {
      S.plantBeepAt = S.time;
      audio.plantBeep(false);
    }
    hud.setPlant(bomb.plantProgress);
    if (bomb.plantProgress >= 1) {
      bomb.plantProgress = 1;
      rounds.plant(site.id, site.x, site.z);
      S.money += ECONOMY.plant;
      hud.setMoney(S.money);
      audio.plantBeep(true);
      audio.bombBeep();
      hud.setPlant(null);
      hud.banner('BOMB PLANTED', `Site ${site.id} — defend it for 35 seconds`, 'warn');
      hud.killfeed(`YOU planted the bomb at Site ${site.id}`, 'good');
      bots.goDefuse({ x: site.x, z: site.z });
    }
  } else {
    bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
    hud.setPlant(bomb.plantProgress > 0 ? bomb.plantProgress : null);
  }
}

function updateHUD() {
  const p = player.state;
  const owned = currentOwned();
  hud.setHealth(p.health, p.armor);
  hud.setAmmo(owned.mag, owned.reserve);
  hud.setMoney(S.money);
  const bomb = rounds.state.bomb;
  if (rounds.state.phase === 'buy') hud.setTimer(rounds.state.timer);
  else if (rounds.state.phase === 'live') hud.setTimer(bomb.state === 'planted' ? bomb.fuse : rounds.state.timer);
  else hud.setTimer(0);
  hud.setScore(rounds.state.score[0], rounds.state.score[1]);
  hud.setAlive((p.alive ? 1 : 0) + bots.aliveCount(0), bots.aliveCount(1));
  if (bomb.state === 'planted') hud.setBomb(`BOMB PLANTED — SITE ${bomb.site} — ${Math.ceil(bomb.fuse)}s`, bomb.fuse <= 10);
  else if (bomb.state === 'carried' && rounds.state.phase === 'live') hud.setBomb('BOMB — reach a site, hold E to plant', false);
  else if (bomb.state === 'defused') hud.setBomb('BOMB DEFUSED', false);
  else if (bomb.state === 'exploded') hud.setBomb('BOMB DETONATED', true);
  else hud.setBomb('');
  const spread = weaponSpread(owned, player.groundSpeed(), S.heat);
  hud.setCrosshair(spread * 2600);
  S.minimapAt -= STEP;
  if (S.minimapAt <= 0) {
    S.minimapAt = 0.15;
    hud.drawMinimap(player.state, bots.bots, bomb);
  }
  if (bomb.state === 'planted' && S.time - S.bombBeepAt > (bomb.fuse <= 10 ? 0.5 : 1)) {
    S.bombBeepAt = S.time;
    audio.bombBeep();
  }
}

function fixedStep(dt) {
  S.time += dt;
  const keys = input.state.keys;
  const look = input.takeLook();
  if (look.x || look.y) player.look(look.x, look.y);
  S.heat = Math.max(0, S.heat - dt * 0.9);

  const phase = rounds.state.phase;
  if (phase === 'end') {
    rounds.state.timer -= dt;
    if (rounds.state.timer <= 0) {
      hud.hideEnd();
      const next = rounds.nextRound();
      if (next === 'match') {
        S.over = true;
        hud.showMatch(rounds.matchWinner() === 0, rounds.state.score);
        document.exitPointerLock?.();
      } else {
        resetForRound();
      }
    }
  }

  const frozen = S.paused || phase === 'menu' || phase === 'match';
  player.step(dt, keys, frozen || !player.state.alive);
  weaponStep(currentOwned(), dt);
  bots.step(dt, botCtx);
  stepGrenades(dt);
  world.step(S.time);
  effects.step(dt);
  hud.step(dt);

  if (phase === 'buy' || phase === 'live') {
    // Buy menu, weapon switching, reload, grenades — only while playing.
    if (keys.has('KeyB') && !fixedStep.prevB && phase === 'buy') {
      if (S.menuOpen) closeBuyMenu();
      else openBuyMenu();
    }
    fixedStep.prevB = keys.has('KeyB');
    if (keys.has('Digit1')) switchWeapon('pistol');
    if (keys.has('Digit2')) switchWeapon('rifle');
    if (keys.has('Digit3')) switchWeapon('smg');
    if ((keys.has('Digit4') || keys.has('KeyG')) && !fixedStep.grenadeUsed) {
      fixedStep.grenadeUsed = true;
      throwGrenade();
    }
    if (!keys.has('Digit4') && !keys.has('KeyG')) fixedStep.grenadeUsed = false;
    if (keys.has('KeyR') && weaponReload(currentOwned())) audio.reload();

    if ((phase === 'live' || phase === 'buy') && player.state.alive && !S.paused) {
      const owned = currentOwned();
      const firing = input.state.firing && input.state.locked;
      if (firing && owned.mag === 0) {
        // Empty: one click reloads if there is reserve, otherwise a dry click.
        if (!S.prevFiring) {
          if (weaponReload(owned)) audio.reload();
          else audio.dry();
        }
      } else if (firing && !owned.def.auto && !S.prevFiring) {
        playerShoot();
      } else if (firing && owned.def.auto && weaponReady(owned)) {
        playerShoot();
      }
      S.prevFiring = firing;
      stepPlant(dt, keys);
    }
  }

  const event = rounds.tick(dt);
  if (event === 'live') {
    closeBuyMenu();
    hud.banner(`ROUND ${rounds.state.round}`, 'Plant the bomb at Site A or B', 'info');
  } else if (event === 'timeout') {
    endRound(1, 'Time expired — the sites held');
  } else if (event === 'explode') {
    const bomb = rounds.state.bomb;
    effects.explosion(new THREE.Vector3(bomb.pos.x, 0.8, bomb.pos.z));
    audio.explosion();
    endRound(0, 'Bomb detonated — Site ' + bomb.site + ' is gone');
  }
  if (phase === 'live') checkRoundEnd();
  updateHUD();
  if (viewModel) viewModel.step(currentOwned(), dt);
}

let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (S.frozen) return;
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard < 40) {
    fixedStep(STEP);
    accumulator -= STEP;
    guard += 1;
  }
  const p = player.state;
  player.eyePosition(tmpEye);
  camera.position.copy(tmpEye);
  camera.rotation.order = 'YXZ';
  const shake = effects.shakeValue();
  camera.rotation.y = p.yaw + (S.random() - 0.5) * shake * 0.03;
  camera.rotation.x = p.pitch + (S.random() - 0.5) * shake * 0.03;
  camera.rotation.z = 0;
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Buttons.
document.getElementById('play-btn').addEventListener('click', () => {
  audio.unlock();
  if (!S.started || S.over) startMatch();
  else hud.hideStart();
  input.requestLock();
});
document.getElementById('resume-btn').addEventListener('click', () => input.requestLock());
document.getElementById('restart-btn').addEventListener('click', () => {
  hud.hidePause();
  startMatch();
  input.requestLock();
});
document.getElementById('again-btn').addEventListener('click', () => {
  document.getElementById('overlay-match').classList.add('hidden');
  startMatch();
  input.requestLock();
});
document.getElementById('buy-close').addEventListener('click', () => closeBuyMenu());

// Idle backdrop behind the start overlay: the yard, seen from the south spawn.
player.reset(MAP.spawns.attack[0][0], MAP.spawns.attack[0][1], 0);
bots.resetRound();
hud.showStart();
hud.showHud(false);

window.__game = {
  S, player, bots, rounds, input, hud, fire, damagePlayer, applyDamageToBot,
  startMatch, endRound, throwGrenade,
  // Fast-forward the simulation n fixed steps (debug/QA handle: lets a test
  // run a round without waiting on the renderer's frame rate).
  step(n) {
    for (let i = 0; i < n; i += 1) fixedStep(STEP);
  },
  teleport(x, z, yaw) {
    player.state.position.set(x, 0, z);
    player.state.yaw = yaw;
    player.state.pitch = 0;
  },
};

if (SHOT) {
  S.frozen = true;
  setupShot(SHOT);
} else {
  requestAnimationFrame(frame);
}

function setupShot(mode) {
  startMatch();
  hud.showHud(true);
  if (mode === 'start') {
    // Just past the spawn wall, looking up the mid lane into the yard. The
    // buy menu stays shut here: this shot is the yard, not the shop.
    player.reset(0, 11, 0);
    hud.setBuyVisible(false);
  } else if (mode === 'buy') {
    // Same vantage, menu open. The spawn pocket itself is not a vantage: it
    // faces the spawn wall's shadowed south face, which reads as black.
    player.reset(0, 11, 0);
    hud.setBuyVisible(true);
    hud.refreshBuy(S.money, { armor: false, weapons: new Set(['pistol']) }, 0);
  } else if (mode === 'play') {
    // Run the real simulation six seconds in, then put the player mid-yard
    // aiming at the nearest enemy the sim has actually put in view — with a
    // clear line of sight, so the frame shows a fight, not a wall.
    rounds.startLive();
    hud.setBuyVisible(false);
    for (let i = 0; i < 360; i += 1) fixedStep(STEP);
    player.reset(0, -6, 0);
    player.eyePosition(tmpEye);
    let best = null;
    let bestDist = Infinity;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 1) continue;
      const dist = Math.hypot(bot.pos.x - 0, bot.pos.z + 6);
      if (dist >= bestDist) continue;
      tmpPoint.set(bot.pos.x, bot.pos.y + 1.2, bot.pos.z);
      if (!hasLOS(tmpEye, tmpPoint)) continue;
      bestDist = dist;
      best = bot;
    }
    if (best) {
      const dx = best.pos.x - 0;
      const dz = best.pos.z + 6;
      player.state.yaw = Math.atan2(-dx, -dz);
      player.state.pitch = Math.atan2(1.2, bestDist);
      syncCamera();
      input.state.locked = true;
      input.state.firing = true;
      playerShoot();
      input.state.firing = false;
      input.state.locked = false;
    }
    fixedStep(STEP);
  } else if (mode === 'bomb') {
    // Let the sim settle with the player safe at spawn, then stage the plant
    // at Site A. The player must not spend the settling steps standing in the
    // open west lane, where a defender can shoot him before the picture.
    rounds.startLive();
    hud.setBuyVisible(false);
    for (let i = 0; i < 120; i += 1) fixedStep(STEP);
    player.reset(-16, -10, 0);
    player.state.yaw = Math.atan2(-16, 4);
    rounds.state.bomb.plantProgress = 0.6;
    hud.setPlant(0.6);
  } else if (mode === 'end') {
    rounds.startLive();
    hud.setBuyVisible(false);
    for (let i = 0; i < 120; i += 1) fixedStep(STEP);
    if (rounds.state.phase === 'live') endRound(0, 'Bomb detonated — Site A is gone');
    const won = rounds.state.winner === 0;
    hud.hideEnd();
    hud.showEnd(won ? 'ROUND WON' : 'ROUND LOST', rounds.state.winReason || 'Bomb detonated — Site A is gone');
  }
  // The round banner hides on a 4.2 s wall-clock timer, which has not fired
  // yet when the driver screenshots — hide it so no shot carries a stale
  // "BUY PHASE" banner. Refresh the HUD once so the timer shows the real
  // phase time and the minimap is painted (it only draws inside the step).
  hud.hideBanner();
  updateHUD();
  // Paint twice, then tell the screenshot driver the frame is ready.
  const renderOnce = () => {
    syncCamera();
    renderer.render(scene, camera);
  };
  renderOnce();
  renderOnce();
  window.__shotReady = true;
}

function syncCamera() {
  player.eyePosition(tmpEye);
  camera.position.copy(tmpEye);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;
  camera.rotation.z = 0;
}
