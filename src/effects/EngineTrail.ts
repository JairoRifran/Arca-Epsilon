import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export class EngineTrail {
  readonly group = new THREE.Group();

  private readonly materials: THREE.PointsMaterial[] = [];

  private readonly trails: THREE.Points[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.name = 'Player Engine Trail';
    const texture = createSoftParticleTexture(64);
    let randomState = 0x71a11;
    const random = (): number => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4_294_967_296;
    };

    for (const x of [-1.15, 1.15]) {
      const positions = new Float32Array(80 * 3);
      for (let i = 0; i < 80; i += 1) {
        positions[i * 3] = (random() - 0.5) * 0.16;
        positions[i * 3 + 1] = (random() - 0.5) * 0.16;
        positions[i * 3 + 2] = i * 0.08;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0x72dfff,
        size: 0.58,
        map: texture,
        transparent: true,
        opacity: 0.08,
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

  update(boosting: boolean, speed: number, elapsed: number, thrust = 0, braking = false): void {
    // A ship can coast quickly with its engines quiet. Speed contributes only a
    // small residual ion trail; live thrust owns plume length and brightness.
    const coast = Math.min(speed * 0.006, 0.12);
    const drive = braking ? thrust * 0.12 : thrust;
    const intensity = THREE.MathUtils.clamp(0.06 + coast + drive * 0.72 + (boosting && !braking ? 0.5 : 0), 0.08, 1.1);
    this.group.scale.z = 1.15 + intensity * 2.35 + Math.sin(elapsed * 18) * 0.05;
    for (const material of this.materials) {
      material.opacity = 0.035 + intensity * 0.1;
      material.size = 0.34 + intensity * 0.34;
    }
  }
}
