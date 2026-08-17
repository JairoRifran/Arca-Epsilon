import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { materialLibrary } from '../assets/materials';
import { createRockGeometry } from './AsteroidField';
import { AssetLoader } from '../core/AssetLoader';
import { loadOptionalModel, loadPreferredModel, type ModelLodPaths } from '../core/ModelLod';
import {
  cloneShared,
  freezeStaticChildren,
  sharedBasicMaterial,
  sharedStandardMaterial
} from '../assets/materialCache';

const ARK_PLUME_VERTEX = /* glsl */ `
varying float vAxial;
varying vec3 vNormal;

void main() {
  vAxial = uv.y;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ARK_PLUME_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPulse;
varying float vAxial;
varying vec3 vNormal;

void main() {
  float nearFade = smoothstep(0.0, 0.12, vAxial);
  float farFade = 1.0 - smoothstep(0.28, 1.0, vAxial);
  float edge = 0.45 + pow(1.0 - abs(vNormal.z), 1.8) * 0.55;
  float ripple = 0.92 + sin(vAxial * 24.0 + uPulse) * 0.08;
  float alpha = uOpacity * nearFade * farFade * edge * ripple;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.72 + edge * 0.28), alpha);
}
`;

export type MothershipDiagnostics = {
  status: 'loading' | 'loaded' | 'fallback';
  path: string;
  meshCount: number;
  triangles: number;
  trianglesByLod: Record<string, number>;
  scale: number;
  visible: boolean;
  lodLevel: string;
  availableLods: string[];
  fallbackUsed: boolean;
  skippedVisualUpdates: number;
  error: string;
};

export class Mothership {
  readonly group = new THREE.Group();
  /** The hull drifts as a whole; nothing inside it moves relative to it. */
  private staticTransformsFrozen = false;

  readonly safeZoneRadius = 235;

  readonly diagnostics: MothershipDiagnostics = {
    status: 'loading',
    path: '',
    meshCount: 0,
    triangles: 0,
    trianglesByLod: {},
    scale: 1,
    visible: false,
    lodLevel: 'medium',
    availableLods: [],
    fallbackUsed: false,
    skippedVisualUpdates: 0,
    error: ''
  };

  private readonly beaconMaterials: THREE.MeshStandardMaterial[] = [];

  private readonly safeZoneRingMaterials: THREE.MeshBasicMaterial[] = [];

  private readonly engineMaterials: THREE.MeshStandardMaterial[] = [];

  private readonly enginePlumeMaterials: THREE.ShaderMaterial[] = [];

  private coreObject?: THREE.Object3D;

  private lowDetailObject?: THREE.Object3D;

  private nearLevel = 'medium';

  private launchAnchor?: THREE.Object3D;

  private readonly clampArms: THREE.Object3D[] = [];

  private readonly platformLightMaterials: THREE.MeshStandardMaterial[] = [];

  private launchPlatform?: THREE.Group;

  private launchPlatformNearDetail?: THREE.Group;

  private hangarGuide?: THREE.Group;

  private safeZoneHardware?: THREE.Group;

  private platformPower = 0;

  private readonly basePosition = new THREE.Vector3(-80, -34, -145);

  private visualAccumulator = 0;

  constructor(private readonly assetLoader: AssetLoader) {
    this.group.name = 'Arca Epsilon Mothership';
    this.group.position.copy(this.basePosition);
    this.group.rotation.set(0.08, -0.34, 0.02);
  }

  async load(paths: string | ModelLodPaths): Promise<void> {
    const lodPaths: ModelLodPaths = typeof paths === 'string'
      ? { medium: paths, original: paths }
      : paths;
    this.diagnostics.status = 'loading';
    this.diagnostics.path = lodPaths.medium;
    this.diagnostics.error = '';
    this.diagnostics.fallbackUsed = false;

    try {
      const primary = await loadPreferredModel(this.assetLoader, lodPaths.medium, lodPaths.original);
      const low = primary.fallbackUsed ? undefined : await loadOptionalModel(this.assetLoader, lodPaths.low);
      this.nearLevel = primary.fallbackUsed ? 'original' : 'medium';
      this.installModels(primary.gltf, low);
      this.diagnostics.status = 'loaded';
      this.diagnostics.path = primary.path;
      this.diagnostics.fallbackUsed = primary.fallbackUsed;
      this.diagnostics.visible = true;
    } catch (error) {
      this.diagnostics.status = 'fallback';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      this.installFallback();
      this.diagnostics.visible = true;
    }
  }

  update(delta: number, elapsed: number, playerDistance = 0): void {
    // The hull drifts and rotates as a single group, so everything inside it is
    // static relative to its parent. Freezing those local matrices once the GLB
    // has landed takes sixty objects out of the per-frame matrix walk. Done
    // here rather than in the constructor because the model loads later.
    if (!this.staticTransformsFrozen && this.coreObject) {
      this.staticTransformsFrozen = true;
      // The group itself keeps composing: `update` animates its transform.
      this.group.userData.dynamic = true;
      freezeStaticChildren(this.group);
    }
    const useLow = Boolean(this.lowDetailObject && playerDistance > 900);
    if (this.coreObject) this.coreObject.visible = !useLow;
    if (this.lowDetailObject) this.lowDetailObject.visible = useLow;
    const nearInfrastructureVisible = !useLow && playerDistance < 900;
    if (this.launchPlatform) this.launchPlatform.visible = nearInfrastructureVisible;
    if (this.hangarGuide) this.hangarGuide.visible = nearInfrastructureVisible;
    if (this.safeZoneHardware) this.safeZoneHardware.visible = nearInfrastructureVisible;
    if (this.launchPlatformNearDetail) this.launchPlatformNearDetail.visible = nearInfrastructureVisible;
    this.diagnostics.lodLevel = useLow ? 'low' : this.nearLevel;
    this.diagnostics.triangles = this.diagnostics.trianglesByLod[this.diagnostics.lodLevel] ?? 0;
    if (!this.group.visible) {
      this.diagnostics.skippedVisualUpdates += 1;
      return;
    }
    this.visualAccumulator += delta;
    const interval = this.diagnostics.lodLevel === 'low' ? 0.25 : 0;
    if (interval > 0 && this.visualAccumulator < interval) {
      this.diagnostics.skippedVisualUpdates += 1;
      return;
    }
    const visualDelta = this.visualAccumulator;
    this.visualAccumulator = 0;
    const beaconPulse = 0.55 + Math.sin(elapsed * 3.2) * 0.35;
    for (const material of this.beaconMaterials) {
      material.emissiveIntensity = 1.2 + beaconPulse * 1.3;
    }

    const enginePulse = 1.6 + Math.sin(elapsed * 4.6) * 0.45;
    for (const material of this.engineMaterials) {
      material.emissiveIntensity = enginePulse;
    }
    for (const material of this.enginePlumeMaterials) {
      material.uniforms.uPulse.value = elapsed * 4.6;
    }

    // Platform guide lights: quiet idle pulse; a running chase toward the
    // pad edge while launch power ramps.
    for (let index = 0; index < this.platformLightMaterials.length; index += 1) {
      const material = this.platformLightMaterials[index];
      const idle = 0.3 + Math.sin(elapsed * 1.8 + index) * 0.1;
      const chase = Math.max(0, Math.sin(elapsed * 7.2 - index * 1.35)) * 1.55 * this.platformPower;
      material.emissiveIntensity = idle + chase;
    }

    this.group.rotation.y += visualDelta * 0.006;
    // Barely-there station-keeping drift: a kilometre-class hull should
    // breathe on a minute scale, never bounce.
    this.group.position.y = this.basePosition.y + Math.sin(elapsed * 0.09) * 1.6;
    this.group.rotation.z = 0.02 + Math.sin(elapsed * 0.05) * 0.008;
  }

  isInSafeZone(position: THREE.Vector3): boolean {
    return position.distanceTo(this.group.position) <= this.safeZoneRadius;
  }

  distanceTo(position: THREE.Vector3): number {
    return position.distanceTo(this.group.position);
  }

  get highDetailVisible(): boolean {
    return Boolean(this.coreObject?.visible && this.group.visible);
  }

  private installModels(primary: GLTF, low?: GLTF): void {
    this.group.clear();
    this.engineMaterials.length = 0;
    this.enginePlumeMaterials.length = 0;
    this.coreObject = primary.scene;
    this.coreObject.name = `Arca Epsilon ${this.nearLevel}`;

    const primaryStats = this.prepareImportedMaterials(this.coreObject);
    const primaryScale = this.normalizeToMassiveScale(this.coreObject, 275);
    this.group.add(this.coreObject);
    this.lowDetailObject = low?.scene;
    let lowStats: { meshCount: number; triangles: number } | undefined;
    if (this.lowDetailObject) {
      this.lowDetailObject.name = 'Arca Epsilon low';
      lowStats = this.prepareImportedMaterials(this.lowDetailObject);
      this.normalizeToMassiveScale(this.lowDetailObject, 275);
      this.lowDetailObject.visible = false;
      this.group.add(this.lowDetailObject);
    }
    this.diagnostics.meshCount = primaryStats.meshCount;
    this.diagnostics.triangles = primaryStats.triangles;
    this.diagnostics.trianglesByLod = {
      [this.nearLevel]: primaryStats.triangles,
      ...(lowStats ? { low: lowStats.triangles } : {})
    };
    this.diagnostics.scale = primaryScale;
    this.diagnostics.lodLevel = this.nearLevel;
    this.diagnostics.availableLods = lowStats ? [this.nearLevel, 'low'] : [this.nearLevel];
    this.addCinematicOverlays();
  }

  private prepareImportedMaterials(root: THREE.Object3D): { meshCount: number; triangles: number } {
    let meshCount = 0;
    let triangles = 0;

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshCount += 1;

      const geometry = child.geometry;
      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }

      child.castShadow = false;
      child.receiveShadow = true;
      child.frustumCulled = true;
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => this.improveMaterial(material));
      } else {
        child.material = this.improveMaterial(child.material);
      }
    });

    return { meshCount, triangles: Math.round(triangles) };
  }

  private improveMaterial(material: THREE.Material): THREE.Material {
    if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
      return materialLibrary.wornMetal.clone();
    }

    const improved = material.clone();
    improved.roughness = Math.max(0.36, improved.roughness ?? 0.5);
    improved.metalness = Math.max(0.45, improved.metalness ?? 0.4);
    improved.envMapIntensity = Math.min(improved.envMapIntensity ?? 1, 0.72);

    if (!improved.map) {
      improved.color.lerp(new THREE.Color(0x8fa0aa), 0.18);
    }

    const materialName = `${material.name}`.toLowerCase();
    if (materialName.includes('light') || materialName.includes('engine') || materialName.includes('window')) {
      improved.emissive = new THREE.Color(0x4cc8ff);
      improved.emissiveIntensity = 0.9;
      this.engineMaterials.push(improved);
    }

    return improved;
  }

  private normalizeToMassiveScale(root: THREE.Object3D, targetMaxDimension: number): number {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = maxDimension > 0 ? targetMaxDimension / maxDimension : 1;
    root.position.sub(center);
    root.scale.setScalar(scale);
    return scale;
  }

  private addCinematicOverlays(): void {
    const box = new THREE.Box3().setFromObject(this.group);
    const size = new THREE.Vector3();
    box.getSize(size);

    this.addSafeZoneShell();
    this.addHangarGuide(size);
    this.addEngineGlow(size);
    this.addBeaconLights(size);
    this.addDamageDebris(size);
    this.addLaunchPlatform(size);
  }

  /**
   * Lateral launch platform Epsilon-3: a pad jutting from the hull flank
   * with guide-light rails, docking clamps and a cradle anchor the scout
   * sits on until Arca Command releases it.
   */
  private addLaunchPlatform(size: THREE.Vector3): void {
    const platform = new THREE.Group();
    platform.name = 'Launch Platform Epsilon-3';
    this.launchPlatform = platform;

    const deckMetal = sharedStandardMaterial({
      color: 0x414c54,
      metalness: 0.72,
      roughness: 0.58
    });
    const deckInset = sharedStandardMaterial({
      color: 0x263139,
      metalness: 0.66,
      roughness: 0.66
    });
    const structuralMetal = sharedStandardMaterial({
      color: 0x141c22,
      metalness: 0.84,
      roughness: 0.44,
      emissive: 0x050b0e,
      emissiveIntensity: 0.12
    });
    const serviceMetal = sharedStandardMaterial({
      color: 0x778087,
      metalness: 0.58,
      roughness: 0.7
    });
    const hazardMaterial = sharedStandardMaterial({
      color: 0x9a7a32,
      metalness: 0.48,
      roughness: 0.76
    });

    // A layered load-bearing deck instead of a single exposed slab.
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.6, 22), structuralMetal);
    bridge.name = 'Epsilon-3 armored hull bridge';
    bridge.position.set(0, -1.75, -14.5);
    platform.add(bridge);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(18, 1.3, 24), deckMetal);
    pad.name = 'Epsilon-3 load-bearing deck';
    pad.position.y = -1.18;
    platform.add(pad);
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(16.7, 0.24, 22.5), deckInset);
    upperDeck.name = 'Epsilon-3 replaceable deck surface';
    upperDeck.position.y = -0.43;
    platform.add(upperDeck);

    const nearDetail = new THREE.Group();
    nearDetail.name = 'Epsilon-3 near industrial detail';
    this.launchPlatformNearDetail = nearDetail;
    platform.add(nearDetail);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const setBox = (
      mesh: THREE.InstancedMesh,
      index: number,
      position: readonly [number, number, number],
      dimensions: readonly [number, number, number],
      rotationY = 0
    ): void => {
      quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));
      scale.set(dimensions[0], dimensions[1], dimensions[2]);
      matrix.compose(new THREE.Vector3(position[0], position[1], position[2]), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    };

    // Armored edge cassettes break the slab silhouette and protect utilities.
    const edgeCassettes = new THREE.InstancedMesh(unitBox, structuralMetal, 12);
    edgeCassettes.name = 'Epsilon-3 armored edge cassettes';
    let instance = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 6; index += 1) {
        setBox(edgeCassettes, instance++, [side * 8.85, -1.12, -9.8 + index * 3.9], [0.55, 1.5, 3.15]);
      }
    }
    edgeCassettes.instanceMatrix.needsUpdate = true;
    edgeCassettes.computeBoundingSphere();
    nearDetail.add(edgeCassettes);

    // Structural trusses make the connection to the Ark visibly load-bearing.
    const trusses = new THREE.InstancedMesh(unitBox, structuralMetal, 6);
    trusses.name = 'Epsilon-3 underside truss members';
    setBox(trusses, 0, [-4.7, -2.65, -15.5], [0.55, 0.55, 12], 0.52);
    setBox(trusses, 1, [4.7, -2.65, -15.5], [0.55, 0.55, 12], -0.52);
    setBox(trusses, 2, [-4.8, -2.25, -2], [0.48, 0.48, 16], -0.38);
    setBox(trusses, 3, [4.8, -2.25, -2], [0.48, 0.48, 16], 0.38);
    setBox(trusses, 4, [0, -2.55, -20], [13.5, 0.55, 0.55]);
    setBox(trusses, 5, [0, -2.25, -9.5], [16.2, 0.48, 0.48]);
    trusses.instanceMatrix.needsUpdate = true;
    trusses.computeBoundingSphere();
    nearDetail.add(trusses);

    // Replaceable deck plates: ordered service bays, not random surface noise.
    const panelGeometry = new THREE.BoxGeometry(1.7, 0.08, 2.45);
    const deckPanels = new THREE.InstancedMesh(panelGeometry, serviceMetal, 12);
    deckPanels.name = 'Epsilon-3 service access panels';
    instance = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        matrix.compose(
          new THREE.Vector3(column * 5.4, -0.265, -7.4 + row * 4.75),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1)
        );
        deckPanels.setMatrixAt(instance++, matrix);
      }
    }
    deckPanels.instanceMatrix.needsUpdate = true;
    deckPanels.computeBoundingSphere();
    nearDetail.add(deckPanels);

    // Two physical guide rails contain the light inserts. No floating strokes.
    const railHousings = new THREE.InstancedMesh(unitBox, structuralMetal, 2);
    railHousings.name = 'Epsilon-3 launch rail housings';
    setBox(railHousings, 0, [-7.55, -0.22, 0], [0.78, 0.42, 21.1]);
    setBox(railHousings, 1, [7.55, -0.22, 0], [0.78, 0.42, 21.1]);
    railHousings.instanceMatrix.needsUpdate = true;
    railHousings.computeBoundingSphere();
    platform.add(railHousings);

    const guideLooks = [0, 1].map((index) => {
      const material = cloneShared(sharedStandardMaterial({
        color: index === 0 ? 0x5d9eaa : 0x6ea58e,
        emissive: index === 0 ? 0x238cb1 : 0x2a9a78,
        emissiveIntensity: 0.35,
        metalness: 0.24,
        roughness: 0.34
      }));
      this.platformLightMaterials.push(material);
      return material;
    });
    const guideGeometry = new THREE.BoxGeometry(0.42, 0.13, 1.25);
    for (let phase = 0; phase < 2; phase += 1) {
      const guides = new THREE.InstancedMesh(guideGeometry, guideLooks[phase], 5);
      guides.name = `Epsilon-3 recessed vector lights ${phase + 1}`;
      instance = 0;
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const x = sideIndex === 0 ? -7.55 : 7.55;
        for (let index = 0; index < 5; index += 1) {
          if ((sideIndex + index) % 2 !== phase) continue;
          matrix.compose(
            new THREE.Vector3(x, 0.045, -8.4 + index * 4.2),
            new THREE.Quaternion(),
            new THREE.Vector3(1, 1, 1)
          );
          guides.setMatrixAt(instance++, matrix);
        }
      }
      guides.instanceMatrix.needsUpdate = true;
      guides.computeBoundingSphere();
      platform.add(guides);
    }

    const hazardStrips = new THREE.InstancedMesh(unitBox, hazardMaterial, 8);
    hazardStrips.name = 'Epsilon-3 hazard edge markings';
    for (let index = 0; index < 4; index += 1) {
      setBox(hazardStrips, index, [-6.4 + index * 4.25, -0.25, 10.85], [2.5, 0.08, 0.48], index % 2 ? 0.12 : -0.12);
      setBox(hazardStrips, index + 4, [-6.4 + index * 4.25, -0.25, -10.85], [2.5, 0.08, 0.48], index % 2 ? -0.12 : 0.12);
    }
    hazardStrips.instanceMatrix.needsUpdate = true;
    hazardStrips.computeBoundingSphere();
    nearDetail.add(hazardStrips);

    // A real service bulkhead gives the platform a clear connection point.
    const bulkhead = new THREE.InstancedMesh(unitBox, structuralMetal, 4);
    bulkhead.name = 'Epsilon-3 service bulkhead';
    setBox(bulkhead, 0, [-7.2, 2.25, -11.65], [1.1, 6.1, 1.45]);
    setBox(bulkhead, 1, [7.2, 2.25, -11.65], [1.1, 6.1, 1.45]);
    setBox(bulkhead, 2, [-4.8, 5.35, -11.65], [5.1, 0.58, 1.45]);
    setBox(bulkhead, 3, [4.8, 5.35, -11.65], [5.1, 0.58, 1.45]);
    bulkhead.instanceMatrix.needsUpdate = true;
    bulkhead.computeBoundingSphere();
    nearDetail.add(bulkhead);

    const servicePods = new THREE.InstancedMesh(unitBox, serviceMetal, 6);
    servicePods.name = 'Epsilon-3 power and coolant modules';
    for (let index = 0; index < 3; index += 1) {
      setBox(servicePods, index, [-6.25, 0.2 + index * 1.25, -11.05], [1.35, 0.72, 1.15]);
      setBox(servicePods, index + 3, [6.25, 0.2 + index * 1.25, -11.05], [1.35, 0.72, 1.15]);
    }
    servicePods.instanceMatrix.needsUpdate = true;
    servicePods.computeBoundingSphere();
    nearDetail.add(servicePods);

    nearDetail.add(this.createLaunchDeckMarking());

    // Articulated docking clamps retain the existing pivots and release logic.
    for (const x of [-4.6, 4.6]) {
      const pivot = new THREE.Group();
      pivot.name = x < 0 ? 'Epsilon-3 port clamp' : 'Epsilon-3 starboard clamp';
      pivot.userData.dynamic = true;
      pivot.position.set(x, -0.48, 0);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.25, 10), structuralMetal);
      hinge.rotation.z = Math.PI / 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.45, 1.55), structuralMetal);
      arm.position.y = 1.72;
      const actuator = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 2.8, 8), serviceMetal);
      actuator.position.set(x < 0 ? 0.5 : -0.5, 1.55, 0.72);
      actuator.rotation.z = x < 0 ? -0.22 : 0.22;
      const claw = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.62, 1.85), structuralMetal);
      claw.position.set(x < 0 ? 0.78 : -0.78, 3.42, 0);
      const contact = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 1.35), serviceMetal);
      contact.position.set(x < 0 ? 1.62 : -1.62, 3.56, 0);
      pivot.add(hinge, arm, actuator, claw, contact);
      platform.add(pivot);
      this.clampArms.push(pivot);
    }

    const workLight = new THREE.PointLight(0xbfe2ff, 0.82, 58, 1.8);
    workLight.position.set(0, 5.2, -7.8);
    platform.add(workLight);

    // Cradle anchor: the scout parks here; +Z of this anchor is the
    // outward launch direction.
    const anchor = new THREE.Object3D();
    anchor.name = 'Launch Cradle Epsilon-3';
    anchor.position.set(0, 2.2, 0);
    platform.add(anchor);
    this.launchAnchor = anchor;

    // Mounted on the hull flank, launching outward from the +Z side.
    platform.position.set(size.x * 0.16, size.y * 0.02, size.z * 0.52);
    this.group.add(platform);
  }

  private createLaunchDeckMarking(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create Epsilon-3 deck marking.');

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(196, 210, 214, 0.66)';
    context.lineWidth = 7;
    context.strokeRect(24, 24, 464, 208);
    context.fillStyle = 'rgba(201, 167, 77, 0.78)';
    for (let index = 0; index < 8; index += 1) {
      context.save();
      context.translate(40 + index * 58, 210);
      context.rotate(-0.42);
      context.fillRect(-16, -9, 32, 18);
      context.restore();
    }
    context.fillStyle = 'rgba(218, 229, 231, 0.82)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 86px Arial';
    context.fillText('E-3', 256, 105);
    context.font = '700 27px Arial';
    context.fillText('LAUNCH / OUTBOUND', 256, 164);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide
    });
    const marking = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 5.25), material);
    marking.name = 'Epsilon-3 operational deck marking';
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(0, -0.255, 4.2);
    return marking;
  }

  private addSafeZoneShell(): void {
    const perimeter = new THREE.Group();
    perimeter.name = 'Arca Traffic Control Buoy Perimeter';
    this.safeZoneHardware = perimeter;

    const buoyCount = 14;
    const bodyMaterial = sharedStandardMaterial({
      color: 0x26323a,
      metalness: 0.8,
      roughness: 0.48,
      emissive: 0x061018,
      emissiveIntensity: 0.16
    });
    const lightMaterial = cloneShared(sharedBasicMaterial({
      color: 0x7dd8eb,
      transparent: true,
      opacity: 0.08,
      depthWrite: false
    }));
    this.safeZoneRingMaterials.push(lightMaterial);

    const bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.72, 0.92, 2.7, 8),
      bodyMaterial,
      buoyCount
    );
    bodies.name = 'Arca perimeter buoy housings';
    const lenses = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.46, 8, 6),
      lightMaterial,
      buoyCount
    );
    lenses.name = 'Arca perimeter buoy navigation lenses';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let index = 0; index < buoyCount; index += 1) {
      const angle = (index / buoyCount) * Math.PI * 2;
      const y = Math.sin(index * 1.7) * 4.5;
      quaternion.setFromEuler(new THREE.Euler(0, -angle, Math.PI / 2));
      matrix.compose(
        new THREE.Vector3(Math.cos(angle) * this.safeZoneRadius, y, Math.sin(angle) * this.safeZoneRadius),
        quaternion,
        scale
      );
      bodies.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          Math.cos(angle) * (this.safeZoneRadius - 1.05),
          y,
          Math.sin(angle) * (this.safeZoneRadius - 1.05)
        ),
        quaternion,
        scale
      );
      lenses.setMatrixAt(index, matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    bodies.computeBoundingSphere();
    lenses.computeBoundingSphere();
    perimeter.add(bodies, lenses);

    this.group.add(perimeter);
  }

  /**
   * Inside the perimeter the boundary rings would slice across the whole
   * sky, so they fade to a whisper; from outside they read as the gate home.
   */
  setPlayerInside(inside: boolean, delta: number): void {
    const target = inside ? 0.08 : 0.42;
    for (const material of this.safeZoneRingMaterials) {
      material.opacity = THREE.MathUtils.lerp(material.opacity, target, 1 - Math.pow(0.02, delta));
    }
  }

  /** World-space transform of the lateral launch platform's ship cradle. */
  getLaunchAnchor(): THREE.Object3D | undefined {
    return this.launchAnchor;
  }

  /** 0..1 engine/pad power: drives the guide-light chase during launch. */
  setPlatformPower(power: number): void {
    this.platformPower = THREE.MathUtils.clamp(power, 0, 1);
  }

  /** 0..1 clamp release: swings the docking arms open. */
  setClampOpen(open: number): void {
    const angle = THREE.MathUtils.clamp(open, 0, 1) * 1.05;
    if (this.clampArms.length === 2) {
      this.clampArms[0].rotation.z = angle;
      this.clampArms[1].rotation.z = -angle;
    }
  }

  private addHangarGuide(size: THREE.Vector3): void {
    const guide = new THREE.Group();
    guide.name = 'Arca Industrial Hangar Approach';
    this.hangarGuide = guide;

    const structuralMetal = sharedStandardMaterial({
      color: 0x222d35,
      metalness: 0.82,
      roughness: 0.48,
      emissive: 0x061019,
      emissiveIntensity: 0.14
    });
    const insetLight = sharedStandardMaterial({
      color: 0x5e909b,
      emissive: 0x236f85,
      emissiveIntensity: 0.62,
      metalness: 0.3,
      roughness: 0.38
    });

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const frame = new THREE.InstancedMesh(unitBox, structuralMetal, 9);
    frame.name = 'Arca hangar approach armored frame';
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const baseY = -size.y * 0.22;
    const laneZ = size.z * 0.24;
    const gateZ = size.z * 0.42;
    const compose = (
      index: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number
    ): void => {
      scale.set(sx, sy, sz);
      matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
      frame.setMatrixAt(index, matrix);
    };
    compose(0, -10, baseY, laneZ, 2.1, 1.15, 42);
    compose(1, 10, baseY, laneZ, 2.1, 1.15, 42);
    compose(2, -13, baseY, gateZ, 1.8, 22, 2);
    compose(3, 13, baseY, gateZ, 1.8, 22, 2);
    compose(4, 0, baseY + 10.5, gateZ, 27.5, 1.5, 2);
    compose(5, 0, baseY - 10.5, gateZ, 27.5, 1.5, 2);
    compose(6, -11.5, baseY + 7, gateZ - 2.8, 0.7, 7, 0.7);
    compose(7, 11.5, baseY + 7, gateZ - 2.8, 0.7, 7, 0.7);
    compose(8, 0, baseY + 8.8, gateZ - 2.8, 17, 0.65, 0.65);
    frame.instanceMatrix.needsUpdate = true;
    frame.computeBoundingSphere();
    guide.add(frame);

    const markerGeometry = new THREE.BoxGeometry(0.55, 0.18, 2.25);
    const markers = new THREE.InstancedMesh(markerGeometry, insetLight, 16);
    markers.name = 'Arca hangar recessed vector markers';
    let instance = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 8; index += 1) {
        matrix.compose(
          new THREE.Vector3(side * 10, baseY + 0.67, laneZ - 17 + index * 4.8),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1)
        );
        markers.setMatrixAt(instance++, matrix);
      }
    }
    markers.instanceMatrix.needsUpdate = true;
    markers.computeBoundingSphere();
    guide.add(markers);
    this.group.add(guide);
  }

  private addEngineGlow(size: THREE.Vector3): void {
    const sockets = [-size.x * 0.16, 0, size.x * 0.16];
    const throatMaterial = materialLibrary.energyBlue.clone();
    throatMaterial.emissiveIntensity = 1.25;
    this.engineMaterials.push(throatMaterial);

    const outerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x4ab7df) },
        uOpacity: { value: 0.14 },
        uPulse: { value: 0 }
      },
      vertexShader: ARK_PLUME_VERTEX,
      fragmentShader: ARK_PLUME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const innerMaterial = outerMaterial.clone();
    innerMaterial.uniforms = THREE.UniformsUtils.clone(outerMaterial.uniforms);
    innerMaterial.uniforms.uColor.value = new THREE.Color(0xd5f6ff);
    innerMaterial.uniforms.uOpacity.value = 0.2;
    this.enginePlumeMaterials.push(outerMaterial, innerMaterial);

    const throats = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(3.4, 4.6, 2.2, 18, 1, false),
      throatMaterial,
      sockets.length
    );
    throats.name = 'Arca Engine Throats';
    const outerPlumes = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(5.4, 1.15, 32, 18, 1, true),
      outerMaterial,
      sockets.length
    );
    outerPlumes.name = 'Arca Engine Outer Plumes';
    const innerPlumes = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(2.15, 0.46, 18, 14, 1, true),
      innerMaterial,
      sockets.length
    );
    innerPlumes.name = 'Arca Engine Hot Cores';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    const y = -size.y * 0.18;
    for (let index = 0; index < sockets.length; index += 1) {
      const x = sockets[index];
      matrix.compose(new THREE.Vector3(x, y, size.z * 0.5), quaternion, scale);
      throats.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(x, y, size.z * 0.5 + 16), quaternion, scale);
      outerPlumes.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(x, y, size.z * 0.5 + 9), quaternion, scale);
      innerPlumes.setMatrixAt(index, matrix);
    }
    throats.instanceMatrix.needsUpdate = true;
    outerPlumes.instanceMatrix.needsUpdate = true;
    innerPlumes.instanceMatrix.needsUpdate = true;
    throats.computeBoundingSphere();
    outerPlumes.computeBoundingSphere();
    innerPlumes.computeBoundingSphere();
    this.group.add(throats, outerPlumes, innerPlumes);

    const light = new THREE.PointLight(0x58ccff, 0.82, 125, 1.9);
    light.position.set(0, y, size.z * 0.54);
    this.group.add(light);
  }

  private addBeaconLights(size: THREE.Vector3): void {
    const positions = [
      new THREE.Vector3(-size.x * 0.36, size.y * 0.18, -size.z * 0.22),
      new THREE.Vector3(size.x * 0.36, size.y * 0.18, -size.z * 0.22),
      new THREE.Vector3(-size.x * 0.28, -size.y * 0.18, size.z * 0.16),
      new THREE.Vector3(size.x * 0.28, -size.y * 0.18, size.z * 0.16)
    ];

    for (const [index, position] of positions.entries()) {
      const material = (index % 2 === 0 ? materialLibrary.warningRed : materialLibrary.energyBlue).clone();
      this.beaconMaterials.push(material);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.8, 16, 8), material);
      beacon.position.copy(position);
      this.group.add(beacon);

      const light = new THREE.PointLight(index % 2 === 0 ? 0xff3555 : 0x61d9ff, 0.7, 120);
      light.position.copy(position);
      this.group.add(light);
    }
  }

  private addDamageDebris(size: THREE.Vector3): void {
    // Mixed wreckage instead of 24 clones of one plate: torn hull panels of
    // uneven proportions plus charred structural chunks. Reads as damage
    // history, not a particle emitter.
    const panelMaterial = materialLibrary.damagedPanel.clone();
    const burntMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f1c19,
      metalness: 0.55,
      roughness: 0.9,
      emissive: 0x1c0803,
      emissiveIntensity: 0.12
    });

    const place = (mesh: THREE.Mesh): void => {
      mesh.position.set(
        (Math.random() - 0.5) * size.x * 0.9,
        (Math.random() - 0.5) * size.y * 0.75,
        (Math.random() - 0.5) * size.z * 0.9
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(mesh);
    };

    for (let i = 0; i < 10; i += 1) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2 + Math.random() * 5, 0.25 + Math.random() * 0.6, 4 + Math.random() * 9),
        panelMaterial
      );
      place(panel);
    }

    for (let i = 0; i < 8; i += 1) {
      const chunk = new THREE.Mesh(createRockGeometry(600 + i * 17.3, 1), burntMaterial);
      chunk.scale.setScalar(0.9 + Math.random() * 2.2);
      place(chunk);
    }
  }

  private installFallback(): void {
    this.group.clear();

    const carrier = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(210, 42, 84), materialLibrary.wornMetal.clone());
    const spine = new THREE.Mesh(new THREE.BoxGeometry(54, 76, 220), materialLibrary.darkMetal.clone());
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(58, 36, 46), materialLibrary.glass.clone());
    bridge.position.set(0, 43, -22);
    carrier.add(body, spine, bridge);
    this.coreObject = carrier;
    this.lowDetailObject = undefined;
    this.group.add(carrier);
    this.diagnostics.meshCount = 3;
    this.diagnostics.triangles = 36;
    this.diagnostics.trianglesByLod = { fallback: 36 };
    this.diagnostics.scale = 1;
    this.diagnostics.lodLevel = 'fallback';
    this.diagnostics.availableLods = ['fallback'];
    this.diagnostics.fallbackUsed = true;
    this.addCinematicOverlays();
  }
}
