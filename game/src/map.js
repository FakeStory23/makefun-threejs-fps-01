// Emberline Yard: the map as data. Everything the scene draws, everything the
// simulation collides with, and every route the bots walk comes from this one file,
// so the picture and the rules can never disagree. Units are metres, y is up,
// the yard runs x -22..22 and z -18..18, attackers spawn south, defenders north.
// A wall is { x, z, hx, hz, h, mat }: centre, half extents, height, material.
// A circle is a silo: { x, z, r, h, mat }. Sites are the two bomb plots.
export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
  walls: [
    // Perimeter, 5 m high.
    { x: -22.3, z: 0, hx: 0.3, hz: 18.3, h: 5, mat: 'surface' },
    { x: 22.3, z: 0, hx: 0.3, hz: 18.3, h: 5, mat: 'surface' },
    { x: 0, z: -18.3, hx: 22.6, hz: 0.3, h: 5, mat: 'surface' },
    { x: 0, z: 18.3, hx: 22.6, hz: 0.3, h: 5, mat: 'surface' },
    // West lane: rust container rows guarding site A. The (-14,-8) box is
    // narrow (3 m) so the lane keeps a clear column past it to site A.
    { x: -14, z: -8, hx: 1.5, hz: 1.2, h: 2.6, mat: 'rust' },
    { x: -14, z: -2, hx: 3, hz: 1.2, h: 2.6, mat: 'rust' },
    { x: -18, z: 2, hx: 1.2, hz: 3, h: 2.6, mat: 'rust' },
    { x: -8, z: -15, hx: 1.2, hz: 3, h: 5.2, mat: 'steel' },
    { x: -16, z: -13, hx: 3, hz: 1.5, h: 1.1, mat: 'sand' },
    // East lane: the same, mirrored, guarding site B.
    { x: 14, z: -8, hx: 1.5, hz: 1.2, h: 2.6, mat: 'rust' },
    { x: 14, z: -2, hx: 3, hz: 1.2, h: 2.6, mat: 'rust' },
    { x: 18, z: 2, hx: 1.2, hz: 3, h: 2.6, mat: 'rust' },
    { x: 8, z: -15, hx: 1.2, hz: 3, h: 5.2, mat: 'steel' },
    { x: 16, z: -13, hx: 3, hz: 1.5, h: 1.1, mat: 'sand' },
    // Mid: two pillars leave a 3 m gap at the centre, then a cross wall forces
    // the middle lane around its ends. The yard's main choke point.
    { x: -3, z: -4, hx: 1.5, hz: 4, h: 2.6, mat: 'surface' },
    { x: 3, z: -4, hx: 1.5, hz: 4, h: 2.6, mat: 'surface' },
    { x: 0, z: 2, hx: 6, hz: 1, h: 2.6, mat: 'surface' },
    // Crouch cover, scattered so no lane is a bare shooting gallery. The mid
    // band stays open on purpose: the pillars and the cross wall are its cover,
    // and the waypoint column runs straight through it.
    { x: -13, z: 7, hx: 2, hz: 1, h: 1.1, mat: 'sand' },
    { x: 13, z: 7, hx: 2, hz: 1, h: 1.1, mat: 'sand' },
    { x: -4, z: 12, hx: 1, hz: 1, h: 1.1, mat: 'sand' },
    { x: 4, z: 12, hx: 1, hz: 1, h: 1.1, mat: 'sand' },
    { x: -6, z: -13, hx: 1.5, hz: 1, h: 1.1, mat: 'sand' },
    { x: 6, z: -13, hx: 1.5, hz: 1, h: 1.1, mat: 'sand' },
    // Spawn wall: 3 m high, so no defender can shoot into the attacker spawn
    // down the mid lane. Attackers walk around its ends (nodes 28 and 29),
    // which land right beside the container cover on each side.
    { x: 0, z: 13, hx: 12, hz: 0.5, h: 3, mat: 'surface' },
  ],
  circles: [
    { x: -19, z: -14, r: 2, h: 6, mat: 'steel' },
    { x: 19, z: -14, r: 2, h: 6, mat: 'steel' },
  ],
  sites: [
    { id: 'A', x: -16, z: -10, r: 4.5 },
    { id: 'B', x: 16, z: -10, r: 4.5 },
  ],
  spawns: {
    attack: [[0, 15], [-3, 15], [3, 15], [-6, 14], [6, 14]],
    defend: [[0, -15], [-6, -15], [6, -15], [-12, -14], [12, -14]],
  },
  // Waypoint graph the bots walk. Nodes are [x, z]; edges are index pairs.
  // Every node stands in open ground and every edge is a straight line that
  // clears all colliders (verified by /tmp/qa-graph.mjs): the pillars block
  // the z=-2 row, the cross wall blocks the mid column, so the mid crosses
  // through nodes 30/31 around the wall ends, and the sites are reached
  // through the north corridor (nodes 26/27).
  waypoints: [
    [0, 15], [-6, 15], [6, 15],
    [-9, 7], [0, 10], [9, 7],
    [-9, 4], [0, 6], [9, 4],
    [-9, -2], [0, -2], [9, -2],
    [-9, -8], [0, -10], [9, -8],
    [-16, -10], [16, -10],
    [-12, -12], [12, -12],
    [-16, -6], [16, -6],
    [-12, -13], [12, -13], [0, -14], [-18, -6], [18, -6],
    [-11, -11], [11, -11],
    [-16, 14], [16, 14],
    [-7, 2], [7, 2],
  ],
  edges: [
    [0, 1], [0, 2], [3, 4], [4, 5],
    [1, 28], [28, 3], [2, 29], [29, 5],
    [3, 6], [4, 7], [5, 8], [6, 7], [7, 8],
    [6, 9], [8, 11], [7, 30], [30, 9], [7, 31], [31, 11],
    [9, 12], [10, 13], [11, 14], [12, 13], [13, 14],
    [13, 17], [13, 18], [15, 17], [15, 19], [16, 18], [16, 20],
    [17, 21], [18, 22], [19, 24], [20, 25],
    [21, 26], [22, 27], [13, 23], [23, 26], [23, 27],
    [12, 26], [14, 27], [15, 26], [16, 27], [17, 26], [18, 27],
  ],
  // Defender hold nodes, one per defender bot, near the two sites.
  holds: [21, 22, 23, 24, 25],
  // Attacker route targets: the site node each attacker pushes toward.
  siteNode: { A: 15, B: 16 },
};

// Collision: a circle (a body seen from above) against the map's boxes and silos.
// moveCircle tries x then z, so a body slides along a wall instead of sticking.
export function createCollision(map) {
  const { walls, circles, bounds } = map;

  function blocked(x, z, r, y, h) {
    if (x - r < bounds.minX || x + r > bounds.maxX || z - r < bounds.minZ || z + r > bounds.maxZ) return true;
    for (const w of walls) {
      if (y + h <= 0 || y >= w.h) continue;
      if (Math.abs(x - w.x) < w.hx + r && Math.abs(z - w.z) < w.hz + r) return true;
    }
    for (const c of circles) {
      if (y + h <= 0 || y >= c.h) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
    }
    return false;
  }

  return {
    blocked,
    // Steps a body by (dx, dz); returns the position it reaches. Reused by the
    // player and every bot, so all of them collide with the map the same way.
    move(x, z, r, y, h, dx, dz) {
      let nx = x;
      let nz = z;
      if (!blocked(x + dx, z, r, y, h)) nx = x + dx;
      if (!blocked(nx, z + dz, r, y, h)) nz = z + dz;
      return [nx, nz];
    },
    // Is the straight 2D line between two points clear at height y?
    clearLine(x1, z1, x2, z2, y) {
      const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.5);
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0.05, y, 0.1)) return false;
      }
      return true;
    },
  };
}

// Breadth-first search over the waypoint graph. Small graph, no allocation
// beyond the path it returns.
export function findPath(map, from, to) {
  if (from === to) return [to];
  const adjacency = new Map();
  for (const [a, b] of map.edges) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  const previous = new Array(map.waypoints.length).fill(-1);
  const queue = [from];
  previous[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency.get(node) ?? []) {
      if (previous[next] !== -1) continue;
      previous[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = previous[at];
          path.push(at);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [to];
}

export function nearestWaypoint(map, x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < map.waypoints.length; i += 1) {
    const [wx, wz] = map.waypoints[i];
    const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
