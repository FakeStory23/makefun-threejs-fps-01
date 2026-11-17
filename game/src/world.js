// The scene: Emberline Yard built from the map data, lit like dusk. Ground and
// containers get small procedural canvas textures (drawn at runtime, no files),
// the sun hangs low and warm, and the two bomb sites glow so a player can read
// the map at a glance. Nothing here knows about the rules; it only draws MAP.
import * as THREE from 'three';
import { MAP } from './map.js';
import { PALETTE } from './palette.js';

function canvasTexture(size, draw, repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, size, base, dots, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i += 1) {
    const shade = Math.random();
    ctx.fillStyle = shade > 0.5
      ? `rgba(255, 235, 200, ${alpha})`
      : `rgba(40, 26, 12, ${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 14, 8, 0.55)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const groundTex = canvasTexture(256, (ctx, s) => speckle(ctx, s, '#9c7c50', 900, 0.16), 11, 9);
  const rustTex = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#a4552f', 500, 0.12);
    ctx.fillStyle = 'rgba(60, 30, 14, 0.35)';
    for (let i = 0; i < 14; i += 1) ctx.fillRect(Math.random() * s, 0, 3 + Math.random() * 5, s);
  }, 2, 1);
  const steelTex = canvasTexture(256, (ctx, s) => speckle(ctx, s, '#55606e', 350, 0.1), 2, 2);

  const materials = {
    ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
    surface: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.9, metalness: 0.05 }),
    sand: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.92, metalness: 0 }),
    rust: new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.75, metalness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.55, metalness: 0.5 }),
  };

  const shootables = [];
  const solids = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    solids.push(mesh);
    return mesh;
  }

  // Ground slab.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 38), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  for (const w of MAP.walls) {
    box(w.hx * 2, w.h, w.hz * 2, w.x, w.h / 2, w.z, w.mat);
  }
  for (const c of MAP.circles) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h, 20), materials[c.mat]);
    mesh.position.set(c.x, c.h / 2, c.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    solids.push(mesh);
  }

  // Bomb sites: a glowing ring on the ground and a letter banner above it.
  const siteMarkers = [];
  for (const site of MAP.sites) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id, PALETTE.accent), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    banner.position.set(site.x, 4.6, site.z);
    group.add(banner);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 12);
    lamp.position.set(site.x, 3.4, site.z);
    group.add(lamp);
    siteMarkers.push({ site, ring, banner });
  }

  // Two yard lamps over the middle lane.
  for (const [x, z] of [[-9, 6], [9, 6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.4, 8), materials.steel);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 20, 16);
    lamp.position.set(x, 5.2, z);
    group.add(lamp);
  }

  // Dusk light: a low warm sun, a cool sky fill, and a warm ground bounce.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#7a86b8'), new THREE.Color('#5a4028'), 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb26b'), 2.4);
  sun.position.set(-18, 12, 22);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6b9e'), 0.5);
  fill.position.set(14, 10, -16);
  scene.add(fill);

  return {
    group,
    shootables,
    solids,
    siteMarkers,
    step(time) {
      for (const marker of siteMarkers) {
        marker.banner.rotation.y = time * 0.4;
        marker.ring.material.opacity = 0.4 + Math.sin(time * 2.4) * 0.15;
      }
    },
  };
}
