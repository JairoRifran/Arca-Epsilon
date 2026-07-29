import * as THREE from 'three';
import { createContactShadow } from '../assets/materialCache';
import { auroraGreebleField, boltGeometry, polymer, structuralMetal } from '../assets/auroraDetailKit';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * The stake the pilot drives into the clearing to claim the site for
 * Aurora-01: a short pole, a folded marker flag panel and a ground ring that
 * lights the moment the site is chosen. Deliberately modest — this is a
 * survey marker, not a monument.
 */
export class AuroraSettlementBeacon {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly panelMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly metalMaterial: THREE.MeshStandardMaterial;
  private readonly shellMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'Baliza Aurora-01';
    this.group.visible = false;

    const metal = structuralMetal(0x4a525a);
    const shell = polymer(0x39413f);
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2a2a,
      emissive: 0x62d2a4,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.4
    });
    this.panelMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9c2b4,
      emissive: 0x2f6b52,
      emissiveIntensity: 0.12,
      roughness: 0.7,
      metalness: 0.15,
      side: THREE.DoubleSide
    });

    this.group.add(createContactShadow(1.4, 0.3));

    const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 20), this.ringMaterial);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.05;
    this.group.add(groundRing);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.1, 6), metal);
    pole.position.y = 1.05;
    this.group.add(pole);

    // Driven-stake hardware: a base flange bolted to the ground plate, a
    // reinforcing collar and a guy-line to one side, so the pole reads as
    // something planted rather than a floating cylinder.
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.07, 10), shell);
    flange.position.y = 0.05;
    this.group.add(flange);

    // Panel on a short arm with a bolted bracket, rather than floating.
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.035), metal);
    arm.position.set(0.17, 1.72, 0);
    this.group.add(arm);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.44), this.panelMaterial);
    panel.position.set(0.36, 1.72, 0);
    this.group.add(panel);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 6), metal);
    cap.position.y = 2.22;
    this.group.add(cap);
    this.metalMaterial = metal;
    this.shellMaterial = shell;

    this.light = new THREE.PointLight(0x62d2a4, 0.42, 12, 1.9);
    this.light.position.y = 1.6;
    this.group.add(this.light);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  /** Hardware detail into the colony pool; placement-time only. */
  private emitDetail(): void {
    this.group.updateMatrixWorld(true);
    const metal = this.metalMaterial;
    const shell = this.shellMaterial;
    auroraGreebleField.emit('beacon:aurora-01', this.group.matrixWorld, (b) => {
      b.boltRing(4, 0.145, 0.095, 0.05, metal);
      b.add('collar|shell', boltGeometry(), shell, { x: 0, y: 1.34, z: 0 }, { x: 0.19, y: 0.1, z: 0.19 });
      b.cable({ x: 0.04, y: 1.9, z: 0.02 }, { x: 0.62, y: 0.08, z: 0.34 }, 0.12, 5, 0.014);
      b.boltRow({ x: 0.05, y: 1.66, z: 0.005 }, { x: 0.05, y: 1.78, z: 0.005 }, 2, 0.03, metal);
    });
    auroraGreebleField.commit();
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.5, z);
    this.emitDetail();
  }

  restore(visible: boolean): void {
    this.group.visible = visible;
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * 1.7) * 0.5;
    this.ringMaterial.emissiveIntensity = 0.28 + pulse * 0.22;
    this.panelMaterial.emissiveIntensity = 0.08 + pulse * 0.06;
    this.light.intensity = 0.3 + pulse * 0.24;
  }
}
