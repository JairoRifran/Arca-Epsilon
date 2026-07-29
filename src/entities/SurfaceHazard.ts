import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * Unstable radiation pocket: a shimmering column of charged haze, drifting
 * embers and intermittent static arcs over scorched ground. Readable from
 * a distance without any painted circle.
 */
export class SurfaceHazard {
  readonly group = new THREE.Group();

  private readonly hazeMaterials: THREE.SpriteMaterial[] = [];
  private readonly embers: THREE.Points;
  private readonly emberSeeds: Float32Array;
  private readonly arcs: THREE.LineSegments;
  private readonly arcMaterial: THREE.LineBasicMaterial;
  private readonly light: THREE.PointLight;

  constructor(readonly name: string, position: THREE.Vector3, readonly radius: number) {
    this.group.name = `SurfaceHazard (${name})`;
    this.group.position.copy(position);

    // Scorched ground stain under the pocket.
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.55, 26),
      new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.98, metalness: 0 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.12;
    this.group.add(scorch);

    // Layered irradiated haze: ragged sprites, never a uniform sphere.
    for (let i = 0; i < 7; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: createSoftParticleTexture(96),
        color: 0xc46a24,
        transparent: true,
        opacity: 0.07 + Math.random() * 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        rotation: Math.random() * Math.PI * 2
      });
      this.hazeMaterials.push(material);
      const haze = new THREE.Sprite(material);
      haze.position.set(
        (Math.random() - 0.5) * radius * 0.8,
        4 + Math.random() * radius * 0.4,
        (Math.random() - 0.5) * radius * 0.8
      );
      haze.scale.setScalar(radius * (0.5 + Math.random() * 0.5));
      this.group.add(haze);
    }

    // Charged embers spiralling up through the pocket.
    const emberCount = 26;
    const emberPositions = new Float32Array(emberCount * 3);
    this.emberSeeds = new Float32Array(emberCount * 2);
    for (let i = 0; i < emberCount; i += 1) {
      this.emberSeeds[i * 2] = Math.random() * Math.PI * 2;
      this.emberSeeds[i * 2 + 1] = 4 + Math.random() * radius * 0.5;
    }
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    this.embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        color: 0xffb050,
        size: 0.9,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.embers.frustumCulled = false;
    this.group.add(this.embers);

    // Static discharge arcs: jittering line bundle, mostly dormant.
    const arcSegments = 14;
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcSegments * 2 * 3), 3));
    this.arcMaterial = new THREE.LineBasicMaterial({
      color: 0xffd9b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.arcs = new THREE.LineSegments(arcGeometry, this.arcMaterial);
    this.group.add(this.arcs);

    this.light = new THREE.PointLight(0xff8a30, 1.2, radius * 1.6, 1.7);
    this.light.position.y = 9;
    this.group.add(this.light);
  }

  isInRange(position: THREE.Vector3): boolean {
    return this.group.position.distanceTo(position) < this.radius;
  }

  update(elapsed: number): void {
    for (const [index, material] of this.hazeMaterials.entries()) {
      material.opacity = 0.06 + Math.abs(Math.sin(elapsed * 0.6 + index * 1.7)) * 0.06;
      material.rotation += 0.0006 * (index % 2 === 0 ? 1 : -1);
    }

    // Embers rise on deterministic loops with a slow orbital drift.
    const positions = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const angle = this.emberSeeds[i * 2] + elapsed * 0.24;
      const orbit = this.emberSeeds[i * 2 + 1];
      const rise = ((elapsed * 2.2 + this.emberSeeds[i * 2] * 5) % 16);
      positions.setXYZ(i, Math.cos(angle) * orbit, 0.8 + rise, Math.sin(angle) * orbit);
    }
    positions.needsUpdate = true;

    // Arc bursts: brief, bright, pseudo-random from the clock.
    const burst = Math.sin(elapsed * 1.35) > 0.88;
    if (burst) {
      const arcPositions = this.arcs.geometry.getAttribute('position') as THREE.BufferAttribute;
      let x = (Math.sin(elapsed * 53.7) * 0.5) * this.radius * 0.5;
      let y = 3 + Math.abs(Math.sin(elapsed * 31.3)) * 9;
      let z = (Math.cos(elapsed * 47.1) * 0.5) * this.radius * 0.5;
      for (let i = 0; i < arcPositions.count; i += 2) {
        arcPositions.setXYZ(i, x, y, z);
        x += Math.sin(elapsed * 77.7 + i * 3.1) * 5;
        y += Math.sin(elapsed * 91.3 + i * 1.7) * 3.4;
        z += Math.cos(elapsed * 83.9 + i * 2.3) * 5;
        arcPositions.setXYZ(i + 1, x, y, z);
      }
      arcPositions.needsUpdate = true;
    }
    this.arcMaterial.opacity = burst ? 0.7 : Math.max(0, this.arcMaterial.opacity - 0.08);

    this.light.intensity = 1 + Math.abs(Math.sin(elapsed * 2.5)) * 0.7 + (burst ? 1.4 : 0);
  }
}
