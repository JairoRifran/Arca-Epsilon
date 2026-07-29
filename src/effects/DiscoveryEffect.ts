import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

type Burst = {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  velocities: Float32Array;
  halo: THREE.Sprite;
  haloMaterial: THREE.SpriteMaterial;
  age: number;
  duration: number;
};

/**
 * Discovery celebration: a burst of cyan data motes rising from a scanned
 * site plus a compact soft confirmation halo. Short-lived, pooled per
 * trigger and fully disposed afterwards.
 */
export class DiscoveryEffect {
  readonly group = new THREE.Group();

  private readonly bursts: Burst[] = [];

  private readonly texture = createSoftParticleTexture(48);

  constructor() {
    this.group.name = 'Discovery Effects';
  }

  trigger(origin: THREE.Vector3): void {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.9 + 0.25,
        Math.random() - 0.5
      ).normalize();
      const speed = 9 + Math.random() * 20;
      velocities[i * 3] = direction.x * speed;
      velocities[i * 3 + 1] = direction.y * speed;
      velocities[i * 3 + 2] = direction.z * speed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x7dffe8,
      size: 1.9,
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.position.copy(origin);
    this.group.add(points);

    const haloMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      color: 0x8dfff0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.name = 'Discovery Soft Halo';
    halo.position.copy(origin);
    halo.scale.setScalar(4);
    this.group.add(halo);

    this.bursts.push({
      points,
      material,
      velocities,
      halo,
      haloMaterial,
      age: 0,
      duration: 2.1
    });
  }

  update(delta: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      burst.age += delta;
      const t = burst.age / burst.duration;

      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let p = 0; p < array.length; p += 3) {
        array[p] += burst.velocities[p] * delta;
        array[p + 1] += burst.velocities[p + 1] * delta;
        array[p + 2] += burst.velocities[p + 2] * delta;
        // Gentle deceleration so motes hang like data in the air.
        burst.velocities[p] *= 1 - delta * 1.4;
        burst.velocities[p + 1] *= 1 - delta * 1.1;
        burst.velocities[p + 2] *= 1 - delta * 1.4;
      }
      positions.needsUpdate = true;
      burst.material.opacity = Math.max(0, 0.95 * (1 - t));

      const haloScale = 4 + t * 34;
      burst.halo.scale.setScalar(haloScale);
      burst.haloMaterial.opacity = Math.max(0, 0.34 * (1 - t) * (1 - t));

      if (t >= 1) {
        this.group.remove(burst.points, burst.halo);
        burst.points.geometry.dispose();
        burst.material.dispose();
        burst.haloMaterial.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  get activeCount(): number {
    return this.bursts.length;
  }
}
