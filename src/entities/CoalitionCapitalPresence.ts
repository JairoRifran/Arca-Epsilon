import * as THREE from 'three';
import { mission21Tuning } from '../assets/mission21Definitions';

export type CoalitionCapitalVisualState = {
  visible: boolean;
  signatureAnalyzed: boolean;
  ultimatumActive: boolean;
  interferenceLevel: number;
  demonstrationActive: boolean;
  demonstrationObserved: boolean;
  classifiedRoutes: readonly boolean[];
  routesVisible: boolean;
  pleyadianNetworkActive: boolean;
  simultaneousAssaultActive: boolean;
};

/**
 * Distant, non-combat representation of the Coalition capital ship.
 *
 * The group intentionally exposes no WeaponTarget and owns no collision. It is
 * built only when M21 reveals it, updates at 10 Hz and reuses every geometry,
 * material and buffer for the rest of its lifetime.
 */
export class CoalitionCapitalPresence {
  readonly group = new THREE.Group();

  private readonly capital = new THREE.Group();
  private readonly intactBeacon = new THREE.Group();
  private readonly beaconFragments = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly pleyadianNetwork = new THREE.Group();
  private readonly assaultMarkers = new THREE.Group();
  private readonly capitalWorld = new THREE.Vector3();
  private readonly beaconWorld = new THREE.Vector3();
  private readonly hullMaterials: THREE.Material[] = [];
  private readonly routeMaterials: THREE.LineBasicMaterial[] = [];
  private readonly networkMaterials: THREE.LineBasicMaterial[] = [];
  private readonly structuralLights: THREE.Mesh[] = [];
  private readonly distortionRings: THREE.Mesh[] = [];
  private readonly fragments: THREE.Mesh[] = [];
  private beam?: THREE.Line;
  private beamMaterial?: THREE.LineBasicMaterial;
  private built = false;
  private updateAccumulator = 0;
  private interference = 0;
  private ultimatum = false;
  private demonstration = false;
  private destroyedBeacon = false;

  constructor() {
    this.group.name = 'Presencia Capital de la Coalición';
    this.capital.name = 'Nave Capital // Silueta distante';
    this.intactBeacon.name = 'Baliza orbital remota';
    this.beaconFragments.name = 'Baliza orbital inutilizada';
    this.routeGroup.name = 'Rutas de ataque M21';
    this.pleyadianNetwork.name = 'Red Pleyadiana parcial M21';
    this.assaultMarkers.name = 'Alarmas simultáneas M21';
    this.group.visible = false;
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get capitalPosition(): THREE.Vector3 { return this.capitalWorld; }
  get remoteBeaconPosition(): THREE.Vector3 { return this.beaconWorld; }
  get activeRouteCount(): number {
    let count = 0;
    for (let index = 0; index < this.routeMaterials.length; index += 1) {
      if (this.routeMaterials[index].opacity > 0.35) count += 1;
    }
    return count;
  }
  get networkVisible(): boolean { return this.pleyadianNetwork.visible; }
  get remoteBeaconDestroyed(): boolean { return this.destroyedBeacon; }

  setOrigin(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    const capitalOffset = mission21Tuning.capitalOffset;
    const beaconOffset = mission21Tuning.remoteBeaconOffset;
    this.capitalWorld.set(x + capitalOffset[0], y + capitalOffset[1], z + capitalOffset[2]);
    this.beaconWorld.set(x + beaconOffset[0], y + beaconOffset[1], z + beaconOffset[2]);
  }

  setState(state: CoalitionCapitalVisualState): void {
    if (!state.visible) {
      this.group.visible = false;
      return;
    }
    this.ensureBuilt();
    this.group.visible = true;
    this.interference = THREE.MathUtils.clamp(state.interferenceLevel / 100, 0, 1);
    this.ultimatum = state.ultimatumActive;
    this.demonstration = state.demonstrationActive;
    this.destroyedBeacon = state.demonstrationObserved;

    this.intactBeacon.visible = !state.demonstrationObserved;
    this.beaconFragments.visible = state.demonstrationObserved;
    if (this.beam) this.beam.visible = state.demonstrationActive && !state.demonstrationObserved;
    this.routeGroup.visible = state.routesVisible;
    for (let i = 0; i < this.routeMaterials.length; i += 1) {
      const classified = Boolean(state.classifiedRoutes[i]);
      this.routeMaterials[i].opacity = classified ? 0.68 : 0.16;
      this.routeMaterials[i].color.setHex(classified ? 0xd85b51 : 0x60383b);
    }
    this.pleyadianNetwork.visible = state.pleyadianNetworkActive;
    this.assaultMarkers.visible = state.simultaneousAssaultActive;

    for (const material of this.hullMaterials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = state.signatureAnalyzed ? 0.18 : 0.06;
      }
    }
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < mission21Tuning.visualUpdateInterval) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;

    this.capital.rotation.y = Math.sin(elapsed * 0.045) * 0.035;
    for (let i = 0; i < this.distortionRings.length; i += 1) {
      const ring = this.distortionRings[i];
      ring.rotation.z += step * (i % 2 === 0 ? 0.025 : -0.018);
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = 0.035 + this.interference * 0.035 + Math.sin(elapsed * 0.8 + i) * 0.008;
    }
    for (let i = 0; i < this.structuralLights.length; i += 1) {
      const material = this.structuralLights[i].material as THREE.MeshBasicMaterial;
      const forced = this.ultimatum ? 0.65 : 0.32;
      material.opacity = forced + Math.sin(elapsed * 1.8 + i * 0.7) * 0.1;
    }
    if (this.beamMaterial && this.beam?.visible) {
      this.beamMaterial.opacity = this.demonstration ? 0.72 + Math.sin(elapsed * 14) * 0.18 : 0;
    }
    if (this.beaconFragments.visible) {
      for (let i = 0; i < this.fragments.length; i += 1) {
        this.fragments[i].rotation.x += step * (0.08 + i * 0.01);
        this.fragments[i].rotation.z -= step * (0.05 + i * 0.008);
      }
    }
    if (this.pleyadianNetwork.visible) {
      for (let i = 0; i < this.networkMaterials.length; i += 1) {
        this.networkMaterials[i].opacity = 0.46 + Math.sin(elapsed * 2.2 + i) * 0.12;
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
      if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.group.clear();
    this.built = false;
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    const hull = new THREE.MeshStandardMaterial({
      color: 0x090b0f,
      emissive: 0x19070a,
      emissiveIntensity: 0.06,
      roughness: 0.76,
      metalness: 0.68
    });
    const secondary = hull.clone();
    secondary.color.setHex(0x11141a);
    const voidMaterial = new THREE.MeshBasicMaterial({ color: 0x020204, transparent: true, opacity: 0.94 });
    this.hullMaterials.push(hull, secondary, voidMaterial);

    const spineGeometry = new THREE.BoxGeometry(520, 56, 118);
    const bladeGeometry = new THREE.BoxGeometry(300, 34, 90);
    const coreGeometry = new THREE.OctahedronGeometry(88, 0);
    const spine = new THREE.Mesh(spineGeometry, hull);
    this.capital.add(spine);
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(bladeGeometry, secondary);
      blade.position.set(side * 300, side * 16, 25);
      blade.rotation.y = side * 0.19;
      blade.rotation.z = side * 0.05;
      this.capital.add(blade);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(54, 180, 210), hull);
      fin.position.set(side * 220, -28, 35);
      fin.rotation.z = side * 0.11;
      this.capital.add(fin);
    }
    const core = new THREE.Mesh(coreGeometry, voidMaterial);
    core.scale.set(1.7, 0.65, 1.2);
    this.capital.add(core);

    const lightGeometry = new THREE.BoxGeometry(28, 3, 3);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x8f151e, transparent: true, opacity: 0.36 });
    for (let i = 0; i < 8; i += 1) {
      const light = new THREE.Mesh(lightGeometry, lightMaterial.clone());
      light.position.set(-210 + i * 60, i % 2 === 0 ? 32 : -32, -58);
      this.structuralLights.push(light);
      this.capital.add(light);
    }

    const ringGeometry = new THREE.TorusGeometry(360, 2.5, 6, 64);
    for (let i = 0; i < 3; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0x8f2630 : 0x4a5360,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.scale.setScalar(1 + i * 0.22);
      ring.rotation.set(0.6 + i * 0.25, 0.25, i * 0.8);
      this.distortionRings.push(ring);
      this.capital.add(ring);
    }

    this.capital.position.set(...mission21Tuning.capitalOffset);
    this.capital.scale.setScalar(0.82);
    this.group.add(this.capital);

    this.buildRemoteBeacon();
    this.buildAttackRoutes();
    this.buildPleyadianNetwork();
    this.group.traverse((object) => { object.frustumCulled = false; });
  }

  private buildRemoteBeacon(): void {
    const beaconOffset = mission21Tuning.remoteBeaconOffset;
    const beaconMaterial = new THREE.MeshStandardMaterial({
      color: 0x48515b, emissive: 0x2b7085, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.65
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 42, 8), beaconMaterial);
    const dish = new THREE.Mesh(new THREE.TorusGeometry(16, 2, 6, 24), beaconMaterial);
    dish.rotation.x = Math.PI / 2;
    dish.position.y = 10;
    this.intactBeacon.add(mast, dish);
    this.intactBeacon.position.set(...beaconOffset);

    const fragmentGeometry = new THREE.TetrahedronGeometry(5, 0);
    const fragmentMaterial = new THREE.MeshBasicMaterial({ color: 0xb94f42, transparent: true, opacity: 0.72 });
    for (let i = 0; i < 10; i += 1) {
      const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
      const angle = i * Math.PI * 0.2;
      fragment.position.set(Math.cos(angle) * (10 + i * 1.6), (i % 3 - 1) * 8, Math.sin(angle) * (10 + i));
      fragment.scale.setScalar(0.55 + (i % 4) * 0.18);
      this.fragments.push(fragment);
      this.beaconFragments.add(fragment);
    }
    this.beaconFragments.position.set(...beaconOffset);
    this.beaconFragments.visible = false;

    const beamGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...mission21Tuning.capitalOffset),
      new THREE.Vector3(...beaconOffset)
    ]);
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: 0xff554d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.beam = new THREE.Line(beamGeometry, this.beamMaterial);
    this.beam.name = 'Pulso de demostración de fuerza';
    this.beam.visible = false;
    this.group.add(this.intactBeacon, this.beaconFragments, this.beam);
  }

  private buildAttackRoutes(): void {
    const capital = new THREE.Vector3(...mission21Tuning.capitalOffset);
    for (let i = 0; i < mission21Tuning.attackRouteOffsets.length; i += 1) {
      const destination = new THREE.Vector3(...mission21Tuning.attackRouteOffsets[i]);
      const mid = capital.clone().lerp(destination, 0.54);
      mid.y += 180 + i * 35;
      const geometry = new THREE.BufferGeometry().setFromPoints([capital, mid, destination]);
      const material = new THREE.LineBasicMaterial({ color: 0x60383b, transparent: true, opacity: 0.16 });
      const route = new THREE.Line(geometry, material);
      route.name = ['Ruta hostil // Aurora', 'Ruta hostil // Nereida', 'Ruta hostil // Red orbital'][i];
      this.routeMaterials.push(material);
      this.routeGroup.add(route);

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff4e45, transparent: true, opacity: 0.7, depthWrite: false
      });
      const marker = new THREE.Mesh(new THREE.RingGeometry(18, 22, 24), markerMaterial);
      marker.position.copy(destination);
      marker.lookAt(capital);
      this.assaultMarkers.add(marker);
    }
    this.routeGroup.visible = false;
    this.assaultMarkers.visible = false;
    this.group.add(this.routeGroup, this.assaultMarkers);
  }

  private buildPleyadianNetwork(): void {
    const source = new THREE.Vector3(0, 32, 0);
    for (let i = 0; i < mission21Tuning.attackRouteOffsets.length; i += 1) {
      const destination = new THREE.Vector3(...mission21Tuning.attackRouteOffsets[i]);
      const geometry = new THREE.BufferGeometry().setFromPoints([source, destination]);
      const material = new THREE.LineBasicMaterial({
        color: 0x63d7c7, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const link = new THREE.Line(geometry, material);
      link.name = `Enlace Pleyadiano parcial ${i + 1}`;
      this.networkMaterials.push(material);
      this.pleyadianNetwork.add(link);
    }
    this.pleyadianNetwork.visible = false;
    this.group.add(this.pleyadianNetwork);
  }
}
