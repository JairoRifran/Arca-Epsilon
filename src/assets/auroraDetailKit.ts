import * as THREE from 'three';
import { createNoiseCanvasTexture } from './materials';
import { sharedStandardMaterial } from './materialCache';

/**
 * Shared hardware-detail kit for the Aurora colony objects.
 *
 * Every module, stake and pump in the valley was built from a handful of
 * untextured primitives, which reads as "procedural placeholder" the moment the
 * player walks up to one. This adds the small stuff real equipment has —
 * panel seams, bolt rings, maintenance hatches, cable runs, rubber feet — from
 * one shared set of geometries and cache-backed materials, so a dozen entities
 * can dress themselves without each one inventing (and paying for) its own.
 *
 * Two rules keep it cheap:
 *
 *  - geometry and materials are module-level singletons, so N objects asking
 *    for bolts share one geometry and one material;
 *  - repeated details go through `GreebleBuilder`, which emits a single
 *    `InstancedMesh` per geometry+material bucket. A module with forty bolts,
 *    twenty seams and eight rivets costs three draw calls, not sixty-eight.
 *
 * Everything here is construction-time. Nothing in this file runs per frame.
 */

// ---------------------------------------------------------------------------
// Material palette. Routed through the shared cache so two entities asking for
// the same look get the same instance and the renderer can batch them.
// ---------------------------------------------------------------------------

let hullDetailMap: THREE.Texture | null = null;

/**
 * Fine grime//noise map reused by every painted surface. One upload for the
 * whole colony; it breaks up flat albedo without a per-object texture.
 */
export function auroraHullDetailMap(): THREE.Texture {
  if (!hullDetailMap) {
    hullDetailMap = createNoiseCanvasTexture(256, 0.14);
    hullDetailMap.wrapS = THREE.RepeatWrapping;
    hullDetailMap.wrapT = THREE.RepeatWrapping;
    hullDetailMap.repeat.set(3, 3);
  }
  return hullDetailMap;
}

/** Painted equipment shell: the colony's main hull look. */
export function paintedHull(color: number, roughness = 0.62): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color, roughness, metalness: 0.28, map: auroraHullDetailMap() });
}

/** Bare structural metal: frames, brackets, masts, bolts. */
export function structuralMetal(color = 0x3a4149): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color, roughness: 0.52, metalness: 0.74 });
}

/** Matte polymer: covers, caps, instrument housings. */
export function polymer(color = 0x2a2f34): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color, roughness: 0.82, metalness: 0.06 });
}

/** Dark rubber: feet, gaskets, hose, cable sheath. */
export function rubber(): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color: 0x15171a, roughness: 0.94, metalness: 0.02 });
}

/** Recessed seam/shadow line colour, used for panel breakup. */
export function seamMetal(): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color: 0x1b1f23, roughness: 0.7, metalness: 0.45 });
}

/** Instrument glass with a faint tint. */
export function instrumentGlass(color = 0x0d1418): THREE.MeshStandardMaterial {
  return sharedStandardMaterial({ color, roughness: 0.16, metalness: 0.1 });
}

// ---------------------------------------------------------------------------
// Shared geometry singletons.
// ---------------------------------------------------------------------------

const geo: Record<string, THREE.BufferGeometry | undefined> = {};

function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  geo[key] ??= build();
  return geo[key] as THREE.BufferGeometry;
}

/** Unit bolt head: a squat hex, scaled by the caller. */
export const boltGeometry = (): THREE.BufferGeometry =>
  cached('bolt', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
/** Unit seam strip: a thin flat box, scaled into a panel line. */
export const seamGeometry = (): THREE.BufferGeometry =>
  cached('seam', () => new THREE.BoxGeometry(1, 1, 1));
/**
 * Unit cable segment, +Y aligned so it can be oriented between two points.
 * Deliberately the same geometry as the bolt head: identical unit cylinders
 * bucket together, so a body's cables and bolts cost one draw call, not two.
 */
export const cableGeometry = (): THREE.BufferGeometry => boltGeometry();

// ---------------------------------------------------------------------------
// GreebleBuilder: accumulate small details, emit one InstancedMesh per bucket.
// ---------------------------------------------------------------------------

type Bucket = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
};

/**
 * Collects small repeated details and emits the minimum number of draw calls.
 *
 * Usage is construction-time only: `add(...)` during build, then `attach(group)`
 * once. The resulting meshes have their matrices baked and auto-update off, so
 * they cost nothing in the frame loop.
 */
export class GreebleBuilder {
  private readonly buckets = new Map<string, Bucket>();
  private readonly scratch = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  private bucket(key: string, geometry: THREE.BufferGeometry, material: THREE.Material): Bucket {
    let b = this.buckets.get(key);
    if (!b) { b = { geometry, material, matrices: [] }; this.buckets.set(key, b); }
    return b;
  }

  /** Raw placement: position, euler rotation and scale. */
  add(
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3Like,
    scale: THREE.Vector3Like,
    rotation?: THREE.Vector3Like
  ): this {
    this.pos.set(position.x, position.y, position.z);
    this.scl.set(scale.x, scale.y, scale.z);
    this.euler.set(rotation?.x ?? 0, rotation?.y ?? 0, rotation?.z ?? 0);
    this.quat.setFromEuler(this.euler);
    this.buckets.get(key) ?? this.bucket(key, geometry, material);
    this.bucket(key, geometry, material).matrices.push(
      new THREE.Matrix4().compose(this.pos, this.quat, this.scl)
    );
    return this;
  }

  /**
   * A ring of bolt heads around a cylindrical body — the single most effective
   * "this is fabricated hardware" cue.
   */
  boltRing(count: number, radius: number, y: number, size = 0.05, material = structuralMetal()): this {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      this.add(
        `bolt|${(material as unknown as { id: number }).id}`,
        boltGeometry(), material,
        { x: Math.cos(a) * radius, y, z: Math.sin(a) * radius },
        { x: size, y: size * 0.5, z: size },
        { x: 0, y: a, z: 0 }
      );
    }
    return this;
  }

  /** A row of bolts along a straight run, for panel edges and brackets. */
  boltRow(
    from: THREE.Vector3Like, to: THREE.Vector3Like, count: number,
    size = 0.045, material = structuralMetal()
  ): this {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      this.add(
        `bolt|${(material as unknown as { id: number }).id}`,
        boltGeometry(), material,
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t },
        { x: size, y: size * 0.5, z: size }
      );
    }
    return this;
  }

  /** A recessed panel seam. Thin, dark, and enough to break a flat face. */
  seam(
    position: THREE.Vector3Like, length: number, axis: 'x' | 'y' | 'z',
    thickness = 0.022, material = seamMetal()
  ): this {
    const s = axis === 'x'
      ? { x: length, y: thickness, z: thickness }
      : axis === 'y'
        ? { x: thickness, y: length, z: thickness }
        : { x: thickness, y: thickness, z: length };
    this.add(`seam|${(material as unknown as { id: number }).id}`, seamGeometry(), material, position, s);
    return this;
  }

  /**
   * A sagging cable or hose between two points, built from straight segments.
   * The sag is what sells it as a laid line rather than a rod.
   */
  cable(
    from: THREE.Vector3Like, to: THREE.Vector3Like,
    sag = 0.25, segments = 6, radius = 0.03, material = rubber()
  ): this {
    const key = `cable|${(material as unknown as { id: number }).id}|${radius.toFixed(3)}`;
    const point = (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * sag,
      z: from.z + (to.z - from.z) * t
    });
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < segments; i += 1) {
      const p0 = point(i / segments);
      const p1 = point((i + 1) / segments);
      dir.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
      const len = dir.length() || 0.0001;
      mid.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      q.setFromUnitVectors(up, dir.normalize());
      const b = this.bucket(key, cableGeometry(), material);
      b.matrices.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius * 2, len, radius * 2)));
    }
    return this;
  }

  /** How many draw calls this builder will add. */
  get drawCallCount(): number {
    return this.buckets.size;
  }

  /** Hand the accumulated buckets to a field and reset. */
  drain(): Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }> {
    const out = new Map(this.buckets);
    this.buckets.clear();
    return out;
  }

  /**
   * Emit the instanced meshes into a parent. Matrices are baked and
   * auto-update is off, so these never touch the frame loop.
   */
  attach(parent: THREE.Object3D, namePrefix = 'greeble'): void {
    for (const [key, b] of this.buckets) {
      if (b.matrices.length === 0) continue;
      const mesh = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
      for (let i = 0; i < b.matrices.length; i += 1) mesh.setMatrixAt(i, b.matrices[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `${namePrefix}:${key.split('|')[0]}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------------------
// Scene-level greeble field.
// ---------------------------------------------------------------------------

type FieldBucket = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** World-space matrices contributed by every owner, rebuilt on commit. */
  mesh: THREE.InstancedMesh | null;
  small: boolean;
};

/**
 * One instanced pool of hardware detail for the whole colony.
 *
 * A per-entity builder is the wrong granularity: four survey stakes carrying
 * identical bolts paid four draw calls for them, and the settlement's greebles
 * alone cost ~34 instanced meshes. This holds the details for every Aurora
 * object in world space, so the cost is the number of distinct
 * geometry+material combinations — three or four — no matter how many objects
 * are dressed.
 *
 * Owners re-emit on placement (which happens on layout, never per frame) and
 * the field rebuilds its meshes once. `setDetailVisible` drops the small stuff
 * at distance without touching the silhouette.
 */
export class AuroraGreebleField {
  readonly group = new THREE.Group();

  private readonly buckets = new Map<string, FieldBucket>();
  /** ownerId -> bucketKey -> world matrices. */
  private readonly owners = new Map<string, Map<string, THREE.Matrix4[]>>();
  private readonly scratch = new THREE.Matrix4();
  private dirty = false;
  private detailVisible = true;

  constructor() {
    this.group.name = 'Aurora Greeble Field';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
  }

  /**
   * Replace an owner's contribution. `worldMatrix` places the locally authored
   * details into the world; pass the owner's group matrixWorld.
   */
  emit(
    ownerId: string,
    worldMatrix: THREE.Matrix4,
    build: (b: GreebleBuilder) => void
  ): void {
    const builder = new GreebleBuilder();
    build(builder);
    const byKey = new Map<string, THREE.Matrix4[]>();
    for (const [key, bucket] of builder.drain()) {
      let bk = this.buckets.get(key);
      if (!bk) {
        bk = {
          geometry: bucket.geometry,
          material: bucket.material,
          mesh: null,
          // Bolts and cable segments are the first thing to drop at range.
          small: key.startsWith('bolt') || key.startsWith('cable')
        };
        this.buckets.set(key, bk);
      }
      const world = bucket.matrices.map((m) => new THREE.Matrix4().multiplyMatrices(worldMatrix, m));
      byKey.set(key, world);
    }
    this.owners.set(ownerId, byKey);
    this.dirty = true;
  }

  /** Rebuild the instanced meshes. Cheap and only runs after a layout change. */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const [key, bucket] of this.buckets) {
      let total = 0;
      for (const owner of this.owners.values()) total += owner.get(key)?.length ?? 0;
      if (bucket.mesh && bucket.mesh.count >= total && bucket.mesh.instanceMatrix.count >= total) {
        let i = 0;
        for (const owner of this.owners.values()) {
          for (const m of owner.get(key) ?? []) bucket.mesh.setMatrixAt(i++, m);
        }
        // Park unused slots rather than reallocating the buffer.
        this.scratch.makeScale(0, 0, 0);
        for (; i < bucket.mesh.count; i += 1) bucket.mesh.setMatrixAt(i, this.scratch);
        bucket.mesh.instanceMatrix.needsUpdate = true;
        continue;
      }
      if (bucket.mesh) {
        this.group.remove(bucket.mesh);
        bucket.mesh.dispose();
        bucket.mesh = null;
      }
      if (total === 0) continue;
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, total);
      let i = 0;
      for (const owner of this.owners.values()) {
        for (const m of owner.get(key) ?? []) mesh.setMatrixAt(i++, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `aurora-greeble:${key.split('|')[0]}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.computeBoundingSphere();
      mesh.visible = bucket.small ? this.detailVisible : true;
      bucket.mesh = mesh;
      this.group.add(mesh);
    }
  }

  /**
   * Drop the sub-centimetre detail at range. Silhouette parts (feet, visors,
   * antennas, hoses, insulators) are never hidden by this.
   */
  setDetailVisible(visible: boolean): void {
    if (visible === this.detailVisible) return;
    this.detailVisible = visible;
    for (const bucket of this.buckets.values()) {
      if (bucket.small && bucket.mesh) bucket.mesh.visible = visible;
    }
  }

  get drawCallCount(): number {
    let n = 0;
    for (const b of this.buckets.values()) if (b.mesh) n += 1;
    return n;
  }

  get smallDetailHidden(): boolean {
    return !this.detailVisible;
  }
}

/** The colony's single greeble pool. */
export const auroraGreebleField = new AuroraGreebleField();
