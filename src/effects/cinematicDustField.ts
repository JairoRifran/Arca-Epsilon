import * as THREE from 'three';
import { createSoftParticleTexture } from './premiumMaterials';

export type CinematicDustField = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  update: (delta: number, camera: THREE.Camera, velocity: THREE.Vector3) => void;
};

export type CinematicDustOptions = {
  count?: number;
  radius?: number;
  depth?: number;
  opacity?: number;
};

export function createCinematicDustField(options: CinematicDustOptions = {}): CinematicDustField {
  const count = options.count ?? 1800;
  const radius = options.radius ?? 220;
  const depth = options.depth ?? 620;
  const opacity = options.opacity ?? 0.28;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const spread = Math.sqrt(Math.random()) * radius;
    const theta = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(theta) * spread;
    positions[i * 3 + 1] = Math.sin(theta) * spread * 0.58;
    positions[i * 3 + 2] = -Math.random() * depth;

    color.setHSL(0.55 + Math.random() * 0.06, 0.28, 0.56 + Math.random() * 0.28);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.35,
    map: createSoftParticleTexture(96),
    vertexColors: true,
    transparent: true,
    opacity,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -5;

  function update(delta: number, camera: THREE.Camera, velocity: THREE.Vector3): void {
    const drift = Math.min(velocity.length() * 0.025, 2.6);
    points.position.lerp(camera.position, 1 - Math.pow(0.0008, delta));
    points.rotation.z += delta * 0.006;
    points.rotation.x = THREE.MathUtils.lerp(points.rotation.x, velocity.y * 0.0008, 0.04);
    points.rotation.y = THREE.MathUtils.lerp(points.rotation.y, -velocity.x * 0.0008, 0.04);
    material.opacity = THREE.MathUtils.lerp(material.opacity, opacity + drift * 0.08, 0.035);
  }

  return { points, update };
}
