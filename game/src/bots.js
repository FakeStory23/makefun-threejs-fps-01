// The bots: nine of them, four friendly attackers and five defenders. Each one
// walks the waypoint graph, holds a post, watches a cone of vision, listens for
// gunfire, and fires in bursts once it has reacted. They share the player's
// collision and the same shooting function, so nothing about them is faked.
//
// States: hold / guard (standing a post, scanning), route (walking a path, with
// afterRoute saying what to do on arrival), investigate (looked at a noise, then
// returns home), engage (a visible enemy), defuse (channelling on the bomb).
import * as THREE from 'three';
import { MAP, findPath, nearestWaypoint } from './map.js';
import { WEAPONS, createOwnedWeapon } from './weapons.js';

const FRIEND_NAMES = ['RAKA', 'DIMAS', 'SARI', 'BIMO'];
const ENEMY_NAMES = ['VEX', 'KANE', 'ROOK', 'MIRA', 'JOLT'];
const EYE = 1.5;
const RADIUS = 0.36;
const HEIGHT = 1.72;

function buildBody(scene, team) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.85, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({
    color: team === 0 ? 0x46c8b8 : 0xa4552f,
    roughness: 0.6, metalness: 0.2,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a06c, roughness: 0.8, metalness: 0 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), dark);
  torso.position.y = 1.05;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.36), trim);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.55;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  helmet.position.y = 1.57;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), dark);
  legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), trim);
  gun.position.set(0.18, 1.22, -0.3);
  group.add(torso, vest, head, helmet, legL, legR, gun);
  for (const mesh of group.children) mesh.castShadow = true;
  scene.add(group);
  return { group, torso, head, legL, legR, gun };
}

export function createBots(scene, collision, random) {
  const bots = [];

  function makeBot(index, team, name) {
    const body = buildBody(scene, team);
    const bot = {
      id: index,
      team,
      name,
      alive: true,
      health: 100,
      armor: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      baseYaw: 0,
      speed: 3.6 + random() * 0.5,
      state: 'hold',
      afterRoute: 'hold',
      path: [],
      pathIndex: 0,
      holdNode: 0,
      targetSite: 'A',
      target: null,
      targetKind: null,
      lastSeen: new THREE.Vector3(),
      lastSeenTime: -99,
      hearPos: new THREE.Vector3(),
      investigateUntil: 0,
      reactAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      burstPause: 0,
      thinkTimer: random() * 0.12,
      scanPhase: random() * Math.PI * 2,
      walkPhase: 0,
      stepTimer: 0,
      fall: 0,
      flashTimer: 0,
      weapon: createOwnedWeapon(WEAPONS.rifle),
      body,
    };
    body.torso.userData.hit = { bot, part: 'torso' };
    body.head.userData.hit = { bot, part: 'head' };
    body.group.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) makeBot(i, 0, FRIEND_NAMES[i]);
  for (let i = 0; i < 5; i += 1) makeBot(4 + i, 1, ENEMY_NAMES[i]);

  function routeTo(bot, node, afterRoute) {
    const from = nearestWaypoint(MAP, bot.pos.x, bot.pos.z);
    bot.path = findPath(MAP, from, node);
    bot.pathIndex = 0;
    bot.afterRoute = afterRoute;
    bot.state = 'route';
  }

  function routeToPoint(bot, x, z, afterRoute) {
    routeTo(bot, nearestWaypoint(MAP, x, z), afterRoute);
  }

  function eyeOf(bot, out) {
    return out.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
  }

  function forwardOf(bot, out) {
    return out.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
  }

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  function moveToward(bot, dt, x, z, speed, faceMove) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    const [nx, nz] = collision.move(bot.pos.x, bot.pos.z, RADIUS, bot.pos.y, HEIGHT, (dx / dist) * step, (dz / dist) * step);
    bot.pos.x = nx;
    bot.pos.z = nz;
    if (faceMove) {
      const want = Math.atan2(-dx, -dz);
      let diff = want - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += diff * Math.min(1, dt * 8);
    }
    bot.walkPhase += dt * speed * 2.2;
    return dist < 0.55;
  }

  function perceive(bot, ctx) {
    // One enemy at a time: the closest visible one. Vision is a cone, widened
    // at close range, and always needs a clear line of sight.
    let best = null;
    let bestKind = null;
    let bestDist = Infinity;
    const eye = eyeOf(bot, tmpA);
    const forward = forwardOf(bot, tmpB);
    const candidates = [];
    // Only the defenders hunt the player: a friendly bot must never treat its
    // own teammate as a target. Without the team check the friendlies spawn
    // beside the player, see him at close range, enter engage during the buy
    // phase, and open fire the instant the round goes live.
    if (ctx.player.alive && bot.team === 1) candidates.push({ kind: 'player', obj: ctx.player });
    for (const other of bots) {
      if (other.alive && other.team !== bot.team) candidates.push({ kind: 'bot', obj: other });
    }
    for (const candidate of candidates) {
      const targetPos = tmpC.set(candidate.obj.pos.x, candidate.obj.pos.y + 1.2, candidate.obj.pos.z);
      const dx = targetPos.x - eye.x;
      const dy = targetPos.y - eye.y;
      const dz = targetPos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 42 || dist >= bestDist) continue;
      const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
      const fov = dist < 8 ? 0.3 : 0.55;
      if (dot < fov) continue;
      if (!ctx.hasLOS(eye, targetPos)) continue;
      best = candidate;
      bestKind = candidate.kind;
      bestDist = dist;
    }
    if (best) {
      // A bot committed to the defuse does not get distracted: it can only be
      // stopped by killing it.
      const committed = bot.state === 'defuse' || (bot.state === 'route' && bot.afterRoute === 'defuse');
      if (committed) return false;
      bot.target = best.obj;
      bot.targetKind = bestKind;
      bot.lastSeen.copy(best.obj.pos);
      bot.lastSeenTime = ctx.time;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactAt = ctx.time + 0.35 + random() * 0.25;
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      return true;
    }
    return false;
  }

  function updateBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt * 2.5);
      bot.body.group.rotation.x = -bot.fall * Math.PI * 0.48;
      bot.body.group.position.y = bot.pos.y - bot.fall * 0.1;
      return;
    }
    if (bot.flashTimer > 0) {
      bot.flashTimer -= dt;
      const flash = bot.flashTimer > 0 ? 0x881111 : 0x000000;
      bot.body.torso.material.emissive.setHex(flash);
      bot.body.head.material.emissive.setHex(flash);
    }
    bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.12;
      if (!perceive(bot, ctx) && bot.state === 'engage' && ctx.time - bot.lastSeenTime > 1.2) {
        bot.target = null;
        bot.investigateUntil = ctx.time + 2.5;
        routeToPoint(bot, bot.lastSeen.x, bot.lastSeen.z, 'investigate');
      }
    }

    const walking = bot.state === 'route';
    if (bot.state === 'hold' || bot.state === 'guard') {
      // Slow scan: sweep the yaw back and forth across the post.
      bot.scanPhase += dt * 0.5;
      bot.yaw = bot.baseYaw + Math.sin(bot.scanPhase) * 0.9;
    } else if (bot.state === 'route') {
      const node = bot.path[bot.pathIndex];
      if (node === undefined) {
        bot.state = bot.afterRoute;
        bot.baseYaw = bot.yaw;
        if (bot.state === 'investigate') bot.investigateUntil = ctx.time + 2.5;
      } else {
        const [wx, wz] = MAP.waypoints[node];
        if (moveToward(bot, dt, wx, wz, bot.speed, true)) bot.pathIndex += 1;
      }
    } else if (bot.state === 'investigate') {
      bot.scanPhase += dt * 0.9;
      bot.yaw = bot.baseYaw + Math.sin(bot.scanPhase) * 1.4;
      if (ctx.time > bot.investigateUntil) {
        routeTo(bot, bot.holdNode, bot.team === 1 ? 'hold' : 'guard');
      }
    } else if (bot.state === 'engage') {
      const target = bot.target;
      const alive = target && target.alive;
      if (!alive) {
        bot.target = null;
        bot.investigateUntil = ctx.time + 2.5;
        routeToPoint(bot, bot.lastSeen.x, bot.lastSeen.z, 'investigate');
      } else {
        const tx = target.pos.x;
        const tz = target.pos.z;
        const dx = tx - bot.pos.x;
        const dz = tz - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        const wantYaw = Math.atan2(-dx, -dz);
        let diff = wantYaw - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        bot.yaw += diff * Math.min(1, dt * 10);
        bot.pitch = Math.max(-0.5, Math.min(0.5, Math.atan2((target.pos.y + 1.2) - (bot.pos.y + EYE), dist)));
        if (dist > 20) moveToward(bot, dt, tx, tz, bot.speed * 0.45, false);
        else if (dist < 5) moveToward(bot, dt, bot.pos.x + Math.cos(bot.yaw) * 2, bot.pos.z - Math.sin(bot.yaw) * 2, bot.speed * 0.4, false);

        if (ctx.time >= bot.reactAt && ctx.phase === 'live') {
          if (bot.burstLeft === 0) {
            bot.burstPause -= dt;
            if (bot.burstPause <= 0) {
              bot.burstLeft = 3 + Math.floor(random() * 3);
              bot.burstTimer = 0;
            }
          } else {
            bot.burstTimer -= dt;
            if (bot.burstTimer <= 0) {
              bot.burstTimer = 0.11 + random() * 0.03;
              bot.burstLeft -= 1;
              if (bot.burstLeft === 0) bot.burstPause = 0.5 + random() * 0.5;
              const muzzle = eyeOf(bot, tmpA);
              muzzle.addScaledVector(forwardOf(bot, tmpB), 0.6);
              muzzle.y -= 0.1;
              const aim = tmpC.set(tx, target.pos.y + 1.2, tz);
              ctx.fireBot(bot, muzzle, aim);
            }
          }
        }
      }
    } else if (bot.state === 'defuse') {
      // Channel on the bomb. Losing the bomb breaks the channel.
      if (!ctx.bomb || ctx.bomb.state !== 'planted') {
        bot.state = 'hold';
        bot.baseYaw = bot.yaw;
      } else {
        const dx = ctx.bomb.pos.x - bot.pos.x;
        const dz = ctx.bomb.pos.z - bot.pos.z;
        if (Math.hypot(dx, dz) > 2.2) {
          routeToPoint(bot, ctx.bomb.pos.x, ctx.bomb.pos.z, 'defuse');
        } else {
          ctx.onDefuseTick(dt, bot);
        }
      }
    }

    // Footsteps the player can actually hear.
    if (walking && bot.stepTimer <= 0) {
      bot.stepTimer = 0.38;
      const dx = bot.pos.x - ctx.player.pos.x;
      const dz = bot.pos.z - ctx.player.pos.z;
      if (dx * dx + dz * dz < 22 * 22) ctx.audio.step();
    }
    if (bot.stepTimer > 0) bot.stepTimer -= dt;

    bot.body.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    bot.body.group.rotation.y = bot.yaw;
    bot.body.group.rotation.x = 0;
    const swing = walking ? Math.sin(bot.walkPhase) * 0.5 : 0;
    bot.body.legL.rotation.x = swing;
    bot.body.legR.rotation.x = -swing;
  }

  return {
    bots,
    resetRound() {
      for (const bot of bots) {
        const spawns = bot.team === 0 ? MAP.spawns.attack : MAP.spawns.defend;
        const [x, z] = spawns[bot.id % spawns.length];
        bot.pos.set(x, 0, z);
        bot.vel.set(0, 0, 0);
        bot.health = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.flashTimer = 0;
        bot.target = null;
        bot.weapon = createOwnedWeapon(WEAPONS.rifle);
        bot.yaw = bot.team === 0 ? 0 : Math.PI;
        bot.baseYaw = bot.yaw;
        bot.body.group.rotation.set(0, bot.yaw, 0);
        bot.body.group.position.set(x, 0, z);
        if (bot.team === 1) {
          bot.holdNode = MAP.holds[(bot.id - 4) % MAP.holds.length];
          routeTo(bot, bot.holdNode, 'hold');
        } else {
          bot.targetSite = bot.id % 2 === 0 ? 'A' : 'B';
          bot.holdNode = MAP.siteNode[bot.targetSite];
          routeTo(bot, bot.holdNode, 'guard');
        }
      }
    },
    hearNoise(x, z, radius, phase, time) {
      if (phase !== 'live') return;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const dx = bot.pos.x - x;
        const dz = bot.pos.z - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        if (bot.state !== 'hold' && bot.state !== 'guard') continue;
        const chance = bot.team === 1 ? 0.6 : 0.4;
        if (random() > chance) continue;
        bot.hearPos.set(x, 0, z);
        bot.investigateUntil = time + 2.5;
        routeToPoint(bot, x, z, 'investigate');
      }
    },
    goDefuse(bombPos) {
      // The two nearest living defenders walk to the bomb and channel on it.
      const defenders = bots
        .filter((b) => b.alive && b.team === 1)
        .map((b) => ({ b, d: Math.hypot(b.pos.x - bombPos.x, b.pos.z - bombPos.z) }))
        .sort((a, b2) => a.d - b2.d)
        .slice(0, 2)
        .map((entry) => entry.b);
      for (const bot of defenders) {
        bot.target = null;
        routeToPoint(bot, bombPos.x, bombPos.z, 'defuse');
      }
      return defenders.length;
    },
    kill(bot) {
      bot.alive = false;
      bot.health = 0;
      bot.target = null;
      bot.fall = 0.0001;
    },
    step(dt, ctx) {
      for (const bot of bots) updateBot(bot, dt, ctx);
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
      return n;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        meshes.push(bot.body.torso, bot.body.head);
      }
      return meshes;
    },
  };
}
