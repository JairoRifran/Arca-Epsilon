import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { materialLibrary } from '../assets/materials';
import { createRockGeometry } from './AsteroidField';
import { AssetLoader } from '../core/AssetLoader';
import { loadOptionalModel, loadPreferredModel, type ModelLodPaths } from '../core/ModelLod';
import { freezeStaticChildren } from '../assets/materialCache';

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

  private coreObject?: THREE.Object3D;

  private lowDetailObject?: THREE.Object3D;

  private nearLevel = 'medium';

  private launchAnchor?: THREE.Object3D;

  private readonly clampArms: THREE.Object3D[] = [];

  private readonly platformLightMaterials: THREE.MeshStandardMaterial[] = [];

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

    // Platform guide lights: quiet idle pulse; a running chase toward the
    // pad edge while launch power ramps.
    for (const [index, material] of this.platformLightMaterials.entries()) {
      const idle = 0.3 + Math.sin(elapsed * 1.8 + index) * 0.1;
      const chase = Math.max(0, Math.sin(elapsed * 9 - (index % 5) * 1.1)) * 2.6 * this.platformPower;
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

    const padMetal = materialLibrary.wornMetal.clone();
    padMetal.color.setHex(0x5b666e);
    const strutMetal = materialLibrary.darkMetal.clone();

    // Bridge strut from the hull to the pad.
    const strut = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 20), strutMetal);
    strut.position.set(0, -1.6, -14);
    platform.add(strut);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(17, 1.4, 22), padMetal);
    pad.position.y = -1.2;
    platform.add(pad);

    // Guide-light rails along both pad edges; the chase animation runs
    // through platformLightMaterials during power-up.
    const lightGeometry = new THREE.BoxGeometry(0.8, 0.34, 1.4);
    for (const x of [-7.6, 7.6]) {
      for (let i = 0; i < 5; i += 1) {
        const material = materialLibrary.energyBlue.clone();
        material.emissiveIntensity = 0.35;
        this.platformLightMaterials.push(material);
        const guide = new THREE.Mesh(lightGeometry, material);
        guide.position.set(x, -0.4, -8.5 + i * 4.2);
        platform.add(guide);
      }
    }

    // Docking clamps: two arms that pivot open on release.
    for (const x of [-4.6, 4.6]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.5, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 2.4), strutMetal);
      arm.position.y = 1.7;
      pivot.add(arm);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.4), strutMetal);
      claw.position.set(x < 0 ? 0.8 : -0.8, 3.4, 0);
      pivot.add(claw);
      platform.add(pivot);
      this.clampArms.push(pivot);
    }

    // Pad work light.
    const workLight = new THREE.PointLight(0xbfe2ff, 1.1, 70, 1.8);
    workLight.position.set(0, 6, 0);
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

  private addSafeZoneShell(): void {
    // Holographic perimeter: sparse broken dashes projected by the Arca's
    // traffic control, never a perfect uniform circle. Uneven arc lengths
    // and gaps keep it reading as a scanner artifact.
    const perimeter = new THREE.Group();
    perimeter.name = 'Arca Safe Zone Perimeter';

    const dashCount = 14;
    for (let i = 0; i < dashCount; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x96e8ff,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.safeZoneRingMaterials.push(material);

      const span = 0.12 + Math.random() * 0.2;
      const dash = new THREE.Mesh(
        new THREE.TorusGeometry(this.safeZoneRadius, 0.42, 4, 12, span),
        material
      );
      dash.rotation.x = Math.PI / 2;
      dash.rotation.z = (i / dashCount) * Math.PI * 2 + Math.random() * 0.2;
      perimeter.add(dash);
    }

    this.group.add(perimeter);
  }

  /**
   * Inside the perimeter the boundary rings would slice across the whole
   * sky, so they fade to a whisper; from outside they read as the gate home.
   */
  setPlayerInside(inside: boolean, delta: number): void {
    const target = inside ? 0.025 : 0.15;
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
    const material = materialLibrary.energyBlue.clone();
    material.transparent = true;
    material.opacity = 0.7;

    const guide = new THREE.Group();
    guide.name = 'Docking Hangar Guide';

    for (const x of [-10, 10]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 42), material);
      rail.position.set(x, -size.y * 0.22, size.z * 0.24);
      guide.add(rail);
    }

    const aperture = new THREE.Mesh(new THREE.TorusGeometry(15, 0.65, 10, 72), material);
    aperture.position.set(0, -size.y * 0.22, size.z * 0.42);
    aperture.rotation.x = Math.PI / 2;
    guide.add(aperture);
    this.group.add(guide);
  }

  private addEngineGlow(size: THREE.Vector3): void {
    for (const x of [-size.x * 0.16, 0, size.x * 0.16]) {
      const material = materialLibrary.energyBlue.clone();
      this.engineMaterials.push(material);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 12), material);
      glow.scale.set(1, 0.55, 2.8);
      glow.position.set(x, -size.y * 0.18, size.z * 0.5);
      this.group.add(glow);

      const light = new THREE.PointLight(0x58ccff, 1.6, 180);
      light.position.copy(glow.position);
      this.group.add(light);
    }
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
