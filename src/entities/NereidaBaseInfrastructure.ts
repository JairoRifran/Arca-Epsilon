import * as THREE from 'three';
import { freezeStaticChildren, mergeStaticDecoration } from '../assets/materialCache';

export type NereidaBaseDetailProfile = 'performance' | 'high' | 'ultra';

export type NereidaBaseInfrastructureDiagnostics = {
  architecturalSectors: number;
  landingAccessVisible: boolean;
  midDetailVisible: boolean;
  closeDetailVisible: boolean;
  activeLights: number;
  meshes: number;
  instancedMeshes: number;
  materials: number;
  landmarkName: string;
};

const UP = new THREE.Vector3(0, 1, 0);

function configureMesh(mesh: THREE.Mesh, shadows = true): void {
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
}

function createSignTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Nereida sign texture.');
  context.fillStyle = '#11191c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#39484a';
  context.fillRect(0, 0, canvas.width, 7);
  context.fillRect(0, canvas.height - 7, canvas.width, 7);
  context.fillStyle = '#d7dedc';
  context.font = '700 43px Arial, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(title, 28, 50);
  context.fillStyle = '#72b6aa';
  context.font = '600 20px Arial, sans-serif';
  context.fillText(subtitle, 29, 91);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createFacilityPanelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Nereida facility texture.');
  context.fillStyle = '#c1c6c4';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const variation = Math.sin(column * 8.7 + row * 13.1) * 7;
      const value = Math.round(190 + variation);
      context.fillStyle = `rgb(${value}, ${value + 3}, ${value + 2})`;
      context.fillRect(column * 128 + 3, row * 128 + 3, 122, 122);
    }
  }
  context.strokeStyle = 'rgba(38, 47, 48, 0.72)';
  context.lineWidth = 3;
  for (let value = 0; value <= 512; value += 128) {
    context.beginPath();
    context.moveTo(value, 0);
    context.lineTo(value, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, value);
    context.lineTo(512, value);
    context.stroke();
  }
  context.fillStyle = 'rgba(34, 42, 43, 0.7)';
  for (let y = 14; y < 512; y += 128) {
    for (let x = 14; x < 512; x += 128) {
      for (const offset of [[0, 0], [100, 0], [0, 100], [100, 100]]) {
        context.beginPath();
        context.arc(x + offset[0], y + offset[1], 2.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  const dust = context.createLinearGradient(0, 210, 0, 512);
  dust.addColorStop(0, 'rgba(74, 68, 54, 0)');
  dust.addColorStop(1, 'rgba(74, 66, 51, 0.24)');
  context.fillStyle = dust;
  context.fillRect(0, 190, 512, 322);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 1.6);
  texture.needsUpdate = true;
  return texture;
}

function createFacilityRoughnessTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Nereida facility roughness texture.');
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = noise - Math.floor(noise);
      const seam = x % 64 < 3 || y % 64 < 3 ? -32 : 0;
      const value = THREE.MathUtils.clamp(Math.round(185 + grain * 42 + seam), 0, 255);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.2, 2.1);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Authored support compound for the real Nereida habitat.
 *
 * It is deliberately visual-only: mission positions, the base interaction
 * anchor and collision volumes continue to belong to ColonyModule/main. The
 * compound gives those systems an architectural context without changing
 * their contract.
 */
export class NereidaBaseInfrastructure {
  readonly group = new THREE.Group();

  private readonly silhouette = new THREE.Group();
  private readonly midDetail = new THREE.Group();
  private readonly closeDetail = new THREE.Group();
  private readonly serviceLightMaterial: THREE.MeshStandardMaterial;
  private readonly windowMaterial: THREE.MeshStandardMaterial;
  private readonly accessLight: THREE.PointLight;
  private readonly materials = new Set<THREE.Material>();
  private readonly baseWorldPosition = new THREE.Vector3();
  private detailProfile: NereidaBaseDetailProfile = 'high';
  private mergedDraws = 0;

  constructor() {
    this.group.name = 'Base Nereida Infrastructure';
    this.silhouette.name = 'Base Nereida Architectural Silhouette';
    this.midDetail.name = 'Base Nereida Mid Detail';
    this.closeDetail.name = 'Base Nereida Close Detail';
    this.group.add(this.silhouette, this.midDetail, this.closeDetail);

    const panelTexture = createFacilityPanelTexture();
    const panelRoughness = createFacilityRoughnessTexture();
    const hull = this.track(new THREE.MeshStandardMaterial({
      color: 0xabb2b2,
      map: panelTexture,
      roughnessMap: panelRoughness,
      bumpMap: panelRoughness,
      bumpScale: 0.026,
      roughness: 0.68,
      metalness: 0.32
    }));
    const painted = this.track(new THREE.MeshStandardMaterial({
      color: 0x65716f,
      map: panelTexture,
      roughnessMap: panelRoughness,
      bumpMap: panelRoughness,
      bumpScale: 0.018,
      roughness: 0.76,
      metalness: 0.38
    }));
    const structure = this.track(new THREE.MeshStandardMaterial({
      color: 0x242b2e,
      roughness: 0.57,
      metalness: 0.78
    }));
    const workSurface = this.track(new THREE.MeshStandardMaterial({
      color: 0x3c4545,
      roughness: 0.84,
      metalness: 0.5
    }));
    const warning = this.track(new THREE.MeshStandardMaterial({
      color: 0x9a7443,
      roughness: 0.72,
      metalness: 0.34
    }));
    this.windowMaterial = this.track(new THREE.MeshStandardMaterial({
      color: 0x13292e,
      emissive: 0x285b57,
      emissiveIntensity: 0.32,
      roughness: 0.2,
      metalness: 0.22
    }));
    this.serviceLightMaterial = this.track(new THREE.MeshStandardMaterial({
      color: 0x6cd6bd,
      emissive: 0x42cbae,
      emissiveIntensity: 0.8,
      roughness: 0.22,
      metalness: 0.08
    }));

    this.addFoundations(structure, workSurface);
    this.addWorkshop(hull, painted, structure, warning);
    this.addPowerAndLifeSupport(hull, painted, structure);
    this.addCommunicationsAnnex(hull, structure);
    this.addPressureConnections(painted, structure);
    this.addAccessSpine(workSurface, structure, warning);
    this.addOperationalDetails(workSurface, structure, warning);

    this.accessLight = new THREE.PointLight(0x9bd8c6, 0.68, 18, 2);
    this.accessLight.name = 'Nereida Access Work Light';
    this.accessLight.position.set(0, 2.35, 7.4);
    this.accessLight.castShadow = false;
    this.silhouette.add(this.accessLight);

    freezeStaticChildren(this.group);
    this.mergedDraws += mergeStaticDecoration(this.silhouette, 'Nereida silhouette');
    this.mergedDraws += mergeStaticDecoration(this.midDetail, 'Nereida mid detail');
    this.mergedDraws += mergeStaticDecoration(this.closeDetail, 'Nereida close detail');
  }

  setDetailProfile(profile: NereidaBaseDetailProfile): void {
    this.detailProfile = profile;
  }

  update(elapsed: number, observerPosition?: THREE.Vector3, basePosition?: THREE.Vector3): void {
    const pulse = 0.76 + Math.sin(elapsed * 1.75) * 0.12;
    this.serviceLightMaterial.emissiveIntensity = pulse;
    this.windowMaterial.emissiveIntensity = 0.28 + Math.sin(elapsed * 0.36) * 0.035;

    if (!observerPosition || !basePosition) return;
    this.baseWorldPosition.copy(basePosition);
    const dx = observerPosition.x - this.baseWorldPosition.x;
    const dz = observerPosition.z - this.baseWorldPosition.z;
    const altitude = Math.max(0, observerPosition.y - this.baseWorldPosition.y - 18);
    const distance = Math.hypot(dx, dz, altitude * 1.25);
    const profileScale = this.detailProfile === 'performance' ? 0.68 : this.detailProfile === 'ultra' ? 1.25 : 1;
    this.midDetail.visible = distance < (this.midDetail.visible ? 245 : 220) * profileScale;
    this.closeDetail.visible = distance < (this.closeDetail.visible ? 105 : 88) * profileScale;
  }

  getDiagnostics(): NereidaBaseInfrastructureDiagnostics {
    let meshes = 0;
    let instancedMeshes = 0;
    const activeLights = this.silhouette.visible ? 1 : 0;
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
      if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
    });
    return {
      architecturalSectors: 5,
      landingAccessVisible: this.silhouette.visible,
      midDetailVisible: this.midDetail.visible,
      closeDetailVisible: this.closeDetail.visible,
      activeLights,
      meshes,
      instancedMeshes,
      materials: this.materials.size,
      landmarkName: `Nereida Communications Spine // ${this.mergedDraws} draws merged`
    };
  }

  private track<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private addFoundations(structure: THREE.Material, deck: THREE.Material): void {
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), deck, 5);
    slabs.name = 'Nereida Sector Foundations';
    const transforms: Array<[number, number, number, number, number, number, number]> = [
      [-12.2, 0.18, -5.5, 11.6, 0.36, 8.0, 0.04],
      [12.1, 0.18, -6.1, 8.2, 0.36, 7.5, -0.06],
      [5.4, 0.18, -13.0, 7.2, 0.36, 5.8, 0.03],
      [-6.9, 0.16, -5.0, 3.7, 0.28, 3.1, 0],
      [6.8, 0.16, -5.2, 3.5, 0.28, 3.0, 0]
    ];
    this.setBoxInstances(slabs, transforms);
    slabs.castShadow = false;
    slabs.receiveShadow = true;
    this.silhouette.add(slabs);

    const supports = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 1, 8), structure, 12);
    supports.name = 'Nereida Foundation Piles';
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const [cx, cz, sx, sz] of [
      [-12.2, -5.5, 4.7, 3.0],
      [12.1, -6.1, 3.1, 2.7],
      [5.4, -13, 2.6, 2.0]
    ] as Array<[number, number, number, number]>) {
      for (const xSign of [-1, 1]) {
        for (const zSign of [-1, 1]) {
          dummy.position.set(cx + xSign * sx, -0.18, cz + zSign * sz);
          dummy.scale.set(1, 1.15, 1);
          dummy.updateMatrix();
          supports.setMatrixAt(index++, dummy.matrix);
        }
      }
    }
    supports.instanceMatrix.needsUpdate = true;
    supports.castShadow = true;
    supports.receiveShadow = true;
    this.midDetail.add(supports);
  }

  private addWorkshop(
    hull: THREE.Material,
    painted: THREE.Material,
    structure: THREE.Material,
    warning: THREE.Material
  ): void {
    const workshop = new THREE.Group();
    workshop.name = 'Nereida Workshop and Cargo Bay';
    workshop.position.set(-12.2, 0.35, -5.5);
    workshop.rotation.y = 0.04;

    const shell = new THREE.Mesh(new THREE.BoxGeometry(10.4, 3.8, 6.7), hull);
    shell.position.y = 2.18;
    configureMesh(shell);
    workshop.add(shell);

    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 10.45, 20, 1, false, 0, Math.PI), painted);
    roof.rotation.set(0, 0, Math.PI / 2);
    roof.position.y = 4.08;
    configureMesh(roof);
    workshop.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.85, 0.18), structure);
    door.position.set(0, 1.95, 3.44);
    configureMesh(door);
    workshop.add(door);

    const doorPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 2.65, 0.07), painted, 7);
    for (let i = 0; i < 7; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(-2.82 + i * 0.94, 1.95, 3.56);
      dummy.updateMatrix();
      doorPanels.setMatrixAt(i, dummy.matrix);
    }
    doorPanels.instanceMatrix.needsUpdate = true;
    workshop.add(doorPanels);

    const serviceDoor = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.25, 0.15), structure);
    serviceDoor.position.set(-4.0, 1.45, 3.47);
    configureMesh(serviceDoor);
    workshop.add(serviceDoor);

    const threshold = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.1, 0.8), warning);
    threshold.position.set(0.55, 0.12, 3.9);
    threshold.receiveShadow = true;
    workshop.add(threshold);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 1.0),
      this.track(new THREE.MeshBasicMaterial({ map: createSignTexture('TALLER 01', 'REPARACION / CARGA'), toneMapped: false }))
    );
    sign.position.set(0.7, 4.05, 3.39);
    workshop.add(sign);
    this.silhouette.add(workshop);

    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 4.35, 0.22), structure, 6);
    for (let i = 0; i < 6; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(-16.8 + i * 1.84, 2.55, -2.08);
      dummy.rotation.y = 0.04;
      dummy.updateMatrix();
      ribs.setMatrixAt(i, dummy.matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.castShadow = true;
    this.midDetail.add(ribs);
  }

  private addPowerAndLifeSupport(
    hull: THREE.Material,
    painted: THREE.Material,
    structure: THREE.Material
  ): void {
    const utility = new THREE.Group();
    utility.name = 'Nereida Power and Life Support';
    utility.position.set(12.1, 0.35, -6.1);
    utility.rotation.y = -0.06;

    const pressureBody = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 6.1, 24), hull);
    pressureBody.rotation.x = Math.PI / 2;
    pressureBody.position.y = 3.05;
    configureMesh(pressureBody);
    utility.add(pressureBody);

    for (const z of [-2.65, 0, 2.65]) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(3.04, 0.12, 7, 28), structure);
      collar.position.set(0, 3.05, z);
      configureMesh(collar);
      utility.add(collar);
    }

    const serviceFace = new THREE.Mesh(new THREE.CircleGeometry(2.68, 24), painted);
    serviceFace.position.set(0, 3.05, 3.08);
    utility.add(serviceFace);

    const exchanger = new THREE.Mesh(new THREE.CircleGeometry(1.08, 20), structure);
    exchanger.position.set(-0.75, 3.38, 3.17);
    utility.add(exchanger);
    const exchangerCollar = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.11, 7, 22), hull);
    exchangerCollar.position.set(-0.75, 3.38, 3.2);
    utility.add(exchangerCollar);
    const exchangerSlats = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.1, 0.06), hull, 5);
    for (let i = 0; i < 5; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(-0.75, 2.9 + i * 0.24, 3.24);
      dummy.updateMatrix();
      exchangerSlats.setMatrixAt(i, dummy.matrix);
    }
    exchangerSlats.instanceMatrix.needsUpdate = true;
    utility.add(exchangerSlats);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.14), structure);
    door.position.set(1.65, 1.85, 3.16);
    utility.add(door);

    const utilitySign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 0.42),
      this.track(new THREE.MeshBasicMaterial({ map: createSignTexture('SOPORTE', 'ENERGIA / O2'), toneMapped: false }))
    );
    utilitySign.position.set(1.35, 4.42, 3.2);
    utility.add(utilitySign);

    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.36, 0.08), this.windowMaterial, 4);
    for (let i = 0; i < 4; i += 1) {
      const angle = -0.78 + i * 0.52;
      const dummy = new THREE.Object3D();
      dummy.position.set(Math.sin(angle) * 3.02, 3.92, Math.cos(angle) * 3.02);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      windows.setMatrixAt(i, dummy.matrix);
    }
    windows.instanceMatrix.needsUpdate = true;
    utility.add(windows);
    this.silhouette.add(utility);

    const tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.68, 0.72, 2.8, 12), painted, 3);
    for (let i = 0; i < 3; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(14.5 + i * 1.55, 1.55, -11.7 + (i % 2) * 0.4);
      dummy.updateMatrix();
      tanks.setMatrixAt(i, dummy.matrix);
    }
    tanks.instanceMatrix.needsUpdate = true;
    tanks.castShadow = true;
    tanks.receiveShadow = true;
    this.midDetail.add(tanks);

    const radiator = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 2.9, 3.8), structure, 3);
    for (let i = 0; i < 3; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(9.1 + i * 1.35, 2.25, -12.4);
      dummy.rotation.set(0.14, -0.08, -0.12);
      dummy.updateMatrix();
      radiator.setMatrixAt(i, dummy.matrix);
    }
    radiator.instanceMatrix.needsUpdate = true;
    radiator.castShadow = true;
    this.midDetail.add(radiator);
  }

  private addCommunicationsAnnex(hull: THREE.Material, structure: THREE.Material): void {
    const annex = new THREE.Group();
    annex.name = 'Nereida Communications Spine';
    annex.position.set(4.9, 0.35, -13.0);

    const equipment = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.45, 4.4), hull);
    equipment.position.y = 1.58;
    configureMesh(equipment);
    annex.add(equipment);

    const towerLegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 1, 8), structure, 3);
    const top = new THREE.Vector3(0, 10.4, 0);
    const bases = [new THREE.Vector3(-1.65, 2.75, -1.1), new THREE.Vector3(1.65, 2.75, -1.1), new THREE.Vector3(0, 2.75, 1.7)];
    for (let i = 0; i < bases.length; i += 1) {
      const start = bases[i];
      const direction = top.clone().sub(start);
      const dummy = new THREE.Object3D();
      dummy.position.copy(start).addScaledVector(direction, 0.5);
      dummy.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
      dummy.scale.set(1, direction.length(), 1);
      dummy.updateMatrix();
      towerLegs.setMatrixAt(i, dummy.matrix);
    }
    towerLegs.instanceMatrix.needsUpdate = true;
    towerLegs.castShadow = true;
    annex.add(towerLegs);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 5.2, 8), structure);
    mast.position.y = 12.65;
    configureMesh(mast);
    annex.add(mast);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), hull);
    dish.scale.y = 0.24;
    dish.position.set(0, 10.85, 0);
    dish.rotation.z = -0.5;
    configureMesh(dish);
    annex.add(dish);

    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.46, 10), this.serviceLightMaterial);
    marker.position.y = 15.35;
    annex.add(marker);
    this.silhouette.add(annex);

    const crossBraces = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, 0.09, 0.09), structure, 7);
    for (let i = 0; i < 7; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(4.9, 4.1 + i * 0.92, -13.0);
      dummy.rotation.y = i % 2 === 0 ? 0.25 : -0.25;
      dummy.updateMatrix();
      crossBraces.setMatrixAt(i, dummy.matrix);
    }
    crossBraces.instanceMatrix.needsUpdate = true;
    this.midDetail.add(crossBraces);
  }

  private addPressureConnections(painted: THREE.Material, structure: THREE.Material): void {
    const corridors = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.25, 1.25, 1, 16), painted, 3);
    const connections: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(-4.1, 2.65, -3.2), new THREE.Vector3(-7.1, 2.65, -4.7)],
      [new THREE.Vector3(4.1, 2.65, -3.4), new THREE.Vector3(8.9, 2.65, -5.4)],
      [new THREE.Vector3(3.2, 2.65, -5.2), new THREE.Vector3(4.7, 2.65, -10.7)]
    ];
    this.setCylinderInstances(corridors, connections, 1);
    corridors.castShadow = true;
    corridors.receiveShadow = true;
    this.silhouette.add(corridors);

    const pressureCollars = new THREE.InstancedMesh(new THREE.TorusGeometry(1.31, 0.1, 7, 20), structure, 6);
    let index = 0;
    for (const [start, end] of connections) {
      const direction = end.clone().sub(start).normalize();
      for (const point of [start, end]) {
        const dummy = new THREE.Object3D();
        dummy.position.copy(point);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        dummy.updateMatrix();
        pressureCollars.setMatrixAt(index++, dummy.matrix);
      }
    }
    pressureCollars.instanceMatrix.needsUpdate = true;
    this.midDetail.add(pressureCollars);

    const conduits = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), structure, 8);
    const pipeRuns: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(8.8, 0.75, -8.8), new THREE.Vector3(4.8, 0.75, -8.8)],
      [new THREE.Vector3(4.8, 0.75, -8.8), new THREE.Vector3(4.8, 0.75, -4.2)],
      [new THREE.Vector3(-7.0, 0.7, -8.3), new THREE.Vector3(-3.9, 0.7, -8.3)],
      [new THREE.Vector3(-3.9, 0.7, -8.3), new THREE.Vector3(-3.9, 0.7, -4.4)],
      [new THREE.Vector3(14.8, 0.65, -10.4), new THREE.Vector3(14.8, 0.65, -8.1)],
      [new THREE.Vector3(14.8, 0.65, -8.1), new THREE.Vector3(9.4, 0.65, -8.1)],
      [new THREE.Vector3(-15.8, 0.62, -1.3), new THREE.Vector3(-9.6, 0.62, -1.3)],
      [new THREE.Vector3(-9.6, 0.62, -1.3), new THREE.Vector3(-9.6, 0.62, -2.1)]
    ];
    this.setCylinderInstances(conduits, pipeRuns, 1);
    conduits.castShadow = true;
    this.midDetail.add(conduits);
  }

  private addAccessSpine(deck: THREE.Material, structure: THREE.Material, warning: THREE.Material): void {
    const access = new THREE.Group();
    access.name = 'Nereida Landing Access Spine';

    const walkway = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.16, 13.0), deck);
    walkway.position.set(0, 0.18, 11.5);
    walkway.receiveShadow = true;
    access.add(walkway);

    const edgeStrips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.08, 12.8), warning, 2);
    for (let i = 0; i < 2; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(i === 0 ? -1.72 : 1.72, 0.31, 11.5);
      dummy.updateMatrix();
      edgeStrips.setMatrixAt(i, dummy.matrix);
    }
    edgeStrips.instanceMatrix.needsUpdate = true;
    access.add(edgeStrips);

    const rails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), structure, 12);
    const segments: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (const side of [-1, 1]) {
      for (let z = 5.5; z <= 17.5; z += 3) {
        segments.push([new THREE.Vector3(side * 1.82, 0.25, z), new THREE.Vector3(side * 1.82, 1.12, z)]);
      }
      segments.push([new THREE.Vector3(side * 1.82, 1.1, 5.5), new THREE.Vector3(side * 1.82, 1.1, 17.5)]);
    }
    this.setCylinderInstances(rails, segments, 1);
    access.add(rails);

    const accessLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 0.32), this.serviceLightMaterial, 8);
    let lightIndex = 0;
    for (const z of [6.5, 10.2, 13.9, 17.6]) {
      for (const x of [-1.58, 1.58]) {
        const dummy = new THREE.Object3D();
        dummy.position.set(x, 0.39, z);
        dummy.updateMatrix();
        accessLights.setMatrixAt(lightIndex++, dummy.matrix);
      }
    }
    accessLights.instanceMatrix.needsUpdate = true;
    access.add(accessLights);
    this.silhouette.add(access);
  }

  private addOperationalDetails(deck: THREE.Material, structure: THREE.Material, warning: THREE.Material): void {
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), deck, 9);
    crates.name = 'Nereida Purposeful Cargo Staging';
    const layouts: Array<[number, number, number, number, number, number, number]> = [
      [-17.0, 0.65, 0.1, 1.5, 1.2, 1.25, 0.12],
      [-15.3, 0.55, 0.2, 1.25, 1.0, 1.0, -0.08],
      [-17.1, 1.7, 0.05, 1.4, 0.82, 1.18, 0.05],
      [-8.2, 0.45, 0.9, 1.1, 0.78, 0.9, 0.32],
      [16.1, 0.48, -2.0, 1.0, 0.84, 1.0, -0.18],
      [17.2, 0.42, -3.2, 0.82, 0.72, 0.9, 0.22],
      [-13.8, 0.38, -10.2, 1.2, 0.65, 0.8, 0.05],
      [-12.4, 0.38, -10.2, 1.2, 0.65, 0.8, 0.05],
      [-11.0, 0.38, -10.2, 1.2, 0.65, 0.8, 0.05]
    ];
    this.setBoxInstances(crates, layouts);
    crates.castShadow = true;
    crates.receiveShadow = true;
    this.closeDetail.add(crates);

    const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.75, 8), warning, 8);
    let index = 0;
    for (const x of [-5.8, 5.8]) {
      for (const z of [-1.2, -4.2, -8.2, -11.2]) {
        const dummy = new THREE.Object3D();
        dummy.position.set(x, 0.42, z);
        dummy.updateMatrix();
        bollards.setMatrixAt(index++, dummy.matrix);
      }
    }
    bollards.instanceMatrix.needsUpdate = true;
    this.closeDetail.add(bollards);

    const maintenanceLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.13, 0.11), this.serviceLightMaterial, 14);
    const points: Array<[number, number, number, number]> = [
      [-16, 3.9, -2.02, 0], [-12, 4.25, -2.02, 0], [-8.2, 3.9, -2.02, 0],
      [9.4, 3.9, -2.95, 0], [12.1, 4.6, -3.05, 0], [14.8, 3.9, -3.15, 0],
      [2.5, 2.35, -10.75, 0], [5.0, 2.5, -10.75, 0], [7.5, 2.35, -10.75, 0],
      [-5.6, 0.58, -4, 0], [5.6, 0.58, -4, 0], [-5.6, 0.58, -9, 0], [5.6, 0.58, -9, 0],
      [0, 1.35, 18.0, 0]
    ];
    for (let i = 0; i < points.length; i += 1) {
      const dummy = new THREE.Object3D();
      dummy.position.set(points[i][0], points[i][1], points[i][2]);
      dummy.rotation.y = points[i][3];
      dummy.updateMatrix();
      maintenanceLights.setMatrixAt(i, dummy.matrix);
    }
    maintenanceLights.instanceMatrix.needsUpdate = true;
    this.midDetail.add(maintenanceLights);

    const cableTray = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 16.5), structure);
    cableTray.position.set(-5.1, 0.55, -4.9);
    cableTray.rotation.y = -0.03;
    cableTray.castShadow = true;
    this.closeDetail.add(cableTray);
  }

  private setBoxInstances(
    mesh: THREE.InstancedMesh,
    transforms: Array<[number, number, number, number, number, number, number]>
  ): void {
    const dummy = new THREE.Object3D();
    transforms.forEach(([x, y, z, sx, sy, sz, yaw], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private setCylinderInstances(
    mesh: THREE.InstancedMesh,
    segments: Array<[THREE.Vector3, THREE.Vector3]>,
    radiusScale: number
  ): void {
    const dummy = new THREE.Object3D();
    const direction = new THREE.Vector3();
    segments.forEach(([start, end], index) => {
      direction.copy(end).sub(start);
      dummy.position.copy(start).addScaledVector(direction, 0.5);
      dummy.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
      dummy.scale.set(radiusScale, direction.length(), radiusScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}
