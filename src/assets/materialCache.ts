import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Shared-material registry.
 *
 * The world builds most of its hardware from the same handful of looks — the
 * same grey shell, the same dark metal, the same soft contact shadow — but each
 * entity constructs its own `MeshStandardMaterial` for them. Every distinct
 * material is a separate uniform upload and a break in the renderer's sort, so
 * hundreds of visually identical copies cost real time for nothing.
 *
 * This hands back one instance per visual signature. Two callers asking for the
 * same look get the same object, and the renderer can batch them.
 *
 * The rule for using it: only share a material nothing animates. A material
 * whose `color`, `opacity`, `emissiveIntensity` or uniforms are driven per
 * entity must stay private, because mutating a shared instance would change
 * every mesh that borrowed it. `cloneShared` exists for exactly that case — it
 * takes the cached look and hands back a private copy to animate.
 *
 * Nothing here is ever disposed by an entity: these instances outlive any one
 * owner, so `dispose()` on a single entity must leave them alone.
 */

type StandardSpec = {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  flatShading?: boolean;
  map?: THREE.Texture;
};

type BasicSpec = {
  color: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  blending?: THREE.Blending;
  map?: THREE.Texture;
};

const standardCache = new Map<string, THREE.MeshStandardMaterial>();
const basicCache = new Map<string, THREE.MeshBasicMaterial>();

function signature(kind: string, spec: Record<string, unknown>): string {
  let key = kind;
  for (const name of Object.keys(spec).sort()) {
    const value = spec[name];
    if (value === undefined) continue;
    // Textures are identified by instance, so two materials only share when
    // they genuinely reference the same upload.
    key += `|${name}=${value instanceof THREE.Texture ? `tex${value.id}` : String(value)}`;
  }
  return key;
}

/** A shared `MeshStandardMaterial`. Never mutate the result. */
export function sharedStandardMaterial(spec: StandardSpec): THREE.MeshStandardMaterial {
  const key = signature('std', spec as unknown as Record<string, unknown>);
  const existing = standardCache.get(key);
  if (existing) return existing;
  const material = new THREE.MeshStandardMaterial(spec);
  standardCache.set(key, material);
  return material;
}

/**
 * A shared `MeshBasicMaterial`. The right choice for glow, decals, fake contact
 * shadows and indicators: they carry their own colour and gain nothing from
 * being lit, so shading them through the PBR path is pure cost.
 */
export function sharedBasicMaterial(spec: BasicSpec): THREE.MeshBasicMaterial {
  const key = signature('basic', spec as unknown as Record<string, unknown>);
  const existing = basicCache.get(key);
  if (existing) return existing;
  const material = new THREE.MeshBasicMaterial(spec);
  basicCache.set(key, material);
  return material;
}

/**
 * A private copy of a cached look, for the cases that animate. Costs one
 * material but keeps the cache's single source of truth for the appearance.
 */
export function cloneShared<T extends THREE.Material>(material: T): T {
  return material.clone() as T;
}

/** Diagnostics only: how many distinct looks the world actually needed. */
export function sharedMaterialStats(): { standard: number; basic: number } {
  return { standard: standardCache.size, basic: basicCache.size };
}

/** Unit-radius disc reused by every fake contact shadow in the world. */
let contactShadowGeometry: THREE.CircleGeometry | null = null;

/**
 * The soft dark disc almost every piece of hardware sits on.
 *
 * Fourteen entities built their own geometry, material and sprite texture for
 * this. They are visually identical, so they now share one unit disc scaled to
 * size and one material per opacity. The mesh is static by construction, so its
 * matrix is composed once and then left alone.
 */
export function createContactShadow(radius: number, opacity = 0.3, texture?: THREE.Texture): THREE.Mesh {
  contactShadowGeometry ??= new THREE.CircleGeometry(1, 14);
  const spec: BasicSpec = {
    color: 0x000000,
    transparent: true,
    opacity: Number(opacity.toFixed(2)),
    depthWrite: false
  };
  if (texture) spec.map = texture;
  const material = sharedBasicMaterial(spec);
  const shadow = new THREE.Mesh(contactShadowGeometry, material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.scale.setScalar(radius);
  shadow.matrixAutoUpdate = false;
  shadow.updateMatrix();
  return shadow;
}

/**
 * Compose a subtree's local matrices once and stop recomputing them.
 *
 * `updateMatrixWorld` runs over every object every frame, and for most of the
 * world it recomposes a transform that has not moved since it was built. This
 * freezes the local matrix of each descendant, leaving world-matrix
 * propagation intact so the parent can still be moved as a whole.
 *
 * Anything that animates its own position, rotation or scale must be excluded,
 * either by not calling this on it or by marking it `userData.dynamic = true`.
 * Skinned meshes and their bones are always skipped: their transforms are owned
 * by the animation system.
 */
/**
 * Freeze a root's static children while leaving the root itself composing.
 *
 * The common case: an entity whose group is positioned by mission code but
 * whose parts never move relative to it. Marking the group `dynamic` and then
 * freezing it would prune the whole subtree and freeze nothing, so the children
 * are walked individually instead.
 */
export function freezeStaticChildren(root: THREE.Object3D): number {
  let frozen = 0;
  for (const child of root.children) frozen += freezeStaticTransforms(child);
  return frozen;
}

export function freezeStaticTransforms(root: THREE.Object3D): number {
  let frozen = 0;
  // Walked by hand rather than with `traverse`: returning from a traverse
  // callback skips one node but still descends into its children, so a group
  // marked dynamic would have had every part inside it frozen anyway. Marking
  // a parent has to protect everything under it.
  const visit = (object: THREE.Object3D): void => {
    if (object.userData.dynamic === true) return;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh || (object as THREE.Bone).isBone) return;
    if (object.matrixAutoUpdate) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
      frozen += 1;
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return frozen;
}

/**
 * Merge a subtree's static decorative meshes into one draw call per material.
 *
 * Three.js issues a draw call per mesh, so a landmark built from three boulders
 * costs three even though they share a material and never move. This bakes each
 * child's transform (relative to `root`) into its geometry and collapses every
 * group that shares a material into a single mesh.
 *
 * Only safe for decoration. A mesh is skipped when it is marked
 * `userData.dynamic` or `userData.noMerge`, when it still composes its own
 * matrix (so something is animating it), when it is hidden, instanced, skinned,
 * or when it has children of its own. That last rule matters: merging a parent
 * would strand whatever hangs off it.
 *
 * Merging is per subtree by design. Collapsing the whole scene into one mesh
 * would defeat frustum culling, so callers pass one zone at a time and each
 * result keeps its own bounds and `frustumCulled`.
 *
 * Returns how many draw calls were saved.
 */
export function mergeStaticDecoration(root: THREE.Object3D, label = 'merged', cellSize = 0): number {
  // Grouped by material and, when a cell size is given, by grid cell too:
  // decoration scattered across a whole basin must not collapse into one
  // basin-wide mesh, or frustum culling would have nothing left to reject.
  const byMaterial = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // Walked by hand rather than with `traverse`: returning from a traverse
  // callback skips one node but still descends into its children, so a group
  // marked dynamic would have had its parts merged out from under it and
  // re-parented to this root — which is exactly how a deployable module ends
  // up scattered across the terrain. Marking a parent must protect the
  // entire subtree.
  const visit = (object: THREE.Object3D): void => {
    if (object.userData.dynamic === true || object.userData.noMerge === true) return;
    if (!object.visible) return;
    collect(object);
    for (const child of object.children) visit(child);
  };

  const collect = (object: THREE.Object3D): void => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (object.children.length > 0) return;
    if (object.matrixAutoUpdate) return;
    if (Array.isArray(mesh.material) || !mesh.geometry) return;
    const id = (mesh.material as unknown as { id: number }).id;
    let key = String(id);
    if (cellSize > 0) {
      mesh.getWorldPosition(scratchPosition);
      key += `|${Math.floor(scratchPosition.x / cellSize)},${Math.floor(scratchPosition.z / cellSize)}`;
    }
    let bucket = byMaterial.get(key);
    if (!bucket) { bucket = { material: mesh.material, meshes: [] }; byMaterial.set(key, bucket); }
    bucket.meshes.push(mesh);
  };

  visit(root);

  let saved = 0;
  for (const [, bucket] of byMaterial) {
    if (bucket.meshes.length < 2) continue;
    const baked: THREE.BufferGeometry[] = [];
    let consistent = true;
    const reference = Object.keys(bucket.meshes[0].geometry.attributes).sort().join(',');
    for (const mesh of bucket.meshes) {
      // mergeGeometries needs matching attribute sets; anything else is left
      // alone rather than silently dropped from the scene.
      if (Object.keys(mesh.geometry.attributes).sort().join(',') !== reference) { consistent = false; break; }
      const clone = mesh.geometry.clone();
      mesh.updateMatrixWorld(true);
      clone.applyMatrix4(scratchMerge.multiplyMatrices(inverseRoot, mesh.matrixWorld));
      baked.push(clone);
    }
    if (!consistent) { for (const g of baked) g.dispose(); continue; }

    const merged = mergeGeometries(baked, false);
    for (const g of baked) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();

    const combined = new THREE.Mesh(merged, bucket.material);
    combined.name = `${label} (${bucket.meshes.length}x)`;
    combined.matrixAutoUpdate = false;
    combined.updateMatrix();
    // Per-zone bounds are intact, so this still culls like the parts did.
    combined.frustumCulled = true;
    for (const mesh of bucket.meshes) {
      mesh.removeFromParent();
      // The geometry was authored for this mesh alone and is now baked in.
      // The material is shared and deliberately left alive.
      mesh.geometry.dispose();
    }
    root.add(combined);
    saved += bucket.meshes.length - 1;
  }
  return saved;
}

const scratchMerge = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
