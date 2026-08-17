import * as THREE from 'three';
import {
  freezeStaticChildren,
  mergeStaticDecoration,
  sharedStandardMaterial
} from '../assets/materialCache';
import { auroraHullDetailMap } from '../assets/auroraDetailKit';

export type AuroraSettlementDetailProfile = 'performance' | 'high' | 'ultra';

export type AuroraSettlementInfrastructureDiagnostics = {
  functionalSectors: number;
  coreVisible: boolean;
  expansionVisible: boolean;
  arrivalVisible: boolean;
  stormVisible: boolean;
  midDetailVisible: boolean;
  closeDetailVisible: boolean;
  meshes: number;
  instancedMeshes: number;
  materials: number;
  lights: number;
  mergedDraws: number;
  landmarkName: string;
  resupplyVisuals: false;
};

type PhaseLayers = {
  macro: THREE.Group;
  mid: THREE.Group;
  close: THREE.Group;
};

type ConformingGeometry = {
  geometry: THREE.BufferGeometry;
  xz: Float32Array;
  heightOffset: number;
};

type GroundSampler = (x: number, z: number) => number;

const UP = new THREE.Vector3(0, 1, 0);
const CORE = new THREE.Vector2(0, 0);
const ENERGY = new THREE.Vector2(35, 27);
const CULTIVATION = new THREE.Vector2(-24, -18);
const WATER = new THREE.Vector2(-34, -68);
const ARRIVAL = new THREE.Vector2(68, -38);
const STORM_ANTENNA = new THREE.Vector2(-22, 32);
const STORM_ANCHORS = [new THREE.Vector2(-32, 42), new THREE.Vector2(-11, 24)] as const;

function configureMesh(mesh: THREE.Mesh, castShadow = true, receiveShadow = true): void {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
}

function createChamferedModule(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  const half = width * 0.5;
  const chamfer = Math.min(0.72, width * 0.08, height * 0.24);
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, height - chamfer);
  shape.lineTo(half - chamfer, height);
  shape.lineTo(-half + chamfer, height);
  shape.lineTo(-half, height - chamfer);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function createLabelTexture(title: string, subtitle: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Aurora label texture.');
  context.fillStyle = '#121819';
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = accent;
  context.fillRect(0, 0, 12, 128);
  context.fillRect(24, 12, 464, 3);
  context.fillStyle = '#d9ded8';
  context.font = '700 40px Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(title, 34, 51);
  context.fillStyle = '#9faea6';
  context.font = '600 19px Arial, sans-serif';
  context.fillText(subtitle, 35, 91);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createArrivalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Aurora arrival texture.');
  context.clearRect(0, 0, 1024, 1024);
  context.translate(512, 512);
  context.strokeStyle = 'rgba(174, 190, 178, 0.8)';
  context.lineWidth = 18;
  context.beginPath();
  context.arc(0, 0, 380, -Math.PI * 0.7, Math.PI * 0.7);
  context.stroke();
  context.strokeStyle = 'rgba(191, 142, 82, 0.82)';
  context.lineWidth = 12;
  for (let i = 0; i < 6; i += 1) {
    const angle = -1.72 + i * 0.69;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 320, Math.sin(angle) * 320);
    context.lineTo(Math.cos(angle) * 405, Math.sin(angle) * 405);
    context.stroke();
  }
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.fillStyle = 'rgba(220, 226, 217, 0.9)';
  context.font = '700 58px Arial, sans-serif';
  context.fillText('AURORA // ARRIVAL', 0, -72);
  context.fillStyle = 'rgba(195, 146, 87, 0.92)';
  context.font = '700 35px Arial, sans-serif';
  context.fillText('CREW TRANSFER // NO SERVICE', 0, 12);
  context.fillStyle = 'rgba(216, 222, 214, 0.68)';
  context.font = '600 30px Arial, sans-serif';
  context.fillText('A-01', 0, 98);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createDiscGeometry(radius: number, rings: number, segments: number, center: THREE.Vector2): THREE.BufferGeometry {
  const positions: number[] = [center.x, 0, center.y];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = (ring / rings) * radius;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;
      positions.push(center.x + x, 0, center.y + z);
      uvs.push(0.5 + x / (radius * 2), 0.5 + z / (radius * 2));
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments));
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const current = 1 + (ring - 1) * segments;
    const next = current + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments;
      indices.push(current + segment, next + segment, next + following);
      indices.push(current + segment, next + following, current + following);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRibbonGeometry(from: THREE.Vector2, to: THREE.Vector2, width: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const dx = to.x - from.x;
  const dz = to.y - from.y;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const bow = Math.sin(t * Math.PI) * 1.4;
    const centerX = from.x + dx * t + nx * bow;
    const centerZ = from.y + dz * t + nz * bow;
    for (const side of [-1, 1]) {
      positions.push(centerX + nx * width * 0.5 * side, 0, centerZ + nz * width * 0.5 * side);
    }
    if (step < segments) {
      const row = step * 2;
      indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Presentation layer for the real Aurora settlement.
 *
 * The functional authority remains with Aurora-01 and the M10-M18 entities.
 * This group is attached to Aurora-01, reads their progression, owns no
 * colliders or triggers, and adds only architectural context around the fixed
 * mission positions.
 */
export class AuroraSettlementInfrastructure {
  readonly group = new THREE.Group();

  private readonly macroLayer = new THREE.Group();
  private readonly midLayer = new THREE.Group();
  private readonly closeLayer = new THREE.Group();
  private readonly core: PhaseLayers;
  private readonly expansion: PhaseLayers;
  private readonly arrival: PhaseLayers;
  private readonly storm: PhaseLayers;
  private readonly materials = new Set<THREE.Material>();
  private readonly conforming: ConformingGeometry[] = [];
  private readonly seatedGroups: THREE.Group[] = [];
  private readonly waterPipes: THREE.InstancedMesh;
  private readonly waterSupports: THREE.InstancedMesh;
  private readonly arrivalRim: THREE.InstancedMesh;
  private readonly stormVanes: THREE.InstancedMesh;
  private readonly stormCableGeometry: THREE.BufferGeometry;
  private readonly instrumentMaterial: THREE.MeshStandardMaterial;
  private readonly habitationMaterial: THREE.MeshStandardMaterial;
  private readonly coreWorld = new THREE.Vector3();
  private readonly scratchObject = new THREE.Object3D();
  private readonly scratchDirection = new THREE.Vector3();
  private detailProfile: AuroraSettlementDetailProfile = 'high';
  private inhabited = false;
  private layoutInitialized = false;
  private mergedDraws = 0;

  constructor() {
    this.group.name = 'Aurora Settlement Infrastructure';
    this.group.userData.getDiagnostics = () => this.getDiagnostics();
    this.group.add(this.macroLayer, this.midLayer, this.closeLayer);
    this.macroLayer.name = 'Aurora Architectural Silhouette';
    this.midLayer.name = 'Aurora Mid Detail';
    this.closeLayer.name = 'Aurora Close Detail';
    this.core = this.createPhase('Aurora Environmental Core');
    this.expansion = this.createPhase('Aurora Resource Research Wing');
    this.arrival = this.createPhase('Aurora Crew Arrival Sector');
    this.storm = this.createPhase('Aurora Storm Resilience Sector');

    const hullMap = auroraHullDetailMap();
    const hull = this.track(sharedStandardMaterial({
      color: 0x929b94,
      roughness: 0.76,
      metalness: 0.24,
      map: hullMap
    }));
    const shell = this.track(sharedStandardMaterial({
      color: 0xb1b5aa,
      roughness: 0.83,
      metalness: 0.14,
      map: hullMap
    }));
    const structure = this.track(sharedStandardMaterial({ color: 0x293237, roughness: 0.55, metalness: 0.72 }));
    const foundation = this.track(sharedStandardMaterial({ color: 0x454b48, roughness: 0.92, metalness: 0.2 }));
    const warning = this.track(sharedStandardMaterial({ color: 0x9b7543, roughness: 0.72, metalness: 0.28 }));
    const solar = this.track(sharedStandardMaterial({ color: 0x16272b, roughness: 0.26, metalness: 0.52 }));
    const glass = this.track(sharedStandardMaterial({
      color: 0x335a57,
      emissive: 0x244b45,
      emissiveIntensity: 0.22,
      roughness: 0.24,
      metalness: 0.16
    }));
    this.instrumentMaterial = this.track(new THREE.MeshStandardMaterial({
      color: 0x1d2625,
      emissive: 0x64b9a2,
      emissiveIntensity: 0.52,
      roughness: 0.3,
      metalness: 0.2
    }));
    this.habitationMaterial = this.track(new THREE.MeshStandardMaterial({
      color: 0x292c28,
      emissive: 0xc89155,
      emissiveIntensity: 0.3,
      roughness: 0.38,
      metalness: 0.12
    }));

    this.buildEnvironmentalCore(hull, shell, structure, foundation, glass);
    const resourceHardware = this.buildResourceResearchWing(hull, shell, structure, foundation, warning, solar, glass);
    this.waterPipes = resourceHardware.pipes;
    this.waterSupports = resourceHardware.supports;
    this.arrivalRim = this.buildCrewArrivalSector(structure, foundation, warning);
    const stormHardware = this.buildStormSector(structure, warning);
    this.stormVanes = stormHardware.vanes;
    this.stormCableGeometry = stormHardware.cables;

    this.setProgress(false, false, false, false, false);
  }

  setDetailProfile(profile: AuroraSettlementDetailProfile): void {
    this.detailProfile = profile;
  }

  setLayout(coreWorld: THREE.Vector3, getGroundHeight: GroundSampler): void {
    if (this.layoutInitialized && this.coreWorld.distanceToSquared(coreWorld) < 0.01) return;
    this.coreWorld.copy(coreWorld);

    for (const group of this.seatedGroups) {
      const [x, z, burial] = group.userData.seat as [number, number, number];
      group.position.set(x, getGroundHeight(coreWorld.x + x, coreWorld.z + z) - coreWorld.y - burial, z);
    }
    for (const entry of this.conforming) {
      const position = entry.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const x = entry.xz[index * 2];
        const z = entry.xz[index * 2 + 1];
        position.setY(index, getGroundHeight(coreWorld.x + x, coreWorld.z + z) - coreWorld.y + entry.heightOffset);
      }
      position.needsUpdate = true;
      entry.geometry.computeVertexNormals();
      entry.geometry.computeBoundingSphere();
      entry.geometry.computeBoundingBox();
    }
    this.layoutWaterInfrastructure(coreWorld, getGroundHeight);
    this.layoutArrivalRim(coreWorld, getGroundHeight);
    this.layoutStormHardware(coreWorld, getGroundHeight);

    const phaseVisibility = [this.core, this.expansion, this.arrival, this.storm].map((phase) => ({
      phase,
      macro: phase.macro.visible,
      mid: phase.mid.visible,
      close: phase.close.visible
    }));
    for (const entry of phaseVisibility) this.setPhaseVisible(entry.phase, true);
    this.group.visible = true;
    this.group.updateMatrixWorld(true);
    freezeStaticChildren(this.group);
    this.mergedDraws += mergeStaticDecoration(this.core.macro, 'Aurora core macro');
    this.mergedDraws += mergeStaticDecoration(this.expansion.macro, 'Aurora resource macro');
    this.mergedDraws += mergeStaticDecoration(this.expansion.mid, 'Aurora resource detail');
    this.mergedDraws += mergeStaticDecoration(this.arrival.mid, 'Aurora arrival detail');
    this.mergedDraws += mergeStaticDecoration(this.storm.mid, 'Aurora storm detail');
    for (const entry of phaseVisibility) {
      entry.phase.macro.visible = entry.macro;
      entry.phase.mid.visible = entry.mid;
      entry.phase.close.visible = entry.close;
    }
    this.layoutInitialized = true;
  }

  setProgress(coreActive: boolean, expansionActive: boolean, arrivalActive: boolean, inhabited: boolean, stormActive: boolean): void {
    this.setPhaseVisible(this.core, coreActive);
    this.setPhaseVisible(this.expansion, expansionActive);
    this.setPhaseVisible(this.arrival, arrivalActive);
    this.setPhaseVisible(this.storm, stormActive);
    this.group.visible = coreActive;
    this.inhabited = inhabited;
    this.habitationMaterial.emissiveIntensity = inhabited ? 0.58 : 0.22;
  }

  update(elapsed: number, observerPosition: THREE.Vector3, coreWorld: THREE.Vector3): void {
    if (!this.group.visible) return;
    const dx = observerPosition.x - coreWorld.x;
    const dz = observerPosition.z - coreWorld.z;
    const altitude = Math.max(0, observerPosition.y - coreWorld.y - 20);
    const distance = Math.hypot(dx, dz, altitude * 1.2);
    const scale = this.detailProfile === 'performance' ? 0.7 : this.detailProfile === 'ultra' ? 1.25 : 1;
    this.midLayer.visible = distance < (this.midLayer.visible ? 270 : 238) * scale;
    this.closeLayer.visible = distance < (this.closeLayer.visible ? 112 : 92) * scale;
    this.instrumentMaterial.emissiveIntensity = 0.45 + Math.sin(elapsed * 0.72) * 0.08;
    this.habitationMaterial.emissiveIntensity = (this.inhabited ? 0.58 : 0.22) + Math.sin(elapsed * 0.38) * 0.012;
  }

  getDiagnostics(): AuroraSettlementInfrastructureDiagnostics {
    let meshes = 0;
    let instancedMeshes = 0;
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) instancedMeshes += 1;
      const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of source) materials.add(material);
    });
    return {
      functionalSectors: 5,
      coreVisible: this.core.macro.visible,
      expansionVisible: this.expansion.macro.visible,
      arrivalVisible: this.arrival.macro.visible,
      stormVisible: this.storm.macro.visible,
      midDetailVisible: this.midLayer.visible,
      closeDetailVisible: this.closeLayer.visible,
      meshes,
      instancedMeshes,
      materials: materials.size,
      lights: 0,
      mergedDraws: this.mergedDraws,
      landmarkName: 'Aurora Solar-Thermal Wing',
      resupplyVisuals: false
    };
  }

  private createPhase(name: string): PhaseLayers {
    const phase = {
      macro: new THREE.Group(),
      mid: new THREE.Group(),
      close: new THREE.Group()
    };
    phase.macro.name = `${name} // macro`;
    phase.mid.name = `${name} // mid`;
    phase.close.name = `${name} // close`;
    this.macroLayer.add(phase.macro);
    this.midLayer.add(phase.mid);
    this.closeLayer.add(phase.close);
    return phase;
  }

  private setPhaseVisible(phase: PhaseLayers, visible: boolean): void {
    phase.macro.visible = visible;
    phase.mid.visible = visible;
    phase.close.visible = visible;
  }

  private track<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private seat(group: THREE.Group, x: number, z: number, burial = 0): void {
    group.userData.seat = [x, z, burial];
    this.seatedGroups.push(group);
  }

  private registerConforming(geometry: THREE.BufferGeometry, heightOffset: number): void {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const xz = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      xz[index * 2] = position.getX(index);
      xz[index * 2 + 1] = position.getZ(index);
    }
    this.conforming.push({ geometry, xz, heightOffset });
  }

  private buildEnvironmentalCore(
    hull: THREE.Material,
    shell: THREE.Material,
    structure: THREE.Material,
    foundation: THREE.Material,
    glass: THREE.Material
  ): void {
    const gallery = new THREE.Group();
    gallery.name = 'Aurora Environmental Analysis Gallery';
    this.seat(gallery, -12, 6, 0.22);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.46, 7.2), foundation);
    slab.position.y = 0.23;
    configureMesh(slab, false, true);
    gallery.add(slab);
    const body = new THREE.Mesh(createChamferedModule(13.6, 3.15, 5.4), hull);
    body.position.y = 0.42;
    configureMesh(body);
    gallery.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.16, 5.62), shell);
    roof.position.y = 3.7;
    configureMesh(roof);
    gallery.add(roof);
    const observationBand = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.62, 0.08), glass, 7);
    for (let index = 0; index < 7; index += 1) {
      this.scratchObject.position.set(-4.65 + index * 1.55, 2.4, 2.76);
      this.scratchObject.rotation.set(0, 0, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      observationBand.setMatrixAt(index, this.scratchObject.matrix);
    }
    observationBand.instanceMatrix.needsUpdate = true;
    gallery.add(observationBand);
    this.core.macro.add(gallery);

    const galleryRibs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 3.8, 5.9), structure, 5);
    for (let index = 0; index < 5; index += 1) {
      this.scratchObject.position.set(-16.6 + index * 2.3, 2.05, 6);
      this.scratchObject.rotation.set(0, 0, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      galleryRibs.setMatrixAt(index, this.scratchObject.matrix);
    }
    galleryRibs.instanceMatrix.needsUpdate = true;
    this.core.mid.add(galleryRibs);

    const overheadLink = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1, 12), shell);
    const start = new THREE.Vector3(-5.4, 3.0, 6);
    const end = new THREE.Vector3(-1.4, 2.7, 1.2);
    this.placeCylinder(overheadLink, start, end, 1);
    configureMesh(overheadLink);
    this.core.macro.add(overheadLink);

    const instruments = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), this.instrumentMaterial, 10);
    for (let index = 0; index < 10; index += 1) {
      const side = index < 5 ? -1 : 1;
      this.scratchObject.position.set(-17 + (index % 5) * 2.4, 3.05, 6 + side * 2.87);
      this.scratchObject.rotation.set(0, side < 0 ? Math.PI : 0, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      instruments.setMatrixAt(index, this.scratchObject.matrix);
    }
    instruments.instanceMatrix.needsUpdate = true;
    this.core.close.add(instruments);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 1.12),
      this.track(new THREE.MeshBasicMaterial({
        map: createLabelTexture('AURORA-01', 'HABITABILITY / FIELD SCIENCE', '#5da993'),
        toneMapped: false
      }))
    );
    sign.position.set(-12, 3.12, 8.74);
    this.core.mid.add(sign);
  }

  private buildResourceResearchWing(
    hull: THREE.Material,
    shell: THREE.Material,
    structure: THREE.Material,
    foundation: THREE.Material,
    warning: THREE.Material,
    solar: THREE.Material,
    glass: THREE.Material
  ): { pipes: THREE.InstancedMesh; supports: THREE.InstancedMesh } {
    const wing = new THREE.Group();
    wing.name = 'Aurora Solar-Thermal Wing';
    this.seat(wing, ENERGY.x, ENERGY.y, 0.18);
    wing.rotation.y = -0.24;
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.5, 6.4), foundation);
    base.position.y = 0.25;
    configureMesh(base, false, true);
    wing.add(base);
    const plant = new THREE.Mesh(createChamferedModule(6.8, 3.1, 4.7), hull);
    plant.position.y = 0.45;
    configureMesh(plant);
    wing.add(plant);
    const thermalBand = new THREE.Mesh(new THREE.BoxGeometry(7.15, 0.54, 4.9), structure);
    thermalBand.position.y = 2.25;
    configureMesh(thermalBand);
    wing.add(thermalBand);

    const panelGeometry = new THREE.BoxGeometry(1, 1, 1);
    const panels = new THREE.InstancedMesh(panelGeometry, solar, 8);
    for (let index = 0; index < 8; index += 1) {
      const side = index < 4 ? -1 : 1;
      const along = index % 4;
      this.scratchObject.position.set(side * 7.1, side < 0 ? 5.2 : 6.15, -5.1 + along * 3.4);
      this.scratchObject.rotation.set(-0.12, 0, side * -0.16);
      this.scratchObject.scale.set(5.4, 0.13, 3.08);
      this.scratchObject.updateMatrix();
      panels.setMatrixAt(index, this.scratchObject.matrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    panels.castShadow = true;
    panels.receiveShadow = true;
    wing.add(panels);

    const pylons = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.24, 1, 7), structure, 6);
    for (let index = 0; index < 6; index += 1) {
      const side = index < 3 ? -1 : 1;
      const along = index % 3;
      const height = side < 0 ? 5.0 : 5.9;
      this.scratchObject.position.set(side * 7.1, height * 0.5, -4.4 + along * 4.4);
      this.scratchObject.rotation.set(0, 0, side * -0.18);
      this.scratchObject.scale.set(1, height, 1);
      this.scratchObject.updateMatrix();
      pylons.setMatrixAt(index, this.scratchObject.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    pylons.castShadow = true;
    wing.add(pylons);
    this.expansion.macro.add(wing);

    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 2.2, 3.6), shell, 8);
    for (let index = 0; index < 8; index += 1) {
      this.scratchObject.position.set(32 + index * 0.85, 2.0, 30.8);
      this.scratchObject.rotation.set(0, -0.24, -0.08);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      fins.setMatrixAt(index, this.scratchObject.matrix);
    }
    fins.instanceMatrix.needsUpdate = true;
    this.expansion.mid.add(fins);

    const growthShelter = new THREE.Group();
    growthShelter.name = 'Aurora Biosphere Trial Shelter';
    this.seat(growthShelter, CULTIVATION.x, CULTIVATION.y, 0.08);
    const shelterRibs = new THREE.InstancedMesh(new THREE.TorusGeometry(2.9, 0.07, 6, 14, Math.PI), structure, 4);
    for (let index = 0; index < 4; index += 1) {
      this.scratchObject.position.set(0, 0.1, -2.1 + index * 1.4);
      this.scratchObject.rotation.set(0, 0, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      shelterRibs.setMatrixAt(index, this.scratchObject.matrix);
    }
    shelterRibs.instanceMatrix.needsUpdate = true;
    growthShelter.add(shelterRibs);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 5.2), glass);
    canopy.position.y = 2.72;
    canopy.rotation.z = 0.03;
    configureMesh(canopy, false, false);
    growthShelter.add(canopy);
    this.expansion.mid.add(growthShelter);

    const waterPipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 8), shell, 5);
    waterPipes.name = 'Aurora Hydrology Spine';
    waterPipes.castShadow = true;
    this.expansion.macro.add(waterPipes);
    const waterSupports = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 1, 0.42), foundation, 6);
    waterSupports.name = 'Aurora Hydrology Supports';
    waterSupports.castShadow = true;
    this.expansion.mid.add(waterSupports);

    const manifold = new THREE.Group();
    manifold.name = 'Aurora Water Research Manifold';
    this.seat(manifold, WATER.x, WATER.y + 5, 0.1);
    const skid = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.34, 3.6), foundation);
    skid.position.y = 0.17;
    manifold.add(skid);
    const pressureRack = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.52, 0.58, 2.35, 10), shell, 4);
    for (let index = 0; index < 4; index += 1) {
      this.scratchObject.position.set(-2.35 + index * 1.55, 1.36, 0);
      this.scratchObject.rotation.set(0, 0, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      pressureRack.setMatrixAt(index, this.scratchObject.matrix);
    }
    pressureRack.instanceMatrix.needsUpdate = true;
    manifold.add(pressureRack);
    const hazardStrip = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.08, 0.28), warning);
    hazardStrip.position.set(0, 0.38, 1.62);
    manifold.add(hazardStrip);
    this.expansion.macro.add(manifold);

    const sampleCases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.42, 0.4), shell, 6);
    for (let index = 0; index < 6; index += 1) {
      this.scratchObject.position.set(-29 + (index % 3) * 0.8, 0.38 + Math.floor(index / 3) * 0.44, -61.5);
      this.scratchObject.rotation.set(0, 0.18, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      sampleCases.setMatrixAt(index, this.scratchObject.matrix);
    }
    sampleCases.instanceMatrix.needsUpdate = true;
    this.expansion.close.add(sampleCases);

    return { pipes: waterPipes, supports: waterSupports };
  }

  private buildCrewArrivalSector(
    structure: THREE.Material,
    foundation: THREE.Material,
    warning: THREE.Material
  ): THREE.InstancedMesh {
    const padGeometry = createDiscGeometry(9.6, 4, 24, ARRIVAL);
    this.registerConforming(padGeometry, 0.055);
    const pad = new THREE.Mesh(
      padGeometry,
      this.track(new THREE.MeshStandardMaterial({
        map: createArrivalTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        roughness: 0.94,
        metalness: 0.04,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      }))
    );
    pad.name = 'Aurora Crew Arrival Apron';
    pad.receiveShadow = true;
    this.arrival.macro.add(pad);

    const pathGeometry = createRibbonGeometry(new THREE.Vector2(57, -32), new THREE.Vector2(33, -17), 2.2, 12);
    this.registerConforming(pathGeometry, 0.07);
    const path = new THREE.Mesh(pathGeometry, sharedStandardMaterial({ color: 0x4b4d45, roughness: 0.98, metalness: 0.02 }));
    path.name = 'Aurora Crew Transfer Path';
    path.receiveShadow = true;
    this.arrival.macro.add(path);

    const rim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.16, 0.28), foundation, 14);
    rim.name = 'Aurora Arrival Segmented Rim';
    rim.castShadow = true;
    rim.receiveShadow = true;
    this.arrival.mid.add(rim);

    const markerMaterial = this.habitationMaterial;
    const markers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.08, 0.42), markerMaterial, 10);
    for (let index = 0; index < 10; index += 1) {
      const angle = -2.2 + index * 0.49;
      const x = ARRIVAL.x + Math.cos(angle) * 8.4;
      const z = ARRIVAL.y + Math.sin(angle) * 8.4;
      this.scratchObject.position.set(x, 0.18, z);
      this.scratchObject.rotation.set(0, -angle, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      markers.setMatrixAt(index, this.scratchObject.matrix);
    }
    markers.instanceMatrix.needsUpdate = true;
    this.arrival.mid.add(markers);

    const transferRails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), structure, 8);
    for (let index = 0; index < 8; index += 1) {
      const t = index / 7;
      const x = THREE.MathUtils.lerp(55, 36, t);
      const z = THREE.MathUtils.lerp(-31, -19, t) + Math.sin(t * Math.PI) * 1.4;
      this.scratchObject.position.set(x, 0.62, z);
      this.scratchObject.rotation.set(0, -1.0, 0);
      this.scratchObject.scale.set(1, 0.9, 1);
      this.scratchObject.updateMatrix();
      transferRails.setMatrixAt(index, this.scratchObject.matrix);
    }
    transferRails.instanceMatrix.needsUpdate = true;
    this.arrival.close.add(transferRails);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.2),
      this.track(new THREE.MeshBasicMaterial({
        map: createLabelTexture('ARRIVAL A-01', 'CREW TRANSFER / NO RESUPPLY', '#bd8950'),
        toneMapped: false
      }))
    );
    sign.position.set(58.5, 2.1, -31.2);
    sign.rotation.y = -0.78;
    this.arrival.mid.add(sign);
    return rim;
  }

  private buildStormSector(structure: THREE.Material, warning: THREE.Material): { vanes: THREE.InstancedMesh; cables: THREE.BufferGeometry } {
    const cableGeometry = new THREE.BufferGeometry();
    cableGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    const cables = new THREE.LineSegments(
      cableGeometry,
      this.track(new THREE.LineBasicMaterial({ color: 0x596466, transparent: true, opacity: 0.72 }))
    );
    cables.name = 'Aurora Storm Mast Guy Lines';
    this.storm.macro.add(cables);

    const vaneGeometry = new THREE.BoxGeometry(2.4, 0.08, 0.62);
    const vanes = new THREE.InstancedMesh(vaneGeometry, structure, 6);
    vanes.name = 'Aurora Storm Vector Vanes';
    vanes.castShadow = true;
    this.storm.mid.add(vanes);

    const warningPlates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.06, 0.58), warning, 6);
    for (let index = 0; index < 6; index += 1) {
      const angle = -0.6 + index * 0.5;
      const x = -6 + Math.cos(angle) * (36 + index * 1.7);
      const z = 12 + Math.sin(angle) * (36 + index * 1.7);
      this.scratchObject.position.set(x, 0.1, z);
      this.scratchObject.rotation.set(0, angle, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      warningPlates.setMatrixAt(index, this.scratchObject.matrix);
    }
    warningPlates.instanceMatrix.needsUpdate = true;
    this.storm.close.add(warningPlates);
    return { vanes, cables: cableGeometry };
  }

  private layoutWaterInfrastructure(coreWorld: THREE.Vector3, getGroundHeight: GroundSampler): void {
    const points = [
      new THREE.Vector2(-9, -3),
      new THREE.Vector2(-15, -20),
      new THREE.Vector2(-21, -36),
      new THREE.Vector2(-28, -52),
      new THREE.Vector2(-34, -63),
      WATER
    ];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const start = new THREE.Vector3(
        a.x,
        getGroundHeight(coreWorld.x + a.x, coreWorld.z + a.y) - coreWorld.y + 0.7,
        a.y
      );
      const end = new THREE.Vector3(
        b.x,
        getGroundHeight(coreWorld.x + b.x, coreWorld.z + b.y) - coreWorld.y + 0.7,
        b.y
      );
      this.setCylinderInstance(this.waterPipes, index, start, end, 1);
    }
    this.waterPipes.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < 6; index += 1) {
      const t = (index + 0.5) / 6;
      const x = THREE.MathUtils.lerp(-10, -33, t);
      const z = THREE.MathUtils.lerp(-5, -66, t);
      const y = getGroundHeight(coreWorld.x + x, coreWorld.z + z) - coreWorld.y;
      this.scratchObject.position.set(x, y + 0.34, z);
      this.scratchObject.rotation.set(0, 0.18, 0);
      this.scratchObject.scale.set(1, 0.68, 1);
      this.scratchObject.updateMatrix();
      this.waterSupports.setMatrixAt(index, this.scratchObject.matrix);
    }
    this.waterSupports.instanceMatrix.needsUpdate = true;
  }

  private layoutArrivalRim(coreWorld: THREE.Vector3, getGroundHeight: GroundSampler): void {
    for (let index = 0; index < 14; index += 1) {
      const angle = -2.35 + index * (4.7 / 13);
      const x = ARRIVAL.x + Math.cos(angle) * 9.45;
      const z = ARRIVAL.y + Math.sin(angle) * 9.45;
      const y = getGroundHeight(coreWorld.x + x, coreWorld.z + z) - coreWorld.y;
      this.scratchObject.position.set(x, y + 0.1, z);
      this.scratchObject.rotation.set(0, -angle, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      this.arrivalRim.setMatrixAt(index, this.scratchObject.matrix);
    }
    this.arrivalRim.instanceMatrix.needsUpdate = true;
  }

  private layoutStormHardware(coreWorld: THREE.Vector3, getGroundHeight: GroundSampler): void {
    const cablePositions = this.stormCableGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < STORM_ANCHORS.length; index += 1) {
      const anchor = STORM_ANCHORS[index];
      cablePositions.setXYZ(
        index * 2,
        STORM_ANTENNA.x,
        getGroundHeight(coreWorld.x + STORM_ANTENNA.x, coreWorld.z + STORM_ANTENNA.y) - coreWorld.y + 7.8,
        STORM_ANTENNA.y
      );
      cablePositions.setXYZ(
        index * 2 + 1,
        anchor.x,
        getGroundHeight(coreWorld.x + anchor.x, coreWorld.z + anchor.y) - coreWorld.y + 1,
        anchor.y
      );
    }
    cablePositions.needsUpdate = true;
    this.stormCableGeometry.computeBoundingSphere();

    const vanePoints = [
      new THREE.Vector2(-39, 36), new THREE.Vector2(-30, 50), new THREE.Vector2(-16, 55),
      new THREE.Vector2(0, 52), new THREE.Vector2(15, 45), new THREE.Vector2(26, 35)
    ];
    for (let index = 0; index < vanePoints.length; index += 1) {
      const point = vanePoints[index];
      const y = getGroundHeight(coreWorld.x + point.x, coreWorld.z + point.y) - coreWorld.y;
      this.scratchObject.position.set(point.x, y + 1.75, point.y);
      this.scratchObject.rotation.set(0.08, -0.32 + index * 0.11, -0.12);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      this.stormVanes.setMatrixAt(index, this.scratchObject.matrix);
    }
    this.stormVanes.instanceMatrix.needsUpdate = true;
  }

  private placeCylinder(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, radiusScale: number): void {
    this.scratchDirection.copy(end).sub(start);
    mesh.position.copy(start).addScaledVector(this.scratchDirection, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, this.scratchDirection.clone().normalize());
    mesh.scale.set(radiusScale, this.scratchDirection.length(), radiusScale);
  }

  private setCylinderInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radiusScale: number
  ): void {
    this.scratchDirection.copy(end).sub(start);
    this.scratchObject.position.copy(start).addScaledVector(this.scratchDirection, 0.5);
    this.scratchObject.quaternion.setFromUnitVectors(UP, this.scratchDirection.clone().normalize());
    this.scratchObject.scale.set(radiusScale, this.scratchDirection.length(), radiusScale);
    this.scratchObject.updateMatrix();
    mesh.setMatrixAt(index, this.scratchObject.matrix);
  }
}
