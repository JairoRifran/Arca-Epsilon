import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type { AssetLoader } from '../core/AssetLoader';
import { loadOptionalModel, loadPreferredModel, type ModelLodPaths } from '../core/ModelLod';

export type OrbitalMarkerDiagnostics = {
  status: 'idle' | 'loading' | 'loaded' | 'failed';
  path: string;
  meshCount: number;
  materialCount: number;
  triangles: number;
  trianglesByLod: Record<string, number>;
  objectCount: number;
  scale: number;
  visible: boolean;
  lodLevel: string;
  availableLods: string[];
  fallbackUsed: boolean;
  error: string;
};

type ModelStats = {
  meshCount: number;
  materialCount: number;
  triangles: number;
  objectCount: number;
  scale: number;
};

export class OrbitalMarker {
  readonly group = new THREE.Group();

  readonly diagnostics: OrbitalMarkerDiagnostics = {
    status: 'idle',
    path: '',
    meshCount: 0,
    materialCount: 0,
    triangles: 0,
    trianglesByLod: {},
    objectCount: 0,
    scale: 1,
    visible: false,
    lodLevel: 'idle',
    availableLods: [],
    fallbackUsed: false,
    error: ''
  };

  private readonly glowMaterial: THREE.MeshBasicMaterial;

  private readonly auraMaterial: THREE.SpriteMaterial;

  private modelRoot?: THREE.Group;

  private nearRoot?: THREE.Object3D;

  private lowRoot?: THREE.Object3D;

  private nearLevel = 'medium';

  private highlight = 0;

  private visualAccumulator = 0;

  private skippedVisualUpdates = 0;

  constructor(
    private readonly assetLoader: AssetLoader,
    position: THREE.Vector3
  ) {
    this.group.name = 'Marcador Atlas';
    this.group.position.copy(position);
    this.group.rotation.set(-0.12, 0.48, 0.08);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x78ffd8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });

    this.auraMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(128),
      color: 0x78ffd8,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const aura = new THREE.Sprite(this.auraMaterial);
    aura.scale.setScalar(110);
    this.group.add(aura);

    const beaconLight = new THREE.PointLight(0x77ffd6, 2.2, 360, 1.7);
    beaconLight.position.set(0, 24, 0);
    this.group.add(beaconLight);
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
      this.modelRoot?.removeFromParent();
      this.modelRoot = new THREE.Group();
      this.modelRoot.name = 'Marcador Atlas LOD Root';

      this.nearLevel = primary.fallbackUsed ? 'original' : 'medium';
      this.nearRoot = primary.gltf.scene;
      const nearStats = this.prepareModel(this.nearRoot, `Marcador Atlas GLB ${this.nearLevel}`);
      this.modelRoot.add(this.nearRoot);
      this.lowRoot = low?.scene;
      let lowStats: ModelStats | undefined;
      if (this.lowRoot) {
        lowStats = this.prepareModel(this.lowRoot, 'Marcador Atlas GLB low');
        this.lowRoot.visible = false;
        this.modelRoot.add(this.lowRoot);
      }
      this.group.add(this.modelRoot);

      this.diagnostics.status = 'loaded';
      this.diagnostics.path = primary.path;
      this.diagnostics.meshCount = nearStats.meshCount;
      this.diagnostics.materialCount = nearStats.materialCount;
      this.diagnostics.objectCount = nearStats.objectCount;
      this.diagnostics.triangles = nearStats.triangles;
      this.diagnostics.trianglesByLod = {
        [this.nearLevel]: nearStats.triangles,
        ...(lowStats ? { low: lowStats.triangles } : {})
      };
      this.diagnostics.scale = nearStats.scale;
      this.diagnostics.visible = true;
      this.diagnostics.lodLevel = this.nearLevel;
      this.diagnostics.availableLods = lowStats ? [this.nearLevel, 'low'] : [this.nearLevel];
      this.diagnostics.fallbackUsed = primary.fallbackUsed;
    } catch (error) {
      this.diagnostics.status = 'failed';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      console.error('[OrbitalMarker] Optimized and original GLB failed', error);
      this.createFallback();
    }
  }

  flashHighlight(): void {
    this.highlight = 1;
  }

  distanceTo(position: THREE.Vector3): number {
    return this.group.position.distanceTo(position);
  }

  get highDetailVisible(): boolean {
    return Boolean(this.nearRoot?.visible && this.group.visible);
  }

  get inactiveUpdateSkipped(): number {
    return this.skippedVisualUpdates;
  }

  updateDistanceQuality(distance: number): void {
    if (this.diagnostics.status !== 'loaded') return;
    const useLow = Boolean(this.lowRoot && distance > 850);
    if (this.nearRoot) this.nearRoot.visible = !useLow;
    if (this.lowRoot) this.lowRoot.visible = useLow;
    this.diagnostics.lodLevel = useLow ? 'low' : this.nearLevel;
    this.diagnostics.triangles = this.diagnostics.trianglesByLod[this.diagnostics.lodLevel] ?? 0;
  }

  update(delta: number, elapsed: number, decoded: boolean): void {
    if (!this.group.visible) {
      this.skippedVisualUpdates += 1;
      return;
    }
    this.visualAccumulator += delta;
    const interval = this.diagnostics.lodLevel === 'low' ? 0.25 : 0;
    if (interval > 0 && this.visualAccumulator < interval) {
      this.skippedVisualUpdates += 1;
      return;
    }
    const visualDelta = this.visualAccumulator;
    this.visualAccumulator = 0;
    this.highlight = Math.max(0, this.highlight - visualDelta * 0.65);
    this.group.rotation.y += visualDelta * 0.025;

    const pulse = 0.42 + Math.sin(elapsed * 1.8) * 0.12 + this.highlight * 0.55;
    this.glowMaterial.opacity = decoded ? pulse + 0.15 : pulse;
    this.auraMaterial.opacity = decoded ? 0.16 + this.highlight * 0.14 : 0.08 + this.highlight * 0.14;
    if (this.modelRoot) this.modelRoot.rotation.y += visualDelta * 0.015;
  }

  private prepareModel(root: THREE.Object3D, name: string): ModelStats {
    root.name = name;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z, 1);
    const scale = 155 / maxAxis;
    root.position.sub(center);
    root.scale.setScalar(scale);

    let meshCount = 0;
    let objectCount = 0;
    let triangles = 0;
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      objectCount += 1;
      object.castShadow = false;
      object.receiveShadow = false;
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      object.frustumCulled = true;
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
      triangles += object.geometry.index
        ? object.geometry.index.count / 3
        : object.geometry.attributes.position.count / 3;
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    return { meshCount, materialCount: materials.size, triangles: Math.round(triangles), objectCount, scale };
  }

  private createFallback(): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0x303a40,
      emissive: 0x1d7f68,
      emissiveIntensity: 0.6,
      roughness: 0.65,
      metalness: 0.25
    });
    const placeholder = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), material);
    placeholder.name = 'Debug Placeholder';
    this.group.add(placeholder);
    this.diagnostics.meshCount = 1;
    this.diagnostics.materialCount = 1;
    this.diagnostics.objectCount = 1;
    this.diagnostics.triangles = 8;
    this.diagnostics.trianglesByLod = { fallback: 8 };
    this.diagnostics.scale = 1;
    this.diagnostics.visible = true;
    this.diagnostics.lodLevel = 'fallback';
    this.diagnostics.availableLods = ['fallback'];
    this.diagnostics.fallbackUsed = true;
  }
}
