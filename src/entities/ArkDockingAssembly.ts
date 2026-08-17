import * as THREE from 'three';
import { arkDepartureTuning } from '../assets/arkDepartureDefinitions';
import { cloneShared, sharedBasicMaterial, sharedStandardMaterial } from '../assets/materialCache';

export type ArkDockingVisualDiagnostics = {
  built: boolean;
  visible: boolean;
  gateCount: number;
  guideModuleCount: number;
  meshes: number;
  instancedMeshes: number;
  triangles: number;
};

/**
 * Temporary launch hardware attached to Epsilon-3 during the M01 prologue.
 *
 * Every repeated part is instanced: the corridor is physical hardware, not a
 * stack of LineLoops, and still costs fewer draw calls than the old five torus
 * meshes plus ten individual lamps. The whole assembly is disposed as soon as
 * the safe-distance handoff completes.
 */
export class ArkDockingAssembly {
  readonly group = new THREE.Group();

  private built = false;
  private disposed = false;
  private readonly gateCount = 4;
  private readonly guideModuleCount = 24;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly corridorMaterials: THREE.MeshBasicMaterial[] = [];

  private statusMaterial?: THREE.MeshStandardMaterial;
  private umbilical?: THREE.Object3D;
  private corridorHardware?: THREE.Object3D;
  private readonly umbilicalBase = new THREE.Vector3();

  constructor() {
    this.group.name = 'Ark Docking Assembly';
    this.group.visible = false;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  get visualDiagnostics(): ArkDockingVisualDiagnostics {
    let meshes = 0;
    let instancedMeshes = 0;
    let triangles = 0;
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      meshes += 1;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      if (instances > 1) instancedMeshes += 1;
      const primitiveTriangles = mesh.geometry.index
        ? mesh.geometry.index.count / 3
        : (mesh.geometry.attributes.position?.count ?? 0) / 3;
      triangles += primitiveTriangles * instances;
    });
    return {
      built: this.built,
      visible: this.group.visible,
      gateCount: this.gateCount,
      guideModuleCount: this.guideModuleCount,
      meshes,
      instancedMeshes,
      triangles: Math.round(triangles)
    };
  }

  ensureBuilt(anchor: THREE.Object3D): void {
    if (this.built || this.disposed) return;
    this.built = true;

    const structuralMetal = sharedStandardMaterial({
      color: 0x202b33,
      metalness: 0.82,
      roughness: 0.46,
      emissive: 0x061018,
      emissiveIntensity: 0.18
    });
    const serviceMetal = sharedStandardMaterial({
      color: 0x58636a,
      metalness: 0.68,
      roughness: 0.62
    });

    this.buildUmbilical(structuralMetal, serviceMetal);
    this.buildStatusLamps(structuralMetal);
    this.buildExitCorridor(structuralMetal, serviceMetal);

    anchor.add(this.group);
    this.group.visible = true;
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry);
    return geometry;
  }

  private buildUmbilical(structuralMetal: THREE.Material, serviceMetal: THREE.Material): void {
    const umbilical = new THREE.Group();
    umbilical.name = 'Epsilon-3 Retractable Service Umbilical';
    umbilical.userData.dynamic = true;

    const segmentGeometry = this.own(new THREE.CylinderGeometry(0.22, 0.26, 1.05, 8));
    const segments = new THREE.InstancedMesh(segmentGeometry, serviceMetal, 12);
    segments.name = 'Umbilical twin coolant and power lines';
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    let instance = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 6; index += 1) {
        matrix.compose(
          new THREE.Vector3(-2.35 + side * 0.38, 0.62, -1.4 + index * 1.02),
          quaternion,
          scale
        );
        segments.setMatrixAt(instance++, matrix);
      }
    }
    segments.instanceMatrix.needsUpdate = true;
    segments.computeBoundingSphere();
    umbilical.add(segments);

    const couplingGeometry = this.own(new THREE.TorusGeometry(0.31, 0.065, 5, 10));
    const couplings = new THREE.InstancedMesh(couplingGeometry, structuralMetal, 8);
    couplings.name = 'Umbilical pressure couplings';
    instance = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 4; index += 1) {
        matrix.compose(
          new THREE.Vector3(-2.35 + side * 0.38, 0.62, -1.4 + index * 1.7),
          new THREE.Quaternion(),
          scale
        );
        couplings.setMatrixAt(instance++, matrix);
      }
    }
    couplings.instanceMatrix.needsUpdate = true;
    couplings.computeBoundingSphere();
    umbilical.add(couplings);

    const connectorGeometry = this.own(new THREE.BoxGeometry(1.5, 0.8, 1.1));
    const connectors = new THREE.InstancedMesh(connectorGeometry, structuralMetal, 2);
    connectors.name = 'Umbilical armored connectors';
    for (let index = 0; index < 2; index += 1) {
      matrix.compose(new THREE.Vector3(-2.35, 0.62, index === 0 ? -2 : 4.2), new THREE.Quaternion(), scale);
      connectors.setMatrixAt(index, matrix);
    }
    connectors.instanceMatrix.needsUpdate = true;
    connectors.computeBoundingSphere();
    umbilical.add(connectors);

    this.umbilical = umbilical;
    this.umbilicalBase.copy(umbilical.position);
    this.group.add(umbilical);
  }

  private buildStatusLamps(structuralMetal: THREE.Material): void {
    const positions: readonly [number, number, number][] = [
      [-5.4, 0.34, -3.2], [5.4, 0.34, -3.2], [-5.4, 0.34, 3.2], [5.4, 0.34, 3.2]
    ];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    const housingGeometry = this.own(new THREE.CylinderGeometry(0.38, 0.45, 0.44, 8));
    const housings = new THREE.InstancedMesh(housingGeometry, structuralMetal, positions.length);
    housings.name = 'Epsilon-3 status lamp housings';
    for (let index = 0; index < positions.length; index += 1) {
      matrix.compose(new THREE.Vector3(...positions[index]), quaternion, scale);
      housings.setMatrixAt(index, matrix);
    }
    housings.instanceMatrix.needsUpdate = true;
    housings.computeBoundingSphere();
    this.group.add(housings);

    const statusMaterial = cloneShared(sharedStandardMaterial({
      color: 0x32110d,
      emissive: 0xff3824,
      emissiveIntensity: 1.35,
      roughness: 0.38,
      metalness: 0.18
    }));
    this.statusMaterial = statusMaterial;
    this.ownedMaterials.push(statusMaterial);
    const lensGeometry = this.own(new THREE.SphereGeometry(0.2, 8, 6));
    const lenses = new THREE.InstancedMesh(lensGeometry, statusMaterial, positions.length);
    lenses.name = 'Epsilon-3 status lamp lenses';
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      matrix.compose(new THREE.Vector3(position[0], position[1] + 0.28, position[2]), quaternion, scale);
      lenses.setMatrixAt(index, matrix);
    }
    lenses.instanceMatrix.needsUpdate = true;
    lenses.computeBoundingSphere();
    this.group.add(lenses);
  }

  private buildExitCorridor(structuralMetal: THREE.Material, serviceMetal: THREE.Material): void {
    const corridor = new THREE.Group();
    corridor.name = 'Epsilon-3 Physical Departure Corridor';
    this.corridorHardware = corridor;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const segmentGeometry = this.own(new THREE.BoxGeometry(6.35, 0.48, 0.7));
    const frameSegments = new THREE.InstancedMesh(segmentGeometry, structuralMetal, this.gateCount * 8);
    frameSegments.name = 'Departure gate armored segments';
    let instance = 0;
    for (let gate = 0; gate < this.gateCount; gate += 1) {
      const z = 18 + gate * (arkDepartureTuning.corridorLength / (this.gateCount + 1));
      for (let segment = 0; segment < 8; segment += 1) {
        const angle = (segment / 8) * Math.PI * 2;
        quaternion.setFromEuler(new THREE.Euler(0, 0, angle + Math.PI / 2));
        matrix.compose(
          new THREE.Vector3(Math.cos(angle) * 8.45, 1.4 + Math.sin(angle) * 8.45, z),
          quaternion,
          scale
        );
        frameSegments.setMatrixAt(instance++, matrix);
      }
    }
    frameSegments.instanceMatrix.needsUpdate = true;
    frameSegments.computeBoundingSphere();
    corridor.add(frameSegments);

    const lampGeometry = this.own(new THREE.BoxGeometry(1.35, 0.18, 0.22));
    const gateMaterials = [0, 1].map((index) => {
      const material = cloneShared(sharedBasicMaterial({
        color: index === 0 ? 0x78d5ed : 0x8aefcf,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      }));
      this.ownedMaterials.push(material);
      this.corridorMaterials.push(material);
      return material;
    });
    for (let parity = 0; parity < 2; parity += 1) {
      const gatesInSet = Math.ceil((this.gateCount - parity) / 2);
      const lamps = new THREE.InstancedMesh(lampGeometry, gateMaterials[parity], gatesInSet * 4);
      lamps.name = `Departure gate inset lamps ${parity + 1}`;
      instance = 0;
      for (let gate = parity; gate < this.gateCount; gate += 2) {
        const z = 17.6 + gate * (arkDepartureTuning.corridorLength / (this.gateCount + 1));
        for (let lamp = 0; lamp < 4; lamp += 1) {
          const angle = lamp * Math.PI / 2;
          quaternion.setFromEuler(new THREE.Euler(0, 0, angle + Math.PI / 2));
          matrix.compose(
            new THREE.Vector3(Math.cos(angle) * 7.95, 1.4 + Math.sin(angle) * 7.95, z),
            quaternion,
            scale
          );
          lamps.setMatrixAt(instance++, matrix);
        }
      }
      lamps.instanceMatrix.needsUpdate = true;
      lamps.computeBoundingSphere();
      corridor.add(lamps);
    }

    const railGeometry = this.own(new THREE.BoxGeometry(0.66, 0.34, 4.8));
    const railModules = new THREE.InstancedMesh(railGeometry, serviceMetal, this.guideModuleCount);
    railModules.name = 'Departure vector rail housings';
    const railLightMaterial = cloneShared(sharedBasicMaterial({
      color: 0x6fd6ef,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    }));
    this.ownedMaterials.push(railLightMaterial);
    this.corridorMaterials.push(railLightMaterial);
    const railLightGeometry = this.own(new THREE.BoxGeometry(0.28, 0.1, 2.55));
    const railLights = new THREE.InstancedMesh(railLightGeometry, railLightMaterial, this.guideModuleCount);
    railLights.name = 'Departure vector rail light inserts';
    instance = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let module = 0; module < this.guideModuleCount / 2; module += 1) {
        const z = 12 + module * ((arkDepartureTuning.corridorLength - 18) / 11);
        matrix.compose(new THREE.Vector3(side * 6.4, -5.75, z), new THREE.Quaternion(), scale);
        railModules.setMatrixAt(instance, matrix);
        matrix.compose(new THREE.Vector3(side * 6.4, -5.54, z), new THREE.Quaternion(), scale);
        railLights.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    railModules.instanceMatrix.needsUpdate = true;
    railLights.instanceMatrix.needsUpdate = true;
    railModules.computeBoundingSphere();
    railLights.computeBoundingSphere();
    corridor.add(railModules, railLights);

    this.group.add(corridor);
  }

  update(clampOpen: number, corridorVisible: boolean, elapsed: number): void {
    if (!this.built || this.disposed || !this.group.visible) return;

    if (this.statusMaterial) {
      const hue = clampOpen <= 0 ? 0.02 : clampOpen >= 1 ? 0.32 : 0.02 + clampOpen * 0.09;
      this.statusMaterial.emissive.setHSL(hue, 0.92, 0.46);
      this.statusMaterial.emissiveIntensity = 0.85 + Math.sin(elapsed * 3.4) * 0.22;
    }

    if (this.umbilical) {
      this.umbilical.position.z = this.umbilicalBase.z - clampOpen * 4.2;
      this.umbilical.visible = clampOpen < 0.98;
    }
    if (this.corridorHardware) this.corridorHardware.visible = corridorVisible;

    for (let index = 0; index < this.corridorMaterials.length; index += 1) {
      const material = this.corridorMaterials[index];
      const pulse = Math.max(0, Math.sin(elapsed * 2.4 - index * 1.1));
      material.opacity = corridorVisible ? 0.2 + pulse * 0.32 : 0;
    }
  }

  setVisible(visible: boolean): void {
    if (!this.built || this.disposed) return;
    this.group.visible = visible;
  }

  dispose(): void {
    if (!this.built) {
      this.disposed = true;
      return;
    }
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.corridorMaterials.length = 0;
    this.statusMaterial = undefined;
    this.umbilical = undefined;
    this.corridorHardware = undefined;
    this.built = false;
    this.disposed = true;
  }

  resetForRebuild(): void {
    this.dispose();
    this.disposed = false;
    this.group.visible = false;
  }
}
