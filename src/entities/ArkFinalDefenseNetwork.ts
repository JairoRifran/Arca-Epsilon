import * as THREE from 'three';
import { mission25Tuning } from '../assets/mission25Definitions';

const SYSTEM_OFFSETS = [
  [0, -18, 142],
  [-82, 38, -48],
  [0, 46, 18]
] as const;

export type ArkFinalDefenseVisualState = {
  integrities: readonly number[];
  arkIntegrity: number;
  pressureActive: boolean;
  relaysActive: boolean;
  alliedSupportActive: boolean;
  stabilizing: boolean;
  contactSignaturesActive: boolean;
};

/** Lazy local-space dressing for the real Mothership during M25. */
export class ArkFinalDefenseNetwork {
  readonly group = new THREE.Group();
  readonly systemPositions = Array.from({ length: SYSTEM_OFFSETS.length }, () => new THREE.Vector3());

  private readonly systemMarkers: THREE.Group[] = [];
  private readonly systemMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly impactLevels = new Float32Array(SYSTEM_OFFSETS.length);
  private readonly relayGroup = new THREE.Group();
  private readonly alliedGroup = new THREE.Group();
  private readonly shieldArcs = new THREE.Group();
  private readonly contactSignatures = new THREE.Group();
  private readonly shieldMaterials: THREE.MeshBasicMaterial[] = [];
  private contactSignatureMaterial?: THREE.PointsMaterial;
  private readonly scratch = new THREE.Vector3();
  private built = false;
  private updateAccumulator = 0;
  private pressure = false;
  private stabilizing = false;
  private arkIntegrity = 100;

  constructor() {
    this.group.name = 'M25 Ark Final Defense Network';
    this.group.visible = false;
    this.relayGroup.name = 'M25 Joint Relay Defense';
    this.alliedGroup.name = 'M25 Allied Support';
    this.shieldArcs.name = 'M25 Local Shield Arcs';
    this.contactSignatures.name = 'M25 Incoming Contact Signatures';
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get systemCount(): number { return this.systemMarkers.length; }
  get relayVisible(): boolean { return this.relayGroup.visible; }
  get alliedSupportVisible(): boolean { return this.alliedGroup.visible; }
  get contactSignaturesVisible(): boolean { return this.contactSignatures.visible; }

  setArkTransform(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);
    for (let index = 0; index < SYSTEM_OFFSETS.length; index += 1) {
      const offset = SYSTEM_OFFSETS[index];
      this.scratch.set(offset[0], offset[1], offset[2]).applyQuaternion(quaternion);
      this.systemPositions[index].copy(position).add(this.scratch);
    }
  }

  setState(state: ArkFinalDefenseVisualState): void {
    this.ensureBuilt();
    this.group.visible = true;
    this.pressure = state.pressureActive;
    this.stabilizing = state.stabilizing;
    this.arkIntegrity = state.arkIntegrity;
    this.relayGroup.visible = state.relaysActive;
    this.alliedGroup.visible = state.alliedSupportActive;
    this.shieldArcs.visible = state.pressureActive || state.stabilizing;
    this.contactSignatures.visible = state.contactSignaturesActive;
    for (let index = 0; index < this.systemMaterials.length; index += 1) {
      const integrity = state.integrities[index] ?? 100;
      const material = this.systemMaterials[index];
      material.color.setHex(integrity < 40 ? 0xd15d4a : integrity < 70 ? 0xd2a052 : 0x72cbd0);
      material.opacity = integrity < 40 ? 0.82 : 0.54;
      this.systemMarkers[index].visible = true;
    }
  }

  registerImpact(index: number): void {
    const safeIndex = Math.max(0, Math.min(this.impactLevels.length - 1, Math.floor(index)));
    this.impactLevels[safeIndex] = 1;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < mission25Tuning.visualUpdateInterval) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    for (let index = 0; index < this.systemMarkers.length; index += 1) {
      this.impactLevels[index] = Math.max(0, this.impactLevels[index] - step * 2.6);
      const marker = this.systemMarkers[index];
      marker.rotation.z += step * (index % 2 === 0 ? 0.22 : -0.18);
      const material = this.systemMaterials[index];
      material.opacity = Math.min(0.92, material.opacity + this.impactLevels[index] * 0.24);
    }
    if (this.relayGroup.visible) this.relayGroup.rotation.y += step * 0.08;
    if (this.alliedGroup.visible) this.alliedGroup.rotation.y -= step * 0.045;
    if (this.shieldArcs.visible) {
      this.shieldArcs.rotation.y += step * 0.035;
      const pulse = this.stabilizing ? 0.35 : this.pressure ? 0.18 + Math.sin(elapsed * 4.2) * 0.06 : 0.12;
      for (let index = 0; index < this.shieldMaterials.length; index += 1) {
        this.shieldMaterials[index].opacity = pulse * (0.55 + this.arkIntegrity / 220);
      }
    }
    if (this.contactSignatures.visible && this.contactSignatureMaterial) {
      this.contactSignatureMaterial.opacity = 0.48 + Math.sin(elapsed * 2.2) * 0.18;
    }
  }

  dispose(): void {
    if (!this.built) return;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Line;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.group.clear();
    this.systemMarkers.length = 0;
    this.systemMaterials.length = 0;
    this.relayGroup.clear();
    this.alliedGroup.clear();
    this.shieldArcs.clear();
    this.contactSignatures.clear();
    this.shieldMaterials.length = 0;
    this.contactSignatureMaterial = undefined;
    this.impactLevels.fill(0);
    this.updateAccumulator = 0;
    this.group.visible = false;
    this.built = false;
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    const ringGeometry = new THREE.TorusGeometry(15, 0.9, 6, 32);
    const coreGeometry = new THREE.OctahedronGeometry(5.5, 0);
    for (let index = 0; index < SYSTEM_OFFSETS.length; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x72cbd0,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const marker = new THREE.Group();
      marker.name = `M25 Defendable System ${index + 1}`;
      marker.position.set(SYSTEM_OFFSETS[index][0], SYSTEM_OFFSETS[index][1], SYSTEM_OFFSETS[index][2]);
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.rotation.x = Math.PI / 2;
      marker.add(ring, new THREE.Mesh(coreGeometry, material));
      this.systemMarkers.push(marker);
      this.systemMaterials.push(material);
      this.group.add(marker);
    }

    const relayMaterial = new THREE.MeshBasicMaterial({ color: 0x8bc7b3, transparent: true, opacity: 0.44, depthWrite: false });
    const relayGeometry = new THREE.CylinderGeometry(2.4, 4.2, 18, 7);
    for (let index = 0; index < 3; index += 1) {
      const angle = index / 3 * Math.PI * 2;
      const relay = new THREE.Mesh(relayGeometry, relayMaterial);
      relay.position.set(Math.cos(angle) * 205, 65 + index * 16, Math.sin(angle) * 205);
      this.relayGroup.add(relay);
    }

    const contactGeometry = new THREE.BufferGeometry();
    contactGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -96, 210, -1180,
      8, 234, -1240,
      112, 188, -1145
    ], 3));
    this.contactSignatureMaterial = new THREE.PointsMaterial({
      color: 0xd77b63,
      size: 8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.contactSignatures.add(new THREE.Points(contactGeometry, this.contactSignatureMaterial));
    this.contactSignatures.visible = false;
    this.group.add(this.contactSignatures);
    this.relayGroup.visible = false;
    this.group.add(this.relayGroup);

    const allyMaterial = new THREE.MeshBasicMaterial({ color: 0xd6c783, transparent: true, opacity: 0.5, depthWrite: false });
    const allyGeometry = new THREE.ConeGeometry(3.5, 14, 6);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      const ally = new THREE.Mesh(allyGeometry, allyMaterial);
      ally.position.set(Math.cos(angle) * 270, 100 + (index % 2) * 24, Math.sin(angle) * 270);
      ally.rotation.x = Math.PI / 2;
      this.alliedGroup.add(ally);
    }
    this.alliedGroup.visible = false;
    this.group.add(this.alliedGroup);

    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x75b9ca,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 3; index += 1) {
      const material = shieldMaterial.clone();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(188 + index * 10, 1.2, 5, 52, Math.PI * 1.25), material);
      arc.rotation.set(Math.PI / 2 + index * 0.22, index * 0.55, index * 1.7);
      this.shieldMaterials.push(material);
      this.shieldArcs.add(arc);
    }
    this.shieldArcs.visible = false;
    this.group.add(this.shieldArcs);
  }
}
