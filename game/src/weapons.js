// The arsenal: three guns and one grenade, each with its own numbers. A weapon is
// data plus a small state machine (magazine, cooldown, reload); the ray that does
// the damage lives in main.js so player and bots shoot through the same code.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sparrow', kind: 'pistol', price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.003, spreadMove: 0.02, recoil: 0.007, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Kestrel', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, mag: 30, reserve: 90,
    fireGap: 0.1, reloadTime: 2.1, auto: true,
    spreadStill: 0.0022, spreadMove: 0.026, recoil: 0.011, range: 90,
  },
  smg: {
    id: 'smg', name: 'SM-9 Jackal', kind: 'smg', price: 1500,
    damage: 26, headMult: 3, mag: 32, reserve: 96,
    fireGap: 0.075, reloadTime: 1.7, auto: true,
    spreadStill: 0.004, spreadMove: 0.034, recoil: 0.007, range: 55,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Frag Grenade', price: 300,
  radius: 6, maxDamage: 95, minDamage: 15, fuse: 2.2,
};

export const ARMOR_PRICE = 650;

// One owned weapon: its definition, its ammunition, and its timers. Buying a gun
// the player already owns only refills its reserve.
export function createOwnedWeapon(def) {
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };
}

export function weaponStep(owned, dt) {
  owned.cooldown = Math.max(0, owned.cooldown - dt);
  owned.flash = Math.max(0, owned.flash - dt);
  owned.kick += (0 - owned.kick) * Math.min(1, dt * 14);
  if (owned.reloadLeft > 0) {
    owned.reloadLeft = Math.max(0, owned.reloadLeft - dt);
    if (owned.reloadLeft === 0) {
      const take = Math.min(owned.def.mag - owned.mag, owned.reserve);
      owned.mag += take;
      owned.reserve -= take;
    }
  }
}

export function weaponReady(owned) {
  return owned.mag > 0 && owned.cooldown === 0 && owned.reloadLeft === 0;
}

export function weaponFire(owned) {
  owned.cooldown = owned.def.fireGap;
  owned.flash = 0.06;
  owned.kick = 0.055;
  owned.mag -= 1;
}

export function weaponReload(owned) {
  if (owned.reloadLeft > 0 || owned.mag === owned.def.mag || owned.reserve === 0) return false;
  owned.reloadLeft = owned.def.reloadTime;
  return true;
}

// Spread grows with movement speed and with each shot in a burst, so stopping
// to aim pays and spraying on the move does not.
export function weaponSpread(owned, speed, heat) {
  const move = Math.min(1, speed / 5.2);
  return owned.def.spreadStill + move * owned.def.spreadMove + heat * 0.004;
}

// The gun in the player's hands: simple styled boxes, one per weapon kind, with a
// muzzle flash quad and a warm flash light. Kept on the camera, so it never
// needs the world. Returns the group plus a small per-frame updater.
export function buildViewModel(camera, def) {
  const grip = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, def.kind === 'pistol' ? 0.24 : 0.42), body);
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.045, def.kind === 'rifle' ? 0.4 : def.kind === 'smg' ? 0.22 : 0.14),
    grip,
  );
  barrel.position.set(0, 0.025, def.kind === 'pistol' ? -0.2 : -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, def.kind === 'pistol' ? 0.1 : 0.22), grip);
  stock.position.set(0, -0.02, def.kind === 'pistol' ? 0.14 : 0.3);
  model.add(receiver, barrel, stock);
  if (def.kind === 'smg') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.12, -0.05);
    model.add(mag);
  }
  if (def.kind === 'rifle') {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
    sight.position.set(0, 0.08, -0.1);
    model.add(sight);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffb020, 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  return {
    group: model,
    step(owned, dt) {
      model.position.z = -0.42 + owned.kick;
      model.rotation.x = owned.kick * 2.2;
      flash.visible = owned.flash > 0;
      flash.rotation.z = owned.flash * 30;
      flashLight.intensity = owned.flash > 0 ? 18 : 0;
      if (owned.reloadLeft > 0) {
        const progress = 1 - owned.reloadLeft / owned.def.reloadTime;
        model.rotation.x = -0.55 * Math.sin(progress * Math.PI);
      } else {
        model.rotation.x = owned.kick * 2.2;
      }
    },
    dispose() {
      camera.remove(model, flash, flashLight);
    },
  };
}

