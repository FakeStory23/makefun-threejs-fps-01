// Player movement: acceleration, friction, gravity, crouch and jump, resolved
// against the map's 2D collision (one axis at a time, so a wall never swallows
// the player). The same resolver moves the bots, so everyone plays by one rule.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(collision) {
  const player = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: false,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !collision.blocked(player.position.x, player.position.z, RADIUS, player.position.y, STAND_HEIGHT)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = frozen ? 0 : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = frozen ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (!frozen && keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;

    const [nx, nz] = collision.move(
      player.position.x, player.position.z, RADIUS, player.position.y, player.height,
      player.velocity.x * dt, player.velocity.z * dt,
    );
    if (nx === player.position.x) player.velocity.x = 0;
    if (nz === player.position.z) player.velocity.z = 0;
    player.position.x = nx;
    player.position.z = nz;

    // The yard is flat: the floor is y = 0, and low crates are stood on.
    player.position.y += player.velocity.y * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-30, player.velocity.y);
  }

  function reset(x, z, yaw) {
    player.position.set(x, 0, z);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.health = 100;
    player.armor = false;
    player.alive = true;
    player.crouching = false;
    player.height = STAND_HEIGHT;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    eyePosition(out) {
      out.set(player.position.x, player.position.y + player.eye, player.position.z);
      return out;
    },
  };
}
