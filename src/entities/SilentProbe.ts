import * as THREE from 'three';
import type { SilentProbeState } from '../assets/mission05Definitions';

export class SilentProbe {
  readonly group = new THREE.Group();

  private readonly hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x15181b,
    metalness: 0.94,
    roughness: 0.28,
    emissive: 0x160b08,
    emissiveIntensity: 0.18,
    transparent: true
  });

  private readonly coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xd45a32,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xa84b2d,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  private readonly core: THREE.Mesh;

  private readonly ring: THREE.Mesh;

  private homePosition = new THREE.Vector3();

  /** Reused destination for the retreat lerp; never escapes this class. */
  private readonly escapeScratch = new THREE.Vector3();

  private state: SilentProbeState = 'hidden';

  private retreatProgress = 0;

  constructor() {
    this.group.name = 'Sonda Silenciosa';

    const hull = new THREE.Mesh(new THREE.OctahedronGeometry(2.1, 0), this.hullMaterial);
    hull.scale.set(1.4, 0.58, 2.15);
    this.group.add(hull);

    const finGeometry = new THREE.BoxGeometry(0.22, 0.74, 4.8);
    for (const rotation of [-0.72, 0.72]) {
      const fin = new THREE.Mesh(finGeometry, this.hullMaterial);
      fin.rotation.z = rotation;
      fin.position.x = Math.sin(rotation) * 1.7;
      this.group.add(fin);
    }

    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), this.coreMaterial);
    this.core.position.z = 2.2;
    this.group.add(this.core);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.06, 6, 36), this.ringMaterial);
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);

    this.group.visible = false;
  }

  get interactionPosition(): THREE.Vector3 {
    return this.group.position;
  }

  get retreatComplete(): boolean {
    return this.retreatProgress >= 1;
  }

  setPosition(position: THREE.Vector3): void {
    this.homePosition.copy(position);
    this.group.position.copy(position);
  }

  setState(state: SilentProbeState): void {
    if (this.state === state) return;
    this.state = state;
    if (state === 'retreating') this.retreatProgress = 0;
    if (state === 'detected' || state === 'tracking' || state === 'jammed') {
      this.group.position.copy(this.homePosition);
    }
    this.group.visible = state !== 'hidden' && state !== 'escaped';
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    this.group.rotation.y += delta * (this.state === 'jammed' ? 1.8 : 0.45);
    this.group.rotation.z = Math.sin(elapsed * 0.52) * 0.12;
    this.ring.rotation.z -= delta * 0.7;

    const jamPulse = this.state === 'jammed'
      ? 0.25 + Math.max(0, Math.sin(elapsed * 17)) * 0.65
      : 0.62 + Math.sin(elapsed * 2.4) * 0.18;
    this.coreMaterial.opacity = jamPulse;
    this.ringMaterial.opacity = this.state === 'jammed' ? jamPulse * 0.32 : 0.22;
    this.hullMaterial.opacity = this.state === 'jammed' ? 0.28 + jamPulse * 0.42 : 1;

    if (this.state === 'retreating') {
      this.retreatProgress = Math.min(1, this.retreatProgress + delta * 0.28);
      // Reused: this runs every frame of the retreat, and the destination is
      // a pure function of a position that does not change.
      const escapePosition = this.escapeScratch.copy(this.homePosition).multiplyScalar(1.75);
      escapePosition.y += 260;
      this.group.position.lerpVectors(this.homePosition, escapePosition, this.retreatProgress);
      this.group.scale.setScalar(1 - this.retreatProgress * 0.72);
      if (this.retreatComplete) this.group.visible = false;
    } else {
      this.group.scale.setScalar(1);
    }
  }
}
