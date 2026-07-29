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
  gl_PointSize = clamp(gl_PointSize, 0.75, 9.0);
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
  float twinkle = 0.78 + 0.22 * sin(uTime * uTwinkleSpeed + vPhase);
  gl_FragColor = vec4(vColor * core * twinkle, core * twinkle);
}
`;

function pickStarColor(target: THREE.Color): void {
  const roll = Math.random();
  if (roll < 0.42) {
    target.setHSL(0.6 + Math.random() * 0.05, 0.45 + Math.random() * 0.3, 0.72 + Math.random() * 0.2);
  } else if (roll < 0.74) {
    target.setHSL(0.12 + Math.random() * 0.04, 0.12 + Math.random() * 0.18, 0.82 + Math.random() * 0.14);
  } else if (roll < 0.9) {
    target.setHSL(0.09 + Math.random() * 0.03, 0.55 + Math.random() * 0.25, 0.66 + Math.random() * 0.16);
  } else {
    target.setHSL(0.015 + Math.random() * 0.02, 0.7 + Math.random() * 0.2, 0.58 + Math.random() * 0.14);
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

  constructor() {
    this.group.name = 'Deep Starfield';

    this.addLayer({
      count: 5200,
      minRadius: 3600,
      maxRadius: 4800,
      minSize: 0.9,
      maxSize: 2.4,
      bandBias: 0.62,
      twinkleSpeed: 0.7
    });
    this.addLayer({
      count: 2400,
      minRadius: 2300,
      maxRadius: 3300,
      minSize: 1.4,
      maxSize: 3.6,
      bandBias: 0.4,
      twinkleSpeed: 1.1
    });
    this.addLayer({
      count: 640,
      minRadius: 1250,
      maxRadius: 2100,
      minSize: 2.6,
      maxSize: 6.2,
      bandBias: 0,
      twinkleSpeed: 1.7
    });

    this.addClusters(5, 130);
    this.group.rotation.z = 0.42;
    this.group.rotation.x = 0.18;

    // Meteor streak: a short trail of points that occasionally darts across
    // the far sky. One instance, reused; invisible while dormant.
    const trailCount = 14;
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailCount * 3), 3));
    this.streakMaterial = new THREE.PointsMaterial({
      color: 0xcfe8ff,
      size: 5,
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
      const origin = new THREE.Vector3().setFromSphericalCoords(
        2600 + Math.random() * 900,
        Math.acos(2 * Math.random() - 1),
        Math.random() * Math.PI * 2
      );
      const tangent = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .cross(origin)
        .normalize()
        .multiplyScalar(700 + Math.random() * 600);
      this.streakFrom.copy(origin);
      this.streakTo.copy(origin).add(tangent);
      this.streakAge = 0;
      this.streakTimer = 12 + Math.random() * 24;
    }

    if (this.streakAge >= this.streakDuration) {
      this.streakMaterial.opacity = 0;
      return;
    }

    this.streakAge += delta;
    const headT = Math.min(this.streakAge / this.streakDuration, 1);
    const positions = this.streak.geometry.getAttribute('position') as THREE.BufferAttribute;
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      const t = Math.max(headT - i * 0.016, 0);
      point.copy(this.streakFrom).lerp(this.streakTo, t);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    this.streakMaterial.opacity = Math.sin(Math.PI * headT) * 0.85;
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
      const radius = THREE.MathUtils.lerp(options.minRadius, options.maxRadius, Math.random());
      const theta = Math.random() * Math.PI * 2;
      const inBand = Math.random() < options.bandBias;
      const phi = inBand
        ? Math.PI / 2 + (Math.random() - 0.5) * 0.34
        : Math.acos(2 * Math.random() - 1);

      point.setFromSphericalCoords(radius, phi, theta);

      // Carve a dark void so one region of the sky feels genuinely empty.
      const alignment = point.clone().normalize().dot(this.voidDirection);
      if (alignment > 0.86 && Math.random() < 0.92) continue;

      positions[written * 3] = point.x;
      positions[written * 3 + 1] = point.y;
      positions[written * 3 + 2] = point.z;

      pickStarColor(color);
      const bright = inBand ? 0.82 + Math.random() * 0.3 : 1;
      colors[written * 3] = color.r * bright;
      colors[written * 3 + 1] = color.g * bright;
      colors[written * 3 + 2] = color.b * bright;

      sizes[written] = THREE.MathUtils.lerp(options.minSize, options.maxSize, Math.pow(Math.random(), 2.4));
      phases[written] = Math.random() * Math.PI * 2;
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
        2600 + Math.random() * 1500,
        Math.acos(2 * Math.random() - 1),
        Math.random() * Math.PI * 2
      );
      const spread = 90 + Math.random() * 200;

      for (let s = 0; s < starsPerCluster; s += 1) {
        const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
        positions[index * 3] = center.x + gaussian() * spread;
        positions[index * 3 + 1] = center.y + gaussian() * spread;
        positions[index * 3 + 2] = center.z + gaussian() * spread;

        color.setHSL(0.58 + Math.random() * 0.08, 0.5, 0.74 + Math.random() * 0.2);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        sizes[index] = 1 + Math.pow(Math.random(), 2) * 2.6;
        phases[index] = Math.random() * Math.PI * 2;
        index += 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const points = new THREE.Points(geometry, this.buildMaterial(0.9));
    points.frustumCulled = false;
    points.renderOrder = -20;
    this.group.add(points);
  }
}
