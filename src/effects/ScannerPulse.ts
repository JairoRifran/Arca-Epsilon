import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

type Pulse = {
  halo: THREE.Sprite;
  haloMaterial: THREE.SpriteMaterial;
  particles: THREE.Points;
  particleMaterial: THREE.PointsMaterial;
  directions: Float32Array;
  age: number;
  duration: number;
  maxRadius: number;
};

/**
 * Holographic scanner pulse: a compact soft flash and a shell of signal
 * motes travelling outward. It keeps the scan readable without a giant
 * wire sphere or a debug-looking guide ring.
 */
export class ScannerPulse {
  readonly group = new THREE.Group();

  private readonly pulses: Pulse[] = [];

  private readonly texture = createSoftParticleTexture(48);

  constructor() {
    this.group.name = 'Scanner Pulse Effects';
  }

  trigger(origin: THREE.Vector3, success: boolean): void {
    const color = success ? 0x80fff0 : 0x5aa7ff;

    const haloMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      color,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.name = 'Scanner Soft Halo';
    halo.position.copy(origin);
    halo.scale.setScalar(4);
    this.group.add(halo);

    // Signal motes riding the wavefront.
    const count = 64;
    const positions = new Float32Array(count * 3);
    const directions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        (Math.random() - 0.5) * 0.6,
        Math.random() - 0.5
      ).normalize();
      directions[i * 3] = direction.x;
      directions[i * 3 + 1] = direction.y;
      directions[i * 3 + 2] = direction.z;
      positions[i * 3] = direction.x * 2;
      positions[i * 3 + 1] = direction.y * 2;
      positions[i * 3 + 2] = direction.z * 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color,
      size: 1.6,
      map: this.texture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.position.copy(origin);
    this.group.add(particles);

    this.pulses.push({
      halo,
      haloMaterial,
      particles,
      particleMaterial,
      directions,
      age: 0,
      duration: success ? 1.9 : 1.3,
      maxRadius: success ? 150 : 95
    });
  }

  update(delta: number): void {
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i];
      pulse.age += delta;
      const t = Math.min(pulse.age / pulse.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const radius = THREE.MathUtils.lerp(2, pulse.maxRadius, eased);

      const haloRadius = THREE.MathUtils.lerp(4, Math.min(34, pulse.maxRadius * 0.24), eased);
      pulse.halo.scale.setScalar(haloRadius);
      pulse.haloMaterial.opacity = THREE.MathUtils.lerp(0.28, 0, Math.min(1, t * 1.7));

      const positions = pulse.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      const shell = radius * 0.96;
      for (let p = 0; p < array.length; p += 3) {
        array[p] = pulse.directions[p] * shell;
        array[p + 1] = pulse.directions[p + 1] * shell;
        array[p + 2] = pulse.directions[p + 2] * shell;
      }
      positions.needsUpdate = true;
      pulse.particleMaterial.opacity = THREE.MathUtils.lerp(0.85, 0, t);

      if (t >= 1) {
        this.group.remove(pulse.halo, pulse.particles);
        pulse.haloMaterial.dispose();
        pulse.particles.geometry.dispose();
        pulse.particleMaterial.dispose();
        this.pulses.splice(i, 1);
      }
    }
  }

  get activeCount(): number {
    return this.pulses.length;
  }
}
