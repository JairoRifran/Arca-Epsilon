import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export class EngineTrail {
  readonly group = new THREE.Group();

  private readonly materials: THREE.PointsMaterial[] = [];

  private readonly trails: THREE.Points[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.name = 'Player Engine Trail';
    const texture = createSoftParticleTexture(64);

    for (const x of [-1.15, 1.15]) {
      const positions = new Float32Array(80 * 3);
      for (let i = 0; i < 80; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 0.18;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.18;
        positions[i * 3 + 2] = i * 0.08;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0x72dfff,
        size: 0.95,
        map: texture,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.materials.push(material);

      const trail = new THREE.Points(geometry, material);
      trail.position.set(x, -0.32, 4.85);
      this.trails.push(trail);
      this.group.add(trail);
    }

    parent.add(this.group);
  }

  setSocketPositions(positions: THREE.Vector3[]): void {
    for (let i = 0; i < this.trails.length; i += 1) {
      const socket = positions[i] ?? positions[positions.length - 1];
      if (socket) {
        this.trails[i].position.copy(socket);
      }
    }
  }

  update(boosting: boolean, speed: number, elapsed: number): void {
    const intensity = THREE.MathUtils.clamp(speed * 0.06 + (boosting ? 0.55 : 0), 0.16, 1.1);
    this.group.scale.z = 1.5 + intensity * 3.6 + Math.sin(elapsed * 18) * 0.08;
    for (const material of this.materials) {
      material.opacity = 0.16 + intensity * 0.48;
      material.size = 0.55 + intensity * 0.75;
    }
  }
}
