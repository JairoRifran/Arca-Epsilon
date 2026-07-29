import * as THREE from 'three';
import { mission22Tuning, type Mission22FrontId } from '../assets/mission22Definitions';

export type ThreeFrontVisualState = {
  visible: boolean;
  integrities: readonly [number, number, number];
  activeFront: Mission22FrontId | 'none';
  relaysProtected: readonly boolean[];
  supportPriority: Mission22FrontId | 'none';
  jointNetworkRestored: boolean;
  nodesDetected: readonly boolean[];
  finalPressureActive: boolean;
};

/** Lightweight, lazy strategic representation for Mission 22. */
export class ThreeFrontCommandNetwork {
  readonly group = new THREE.Group();
  readonly relayPositions = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  readonly nodePositions = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  private readonly hologram = new THREE.Group();
  private readonly relays = new THREE.Group();
  private readonly nodes = new THREE.Group();
  private readonly frontMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly linkMaterials: THREE.LineBasicMaterial[] = [];
  private readonly relayMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly relayRings: THREE.Mesh[] = [];
  private readonly nodeMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly nodeRings: THREE.Mesh[] = [];
  private pleyadianMaterial?: THREE.MeshBasicMaterial;
  private pleyadianPulse?: THREE.Mesh;
  private built = false;
  private updateAccumulator = 0;
  private activeFront = -1;
  private finalPressure = false;

  constructor() {
    this.group.name = 'Red de mando de tres frentes M22';
    this.hologram.name = 'Holograma estratégico Aurora Nereida Arca';
    this.relays.name = 'Relés orbitales M22';
    this.nodes.name = 'Nodos de coordinación detectados M22';
    this.group.visible = false;
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get visibleRelayCount(): number {
    let count = 0;
    for (let index = 0; index < this.relayRings.length; index += 1) if (this.relayRings[index].visible) count += 1;
    return count;
  }
  get visibleNodeCount(): number {
    let count = 0;
    for (let index = 0; index < this.nodeRings.length; index += 1) if (this.nodeRings[index].visible) count += 1;
    return count;
  }
  get jointNetworkVisible(): boolean { return Boolean(this.pleyadianPulse?.visible); }

  setOrigin(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    for (let index = 0; index < this.relayPositions.length; index += 1) {
      const offset = mission22Tuning.orbitalRelayOffsets[index];
      this.relayPositions[index].set(x + offset[0], y + offset[1], z + offset[2]);
    }
    for (let index = 0; index < this.nodePositions.length; index += 1) {
      const offset = mission22Tuning.coordinationNodeOffsets[index];
      this.nodePositions[index].set(x + offset[0], y + offset[1], z + offset[2]);
    }
  }

  setState(state: ThreeFrontVisualState): void {
    if (!state.visible) { this.group.visible = false; return; }
    this.ensureBuilt();
    this.group.visible = true;
    this.activeFront = state.activeFront === 'aurora' ? 0 : state.activeFront === 'nereida' ? 1 : state.activeFront === 'orbital' ? 2 : -1;
    this.finalPressure = state.finalPressureActive;

    for (let index = 0; index < this.frontMaterials.length; index += 1) {
      const integrity = THREE.MathUtils.clamp(state.integrities[index] / 100, 0, 1);
      const active = index === this.activeFront;
      this.frontMaterials[index].color.setHex(integrity < 0.38 ? 0xc65a45 : integrity < 0.65 ? 0xc69a45 : 0x58b9aa);
      this.frontMaterials[index].opacity = active ? 0.94 : 0.48 + integrity * 0.22;
      this.linkMaterials[index].color.setHex(state.jointNetworkRestored ? 0x76d9cd : integrity < 0.5 ? 0xb66d49 : 0x4c7e86);
      this.linkMaterials[index].opacity = state.jointNetworkRestored ? 0.78 : 0.28 + integrity * 0.2;
    }

    for (let index = 0; index < this.relayMaterials.length; index += 1) {
      const protectedRelay = Boolean(state.relaysProtected[index]);
      this.relayMaterials[index].emissive.setHex(protectedRelay ? 0x2b897d : 0x8f3c24);
      this.relayMaterials[index].emissiveIntensity = protectedRelay ? 0.75 : 0.42;
      this.relayRings[index].visible = true;
    }

    for (let index = 0; index < this.nodeRings.length; index += 1) {
      const detected = Boolean(state.nodesDetected[index]);
      this.nodeRings[index].visible = detected;
      this.nodeMaterials[index].opacity = detected ? 0.58 : 0;
    }
    if (this.pleyadianPulse) this.pleyadianPulse.visible = state.jointNetworkRestored;
    if (this.pleyadianMaterial) this.pleyadianMaterial.opacity = state.jointNetworkRestored ? 0.5 : 0;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < mission22Tuning.visualUpdateInterval) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    this.hologram.rotation.y += step * 0.08;
    for (let index = 0; index < this.relayRings.length; index += 1) {
      this.relayRings[index].rotation.z += step * (0.35 + index * 0.08);
    }
    for (let index = 0; index < this.nodeRings.length; index += 1) {
      this.nodeRings[index].rotation.z -= step * (0.18 + index * 0.04);
      if (this.nodeRings[index].visible) {
        this.nodeMaterials[index].opacity = 0.42 + Math.sin(elapsed * 2.1 + index) * 0.16;
      }
    }
    if (this.pleyadianPulse?.visible && this.pleyadianMaterial) {
      const pulse = 1 + Math.sin(elapsed * 1.8) * 0.08;
      this.pleyadianPulse.scale.setScalar(pulse);
      this.pleyadianMaterial.opacity = 0.42 + Math.sin(elapsed * 2.4) * 0.1;
    }
    if (this.finalPressure) {
      for (let index = 0; index < this.frontMaterials.length; index += 1) {
        this.frontMaterials[index].opacity *= 0.84 + Math.sin(elapsed * 4.2 + index) * 0.12;
      }
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Line;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (Array.isArray(material)) for (const item of material) materials.add(item);
      else if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    this.group.add(this.hologram, this.relays, this.nodes);

    const center = new THREE.Vector3(0, 126, 0);
    const frontOffsets = [
      new THREE.Vector3(-76, 0, 42),
      new THREE.Vector3(76, 0, 42),
      new THREE.Vector3(0, 0, -72)
    ];
    const nodeGeometry = new THREE.OctahedronGeometry(9, 0);
    for (let index = 0; index < frontOffsets.length; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color: 0x58b9aa, transparent: true, opacity: 0.65, depthWrite: false });
      const marker = new THREE.Mesh(nodeGeometry, material);
      marker.position.copy(center).add(frontOffsets[index]);
      this.frontMaterials.push(material);
      this.hologram.add(marker);

      const geometry = new THREE.BufferGeometry().setFromPoints([center, marker.position]);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4c7e86, transparent: true, opacity: 0.4 });
      this.linkMaterials.push(lineMaterial);
      this.hologram.add(new THREE.Line(geometry, lineMaterial));
    }
    const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x315f68, transparent: true, opacity: 0.34, depthWrite: false });
    const frame = new THREE.Mesh(new THREE.RingGeometry(102, 104, 48), frameMaterial);
    frame.position.copy(center);
    frame.rotation.x = Math.PI / 2;
    this.hologram.add(frame);

    const relayGeometry = new THREE.CylinderGeometry(4, 7, 36, 8);
    const relayRingGeometry = new THREE.TorusGeometry(15, 1.2, 5, 28);
    for (let index = 0; index < mission22Tuning.orbitalRelayOffsets.length; index += 1) {
      const offset = mission22Tuning.orbitalRelayOffsets[index];
      const group = new THREE.Group();
      group.position.set(offset[0], offset[1], offset[2]);
      const material = new THREE.MeshStandardMaterial({ color: 0x27343b, emissive: 0x8f3c24, emissiveIntensity: 0.42, roughness: 0.5, metalness: 0.74 });
      const relay = new THREE.Mesh(relayGeometry, material);
      const ring = new THREE.Mesh(relayRingGeometry, new THREE.MeshBasicMaterial({ color: 0x7bcfc5, transparent: true, opacity: 0.5 }));
      ring.rotation.x = Math.PI / 2;
      group.add(relay, ring);
      this.relayMaterials.push(material);
      this.relayRings.push(ring);
      this.relays.add(group);
    }

    const coordinationGeometry = new THREE.TorusGeometry(32, 2, 6, 32);
    for (let index = 0; index < mission22Tuning.coordinationNodeOffsets.length; index += 1) {
      const offset = mission22Tuning.coordinationNodeOffsets[index];
      const material = new THREE.MeshBasicMaterial({ color: 0xaa4d42, transparent: true, opacity: 0, depthWrite: false });
      const ring = new THREE.Mesh(coordinationGeometry, material);
      ring.position.set(offset[0], offset[1], offset[2]);
      ring.rotation.x = Math.PI / 2;
      ring.visible = false;
      this.nodeMaterials.push(material);
      this.nodeRings.push(ring);
      this.nodes.add(ring);
    }

    this.pleyadianMaterial = new THREE.MeshBasicMaterial({ color: 0x80e3d5, transparent: true, opacity: 0, depthWrite: false });
    this.pleyadianPulse = new THREE.Mesh(new THREE.TorusGeometry(122, 1.6, 6, 56), this.pleyadianMaterial);
    this.pleyadianPulse.position.copy(center);
    this.pleyadianPulse.rotation.x = Math.PI / 2;
    this.pleyadianPulse.visible = false;
    this.hologram.add(this.pleyadianPulse);
  }
}
