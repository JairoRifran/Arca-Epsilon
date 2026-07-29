import * as THREE from 'three';
import { createContactShadow } from '../assets/materialCache';
import {
  auroraGreebleField,
  boltGeometry,
  instrumentGlass,
  polymer,
  rubber,
  seamGeometry,
  structuralMetal
} from '../assets/auroraDetailKit';
import type { AuroraSamplePointDefinition } from '../assets/mission10Definitions';

const ANALYZED = new THREE.Color(0x7fe0a8);

/**
 * A survey stake: three legs, a short mast and an instrument head whose ring
 * reads dormant in the sample's own tint and settles to a confirmed green
 * once analysed. Small enough not to intrude on the valley, tall enough to
 * find on foot. One shared geometry set per probe, contact shadow included.
 */
export class AuroraSurveyProbe {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly headMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly dormantColor: THREE.Color;
  private analyzed = false;
  private readonly frameMaterial: THREE.MeshStandardMaterial;
  private readonly shellMaterial: THREE.MeshStandardMaterial;
  private readonly bootMaterial: THREE.MeshStandardMaterial;

  constructor(readonly definition: AuroraSamplePointDefinition) {
    this.group.name = definition.name;
    this.group.visible = false;
    this.dormantColor = new THREE.Color(definition.tint);

    // Frame/polymer/rubber come from the shared palette, so the four survey
    // stakes in the valley share one instance of each instead of twelve.
    const frame = structuralMetal();
    const shell = polymer(0x333a40);
    const boot = rubber();
    this.headMaterial = new THREE.MeshStandardMaterial({
      color: 0x5b656d,
      emissive: this.dormantColor.clone(),
      emissiveIntensity: 0.08,
      roughness: 0.45,
      metalness: 0.5
    });
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x232c30,
      emissive: this.dormantColor.clone(),
      emissiveIntensity: 0.22,
      roughness: 0.3,
      metalness: 0.45
    });

    this.group.add(createContactShadow(1.15, 0.3));

    // Tripod legs splayed into the ground, each with a rubber ground boot and
    // a bracket bolt where it meets the collar.
    for (let i = 0; i < 3; i += 1) {
      const angle = i * ((Math.PI * 2) / 3);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5), frame);
      leg.position.set(Math.cos(angle) * 0.28, 0.7, Math.sin(angle) * 0.28);
      leg.rotation.z = Math.cos(angle) * 0.22;
      leg.rotation.x = -Math.sin(angle) * 0.22;
      this.group.add(leg);
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.35, 6), frame);
    mast.position.y = 1.85;
    this.group.add(mast);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.26), this.headMaterial);
    head.position.y = 2.62;
    this.group.add(head);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 14), this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.92;
    this.group.add(ring);

    // The hardware detail (boots, collar, visor, lens, whips, wiring) lives in
    // the colony-wide instanced pool, emitted on placement below. Panel seams
    // are deliberately not geometry: the shared grain map carries that breakup.
    this.frameMaterial = frame;
    this.shellMaterial = shell;
    this.bootMaterial = boot;

    this.light = new THREE.PointLight(this.dormantColor.getHex(), 0.3, 9, 1.8);
    this.light.position.y = 2.8;
    this.group.add(this.light);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.4, z);
    this.emitDetail();
  }

  /**
   * Push this stake's hardware detail into the colony-wide pool. Runs on
   * placement only; the field rebuilds its instanced meshes once afterwards.
   */
  private emitDetail(): void {
    this.group.updateMatrixWorld(true);
    const frame = this.frameMaterial;
    const shell = this.shellMaterial;
    const boot = this.bootMaterial;
    auroraGreebleField.emit(`probe:${this.definition.id}`, this.group.matrixWorld, (b) => {
      for (let i = 0; i < 3; i += 1) {
        const angle = i * ((Math.PI * 2) / 3);
        // Boot: the stake is pushed into soil, so the foot is a squat pad.
        b.add('boot|rubber', boltGeometry(), boot,
          { x: Math.cos(angle) * 0.44, y: 0.05, z: Math.sin(angle) * 0.44 },
          { x: 0.14, y: 0.1, z: 0.14 });
        b.add('bolt|frame', boltGeometry(), frame,
          { x: Math.cos(angle) * 0.13, y: 1.36, z: Math.sin(angle) * 0.13 },
          { x: 0.055, y: 0.04, z: 0.055 }, { x: 0, y: angle, z: 0 });
        // Antenna whip off the ring.
        const a = i * ((Math.PI * 2) / 3) + 0.5;
        b.add('bolt|frame', boltGeometry(), frame,
          { x: Math.cos(a) * 0.3, y: 3.06, z: Math.sin(a) * 0.3 },
          { x: 0.012, y: 0.26, z: 0.012 },
          { x: Math.sin(a) * 0.2, y: 0, z: -Math.cos(a) * 0.2 });
      }
      // Collar clamping the legs to the mast, and the sun/rain visor: both
      // change the silhouette, so they stay as geometry.
      b.add('collar|shell', boltGeometry(), shell, { x: 0, y: 1.33, z: 0 }, { x: 0.125, y: 0.16, z: 0.125 });
      b.add('visor|shell', seamGeometry(), shell,
        { x: 0, y: 2.8, z: -0.01 }, { x: 0.5, y: 0.03, z: 0.34 }, { x: -0.09, y: 0, z: 0 });
      b.add('lens|glass', boltGeometry(), instrumentGlass(),
        { x: 0, y: 2.63, z: 0.14 }, { x: 0.15, y: 0.03, z: 0.15 }, { x: Math.PI / 2, y: 0, z: 0 });
      // Wiring from the mast into the head.
      b.cable({ x: 0.055, y: 1.42, z: 0.03 }, { x: 0.14, y: 2.5, z: 0.1 }, 0.06, 5, 0.016);
    });
    auroraGreebleField.commit();
  }

  restore(visible: boolean, analyzed: boolean): void {
    this.group.visible = visible;
    this.analyzed = analyzed;
    const color = analyzed ? ANALYZED : this.dormantColor;
    this.ringMaterial.emissive.copy(color);
    this.headMaterial.emissive.copy(color);
    this.light.color.copy(color);
    this.ringMaterial.emissiveIntensity = analyzed ? 0.6 : 0.22;
  }

  markAnalyzed(): void {
    this.analyzed = true;
    this.ringMaterial.emissive.copy(ANALYZED);
    this.headMaterial.emissive.copy(ANALYZED);
    this.light.color.copy(ANALYZED);
    this.ringMaterial.emissiveIntensity = 0.8;
  }

  update(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * (this.analyzed ? 1.3 : active ? 3.2 : 1.0)) * 0.5;
    this.ringMaterial.emissiveIntensity = this.analyzed
      ? 0.45 + pulse * 0.2
      : active
        ? 0.24 + pulse * 0.3
        : 0.16 + pulse * 0.08;
    this.headMaterial.emissiveIntensity = this.analyzed ? 0.2 + pulse * 0.08 : 0.06 + pulse * 0.05;
    this.light.intensity = this.analyzed ? 0.35 + pulse * 0.2 : active ? 0.3 + pulse * 0.3 : 0.18 + pulse * 0.1;
  }
}
