// Short-lived eye candy: tracer lines, impact sparks and the bomb's fireball.
// Everything is pooled and reused — nothing is allocated while a round runs.
import * as THREE from 'three';

const TRACERS = 16;
const PARTICLES = 240;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 3);
  const velocities = new Float32Array(PARTICLES * 3);
  const life = new Float32Array(PARTICLES);
  const maxLife = new Float32Array(PARTICLES);
  const baseColor = new Float32Array(PARTICLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff9a2a, 0, 26);
  scene.add(boomLight);
  let boomLife = 0;

  let shake = 0;
  const tmpColor = new THREE.Color();

  function spawnBurst(position, colorHex, count, speed) {
    tmpColor.setHex(colorHex);
    for (let n = 0; n < count; n += 1) {
      const i = cursor;
      cursor = (cursor + 1) % PARTICLES;
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const v = speed * (0.4 + Math.random() * 0.6);
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * v;
      velocities[i * 3 + 1] = Math.cos(phi) * v * 0.8 + speed * 0.25;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v;
      baseColor[i * 3] = tmpColor.r;
      baseColor[i * 3 + 1] = tmpColor.g;
      baseColor[i * 3 + 2] = tmpColor.b;
      maxLife[i] = 0.3 + Math.random() * 0.4;
      life[i] = maxLife[i];
    }
  }

  return {
    tracer(from, to) {
      const slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.life = 0.07;
    },
    impact(position, colorHex = 0xffd27a) {
      spawnBurst(position, colorHex, 10, 2.2);
    },
    blood(position) {
      spawnBurst(position, 0xc23b2e, 12, 1.8);
    },
    explosion(position) {
      boom.position.copy(position);
      boom.visible = true;
      boomLife = 0.6;
      boomLight.position.copy(position);
      boomLight.position.y += 1;
      spawnBurst(position, 0xff9a2a, 60, 7);
      spawnBurst(position, 0x3a3a3a, 30, 4);
      shake = Math.min(1, shake + 0.9);
    },
    addShake(amount) {
      shake = Math.min(1, shake + amount);
    },
    shakeValue() {
      return shake;
    },
    step(dt) {
      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.85;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
      for (let i = 0; i < PARTICLES; i += 1) {
        if (life[i] <= 0) {
          colors[i * 3] = 0;
          colors[i * 3 + 1] = 0;
          colors[i * 3 + 2] = 0;
          continue;
        }
        life[i] -= dt;
        velocities[i * 3 + 1] -= 6 * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.03) positions[i * 3 + 1] = 0.03;
        const fade = Math.max(0, life[i] / maxLife[i]);
        colors[i * 3] = baseColor[i * 3] * fade;
        colors[i * 3 + 1] = baseColor[i * 3 + 1] * fade;
        colors[i * 3 + 2] = baseColor[i * 3 + 2] * fade;
      }
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('color').needsUpdate = true;
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - Math.max(0, boomLife) / 0.6;
        const scale = 1 + t * 9;
        boom.scale.setScalar(scale);
        boom.material.opacity = Math.max(0, 0.85 * (1 - t));
        boomLight.intensity = Math.max(0, 260 * (1 - t));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      shake = Math.max(0, shake - dt * 1.6);
    },
  };
}
