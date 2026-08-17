import * as THREE from 'three';

type LayerOptions = {
  count: number;
  minRadius: number;
  maxRadius: number;
  minSize: number;
  maxSize: number;
  bandBias: number;
  twinkleSpeed: number;
};

export type StarfieldQuality = 'performance' | 'high' | 'ultra';

type StarfieldBudget = {
  layers: [number, number, number];
  clusterCount: number;
  starsPerCluster: number;
};

const STARFIELD_BUDGETS: Record<StarfieldQuality, StarfieldBudget> = {
  performance: { layers: [2500, 900, 120], clusterCount: 2, starsPerCluster: 44 },
  high: { layers: [3600, 1450, 220], clusterCount: 3, starsPerCluster: 64 },
  ultra: { layers: [4600, 1850, 300], clusterCount: 4, starsPerCluster: 72 }
};

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(Math.abs(seed) * 1_000_003) ^ 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const STAR_VERTEX = /* glsl */ `
attribute float size;
attribute float phase;
attribute vec3 starColor;
varying vec3 vColor;
varying float vPhase;

void main() {
  vColor = starColor;
  vPhase = phase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (1900.0 / -mvPosition.z);
  gl_PointSize = clamp(gl_PointSize, 0.65, 4.5);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uTwinkleSpeed;
varying vec3 vColor;
varying float vPhase;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  float core = smoothstep(0.5, 0.02, dist);
  core = pow(core, 2.2);
  float twinkle = 0.965 + 0.035 * sin(uTime * uTwinkleSpeed + vPhase);
  gl_FragColor = vec4(vColor * core * twinkle, core * twinkle);
}
`;

function pickStarColor(target: THREE.Color, random: () => number): void {
  const roll = random();
  if (roll < 0.82) {
    target.setHSL(0.11 + random() * 0.05, 0.015 + random() * 0.045, 0.72 + random() * 0.2);
  } else if (roll < 0.92) {
    target.setHSL(0.105 + random() * 0.025, 0.12 + random() * 0.1, 0.72 + random() * 0.16);
  } else {
    target.setHSL(0.57 + random() * 0.035, 0.12 + random() * 0.1, 0.72 + random() * 0.16);
  }
}

/**
 * Deep layered starfield: several depth shells, a tilted galactic band,
 * dense clusters and a dark void region so the sky never reads as a
 * flat wallpaper. Twinkle runs in the point shader, no per-frame CPU work.
 */
export class Starfield {
  readonly group = new THREE.Group();

  private readonly materials: THREE.ShaderMaterial[] = [];

  private readonly voidDirection = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();

  private readonly streak: THREE.Points;

  private readonly streakMaterial: THREE.PointsMaterial;

  private streakFrom = new THREE.Vector3();

  private streakTo = new THREE.Vector3();

  private streakAge = 1;

  private readonly streakDuration = 1.5;

  private streakTimer = 9;

  private readonly random = createSeededRandom(218.9);

  private readonly meteorOrigin = new THREE.Vector3();

  private readonly meteorTangent = new THREE.Vector3();

  private readonly meteorPoint = new THREE.Vector3();

  constructor(quality: StarfieldQuality = 'high') {
    this.group.name = 'Deep Starfield';

    const budget = STARFIELD_BUDGETS[quality];

    this.addLayer({
      count: budget.layers[0],
      minRadius: 3600,
      maxRadius: 4800,
      minSize: 0.62,
      maxSize: 1.65,
      bandBias: 0.48,
      twinkleSpeed: 0.18
    });
    this.addLayer({
      count: budget.layers[1],
      minRadius: 2300,
      maxRadius: 3300,
      minSize: 0.82,
      maxSize: 2.15,
      bandBias: 0.28,
      twinkleSpeed: 0.24
    });
    this.addLayer({
      count: budget.layers[2],
      minRadius: 1250,
      maxRadius: 2100,
      minSize: 1.05,
      maxSize: 2.9,
      bandBias: 0,
      twinkleSpeed: 0.31
    });

    this.addClusters(budget.clusterCount, budget.starsPerCluster);
    this.group.rotation.z = 0.42;
    this.group.rotation.x = 0.18;

    // Meteor streak: a short trail of points that occasionally darts across
    // the far sky. One instance, reused; invisible while dormant.
    const trailCount = 14;
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailCount * 3), 3));
    this.streakMaterial = new THREE.PointsMaterial({
      color: 0xcfe8ff,
      size: 2.8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.streak = new THREE.Points(streakGeometry, this.streakMaterial);
    this.streak.frustumCulled = false;
    this.group.add(this.streak);
  }

  update(delta: number, elapsed: number): void {
    for (const material of this.materials) {
      material.uniforms.uTime.value = elapsed;
    }
    this.updateMeteor(delta);
  }

  private updateMeteor(delta: number): void {
    this.streakTimer -= delta;
    if (this.streakTimer <= 0) {
      // Launch: pick a random far point and a tangential travel direction.
      const origin = this.meteorOrigin.setFromSphericalCoords(
        2600 + this.random() * 900,
        Math.acos(2 * this.random() - 1),
        this.random() * Math.PI * 2
      );
      const tangent = this.meteorTangent
        .set(this.random() - 0.5, this.random() - 0.5, this.random() - 0.5)
        .cross(origin)
        .normalize()
        .multiplyScalar(520 + this.random() * 480);
      this.streakFrom.copy(origin);
      this.streakTo.copy(origin).add(tangent);
      this.streakAge = 0;
      this.streakTimer = 24 + this.random() * 34;
    }

    if (this.streakAge >= this.streakDuration) {
      this.streakMaterial.opacity = 0;
      return;
    }

    this.streakAge += delta;
    const headT = Math.min(this.streakAge / this.streakDuration, 1);
    const positions = this.streak.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const t = Math.max(headT - i * 0.016, 0);
      this.meteorPoint.copy(this.streakFrom).lerp(this.streakTo, t);
      positions.setXYZ(i, this.meteorPoint.x, this.meteorPoint.y, this.meteorPoint.z);
    }
    positions.needsUpdate = true;
    this.streakMaterial.opacity = Math.sin(Math.PI * headT) * 0.34;
  }

  get starCount(): number {
    let total = 0;
    this.group.traverse((child) => {
      if (child instanceof THREE.Points) {
        total += child.geometry.getAttribute('position').count;
      }
    });
    return total;
  }

  private buildMaterial(twinkleSpeed: number): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTwinkleSpeed: { value: twinkleSpeed }
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(material);
    return material;
  }

  private addLayer(options: LayerOptions): void {
    const positions = new Float32Array(options.count * 3);
    const colors = new Float32Array(options.count * 3);
    const sizes = new Float32Array(options.count);
    const phases = new Float32Array(options.count);
    const color = new THREE.Color();
    const point = new THREE.Vector3();

    let written = 0;
    let guard = 0;
    while (written < options.count && guard < options.count * 30) {
      guard += 1;
      const radius = THREE.MathUtils.lerp(options.minRadius, options.maxRadius, this.random());
      const theta = this.random() * Math.PI * 2;
      const inBand = this.random() < options.bandBias;
      const phi = inBand
        ? Math.PI / 2 + (this.random() - 0.5) * 0.3
        : Math.acos(2 * this.random() - 1);

      point.setFromSphericalCoords(radius, phi, theta);

      // Carve a dark void so one region of the sky feels genuinely empty.
      const alignment = point.dot(this.voidDirection) / radius;
      if (alignment > 0.8 && this.random() < 0.965) continue;

      positions[written * 3] = point.x;
      positions[written * 3 + 1] = point.y;
      positions[written * 3 + 2] = point.z;

      pickStarColor(color, this.random);
      const bright = inBand ? 0.68 + this.random() * 0.22 : 0.76 + this.random() * 0.22;
      colors[written * 3] = color.r * bright;
      colors[written * 3 + 1] = color.g * bright;
      colors[written * 3 + 2] = color.b * bright;

      sizes[written] = THREE.MathUtils.lerp(options.minSize, options.maxSize, Math.pow(this.random(), 3.2));
      phases[written] = this.random() * Math.PI * 2;
      written += 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, written * 3), 3));
    geometry.setAttribute('starColor', new THREE.BufferAttribute(colors.subarray(0, written * 3), 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes.subarray(0, written), 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases.subarray(0, written), 1));

    const points = new THREE.Points(geometry, this.buildMaterial(options.twinkleSpeed));
    points.frustumCulled = false;
    points.renderOrder = -20;
    this.group.add(points);
  }

  private addClusters(clusterCount: number, starsPerCluster: number): void {
    const total = clusterCount * starsPerCluster;
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const phases = new Float32Array(total);
    const color = new THREE.Color();
    const center = new THREE.Vector3();

    let index = 0;
    for (let c = 0; c < clusterCount; c += 1) {
      center.setFromSphericalCoords(
        2700 + this.random() * 1300,
        Math.acos(2 * this.random() - 1),
        this.random() * Math.PI * 2
      );
      const spread = 150 + this.random() * 240;

      for (let s = 0; s < starsPerCluster; s += 1) {
        const gaussian = () => (this.random() + this.random() + this.random() - 1.5) * 0.8;
        positions[index * 3] = center.x + gaussian() * spread;
        positions[index * 3 + 1] = center.y + gaussian() * spread;
        positions[index * 3 + 2] = center.z + gaussian() * spread;

        color.setHSL(0.57 + this.random() * 0.035, 0.08 + this.random() * 0.12, 0.68 + this.random() * 0.18);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        sizes[index] = 0.72 + Math.pow(this.random(), 2.8) * 1.55;
        phases[index] = this.random() * Math.PI * 2;
        index += 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const points = new THREE.Points(geometry, this.buildMaterial(0.2));
    points.frustumCulled = false;
    points.renderOrder = -20;
    this.group.add(points);
  }
}
