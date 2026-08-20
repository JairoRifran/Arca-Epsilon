import * as THREE from 'three';

export type GroundDrawCategory =
  | 'character'
  | 'terrain'
  | 'base'
  | 'rocks'
  | 'sky-atmosphere'
  | 'vfx'
  | 'mission-markers'
  | 'other';

export type GroundBaseDrawCategory =
  | 'main-habitat'
  | 'workshop-cargo'
  | 'energy-life-support'
  | 'communications'
  | 'corridors-pipes'
  | 'landing-access'
  | 'foundations'
  | 'solar'
  | 'signage'
  | 'small-props';

export type GroundP15FrameContext = {
  visibleObjects: number;
  newlyVisibleObjects: number;
  shadowUpdate: number;
};

export type GroundDrawPairCandidate = {
  sector: string;
  geometry: string;
  material: string;
  calls: number;
  objects: number;
  triangles: number;
};

export type GroundInstancedBound = {
  name: string;
  instances: number;
  radius: number;
  frustumCulled: boolean;
};

export type GroundDrawCensus = {
  rendererCalls: number;
  sceneRenderItems: number;
  postAndShadowCalls: number;
  visibleObjects: number;
  newlyVisibleObjects: number;
  categories: Record<GroundDrawCategory, number>;
  baseBreakdown: Record<GroundBaseDrawCategory, number>;
  shadowCasters: Record<GroundDrawCategory, number>;
  rootBreakdown: Record<string, number>;
  branchBreakdown: Record<string, number>;
  topGeometryMaterialPairs: GroundDrawPairCandidate[];
  instancedBounds: GroundInstancedBound[];
  frustumCulledFalse: string[];
};

type RenderItem = {
  object: THREE.Object3D;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  group?: { start: number; count: number } | null;
};

type InternalRenderList = {
  opaque: RenderItem[];
  transmissive: RenderItem[];
  transparent: RenderItem[];
};

type RenderListsHost = THREE.WebGLRenderer & {
  renderLists: { get: (scene: THREE.Scene, renderCallDepth: number) => InternalRenderList };
};

type GroundP15Roots = {
  character: THREE.Object3D;
  planetaryWorld: THREE.Object3D;
  colonyModule: THREE.Object3D;
};

const DRAW_CATEGORIES: readonly GroundDrawCategory[] = [
  'character', 'terrain', 'base', 'rocks', 'sky-atmosphere', 'vfx', 'mission-markers', 'other'
];

const BASE_CATEGORIES: readonly GroundBaseDrawCategory[] = [
  'main-habitat', 'workshop-cargo', 'energy-life-support', 'communications', 'corridors-pipes',
  'landing-access', 'foundations', 'solar', 'signage', 'small-props'
];

const MAX_TRACKED_OBJECT_ID = 65_536;

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const key of keys) record[key] = 0;
  return record;
}

/**
 * Debug-only ground render census.
 *
 * It reads Three's already-built render list after a frame, so the lightweight
 * per-frame probe does not traverse the scene or perform a second frustum test.
 * Detailed maps and bounds are allocated only when a benchmark requests a
 * census snapshot, never in normal gameplay.
 */
export class GroundP15Diagnostics {
  private enabled = false;
  private readonly visibilityStamp = new Uint32Array(MAX_TRACKED_OBJECT_ID);
  private stamp = 1;
  private previousStamp = 0;
  private readonly frameContext: GroundP15FrameContext = {
    visibleObjects: 0,
    newlyVisibleObjects: 0,
    shadowUpdate: 0
  };

  constructor(private readonly roots: GroundP15Roots) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.frameContext.visibleObjects = 0;
      this.frameContext.newlyVisibleObjects = 0;
      this.frameContext.shadowUpdate = 0;
    }
  }

  get currentFrameContext(): GroundP15FrameContext {
    return this.frameContext;
  }

  captureRenderedFrame(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    shadowUpdated: boolean
  ): void {
    if (!this.enabled) return;
    const renderList = this.getRenderList(renderer, scene, camera);
    const currentStamp = ++this.stamp;
    let visibleObjects = 0;
    let newlyVisibleObjects = 0;
    this.forEachRenderItem(renderList, (item) => {
      const id = item.object.id;
      if (id >= MAX_TRACKED_OBJECT_ID || this.visibilityStamp[id] === currentStamp) return;
      visibleObjects += 1;
      if (this.visibilityStamp[id] !== this.previousStamp) newlyVisibleObjects += 1;
      this.visibilityStamp[id] = currentStamp;
    });
    this.previousStamp = currentStamp;
    this.frameContext.visibleObjects = visibleObjects;
    this.frameContext.newlyVisibleObjects = newlyVisibleObjects;
    this.frameContext.shadowUpdate = shadowUpdated ? 1 : 0;
  }

  census(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): GroundDrawCensus {
    const categories = zeroRecord(DRAW_CATEGORIES);
    const baseBreakdown = zeroRecord(BASE_CATEGORIES);
    const shadowCasters = zeroRecord(DRAW_CATEGORIES);
    const rootBreakdown: Record<string, number> = {};
    const branchBreakdown: Record<string, number> = {};
    const renderList = this.getRenderList(renderer, scene, camera);
    const pairs = new Map<string, {
      sector: string;
      geometry: string;
      material: string;
      calls: number;
      triangles: number;
      objectIds: Set<number>;
    }>();
    const visibleIds = new Set<number>();
    let sceneRenderItems = 0;

    this.forEachRenderItem(renderList, (item) => {
      sceneRenderItems += 1;
      visibleIds.add(item.object.id);
      const category = this.classify(item.object);
      categories[category] += 1;
      const sceneRoot = this.findSceneRoot(item.object, scene);
      rootBreakdown[sceneRoot] = (rootBreakdown[sceneRoot] ?? 0) + 1;
      const branch = this.findTopNamedBranch(item.object, scene);
      branchBreakdown[branch] = (branchBreakdown[branch] ?? 0) + 1;
      if (category === 'base') baseBreakdown[this.classifyBase(item.object)] += 1;

      const sector = this.findSectorName(item.object);
      const key = `${item.geometry.uuid}|${item.material.uuid}|${sector}`;
      let pair = pairs.get(key);
      if (!pair) {
        pair = {
          sector,
          geometry: item.geometry.name || item.geometry.type,
          material: item.material.name || item.material.type,
          calls: 0,
          triangles: 0,
          objectIds: new Set<number>()
        };
        pairs.set(key, pair);
      }
      pair.calls += 1;
      pair.triangles += this.triangleCount(item);
      pair.objectIds.add(item.object.id);
    });

    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.castShadow) shadowCasters[this.classify(object)] += 1;
    });

    const instancedBounds: GroundInstancedBound[] = [];
    const frustumCulledFalse: string[] = [];
    this.roots.planetaryWorld.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.frustumCulled && frustumCulledFalse.length < 40) {
        frustumCulledFalse.push(object.name || `${object.type}#${object.id}`);
      }
      const instanced = object as THREE.InstancedMesh;
      if (!instanced.isInstancedMesh) return;
      if (!instanced.boundingSphere) instanced.computeBoundingSphere();
      instancedBounds.push({
        name: object.name || `${object.type}#${object.id}`,
        instances: instanced.count,
        radius: Number((instanced.boundingSphere?.radius ?? 0).toFixed(2)),
        frustumCulled: instanced.frustumCulled
      });
    });
    instancedBounds.sort((left, right) => right.radius - left.radius);

    const topGeometryMaterialPairs = [...pairs.values()]
      .filter((pair) => pair.calls > 1)
      .sort((left, right) => right.calls - left.calls || right.triangles - left.triangles)
      .slice(0, 20)
      .map((pair) => ({
        sector: pair.sector,
        geometry: pair.geometry,
        material: pair.material,
        calls: pair.calls,
        objects: pair.objectIds.size,
        triangles: pair.triangles
      }));

    return {
      rendererCalls: renderer.info.render.calls,
      sceneRenderItems,
      postAndShadowCalls: Math.max(0, renderer.info.render.calls - sceneRenderItems),
      visibleObjects: visibleIds.size,
      newlyVisibleObjects: this.frameContext.newlyVisibleObjects,
      categories,
      baseBreakdown,
      shadowCasters,
      rootBreakdown: Object.fromEntries(
        Object.entries(rootBreakdown).sort((left, right) => right[1] - left[1])
      ),
      branchBreakdown: Object.fromEntries(
        Object.entries(branchBreakdown).sort((left, right) => right[1] - left[1])
      ),
      topGeometryMaterialPairs,
      instancedBounds: instancedBounds.slice(0, 20),
      frustumCulledFalse
    };
  }

  private getRenderList(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): InternalRenderList {
    void camera;
    return (renderer as RenderListsHost).renderLists.get(scene, 0) as unknown as InternalRenderList;
  }

  private forEachRenderItem(renderList: InternalRenderList, callback: (item: RenderItem) => void): void {
    for (let index = 0; index < renderList.opaque.length; index += 1) callback(renderList.opaque[index]);
    for (let index = 0; index < renderList.transmissive.length; index += 1) callback(renderList.transmissive[index]);
    for (let index = 0; index < renderList.transparent.length; index += 1) callback(renderList.transparent[index]);
  }

  private isDescendantOf(object: THREE.Object3D, root: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = object;
    while (node) {
      if (node === root) return true;
      node = node.parent;
    }
    return false;
  }

  private hierarchyName(object: THREE.Object3D): string {
    let node: THREE.Object3D | null = object;
    let value = '';
    while (node && node !== this.roots.planetaryWorld.parent) {
      if (node.name) value += ` ${node.name.toLowerCase()}`;
      node = node.parent;
    }
    return value;
  }

  private classify(object: THREE.Object3D): GroundDrawCategory {
    if (this.isDescendantOf(object, this.roots.character)) return 'character';
    const names = this.hierarchyName(object);
    if (this.isDescendantOf(object, this.roots.colonyModule) || /base nereida|landing operations|landing access/.test(names)) return 'base';
    if (/rock|outcrop|landmark/.test(names)) return 'rocks';
    if (/terrain|sediment|ground roughness/.test(names)) return 'terrain';
    if (/marker|objective|beacon|projection|relay|resonador/.test(names)) return 'mission-markers';
    if (/sky|cloud|atmosphere|horizon|sun/.test(names) || object instanceof THREE.Sprite) return 'sky-atmosphere';
    if (object instanceof THREE.Points || /effect|pulse|dust|haze|particle|scorch|heat/.test(names)) return 'vfx';
    return 'other';
  }

  private classifyBase(object: THREE.Object3D): GroundBaseDrawCategory {
    const names = this.hierarchyName(object);
    if (/sign|label|placard/.test(names)) return 'signage';
    if (/workshop|cargo/.test(names)) return 'workshop-cargo';
    if (/power|life support|oxygen|tank|radiator/.test(names)) return 'energy-life-support';
    if (/communication|mast|dish/.test(names)) return 'communications';
    if (/corridor|pressure|conduit|pipe|cable/.test(names)) return 'corridors-pipes';
    if (/airlock|access|ramp|runway|landing/.test(names)) return 'landing-access';
    if (/foundation|pile|underbody|pad/.test(names)) return 'foundations';
    if (/solar|panel|wing/.test(names)) return 'solar';
    if (/crate|bollard|light|rib|brace|rail|support|debris|window/.test(names)) return 'small-props';
    return 'main-habitat';
  }

  private findSectorName(object: THREE.Object3D): string {
    let node: THREE.Object3D | null = object;
    while (node && node !== this.roots.planetaryWorld) {
      if (node.name && (
        node.name.includes('Nereida ') ||
        node.name.includes('Habitat') ||
        node.name.includes('Character')
      )) return node.name;
      node = node.parent;
    }
    let root: THREE.Object3D = object;
    while (root.parent && root.parent !== this.roots.planetaryWorld.parent) root = root.parent;
    return root.name || object.name || object.type;
  }

  private findSceneRoot(object: THREE.Object3D, scene: THREE.Scene): string {
    let root = object;
    while (root.parent && root.parent !== scene) root = root.parent;
    return root.name || `${root.type}#${root.id}`;
  }

  private findTopNamedBranch(object: THREE.Object3D, scene: THREE.Scene): string {
    let node: THREE.Object3D | null = object;
    let named = object.name || object.type;
    while (node?.parent && node.parent !== scene) {
      if (node.name) named = node.name;
      node = node.parent;
    }
    if (node?.name) named = node.name;
    if (node?.parent === scene && !node.name) {
      let child = object;
      while (child.parent && child.parent !== node) child = child.parent;
      if (child.name) named = child.name;
    }
    return named;
  }

  private triangleCount(item: RenderItem): number {
    const geometry = item.geometry;
    const count = item.group?.count ?? (
      Number.isFinite(geometry.drawRange.count)
        ? geometry.drawRange.count
        : geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0
    );
    const instances = (item.object as THREE.InstancedMesh).isInstancedMesh
      ? (item.object as THREE.InstancedMesh).count
      : 1;
    return Math.max(0, Math.round((count / 3) * instances));
  }
}
