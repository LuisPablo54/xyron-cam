import * as THREE from 'three';

const CITY_SEED = 11;
let seed = CITY_SEED;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTexture(width, height, draw, anisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

function speckle(g, width, height, count, alpha) {
  for (let i = 0; i < count; i += 1) {
    const level = random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${level},${level},${level},${random() * alpha})`;
    g.fillRect(random() * width, random() * height, 2, 2);
  }
}

function buildTextures(anisotropy) {
  const tex = (w, h, draw) => canvasTexture(w, h, draw, anisotropy);
  return {
    stucco: tex(512, 512, (g, w, h) => { g.fillStyle = '#f2f1ed'; g.fillRect(0, 0, w, h); speckle(g, w, h, 18000, 0.07); }),
    stone: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#8f887d'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h;) {
        const rowHeight = 16 + random() * 18;
        for (let x = -random() * 40; x < w;) {
          const rockWidth = 28 + random() * 46;
          g.fillStyle = `hsl(${28 + random() * 14},${8 + random() * 12}%,${52 + random() * 24}%)`;
          g.fillRect(x + 2, y + 2, rockWidth - 4, rowHeight - 4);
          x += rockWidth;
        }
        y += rowHeight;
      }
      speckle(g, w, h, 3000, 0.15);
    }),
    wood: tex(256, 256, (g, w, h) => {
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = `hsl(${22 + random() * 6},${42 + random() * 10}%,${30 + random() * 12}%)`; g.fillRect(x, 0, 13, h);
        g.fillStyle = '#2a1a10'; g.fillRect(x + 13, 0, 3, h);
        for (let k = 0; k < 5; k += 1) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + random() * 12, 0, 1, h); }
      }
    }),
    asphalt: tex(512, 512, (g, w, h) => { g.fillStyle = '#55585d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 30000, 0.25); }),
    grass: tex(512, 512, (g, w, h) => {
      g.fillStyle = '#6c9547'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i += 1) { g.fillStyle = `hsl(${85 + random() * 25},${35 + random() * 20}%,${28 + random() * 22}%)`; g.fillRect(random() * w, random() * h, 2, 3); }
    }),
    concrete: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#d8d5cf'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, 0.1);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    }),
    solar: tex(128, 128, (g, w, h) => {
      g.fillStyle = '#16233f'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(160,190,230,.35)';
      for (let i = 0; i <= w; i += 21) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
    }),
    frond: tex(256, 64, (g, w) => {
      g.lineCap = 'round';
      for (let x = 4; x < w - 4; x += 5) {
        const length = (1 - x / w) * 28 + 3;
        g.strokeStyle = `hsl(${95 + random() * 20},${40 + random() * 15}%,${26 + random() * 14}%)`; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 10, 32 - length); g.moveTo(x, 32); g.lineTo(x + 10, 32 + length); g.stroke();
      }
      g.strokeStyle = '#5a6b2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(w, 32); g.stroke();
    }),
    sky: tex(4, 512, (g, w, h) => {
      const gradient = g.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#9fd2ee'); gradient.addColorStop(0.55, '#d6edf8'); gradient.addColorStop(1, '#eef5f9');
      g.fillStyle = gradient; g.fillRect(0, 0, w, h);
    }),
  };
}

// Construyo el fraccionamiento completo; regreso el grupo, el cielo y la azotea de "nuestra" casa.
export function buildCity(anisotropy = 8) {
  seed = CITY_SEED;
  const TX = buildTextures(anisotropy);
  const mat = (options) => new THREE.MeshStandardMaterial(options);
  const tiled = (texture, rx, ry, options = {}) => {
    const map = texture.clone();
    map.repeat.set(rx, ry);
    map.needsUpdate = true;
    return mat({ map, roughness: 0.9, ...options });
  };
  const M = {
    white: mat({ color: 0xf3f2ee, roughness: 0.85 }), graph: mat({ color: 0x2b2f35, roughness: 0.5, metalness: 0.4 }),
    glass: mat({ color: 0x1a2730, roughness: 0.04, metalness: 0.95, envMapIntensity: 1.4 }), garage: mat({ color: 0x9298a0, roughness: 0.35, metalness: 0.6 }),
    hedge: mat({ color: 0x4d7536, roughness: 0.95 }), trunk: mat({ color: 0x8b7a64, roughness: 0.95 }), curb: mat({ color: 0xcfccc6, roughness: 0.9 }),
    frond: mat({ map: TX.frond, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), canopy: mat({ color: 0x5f8a43, roughness: 1, flatShading: true }),
    hill: mat({ color: 0xc6d6df, roughness: 1 }), lamp: mat({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 0.6 }),
  };
  const city = new THREE.Group();
  const box = (parent, w, h, d, material, x, y, z, cast = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const palm = (parent, x, z, height) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    parent.add(group);
    const lean = (random() - 0.5) * 0.6;
    const segments = 9;
    for (let i = 0; i < segments; i += 1) {
      const k = i / segments;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - k * 0.05, 0.17 - k * 0.05, height / segments + 0.02, 10), M.trunk);
      trunk.position.set(lean * k * k * height * 0.25, (height / segments) * (i + 0.5), 0);
      trunk.castShadow = true;
      group.add(trunk);
    }
    const top = vec(lean * height * 0.25, height, 0);
    const leaf = new THREE.PlaneGeometry(2.8, 0.7, 12, 1);
    leaf.translate(1.4, 0, 0);
    const position = leaf.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const px = position.getX(i);
      position.setY(i, position.getY(i) * (1 - px / 3.2));
      position.setZ(i, -0.09 * px * px);
    }
    leaf.rotateX(-Math.PI / 2);
    leaf.computeVertexNormals();
    for (let k = 0; k < 11; k += 1) {
      const frond = new THREE.Mesh(leaf, M.frond);
      frond.position.copy(top);
      frond.rotation.set(0, (k / 11) * Math.PI * 2 + random() * 0.3, 0.25 + random() * 0.35, 'YXZ');
      frond.castShadow = true;
      group.add(frond);
    }
  };

  const tree = (parent, x, z, size) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2, 8), M.trunk);
    trunk.position.set(x, 1, z);
    parent.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * size, 2), M.canopy);
    crown.position.set(x, 2.2 + 1.2 * size, z);
    crown.scale.y = 0.85;
    crown.castShadow = true;
    parent.add(crown);
  };

  const house = (x, z, facing, side, hasPalm = true) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    city.add(group);
    const W = 11.5 + random() * 1.8;
    const D = 10;
    const upperW = W * 0.68;
    const upperD = 8;
    const upperX = (side * (W - upperW)) / 2;
    const upperZ = -1.6 + upperD / 2;
    const roofY = 6.725;
    box(group, W, 3.2, D, tiled(TX.stucco, W / 3, 1), 0, 1.6, D / 2);
    box(group, W + 0.6, 0.28, D + 0.6, M.white, 0, 3.34, D / 2 - 0.1);
    box(group, W + 0.62, 0.07, D + 0.62, M.graph, 0, 3.2, D / 2 - 0.1);
    box(group, 3.4, 3.2, 0.3, tiled(TX.stone, 1.6, 1.6), -side * (W / 2 - 1.7), 1.6, -0.12);
    box(group, 3.2, 2.5, 0.1, M.garage, side * (W / 2 - 2.2), 1.25, -0.05);
    box(group, W - 8, 2.4, 0.08, M.glass, -side * 0.2, 1.5, -0.04);
    box(group, upperW, 3.1, upperD, tiled(TX.stucco, upperW / 3, 1), upperX, 3.48 + 1.55, upperZ);
    box(group, upperW * 0.36, 3.1, 0.14, tiled(TX.wood, 2, 1), upperX - side * upperW * 0.32, 5.03, -1.67);
    box(group, upperW * 0.56, 2.4, 0.08, M.glass, upperX + side * upperW * 0.19, 4.98, -1.64);
    for (const k of [-1, 0, 1]) box(group, 0.07, 2.4, 0.12, M.graph, upperX + side * upperW * 0.19 + k * upperW * 0.14, 4.98, -1.66);
    box(group, upperW + 0.5, 0.25, upperD + 0.5, M.white, upperX, roofY - 0.125, upperZ);
    const frontZ = upperZ - (upperD + 0.5) / 2;
    const backZ = upperZ + (upperD + 0.5) / 2;
    const leftX = upperX - (upperW + 0.5) / 2;
    const rightX = upperX + (upperW + 0.5) / 2;
    box(group, upperW + 0.5, 0.4, 0.15, M.white, upperX, roofY + 0.2, frontZ + 0.075);
    box(group, upperW + 0.5, 0.4, 0.15, M.white, upperX, roofY + 0.2, backZ - 0.075);
    box(group, 0.15, 0.4, upperD + 0.5, M.white, leftX + 0.075, roofY + 0.2, upperZ);
    box(group, 0.15, 0.4, upperD + 0.5, M.white, rightX - 0.075, roofY + 0.2, upperZ);
    const solar = tiled(TX.solar, 1, 1, { roughness: 0.25, metalness: 0.5 });
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        const panel = box(group, 1.1, 0.05, 1.7, solar, upperX - 1.4 + i * 1.25, roofY + 0.45, upperZ + 1.2 + j * 1.9);
        panel.rotation.x = -0.25;
      }
    }
    box(group, W + 5, 0.06, 6, tiled(TX.grass, 4, 2), 0, 0.03, -3, false);
    box(group, 3.4, 0.08, 6, tiled(TX.concrete, 1.5, 3), side * (W / 2 - 2.2), 0.04, -3, false);
    box(group, 3, 0.75, 0.6, M.hedge, -side * (W / 2 - 1.7), 0.375, -1);
    if (hasPalm) palm(group, -side * (W / 2 - 4.6), -3.6, 5.5 + random() * 2.5);
    tree(group, -side * (W / 2 + 1.2), D + 2, 1);
    return { frontZ, rightX, roofY };
  };

  const ours = house(0, 0, 0, 1, false);
  for (const x of [-48, -32, -16, 16, 32]) house(x, 0, 0, random() < 0.5 ? 1 : -1);
  for (const x of [-56, -40, -24, -8, 8, 24]) house(x, -24, Math.PI, random() < 0.5 ? 1 : -1);
  for (const x of [-64, -48, -32, -16, 0, 16]) house(x + 4, -58, Math.PI, random() < 0.5 ? 1 : -1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), tiled(TX.grass, 140, 140, { color: 0xdfe6d0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  city.add(ground);
  box(city, 300, 0.04, 8, tiled(TX.asphalt, 60, 2), 0, 0.02, -12, false);
  box(city, 300, 0.06, 2, tiled(TX.concrete, 150, 1), 0, 0.05, -7, false);
  box(city, 300, 0.06, 2, tiled(TX.concrete, 150, 1), 0, 0.05, -17, false);
  box(city, 300, 0.14, 0.25, M.curb, 0, 0.07, -8.05, false);
  box(city, 300, 0.14, 0.25, M.curb, 0, 0.07, -15.95, false);
  for (let x = -72; x <= 56; x += 16) {
    for (const [z, dir] of [[-7.4, -1], [-16.6, 1]]) {
      const px = x + (dir > 0 ? 8 : 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), M.graph);
      pole.position.set(px, 3, z);
      pole.castShadow = true;
      city.add(pole);
      box(city, 0.08, 0.08, 1.4, M.graph, px, 5.95, z + dir * 0.65);
      box(city, 0.3, 0.08, 0.5, M.lamp, px, 5.9, z + dir * 1.3);
    }
  }
  for (let i = 0; i < 9; i += 1) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(80 + random() * 60, 30 + random() * 35, 7), M.hill);
    hill.position.set(-300 + i * 80 + random() * 30, 0, -240 - random() * 60);
    hill.scale.z = 0.5;
    city.add(hill);
  }
  for (let i = 0; i < 14; i += 1) tree(city, -70 + random() * 130, -40 - random() * 8, 0.9 + random() * 0.5);
  return { city, sky: TX.sky, ours };
}

export function makeDrone() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3237, roughness: 0.45, metalness: 0.3 });
  const light = new THREE.MeshStandardMaterial({ color: 0xdadee2, roughness: 0.35 });
  const blur = new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.5 });
  const props = [];
  const part = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(new THREE.BoxGeometry(0.14, 0.055, 0.22), light, 0, 0, 0);
  part(new THREE.BoxGeometry(0.1, 0.03, 0.15), dark, 0, 0.04, -0.01);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = part(new THREE.BoxGeometry(0.2, 0.018, 0.024), dark, a * 0.075, 0, b * 0.08);
    arm.rotation.y = Math.atan2(-b, a);
    part(new THREE.CylinderGeometry(0.02, 0.022, 0.035, 12), dark, a * 0.15, 0.015, b * 0.16);
    props.push(part(new THREE.BoxGeometry(0.22, 0.004, 0.02), blur, a * 0.15, 0.038, b * 0.16));
    const color = b < 0 ? 0x34c759 : 0xff3b30;
    part(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }), a * 0.15, -0.012, b * 0.16);
  }
  part(new THREE.SphereGeometry(0.024, 16, 12), dark, 0, -0.04, -0.1);
  group.scale.setScalar(1.35);
  return { group, spin: (t) => props.forEach((prop, i) => { prop.rotation.y = t * 55 + i; }) };
}

export function makeBird() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), material);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const wingShape = new THREE.Shape([new THREE.Vector2(0, -0.05), new THREE.Vector2(0.32, 0.02), new THREE.Vector2(0.28, 0.06), new THREE.Vector2(0, 0.05)]);
  const wingGeometry = new THREE.ShapeGeometry(wingShape);
  wingGeometry.rotateX(Math.PI / 2);
  const left = new THREE.Mesh(wingGeometry, material);
  const right = new THREE.Mesh(wingGeometry, material);
  right.scale.x = -1;
  group.add(left, right);
  group.scale.setScalar(1.4);
  return { group, flap: (t) => { left.rotation.z = 0.6 * Math.sin(t * 11); right.rotation.z = -0.6 * Math.sin(t * 11); } };
}
