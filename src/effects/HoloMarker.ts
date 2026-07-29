import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

type Arc = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  spin: number;
};

/**
 * Diegetic navigation ping projected by the ship's scanner: a soft pulsing
 * core orbited by broken, flickering arc fragments. Reads as a holographic
 * scanner artifact instead of a perfect debug circle. Billboarded by the
 * caller; all elements share one opacity dial.
 */
export class HoloMarker {
  readonly group = new THREE.Group();

  opacity = 0.2;

  private readonly coreMaterial: THREE.SpriteMaterial;

  private readonly arcs: Arc[] = [];

  private readonly phase = Math.random() * Math.PI * 2;

  private discovered = false;

  constructor(radius = 8, color = 0x71f3c2) {
    this.group.name = 'Holographic Nav Ping';

    this.coreMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(64),
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const core = new THREE.Sprite(this.coreMaterial);
    core.scale.setScalar(radius * 0.55);
    this.group.add(core);

    // Subtle diegetic diamond core instead of circular torus arcs
    const diamondMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.28, 0), diamondMaterial);
    this.group.add(diamond);
    this.arcs.push({ mesh: diamond, material: diamondMaterial, spin: 0.6 });
  }

  setDiscovered(): void {
    this.discovered = true;
    this.coreMaterial.color.setHex(0x8ffff0);
    for (const arc of this.arcs) {
      arc.material.color.setHex(0x8ffff0);
    }
  }

  update(delta: number, elapsed: number): void {
    // Holographic flicker: two incommensurate sines make it read as signal
    // noise rather than a clean pulse.
    const flicker = 0.72 + 0.18 * Math.sin(elapsed * 6.3 + this.phase) * Math.sin(elapsed * 11.7 + this.phase * 2);
    const strength = this.discovered ? 0.55 : 1;

    this.coreMaterial.opacity = this.opacity * flicker * strength;
    for (const arc of this.arcs) {
      arc.mesh.rotation.z += delta * arc.spin;
      arc.material.opacity = this.opacity * 0.8 * flicker * strength;
    }
  }
}
