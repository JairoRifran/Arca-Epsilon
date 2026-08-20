import * as THREE from 'three';

export type CombatVfxAuditRoot = {
  name: string;
  object: THREE.Object3D;
};

export type CombatVfxMaterialEntry = {
  uuid: string;
  type: string;
  roots: string[];
  objectCount: number;
  transparent: boolean;
  blending: string;
  depthWrite: boolean;
  depthTest: boolean;
  side: string;
  opacity: number;
  mapSize: string | null;
  maximumScreenCoveragePercent: number;
};

export type CombatVfxMaterialAudit = {
  objectCount: number;
  materialCount: number;
  transparentObjectCount: number;
  additiveObjectCount: number;
  doubleSideObjectCount: number;
  depthWritingTransparentObjectCount: number;
  shadowCasterCount: number;
  maximumScreenCoveragePercent: number;
  materials: CombatVfxMaterialEntry[];
};

type MutableEntry = CombatVfxMaterialEntry & { rootSet: Set<string> };

const BLENDING_NAMES = new Map<number, string>([
  [THREE.NoBlending, 'NoBlending'],
  [THREE.NormalBlending, 'NormalBlending'],
  [THREE.AdditiveBlending, 'AdditiveBlending'],
  [THREE.SubtractiveBlending, 'SubtractiveBlending'],
  [THREE.MultiplyBlending, 'MultiplyBlending'],
  [THREE.CustomBlending, 'CustomBlending']
]);

const SIDE_NAMES = new Map<number, string>([
  [THREE.FrontSide, 'FrontSide'],
  [THREE.BackSide, 'BackSide'],
  [THREE.DoubleSide, 'DoubleSide']
]);

const worldCenter = new THREE.Vector3();
const worldScale = new THREE.Vector3();

function mapSize(material: THREE.Material): string | null {
  const texture = (material as THREE.Material & { map?: THREE.Texture | null }).map;
  const image = texture?.image as { width?: number; height?: number } | undefined;
  return image?.width && image?.height ? `${image.width}x${image.height}` : null;
}

function screenCoveragePercent(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number
): number {
  object.getWorldPosition(worldCenter);
  const cameraDistance = Math.max(0.01, camera.position.distanceTo(worldCenter));
  object.getWorldScale(worldScale);
  const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
  let radius = scale * 0.5;
  if ('geometry' in object) {
    const geometry = (object as THREE.Mesh | THREE.Points).geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    radius = Math.max(radius, (geometry.boundingSphere?.radius ?? 0.5) * scale);
  }
  const focalPixels = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
  const radiusPixels = radius * focalPixels / cameraDistance;
  const coverage = Math.PI * radiusPixels * radiusPixels / Math.max(1, viewportWidth * viewportHeight) * 100;
  return Math.min(100, Math.max(0, coverage));
}

/** One-shot material inventory for the explicit performance harness. */
export function auditCombatVfxMaterials(
  roots: readonly CombatVfxAuditRoot[],
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number
): CombatVfxMaterialAudit {
  const entries = new Map<string, MutableEntry>();
  let objectCount = 0;
  let transparentObjectCount = 0;
  let additiveObjectCount = 0;
  let doubleSideObjectCount = 0;
  let depthWritingTransparentObjectCount = 0;
  let shadowCasterCount = 0;
  let maximumScreenCoveragePercent = 0;

  for (const root of roots) {
    root.object.updateWorldMatrix(true, true);
    root.object.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
      objectCount += 1;
      if (object.castShadow) shadowCasterCount += 1;
      const coverage = screenCoveragePercent(object, camera, viewportWidth, viewportHeight);
      maximumScreenCoveragePercent = Math.max(maximumScreenCoveragePercent, coverage);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      let objectTransparent = false;
      let objectAdditive = false;
      let objectDoubleSide = false;
      let objectTransparentDepthWrite = false;
      for (const material of materials) {
        objectTransparent ||= material.transparent;
        objectAdditive ||= material.blending === THREE.AdditiveBlending;
        objectDoubleSide ||= material.side === THREE.DoubleSide;
        objectTransparentDepthWrite ||= material.transparent && material.depthWrite;
        let entry = entries.get(material.uuid);
        if (!entry) {
          entry = {
            uuid: material.uuid,
            type: material.type,
            roots: [],
            rootSet: new Set<string>(),
            objectCount: 0,
            transparent: material.transparent,
            blending: BLENDING_NAMES.get(material.blending) ?? String(material.blending),
            depthWrite: material.depthWrite,
            depthTest: material.depthTest,
            side: SIDE_NAMES.get(material.side) ?? String(material.side),
            opacity: Number(material.opacity.toFixed(3)),
            mapSize: mapSize(material),
            maximumScreenCoveragePercent: 0
          };
          entries.set(material.uuid, entry);
        }
        entry.objectCount += 1;
        entry.rootSet.add(root.name);
        entry.maximumScreenCoveragePercent = Math.max(entry.maximumScreenCoveragePercent, coverage);
      }
      if (objectTransparent) transparentObjectCount += 1;
      if (objectAdditive) additiveObjectCount += 1;
      if (objectDoubleSide) doubleSideObjectCount += 1;
      if (objectTransparentDepthWrite) depthWritingTransparentObjectCount += 1;
    });
  }

  const materials = [...entries.values()]
    .map(({ rootSet, ...entry }) => ({
      ...entry,
      roots: [...rootSet].sort(),
      maximumScreenCoveragePercent: Number(entry.maximumScreenCoveragePercent.toFixed(2))
    }))
    .sort((left, right) => right.maximumScreenCoveragePercent - left.maximumScreenCoveragePercent);

  return {
    objectCount,
    materialCount: materials.length,
    transparentObjectCount,
    additiveObjectCount,
    doubleSideObjectCount,
    depthWritingTransparentObjectCount,
    shadowCasterCount,
    maximumScreenCoveragePercent: Number(maximumScreenCoveragePercent.toFixed(2)),
    materials
  };
}
