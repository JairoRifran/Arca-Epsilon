import * as THREE from 'three';

export type ArkFinalPreparationState = {
  visible: boolean;
  assessedSystems: readonly boolean[];
  restoredLinks: readonly boolean[];
  preparedSystems: readonly boolean[];
  integratedPleyadianNodes: readonly boolean[];
  sheltersPrepared: boolean;
  alliedForcesAssembled: boolean;
  visitedSectorPoints: readonly boolean[];
  rehearsalActive: boolean;
  finalFleetDetected: boolean;
  finalFormation: boolean;
};

const SYSTEM_OFFSETS = [
  [0, 28, -122],
  [0, -18, 152],
  [0, 52, -10],
  [118, -10, -46],
  [0, -30, 34]
] as const;
const LINK_OFFSETS = [[-150, 72, -30], [-85, -95, 40], [135, 58, 35], [0, 118, 80]] as const;
const PREPARATION_OFFSETS = [[0, 52, -10], [0, -18, 152], [0, 40, 62]] as const;
const PLEYADIAN_OFFSETS = [[-190, 85, -100], [190, 76, -70], [0, 142, 150]] as const;
const STARTING_OFFSETS = [[0, 10, -330], [-310, 45, -120], [285, 80, 210]] as const;

/** One lazy, non-combat representation of M24's final preparation. */
export class ArkFinalPreparationNetwork {
  readonly group = new THREE.Group();
  readonly systemPositions = Array.from({ length: 5 }, () => new THREE.Vector3());
  readonly enclaveLinkPositions = Array.from({ length: 4 }, () => new THREE.Vector3());
  readonly preparationPositions = Array.from({ length: 3 }, () => new THREE.Vector3());
  readonly pleyadianNodePositions = Array.from({ length: 3 }, () => new THREE.Vector3());
  readonly startingSectorPositions = Array.from({ length: 3 }, () => new THREE.Vector3());
  readonly civilianShelterPosition = new THREE.Vector3();
  readonly alliedAssemblyPosition = new THREE.Vector3();
  readonly rehearsalPosition = new THREE.Vector3();
  readonly finalFleetPosition = new THREE.Vector3();
  readonly formationPosition = new THREE.Vector3();

  private readonly systemMarkers: THREE.Mesh[] = [];
  private readonly linkMarkers: THREE.Mesh[] = [];
  private readonly preparationMarkers: THREE.Mesh[] = [];
  private readonly pleyadianNodes: THREE.Group[] = [];
  private readonly sectorMarkers: THREE.Mesh[] = [];
  private readonly rehearsalTargets: THREE.Mesh[] = [];
  private readonly alliedSigns = new THREE.Group();
  private readonly finalFleet = new THREE.Group();
  private readonly formation = new THREE.Group();
  private readonly animatedRings: THREE.Mesh[] = [];
  private readonly offsetScratch = new THREE.Vector3();
  private built = false;
  private updateAccumulator = 0;

  constructor() {
    this.group.name = 'M24 Ark Final Preparation Network';
    this.group.visible = false;
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get visiblePleyadianNodeCount(): number {
    let result = 0;
    for (let index = 0; index < this.pleyadianNodes.length; index += 1) if (this.pleyadianNodes[index].visible) result += 1;
    return result;
  }
  get rehearsalTargetCount(): number { return this.rehearsalTargets.length; }
  get rehearsalTargetsVisible(): boolean { return Boolean(this.rehearsalTargets[0]?.visible); }
  get finalFleetVisible(): boolean { return this.finalFleet.visible; }
  get finalFleetAttackable(): boolean { return false; }

  setOrigin(origin: THREE.Vector3): void {
    this.group.position.copy(origin);
    this.copyWorldPositions(this.systemPositions, SYSTEM_OFFSETS, origin);
    this.copyWorldPositions(this.enclaveLinkPositions, LINK_OFFSETS, origin);
    this.copyWorldPositions(this.preparationPositions, PREPARATION_OFFSETS, origin);
    this.copyWorldPositions(this.pleyadianNodePositions, PLEYADIAN_OFFSETS, origin);
    this.copyWorldPositions(this.startingSectorPositions, STARTING_OFFSETS, origin);
    this.civilianShelterPosition.copy(origin).add(this.setOffset(118, -10, -46));
    this.alliedAssemblyPosition.copy(origin).add(this.setOffset(0, 105, 235));
    this.rehearsalPosition.copy(origin).add(this.setOffset(0, 40, -420));
    this.finalFleetPosition.copy(origin).add(this.setOffset(0, 280, -1750));
    this.formationPosition.copy(origin).add(this.setOffset(0, 35, -250));
  }

  setState(state: ArkFinalPreparationState): void {
    if (!state.visible) {
      this.group.visible = false;
      return;
    }
    this.ensureBuilt();
    this.group.visible = true;
    for (let index = 0; index < this.systemMarkers.length; index += 1) {
      this.setMarkerState(this.systemMarkers[index], true, Boolean(state.assessedSystems[index]));
    }
    for (let index = 0; index < this.linkMarkers.length; index += 1) {
      this.setMarkerState(this.linkMarkers[index], state.assessedSystems.every(Boolean), Boolean(state.restoredLinks[index]));
    }
    for (let index = 0; index < this.preparationMarkers.length; index += 1) {
      this.setMarkerState(this.preparationMarkers[index], state.restoredLinks.every(Boolean), Boolean(state.preparedSystems[index]));
    }
    for (let index = 0; index < this.pleyadianNodes.length; index += 1) {
      const visible = state.preparedSystems.every(Boolean);
      this.pleyadianNodes[index].visible = visible;
      const material = this.pleyadianNodes[index].userData.material as THREE.MeshBasicMaterial;
      material.color.setHex(state.integratedPleyadianNodes[index] ? 0xd8c88a : 0x7bcfd0);
      material.opacity = state.integratedPleyadianNodes[index] ? 0.82 : 0.46;
    }
    this.alliedSigns.visible = state.alliedForcesAssembled;
    for (let index = 0; index < this.sectorMarkers.length; index += 1) {
      this.setMarkerState(this.sectorMarkers[index], state.alliedForcesAssembled, Boolean(state.visitedSectorPoints[index]));
    }
    for (let index = 0; index < this.rehearsalTargets.length; index += 1) {
      this.rehearsalTargets[index].visible = state.rehearsalActive;
    }
    this.finalFleet.visible = state.finalFleetDetected;
    this.formation.visible = state.finalFormation;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < 0.05) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    for (let index = 0; index < this.animatedRings.length; index += 1) {
      const ring = this.animatedRings[index];
      if (ring.visible) ring.rotation.z += step * (index % 2 === 0 ? 0.32 : -0.24);
    }
    if (this.finalFleet.visible) {
      this.finalFleet.rotation.y = Math.sin(elapsed * 0.08) * 0.02;
    }
  }

  dispose(): void {
    if (!this.built) return;
    this.group.visible = false;
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
    this.group.clear();
    this.systemMarkers.length = 0;
    this.linkMarkers.length = 0;
    this.preparationMarkers.length = 0;
    this.pleyadianNodes.length = 0;
    this.sectorMarkers.length = 0;
    this.rehearsalTargets.length = 0;
    this.animatedRings.length = 0;
    this.alliedSigns.clear();
    this.finalFleet.clear();
    this.formation.clear();
    this.updateAccumulator = 0;
    this.built = false;
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    const ringGeometry = new THREE.TorusGeometry(14, 0.85, 5, 28);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x7bcfd0, transparent: true, opacity: 0.46, depthWrite: false });
    for (let index = 0; index < SYSTEM_OFFSETS.length; index += 1) {
      const marker = new THREE.Mesh(ringGeometry, markerMaterial.clone());
      marker.position.set(SYSTEM_OFFSETS[index][0], SYSTEM_OFFSETS[index][1], SYSTEM_OFFSETS[index][2]);
      marker.rotation.x = Math.PI / 2;
      this.systemMarkers.push(marker);
      this.animatedRings.push(marker);
      this.group.add(marker);
    }
    for (let index = 0; index < LINK_OFFSETS.length; index += 1) {
      const marker = new THREE.Mesh(ringGeometry, markerMaterial.clone());
      marker.position.set(LINK_OFFSETS[index][0], LINK_OFFSETS[index][1], LINK_OFFSETS[index][2]);
      marker.rotation.x = Math.PI / 2;
      marker.visible = false;
      this.linkMarkers.push(marker);
      this.animatedRings.push(marker);
      this.group.add(marker);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), marker.position]);
      this.group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x4f9898, transparent: true, opacity: 0.26 })));
    }
    for (let index = 0; index < PREPARATION_OFFSETS.length; index += 1) {
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(8, 0), markerMaterial.clone());
      marker.position.set(PREPARATION_OFFSETS[index][0], PREPARATION_OFFSETS[index][1], PREPARATION_OFFSETS[index][2]);
      marker.visible = false;
      this.preparationMarkers.push(marker);
      this.group.add(marker);
    }

    const nodeGeometry = new THREE.CylinderGeometry(3.5, 6, 22, 8);
    const nodeRingGeometry = new THREE.TorusGeometry(11, 0.75, 5, 32);
    for (let index = 0; index < PLEYADIAN_OFFSETS.length; index += 1) {
      const node = new THREE.Group();
      node.position.set(PLEYADIAN_OFFSETS[index][0], PLEYADIAN_OFFSETS[index][1], PLEYADIAN_OFFSETS[index][2]);
      node.visible = false;
      const material = new THREE.MeshBasicMaterial({ color: 0x7bcfd0, transparent: true, opacity: 0.46, depthWrite: false });
      node.userData.material = material;
      node.add(new THREE.Mesh(nodeGeometry, material));
      const ring = new THREE.Mesh(nodeRingGeometry, material);
      ring.rotation.x = Math.PI / 2;
      node.add(ring);
      this.animatedRings.push(ring);
      this.pleyadianNodes.push(node);
      this.group.add(node);
    }

    const allyMaterial = new THREE.MeshBasicMaterial({ color: 0x8bc7b3, transparent: true, opacity: 0.52, depthWrite: false });
    const allyGeometry = new THREE.ConeGeometry(4, 13, 6);
    this.alliedSigns.position.set(0, 105, 235);
    this.alliedSigns.visible = false;
    for (let index = 0; index < 8; index += 1) {
      const sign = new THREE.Mesh(allyGeometry, allyMaterial);
      const angle = index / 8 * Math.PI * 2;
      sign.position.set(Math.cos(angle) * 72, (index % 3) * 8, Math.sin(angle) * 72);
      sign.rotation.x = Math.PI / 2;
      this.alliedSigns.add(sign);
    }
    this.group.add(this.alliedSigns);

    for (let index = 0; index < STARTING_OFFSETS.length; index += 1) {
      const marker = new THREE.Mesh(ringGeometry, markerMaterial.clone());
      marker.position.set(STARTING_OFFSETS[index][0], STARTING_OFFSETS[index][1], STARTING_OFFSETS[index][2]);
      marker.rotation.x = Math.PI / 2;
      marker.visible = false;
      this.sectorMarkers.push(marker);
      this.animatedRings.push(marker);
      this.group.add(marker);
    }

    const rehearsalMaterial = new THREE.MeshBasicMaterial({ color: 0xd7a36a, transparent: true, opacity: 0.34, wireframe: true, depthWrite: false });
    for (let index = 0; index < 3; index += 1) {
      const target = new THREE.Mesh(new THREE.OctahedronGeometry(12 + index * 3, 1), rehearsalMaterial);
      target.position.set((index - 1) * 48, 40 + index * 16, -420 - index * 35);
      target.visible = false;
      this.rehearsalTargets.push(target);
      this.group.add(target);
    }

    const fleetMaterial = new THREE.MeshBasicMaterial({ color: 0x8e5547, transparent: true, opacity: 0.38, depthWrite: false });
    const fleetGeometry = new THREE.ConeGeometry(18, 75, 7);
    this.finalFleet.position.set(0, 280, -1750);
    this.finalFleet.visible = false;
    for (let index = 0; index < 9; index += 1) {
      const signature = new THREE.Mesh(fleetGeometry, fleetMaterial);
      const row = Math.floor(index / 3);
      signature.position.set((index % 3 - 1) * (85 + row * 20), row * 34, row * 95);
      signature.rotation.x = Math.PI / 2;
      signature.scale.setScalar(index === 4 ? 2.2 : 0.7 + (index % 2) * 0.25);
      this.finalFleet.add(signature);
    }
    this.group.add(this.finalFleet);

    const formationMaterial = new THREE.MeshBasicMaterial({ color: 0xd8c88a, transparent: true, opacity: 0.62, depthWrite: false });
    const formationRing = new THREE.Mesh(new THREE.TorusGeometry(42, 1.2, 6, 48), formationMaterial);
    formationRing.rotation.x = Math.PI / 2;
    this.formation.position.set(0, 35, -250);
    this.formation.visible = false;
    this.formation.add(formationRing);
    this.animatedRings.push(formationRing);
    this.group.add(this.formation);
  }

  private setMarkerState(marker: THREE.Mesh, visible: boolean, complete: boolean): void {
    marker.visible = visible;
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.setHex(complete ? 0xd8c88a : 0x7bcfd0);
    material.opacity = complete ? 0.78 : 0.44;
  }

  private copyWorldPositions(
    targets: THREE.Vector3[],
    offsets: readonly (readonly [number, number, number])[],
    origin: THREE.Vector3
  ): void {
    for (let index = 0; index < targets.length; index += 1) {
      const offset = offsets[index];
      targets[index].set(origin.x + offset[0], origin.y + offset[1], origin.z + offset[2]);
    }
  }

  private setOffset(x: number, y: number, z: number): THREE.Vector3 {
    return this.offsetScratch.set(x, y, z);
  }
}
