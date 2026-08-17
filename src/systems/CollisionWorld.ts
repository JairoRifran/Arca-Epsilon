import * as THREE from 'three';

export const COLLISION_CATEGORY = {
  CHARACTER_SOLID: 'CHARACTER_SOLID',
  SHIP_SOLID: 'SHIP_SOLID',
  STATIC_WORLD: 'STATIC_WORLD',
  DYNAMIC_SOLID: 'DYNAMIC_SOLID',
  TERRAIN: 'TERRAIN',
  TRIGGER: 'TRIGGER',
  INTERACTION: 'INTERACTION',
  PROJECTILE_ONLY: 'PROJECTILE_ONLY',
  VISUAL_ONLY: 'VISUAL_ONLY'
} as const;

export type CollisionCategory = typeof COLLISION_CATEGORY[keyof typeof COLLISION_CATEGORY];
export type CollisionActor = 'character' | 'ship';

export type CollisionTuning = {
  characterRadius: number;
  characterHeight: number;
  stepHeight: number;
  maxSlopeDegrees: number;
  groundSnap: number;
  penetrationTolerance: number;
  characterIterations: number;
  shipIterations: number;
  shipTerrainClearance: number;
};

export const DEFAULT_COLLISION_TUNING: CollisionTuning = {
  characterRadius: 0.42,
  characterHeight: 1.82,
  stepHeight: 0.42,
  maxSlopeDegrees: 48,
  groundSnap: 0.34,
  penetrationTolerance: 0.012,
  characterIterations: 4,
  shipIterations: 3,
  shipTerrainClearance: 2.95
};

type ColliderEnabled = () => boolean;

type ColliderBase = {
  readonly id: string;
  readonly category: CollisionCategory;
  readonly dynamic: boolean;
  readonly blocksCharacter: boolean;
  readonly blocksShip: boolean;
  readonly owner?: THREE.Object3D;
  readonly enabled?: ColliderEnabled;
  readonly localCenter: THREE.Vector3;
  readonly worldCenter: THREE.Vector3;
  readonly worldQuaternion: THREE.Quaternion;
  readonly inverseWorldQuaternion: THREE.Quaternion;
  readonly worldScale: THREE.Vector3;
  boundRadius: number;
  queryStamp: number;
};

type BoxCollider = ColliderBase & {
  readonly shape: 'box';
  readonly halfExtents: THREE.Vector3;
  readonly worldHalfExtents: THREE.Vector3;
};

type SphereCollider = ColliderBase & {
  readonly shape: 'sphere';
  radius: number;
  worldRadius: number;
};

type RampCollider = ColliderBase & {
  readonly shape: 'ramp';
  halfWidth: number;
  halfLength: number;
  bottomHeight: number;
  topHeight: number;
};

type CollisionCollider = BoxCollider | SphereCollider | RampCollider;

export type BoxColliderOptions = {
  id: string;
  category: CollisionCategory;
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  dynamic?: boolean;
  blocksCharacter?: boolean;
  blocksShip?: boolean;
  owner?: THREE.Object3D;
  enabled?: ColliderEnabled;
};

export type SphereColliderOptions = {
  id: string;
  category: CollisionCategory;
  center: readonly [number, number, number];
  radius: number;
  dynamic?: boolean;
  blocksCharacter?: boolean;
  blocksShip?: boolean;
  owner?: THREE.Object3D;
  enabled?: ColliderEnabled;
};

export type RampColliderOptions = {
  id: string;
  category: CollisionCategory;
  center: readonly [number, number, number];
  halfWidth: number;
  halfLength: number;
  bottomHeight: number;
  topHeight: number;
  dynamic?: boolean;
  owner?: THREE.Object3D;
  enabled?: ColliderEnabled;
};

export type ShipSphereDefinition = {
  readonly offset: THREE.Vector3;
  readonly radius: number;
};

export type CharacterCollisionResult = {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly lastSafePosition: THREE.Vector3;
  grounded: boolean;
  slopeDegrees: number;
  contact: boolean;
  penetration: number;
  iterations: number;
  candidates: number;
  collidedWith: string;
  restoredToSafe: boolean;
};

export type ShipCollisionResult = {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly lastSafePosition: THREE.Vector3;
  impact: boolean;
  timeOfImpact: number;
  penetration: number;
  iterations: number;
  candidates: number;
  substeps: number;
  sweptDistance: number;
  collidedWith: string;
  restoredToSafe: boolean;
};

export type CollisionWorldDiagnostics = {
  ready: boolean;
  staticColliders: number;
  dynamicColliders: number;
  triggers: number;
  interactions: number;
  queriesThisFrame: number;
  queryCandidates: number;
  collisionTimeMs: number;
  restoreCorrections: number;
  duplicateRegistrations: number;
  resourcesReleased: number;
  debugVisible: boolean;
};

type SweepHit = {
  hit: boolean;
  t: number;
  penetration: number;
  collider?: CollisionCollider;
  readonly normal: THREE.Vector3;
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function createCharacterCollisionResult(): CharacterCollisionResult {
  return {
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    lastSafePosition: new THREE.Vector3(),
    grounded: true,
    slopeDegrees: 0,
    contact: false,
    penetration: 0,
    iterations: 0,
    candidates: 0,
    collidedWith: '',
    restoredToSafe: false
  };
}

export function createShipCollisionResult(): ShipCollisionResult {
  return {
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    lastSafePosition: new THREE.Vector3(),
    impact: false,
    timeOfImpact: 1,
    penetration: 0,
    iterations: 0,
    candidates: 0,
    substeps: 1,
    sweptDistance: 0,
    collidedWith: '',
    restoredToSafe: false
  };
}

/**
 * Kinematic collision world for the two player controllers. Geometry is
 * represented by authored primitive volumes and queried through a static
 * spatial hash plus a deliberately small dynamic list.
 */
export class CollisionWorld {
  readonly tuning: CollisionTuning;

  private readonly colliders: CollisionCollider[] = [];
  private readonly colliderById = new Map<string, CollisionCollider>();
  private readonly staticGrid = new Map<number, CollisionCollider[]>();
  private readonly dynamicColliders: CollisionCollider[] = [];
  private readonly rampColliders: RampCollider[] = [];
  private readonly candidates: CollisionCollider[] = [];
  private readonly cellSize: number;
  private queryStamp = 1;

  private readonly remaining = new THREE.Vector3();
  private readonly segmentStart = new THREE.Vector3();
  private readonly segmentEnd = new THREE.Vector3();
  private readonly localStart = new THREE.Vector3();
  private readonly localEnd = new THREE.Vector3();
  private readonly localDelta = new THREE.Vector3();
  private readonly localNormal = new THREE.Vector3();
  private readonly worldNormal = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly terrainNormal = new THREE.Vector3(0, 1, 0);
  private readonly sphereStart = new THREE.Vector3();
  private readonly sphereEnd = new THREE.Vector3();
  private readonly shipOffset = new THREE.Vector3();
  private readonly hit: SweepHit = { hit: false, t: 1, penetration: 0, normal: new THREE.Vector3() };
  private readonly testHit: SweepHit = { hit: false, t: 1, penetration: 0, normal: new THREE.Vector3() };
  private readonly safeCharacterPosition = new THREE.Vector3();
  private readonly safeShipPosition = new THREE.Vector3();
  private hasSafeCharacterPosition = false;
  private hasSafeShipPosition = false;

  private readonly debugGroup = new THREE.Group();
  private readonly debugMeshes: THREE.Object3D[] = [];
  private readonly debugCharacter = new THREE.Mesh(
    new THREE.CapsuleGeometry(DEFAULT_COLLISION_TUNING.characterRadius, DEFAULT_COLLISION_TUNING.characterHeight - DEFAULT_COLLISION_TUNING.characterRadius * 2, 4, 8),
    new THREE.MeshBasicMaterial({ color: 0x5bc7ff, wireframe: true, transparent: true, opacity: 0.62, depthTest: false })
  );
  private readonly debugCharacterSafe = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x63f2a6, depthTest: false })
  );
  private readonly debugShipSafe = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, depthTest: false })
  );
  private readonly debugShipSpheres: THREE.Mesh[] = [];
  private readonly debugNormalLine: THREE.Line;
  private readonly debugLinePositions = new Float32Array(6);

  readonly diagnostics: CollisionWorldDiagnostics = {
    ready: false,
    staticColliders: 0,
    dynamicColliders: 0,
    triggers: 0,
    interactions: 0,
    queriesThisFrame: 0,
    queryCandidates: 0,
    collisionTimeMs: 0,
    restoreCorrections: 0,
    duplicateRegistrations: 0,
    resourcesReleased: 0,
    debugVisible: false
  };

  constructor(tuning: Partial<CollisionTuning> = {}, cellSize = 64) {
    this.tuning = { ...DEFAULT_COLLISION_TUNING, ...tuning };
    this.cellSize = cellSize;
    this.debugGroup.name = 'Collision Debug View';
    this.debugGroup.visible = false;
    this.debugCharacter.name = 'Character Collision Capsule';
    this.debugGroup.add(this.debugCharacter);
    this.debugCharacterSafe.name = 'Character Last Safe Position';
    this.debugShipSafe.name = 'Ship Last Safe Position';
    this.debugGroup.add(this.debugCharacterSafe, this.debugShipSafe);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.debugLinePositions, 3));
    this.debugNormalLine = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffd36a, depthTest: false, transparent: true, opacity: 0.9 })
    );
    this.debugNormalLine.name = 'Collision Contact Normal';
    this.debugGroup.add(this.debugNormalLine);
  }

  beginFrame(): void {
    this.diagnostics.queriesThisFrame = 0;
    this.diagnostics.queryCandidates = 0;
    this.diagnostics.collisionTimeMs = 0;
  }

  registerBox(options: BoxColliderOptions): boolean {
    if (this.colliderById.has(options.id)) {
      this.diagnostics.duplicateRegistrations += 1;
      return false;
    }
    const collider: BoxCollider = {
      id: options.id,
      category: options.category,
      shape: 'box',
      dynamic: options.dynamic ?? Boolean(options.owner),
      blocksCharacter: options.blocksCharacter ?? true,
      blocksShip: options.blocksShip ?? true,
      owner: options.owner,
      enabled: options.enabled,
      localCenter: new THREE.Vector3(...options.center),
      worldCenter: new THREE.Vector3(),
      worldQuaternion: new THREE.Quaternion(),
      inverseWorldQuaternion: new THREE.Quaternion(),
      worldScale: new THREE.Vector3(1, 1, 1),
      halfExtents: new THREE.Vector3(...options.halfExtents),
      worldHalfExtents: new THREE.Vector3(...options.halfExtents),
      boundRadius: 0,
      queryStamp: 0
    };
    this.installCollider(collider);
    return true;
  }

  registerSphere(options: SphereColliderOptions): boolean {
    if (this.colliderById.has(options.id)) {
      this.diagnostics.duplicateRegistrations += 1;
      return false;
    }
    const collider: SphereCollider = {
      id: options.id,
      category: options.category,
      shape: 'sphere',
      dynamic: options.dynamic ?? Boolean(options.owner),
      blocksCharacter: options.blocksCharacter ?? true,
      blocksShip: options.blocksShip ?? true,
      owner: options.owner,
      enabled: options.enabled,
      localCenter: new THREE.Vector3(...options.center),
      worldCenter: new THREE.Vector3(),
      worldQuaternion: new THREE.Quaternion(),
      inverseWorldQuaternion: new THREE.Quaternion(),
      worldScale: new THREE.Vector3(1, 1, 1),
      radius: options.radius,
      worldRadius: options.radius,
      boundRadius: options.radius,
      queryStamp: 0
    };
    this.installCollider(collider);
    return true;
  }

  registerRamp(options: RampColliderOptions): boolean {
    if (this.colliderById.has(options.id)) {
      this.diagnostics.duplicateRegistrations += 1;
      return false;
    }
    const collider: RampCollider = {
      id: options.id,
      category: options.category,
      shape: 'ramp',
      dynamic: options.dynamic ?? Boolean(options.owner),
      blocksCharacter: false,
      blocksShip: true,
      owner: options.owner,
      enabled: options.enabled,
      localCenter: new THREE.Vector3(...options.center),
      worldCenter: new THREE.Vector3(),
      worldQuaternion: new THREE.Quaternion(),
      inverseWorldQuaternion: new THREE.Quaternion(),
      worldScale: new THREE.Vector3(1, 1, 1),
      halfWidth: options.halfWidth,
      halfLength: options.halfLength,
      bottomHeight: options.bottomHeight,
      topHeight: options.topHeight,
      boundRadius: Math.hypot(options.halfWidth, options.halfLength),
      queryStamp: 0
    };
    this.installCollider(collider);
    return true;
  }

  unregister(id: string): boolean {
    const collider = this.colliderById.get(id);
    if (!collider) return false;
    this.colliderById.delete(id);
    const index = this.colliders.indexOf(collider);
    if (index >= 0) this.colliders.splice(index, 1);
    const dynamicIndex = this.dynamicColliders.indexOf(collider);
    if (dynamicIndex >= 0) this.dynamicColliders.splice(dynamicIndex, 1);
    const rampIndex = this.rampColliders.indexOf(collider as RampCollider);
    if (rampIndex >= 0) this.rampColliders.splice(rampIndex, 1);
    if (!collider.dynamic) this.rebuildStaticGrid();
    this.diagnostics.resourcesReleased += 1;
    this.refreshCounts();
    return true;
  }

  markReady(): void {
    this.diagnostics.ready = true;
  }

  moveCharacter(
    start: THREE.Vector3,
    displacement: THREE.Vector3,
    velocity: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number,
    result: CharacterCollisionResult
  ): CharacterCollisionResult {
    const startedAt = performance.now();
    result.position.copy(start);
    result.normal.set(0, 1, 0);
    result.contact = false;
    result.penetration = 0;
    result.iterations = 0;
    result.candidates = 0;
    result.collidedWith = '';
    result.restoredToSafe = false;

    this.remaining.copy(displacement);
    this.sampleWalkableNormal(start.x + displacement.x, start.z + displacement.z, getTerrainHeight, this.terrainNormal);
    const intendedSlope = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(this.terrainNormal.y, -1, 1)));
    if (intendedSlope > this.tuning.maxSlopeDegrees) {
      this.push.set(-this.terrainNormal.x, 0, -this.terrainNormal.z);
      if (this.push.lengthSq() > 1e-8) {
        this.push.normalize();
        const uphill = this.remaining.dot(this.push);
        if (uphill > 0) this.remaining.addScaledVector(this.push, -uphill);
      }
    }
    const broadRadius = displacement.length() + this.tuning.characterRadius + 1;
    this.collectCandidates(start.x + displacement.x * 0.5, start.z + displacement.z * 0.5, broadRadius, 'character');
    result.candidates = this.candidates.length;

    this.depenetrateCharacterPosition(result.position, getTerrainHeight, result);

    for (let iteration = 0; iteration < this.tuning.characterIterations; iteration += 1) {
      result.iterations = iteration + 1;
      if (this.remaining.lengthSq() < 1e-8) break;
      this.segmentStart.copy(result.position);
      this.segmentEnd.copy(result.position).add(this.remaining);
      this.resetHit(this.hit);

      for (let index = 0; index < this.candidates.length; index += 1) {
        const collider = this.candidates[index];
        if (collider.shape === 'ramp') continue;
        if (!this.characterVerticalOverlap(this.segmentStart.y, collider)) continue;
        this.sweepCharacterCircle(collider, this.segmentStart, this.segmentEnd, this.testHit);
        if (this.testHit.hit && this.testHit.t < this.hit.t) this.copyHit(this.hit, this.testHit);
      }

      if (!this.hit.hit) {
        result.position.add(this.remaining);
        break;
      }

      result.contact = true;
      result.collidedWith = this.hit.collider?.id ?? 'terrain';
      result.normal.copy(this.hit.normal);
      result.penetration = Math.max(result.penetration, this.hit.penetration);
      const safeT = Math.max(0, this.hit.t - 0.002);
      result.position.addScaledVector(this.remaining, safeT);
      this.remaining.multiplyScalar(1 - safeT);
      const inward = this.remaining.dot(this.hit.normal);
      if (inward < 0) this.remaining.addScaledVector(this.hit.normal, -inward);
      const inwardVelocity = velocity.dot(this.hit.normal);
      if (inwardVelocity < 0) velocity.addScaledVector(this.hit.normal, -inwardVelocity);
    }

    const terrainHeight = this.sampleWalkableHeight(result.position.x, result.position.z, getTerrainHeight);
    this.sampleWalkableNormal(result.position.x, result.position.z, getTerrainHeight, this.terrainNormal);
    result.slopeDegrees = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(this.terrainNormal.y, -1, 1)));
    result.grounded = true;
    result.position.y = terrainHeight + 0.04;

    if (!this.characterOverlapsAny(result.position)) {
      this.safeCharacterPosition.copy(result.position);
      this.hasSafeCharacterPosition = true;
    } else if (this.hasSafeCharacterPosition) {
      result.position.copy(this.safeCharacterPosition);
      result.restoredToSafe = true;
    }
    result.lastSafePosition.copy(this.hasSafeCharacterPosition ? this.safeCharacterPosition : result.position);
    this.finishQuery(startedAt, result.candidates);
    return result;
  }

  moveShip(
    start: THREE.Vector3,
    displacement: THREE.Vector3,
    velocity: THREE.Vector3,
    quaternion: THREE.Quaternion,
    compound: readonly ShipSphereDefinition[],
    getTerrainHeight: ((x: number, z: number) => number) | undefined,
    result: ShipCollisionResult
  ): ShipCollisionResult {
    const startedAt = performance.now();
    result.position.copy(start);
    result.normal.set(0, 0, 0);
    result.impact = false;
    result.timeOfImpact = 1;
    result.penetration = 0;
    result.iterations = 0;
    result.candidates = 0;
    result.sweptDistance = displacement.length();
    result.substeps = getTerrainHeight && result.sweptDistance > 3
      ? Math.min(8, Math.max(1, Math.ceil(result.sweptDistance / 3)))
      : 1;
    result.collidedWith = '';
    result.restoredToSafe = false;

    let compoundRadius = 0;
    for (let index = 0; index < compound.length; index += 1) {
      compoundRadius = Math.max(compoundRadius, compound[index].offset.length() + compound[index].radius);
    }
    this.collectCandidates(
      start.x + displacement.x * 0.5,
      start.z + displacement.z * 0.5,
      result.sweptDistance * 0.5 + compoundRadius + 2,
      'ship'
    );
    result.candidates = this.candidates.length;

    this.depenetrateShipPosition(result.position, quaternion, compound, getTerrainHeight, result);
    this.remaining.copy(displacement);

    for (let iteration = 0; iteration < this.tuning.shipIterations; iteration += 1) {
      result.iterations = iteration + 1;
      if (this.remaining.lengthSq() < 1e-8) break;
      this.resetHit(this.hit);
      for (let sphereIndex = 0; sphereIndex < compound.length; sphereIndex += 1) {
        const sphere = compound[sphereIndex];
        this.shipOffset.copy(sphere.offset).applyQuaternion(quaternion);
        this.sphereStart.copy(result.position).add(this.shipOffset);
        this.sphereEnd.copy(this.sphereStart).add(this.remaining);
        for (let colliderIndex = 0; colliderIndex < this.candidates.length; colliderIndex += 1) {
          const collider = this.candidates[colliderIndex];
          if (collider.shape === 'ramp') {
            this.sweepSphereAgainstBoxLikeRamp(this.sphereStart, this.sphereEnd, sphere.radius, collider, this.testHit);
          } else {
            this.sweepSphere(collider, this.sphereStart, this.sphereEnd, sphere.radius, this.testHit);
          }
          if (this.testHit.hit && this.testHit.t < this.hit.t) this.copyHit(this.hit, this.testHit);
        }
      }

      if (getTerrainHeight) {
        this.sweepShipTerrain(result.position, this.remaining, getTerrainHeight, result.substeps, this.testHit);
        if (this.testHit.hit && this.testHit.t < this.hit.t) this.copyHit(this.hit, this.testHit);
      }

      if (!this.hit.hit) {
        result.position.add(this.remaining);
        break;
      }

      result.impact = true;
      result.timeOfImpact = Math.min(result.timeOfImpact, this.hit.t);
      result.normal.copy(this.hit.normal);
      result.penetration = Math.max(result.penetration, this.hit.penetration);
      result.collidedWith = this.hit.collider?.id ?? 'terrain';
      const safeT = Math.max(0, this.hit.t - 0.0015);
      result.position.addScaledVector(this.remaining, safeT);
      this.remaining.multiplyScalar(1 - safeT);
      const inward = this.remaining.dot(this.hit.normal);
      if (inward < 0) this.remaining.addScaledVector(this.hit.normal, -inward);
      const inwardVelocity = velocity.dot(this.hit.normal);
      if (inwardVelocity < 0) velocity.addScaledVector(this.hit.normal, -inwardVelocity);
      result.position.addScaledVector(this.hit.normal, this.tuning.penetrationTolerance);
    }

    if (!this.shipOverlapsAny(result.position, quaternion, compound, getTerrainHeight)) {
      this.safeShipPosition.copy(result.position);
      this.hasSafeShipPosition = true;
    } else if (this.hasSafeShipPosition) {
      result.position.copy(this.safeShipPosition);
      velocity.set(0, 0, 0);
      result.restoredToSafe = true;
    }
    result.lastSafePosition.copy(this.hasSafeShipPosition ? this.safeShipPosition : result.position);
    this.finishQuery(startedAt, result.candidates);
    return result;
  }

  normalizeCharacter(
    position: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number,
    result: CharacterCollisionResult
  ): boolean {
    this.collectCandidates(position.x, position.z, this.tuning.characterRadius + 4, 'character');
    result.position.copy(position);
    result.contact = false;
    result.penetration = 0;
    result.collidedWith = '';
    const changed = this.depenetrateCharacterPosition(result.position, getTerrainHeight, result);
    result.position.y = this.sampleWalkableHeight(result.position.x, result.position.z, getTerrainHeight) + 0.04;
    if (changed) this.diagnostics.restoreCorrections += 1;
    if (!this.characterOverlapsAny(result.position)) {
      this.safeCharacterPosition.copy(result.position);
      this.hasSafeCharacterPosition = true;
    }
    result.lastSafePosition.copy(this.hasSafeCharacterPosition ? this.safeCharacterPosition : result.position);
    return changed;
  }

  normalizeShip(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    compound: readonly ShipSphereDefinition[],
    getTerrainHeight: ((x: number, z: number) => number) | undefined,
    result: ShipCollisionResult
  ): boolean {
    let radius = 0;
    for (let index = 0; index < compound.length; index += 1) {
      radius = Math.max(radius, compound[index].offset.length() + compound[index].radius);
    }
    this.collectCandidates(position.x, position.z, radius + 4, 'ship');
    result.position.copy(position);
    result.impact = false;
    result.penetration = 0;
    result.collidedWith = '';
    const changed = this.depenetrateShipPosition(result.position, quaternion, compound, getTerrainHeight, result);
    if (changed) this.diagnostics.restoreCorrections += 1;
    if (!this.shipOverlapsAny(result.position, quaternion, compound, getTerrainHeight)) {
      this.safeShipPosition.copy(result.position);
      this.hasSafeShipPosition = true;
    }
    result.lastSafePosition.copy(this.hasSafeShipPosition ? this.safeShipPosition : result.position);
    return changed;
  }

  setSafeCharacterPosition(position: THREE.Vector3): void {
    this.safeCharacterPosition.copy(position);
    this.hasSafeCharacterPosition = true;
  }

  setSafeShipPosition(position: THREE.Vector3): void {
    this.safeShipPosition.copy(position);
    this.hasSafeShipPosition = true;
  }

  setDebugVisible(
    scene: THREE.Scene,
    visible: boolean,
    characterPosition?: THREE.Vector3,
    shipPosition?: THREE.Vector3,
    shipQuaternion?: THREE.Quaternion,
    compound?: readonly ShipSphereDefinition[]
  ): void {
    if (this.debugGroup.parent !== scene) scene.add(this.debugGroup);
    this.debugGroup.visible = visible;
    this.diagnostics.debugVisible = visible;
    if (!visible) return;
    this.rebuildDebugMeshes(shipPosition ?? characterPosition);
    if (characterPosition) {
      this.debugCharacter.visible = true;
      this.debugCharacter.position.copy(characterPosition).addScaledVector(Y_AXIS, this.tuning.characterHeight * 0.5);
    } else {
      this.debugCharacter.visible = false;
    }
    if (shipPosition && shipQuaternion && compound) {
      this.ensureDebugShipSpheres(compound.length);
      for (let index = 0; index < compound.length; index += 1) {
        const definition = compound[index];
        const mesh = this.debugShipSpheres[index];
        mesh.visible = true;
        mesh.position.copy(definition.offset).applyQuaternion(shipQuaternion).add(shipPosition);
        mesh.scale.setScalar(definition.radius);
      }
    }
    this.debugCharacterSafe.visible = this.hasSafeCharacterPosition;
    this.debugShipSafe.visible = this.hasSafeShipPosition;
    if (this.hasSafeCharacterPosition) this.debugCharacterSafe.position.copy(this.safeCharacterPosition);
    if (this.hasSafeShipPosition) this.debugShipSafe.position.copy(this.safeShipPosition);
  }

  updateDebug(characterPosition: THREE.Vector3, shipPosition: THREE.Vector3, shipQuaternion: THREE.Quaternion, compound: readonly ShipSphereDefinition[], normal?: THREE.Vector3): void {
    if (!this.debugGroup.visible) return;
    this.debugCharacter.position.copy(characterPosition).addScaledVector(Y_AXIS, this.tuning.characterHeight * 0.5);
    this.ensureDebugShipSpheres(compound.length);
    for (let index = 0; index < compound.length; index += 1) {
      const definition = compound[index];
      this.debugShipSpheres[index].position.copy(definition.offset).applyQuaternion(shipQuaternion).add(shipPosition);
      this.debugShipSpheres[index].scale.setScalar(definition.radius);
    }
    const contactNormal = normal ?? this.worldNormal.set(0, 1, 0);
    this.debugCharacterSafe.visible = this.hasSafeCharacterPosition;
    this.debugShipSafe.visible = this.hasSafeShipPosition;
    if (this.hasSafeCharacterPosition) this.debugCharacterSafe.position.copy(this.safeCharacterPosition);
    if (this.hasSafeShipPosition) this.debugShipSafe.position.copy(this.safeShipPosition);
    this.debugLinePositions[0] = shipPosition.x;
    this.debugLinePositions[1] = shipPosition.y;
    this.debugLinePositions[2] = shipPosition.z;
    this.debugLinePositions[3] = shipPosition.x + contactNormal.x * 8;
    this.debugLinePositions[4] = shipPosition.y + contactNormal.y * 8;
    this.debugLinePositions[5] = shipPosition.z + contactNormal.z * 8;
    const attribute = this.debugNormalLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
  }

  getColliderState(id: string): {
    id: string;
    enabled: boolean;
    category: CollisionCategory;
    shape: string;
    center: [number, number, number];
    boundRadius: number;
  } | undefined {
    const collider = this.colliderById.get(id);
    if (!collider) return undefined;
    if (collider.dynamic) this.updateColliderTransform(collider);
    return {
      id,
      enabled: this.isEnabled(collider),
      category: collider.category,
      shape: collider.shape,
      center: [collider.worldCenter.x, collider.worldCenter.y, collider.worldCenter.z],
      boundRadius: collider.boundRadius
    };
  }

  dispose(scene?: THREE.Scene): void {
    if (scene && this.debugGroup.parent === scene) scene.remove(this.debugGroup);
    this.releaseDebugMeshes();
    this.disposeMesh(this.debugCharacter);
    this.disposeMesh(this.debugCharacterSafe);
    this.disposeMesh(this.debugShipSafe);
    this.debugNormalLine.geometry.dispose();
    (this.debugNormalLine.material as THREE.Material).dispose();
    for (let index = 0; index < this.debugShipSpheres.length; index += 1) {
      this.disposeMesh(this.debugShipSpheres[index]);
    }
    this.debugShipSpheres.length = 0;
    this.diagnostics.resourcesReleased += this.colliders.length;
    this.colliders.length = 0;
    this.dynamicColliders.length = 0;
    this.rampColliders.length = 0;
    this.candidates.length = 0;
    this.colliderById.clear();
    this.staticGrid.clear();
    this.refreshCounts();
    this.diagnostics.ready = false;
  }

  private installCollider(collider: CollisionCollider): void {
    this.updateColliderTransform(collider);
    this.colliders.push(collider);
    this.colliderById.set(collider.id, collider);
    if (collider.shape === 'ramp') this.rampColliders.push(collider);
    if (collider.dynamic) this.dynamicColliders.push(collider);
    else this.insertStaticCollider(collider);
    this.refreshCounts();
  }

  private refreshCounts(): void {
    let staticCount = 0;
    let triggers = 0;
    let interactions = 0;
    for (let index = 0; index < this.colliders.length; index += 1) {
      const collider = this.colliders[index];
      if (!collider.dynamic) staticCount += 1;
      if (collider.category === COLLISION_CATEGORY.TRIGGER) triggers += 1;
      if (collider.category === COLLISION_CATEGORY.INTERACTION) interactions += 1;
    }
    this.diagnostics.staticColliders = staticCount;
    this.diagnostics.dynamicColliders = this.dynamicColliders.length;
    this.diagnostics.triggers = triggers;
    this.diagnostics.interactions = interactions;
  }

  private rebuildStaticGrid(): void {
    this.staticGrid.clear();
    for (let index = 0; index < this.colliders.length; index += 1) {
      const collider = this.colliders[index];
      if (!collider.dynamic) this.insertStaticCollider(collider);
    }
  }

  private insertStaticCollider(collider: CollisionCollider): void {
    const minX = Math.floor((collider.worldCenter.x - collider.boundRadius) / this.cellSize);
    const maxX = Math.floor((collider.worldCenter.x + collider.boundRadius) / this.cellSize);
    const minZ = Math.floor((collider.worldCenter.z - collider.boundRadius) / this.cellSize);
    const maxZ = Math.floor((collider.worldCenter.z + collider.boundRadius) / this.cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = this.cellKey(x, z);
        let bucket = this.staticGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.staticGrid.set(key, bucket);
        }
        bucket.push(collider);
      }
    }
  }

  private collectCandidates(x: number, z: number, radius: number, actor: CollisionActor): void {
    this.candidates.length = 0;
    this.queryStamp += 1;
    if (this.queryStamp >= 2_000_000_000) {
      this.queryStamp = 1;
      for (let index = 0; index < this.colliders.length; index += 1) this.colliders[index].queryStamp = 0;
    }
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const bucket = this.staticGrid.get(this.cellKey(cellX, cellZ));
        if (!bucket) continue;
        for (let index = 0; index < bucket.length; index += 1) {
          const collider = bucket[index];
          if (collider.queryStamp === this.queryStamp) continue;
          collider.queryStamp = this.queryStamp;
          if (!this.blocksActor(collider, actor) || !this.isEnabled(collider)) continue;
          this.candidates.push(collider);
        }
      }
    }
    for (let index = 0; index < this.dynamicColliders.length; index += 1) {
      const collider = this.dynamicColliders[index];
      if (!this.blocksActor(collider, actor) || !this.isEnabled(collider)) continue;
      this.updateColliderTransform(collider);
      const dx = collider.worldCenter.x - x;
      const dz = collider.worldCenter.z - z;
      const range = radius + collider.boundRadius;
      if (dx * dx + dz * dz <= range * range) this.candidates.push(collider);
    }
  }

  private blocksActor(collider: CollisionCollider, actor: CollisionActor): boolean {
    if (collider.category === COLLISION_CATEGORY.TRIGGER || collider.category === COLLISION_CATEGORY.INTERACTION || collider.category === COLLISION_CATEGORY.PROJECTILE_ONLY || collider.category === COLLISION_CATEGORY.VISUAL_ONLY) return false;
    return actor === 'character' ? collider.blocksCharacter : collider.blocksShip;
  }

  private isEnabled(collider: CollisionCollider): boolean {
    if (collider.enabled && !collider.enabled()) return false;
    if (collider.owner && !collider.owner.visible) return false;
    return true;
  }

  private updateColliderTransform(collider: CollisionCollider): void {
    if (!collider.owner) {
      collider.worldCenter.copy(collider.localCenter);
      collider.worldQuaternion.identity();
      collider.inverseWorldQuaternion.identity();
      collider.worldScale.set(1, 1, 1);
    } else {
      collider.owner.updateWorldMatrix(true, false);
      collider.worldCenter.copy(collider.localCenter).applyMatrix4(collider.owner.matrixWorld);
      collider.owner.getWorldQuaternion(collider.worldQuaternion);
      collider.inverseWorldQuaternion.copy(collider.worldQuaternion).invert();
      collider.owner.getWorldScale(collider.worldScale);
    }
    if (collider.shape === 'box') {
      collider.worldHalfExtents.set(
        Math.abs(collider.halfExtents.x * collider.worldScale.x),
        Math.abs(collider.halfExtents.y * collider.worldScale.y),
        Math.abs(collider.halfExtents.z * collider.worldScale.z)
      );
      collider.boundRadius = collider.worldHalfExtents.length();
    } else if (collider.shape === 'sphere') {
      collider.worldRadius = collider.radius * Math.max(Math.abs(collider.worldScale.x), Math.abs(collider.worldScale.y), Math.abs(collider.worldScale.z));
      collider.boundRadius = collider.worldRadius;
    } else {
      collider.boundRadius = Math.hypot(collider.halfWidth * Math.abs(collider.worldScale.x), collider.halfLength * Math.abs(collider.worldScale.z));
    }
  }

  private characterVerticalOverlap(feetY: number, collider: CollisionCollider): boolean {
    const minY = feetY + 0.02;
    const maxY = feetY + this.tuning.characterHeight;
    if (collider.shape === 'sphere') {
      return maxY >= collider.worldCenter.y - collider.worldRadius && minY <= collider.worldCenter.y + collider.worldRadius;
    }
    if (collider.shape === 'ramp') return false;
    return maxY >= collider.worldCenter.y - collider.worldHalfExtents.y && minY <= collider.worldCenter.y + collider.worldHalfExtents.y;
  }

  private sweepCharacterCircle(collider: BoxCollider | SphereCollider, start: THREE.Vector3, end: THREE.Vector3, output: SweepHit): void {
    this.resetHit(output);
    if (collider.shape === 'sphere') {
      this.sweepCircleAgainstCircle(start, end, collider.worldCenter, this.tuning.characterRadius + collider.worldRadius, output);
    } else {
      this.sweepCircleAgainstBox(start, end, collider, this.tuning.characterRadius, output);
    }
    if (output.hit) output.collider = collider;
  }

  private sweepCircleAgainstCircle(start: THREE.Vector3, end: THREE.Vector3, center: THREE.Vector3, radius: number, output: SweepHit): void {
    const sx = start.x - center.x;
    const sz = start.z - center.z;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const c = sx * sx + sz * sz - radius * radius;
    if (c <= 0) {
      const distance = Math.hypot(sx, sz);
      output.hit = true;
      output.t = 0;
      output.penetration = radius - distance;
      if (distance > 1e-6) output.normal.set(sx / distance, 0, sz / distance);
      else if (Math.abs(dx) + Math.abs(dz) > 1e-6) output.normal.set(-dx, 0, -dz).normalize();
      else output.normal.set(1, 0, 0);
      return;
    }
    const a = dx * dx + dz * dz;
    if (a < 1e-10) return;
    const b = sx * dx + sz * dz;
    if (b >= 0) return;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (t < 0 || t > 1) return;
    const hx = sx + dx * t;
    const hz = sz + dz * t;
    const length = Math.hypot(hx, hz) || 1;
    output.hit = true;
    output.t = t;
    output.normal.set(hx / length, 0, hz / length);
  }

  private sweepCircleAgainstBox(start: THREE.Vector3, end: THREE.Vector3, collider: BoxCollider, radius: number, output: SweepHit): void {
    this.localStart.copy(start).sub(collider.worldCenter).applyQuaternion(collider.inverseWorldQuaternion);
    this.localEnd.copy(end).sub(collider.worldCenter).applyQuaternion(collider.inverseWorldQuaternion);
    this.localDelta.copy(this.localEnd).sub(this.localStart);
    const ex = collider.worldHalfExtents.x + radius;
    const ez = collider.worldHalfExtents.z + radius;
    const sx = this.localStart.x;
    const sz = this.localStart.z;
    if (Math.abs(sx) <= ex && Math.abs(sz) <= ez) {
      const px = ex - Math.abs(sx);
      const pz = ez - Math.abs(sz);
      output.hit = true;
      output.t = 0;
      output.penetration = Math.min(px, pz);
      if (px < pz) this.localNormal.set(Math.sign(sx) || -Math.sign(this.localDelta.x) || 1, 0, 0);
      else this.localNormal.set(0, 0, Math.sign(sz) || -Math.sign(this.localDelta.z) || 1);
      output.normal.copy(this.localNormal).applyQuaternion(collider.worldQuaternion).setY(0).normalize();
      return;
    }
    let tMin = 0;
    let tMax = 1;
    let axis = 0;
    let sign = 0;
    const dx = this.localDelta.x;
    if (Math.abs(dx) < 1e-9) {
      if (sx < -ex || sx > ex) return;
    } else {
      const tx1 = (-ex - sx) / dx;
      const tx2 = (ex - sx) / dx;
      const enter = Math.min(tx1, tx2);
      const exit = Math.max(tx1, tx2);
      if (enter > tMin) { tMin = enter; axis = 1; sign = dx > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    const dz = this.localDelta.z;
    if (Math.abs(dz) < 1e-9) {
      if (sz < -ez || sz > ez) return;
    } else {
      const tz1 = (-ez - sz) / dz;
      const tz2 = (ez - sz) / dz;
      const enter = Math.min(tz1, tz2);
      const exit = Math.max(tz1, tz2);
      if (enter > tMin) { tMin = enter; axis = 2; sign = dz > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    if (tMin < 0 || tMin > 1 || axis === 0) return;
    this.localNormal.set(axis === 1 ? sign : 0, 0, axis === 2 ? sign : 0);
    output.hit = true;
    output.t = tMin;
    output.normal.copy(this.localNormal).applyQuaternion(collider.worldQuaternion).setY(0).normalize();
  }

  private sweepSphere(collider: BoxCollider | SphereCollider, start: THREE.Vector3, end: THREE.Vector3, radius: number, output: SweepHit): void {
    if (collider.shape === 'sphere') this.sweepSphereAgainstSphere(start, end, radius, collider, output);
    else this.sweepSphereAgainstBox(start, end, radius, collider, output);
    if (output.hit) output.collider = collider;
  }

  private sweepSphereAgainstSphere(start: THREE.Vector3, end: THREE.Vector3, radius: number, collider: SphereCollider, output: SweepHit): void {
    this.resetHit(output);
    this.offset.copy(start).sub(collider.worldCenter);
    this.localDelta.copy(end).sub(start);
    const combined = radius + collider.worldRadius;
    const c = this.offset.lengthSq() - combined * combined;
    if (c <= 0) {
      const distance = this.offset.length();
      output.hit = true;
      output.t = 0;
      output.penetration = combined - distance;
      if (distance > 1e-6) output.normal.copy(this.offset).multiplyScalar(1 / distance);
      else output.normal.copy(this.localDelta).multiplyScalar(-1).normalize();
      return;
    }
    const a = this.localDelta.lengthSq();
    if (a < 1e-10) return;
    const b = this.offset.dot(this.localDelta);
    if (b >= 0) return;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (t < 0 || t > 1) return;
    output.hit = true;
    output.t = t;
    output.normal.copy(this.offset).addScaledVector(this.localDelta, t).normalize();
  }

  private sweepSphereAgainstBox(start: THREE.Vector3, end: THREE.Vector3, radius: number, collider: BoxCollider, output: SweepHit): void {
    this.resetHit(output);
    this.localStart.copy(start).sub(collider.worldCenter).applyQuaternion(collider.inverseWorldQuaternion);
    this.localEnd.copy(end).sub(collider.worldCenter).applyQuaternion(collider.inverseWorldQuaternion);
    this.localDelta.copy(this.localEnd).sub(this.localStart);
    const ex = collider.worldHalfExtents.x + radius;
    const ey = collider.worldHalfExtents.y + radius;
    const ez = collider.worldHalfExtents.z + radius;
    const inside = Math.abs(this.localStart.x) <= ex && Math.abs(this.localStart.y) <= ey && Math.abs(this.localStart.z) <= ez;
    if (inside) {
      const px = ex - Math.abs(this.localStart.x);
      const py = ey - Math.abs(this.localStart.y);
      const pz = ez - Math.abs(this.localStart.z);
      output.hit = true;
      output.t = 0;
      output.penetration = Math.min(px, py, pz);
      if (px <= py && px <= pz) this.localNormal.set(Math.sign(this.localStart.x) || -Math.sign(this.localDelta.x) || 1, 0, 0);
      else if (py <= pz) this.localNormal.set(0, Math.sign(this.localStart.y) || -Math.sign(this.localDelta.y) || 1, 0);
      else this.localNormal.set(0, 0, Math.sign(this.localStart.z) || -Math.sign(this.localDelta.z) || 1);
      output.normal.copy(this.localNormal).applyQuaternion(collider.worldQuaternion).normalize();
      return;
    }
    let tMin = 0;
    let tMax = 1;
    let axis = 0;
    let sign = 0;
    const sx = this.localStart.x;
    const sy = this.localStart.y;
    const sz = this.localStart.z;
    const dx = this.localDelta.x;
    const dy = this.localDelta.y;
    const dz = this.localDelta.z;
    if (Math.abs(dx) < 1e-9) {
      if (sx < -ex || sx > ex) return;
    } else {
      const first = (-ex - sx) / dx;
      const second = (ex - sx) / dx;
      const enter = Math.min(first, second);
      const exit = Math.max(first, second);
      if (enter > tMin) { tMin = enter; axis = 1; sign = dx > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    if (Math.abs(dy) < 1e-9) {
      if (sy < -ey || sy > ey) return;
    } else {
      const first = (-ey - sy) / dy;
      const second = (ey - sy) / dy;
      const enter = Math.min(first, second);
      const exit = Math.max(first, second);
      if (enter > tMin) { tMin = enter; axis = 2; sign = dy > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    if (Math.abs(dz) < 1e-9) {
      if (sz < -ez || sz > ez) return;
    } else {
      const first = (-ez - sz) / dz;
      const second = (ez - sz) / dz;
      const enter = Math.min(first, second);
      const exit = Math.max(first, second);
      if (enter > tMin) { tMin = enter; axis = 3; sign = dz > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    if (tMin < 0 || tMin > 1 || axis === 0) return;
    this.localNormal.set(axis === 1 ? sign : 0, axis === 2 ? sign : 0, axis === 3 ? sign : 0);
    output.hit = true;
    output.t = tMin;
    output.normal.copy(this.localNormal).applyQuaternion(collider.worldQuaternion).normalize();
  }

  private sweepSphereAgainstBoxLikeRamp(start: THREE.Vector3, end: THREE.Vector3, radius: number, ramp: RampCollider, output: SweepHit): void {
    this.resetHit(output);
    this.localStart.copy(start).sub(ramp.worldCenter).applyQuaternion(ramp.inverseWorldQuaternion);
    this.localEnd.copy(end).sub(ramp.worldCenter).applyQuaternion(ramp.inverseWorldQuaternion);
    this.localDelta.copy(this.localEnd).sub(this.localStart);
    const ex = ramp.halfWidth * Math.abs(ramp.worldScale.x) + radius;
    const ez = ramp.halfLength * Math.abs(ramp.worldScale.z) + radius;
    const top = Math.max(ramp.bottomHeight, ramp.topHeight) + radius;
    const bottom = Math.min(ramp.bottomHeight, ramp.topHeight) - 0.4 - radius;
    const centerY = (top + bottom) * 0.5;
    const ey = (top - bottom) * 0.5;
    this.localStart.y -= centerY;
    this.localEnd.y -= centerY;
    const inside = Math.abs(this.localStart.x) <= ex && Math.abs(this.localStart.y) <= ey && Math.abs(this.localStart.z) <= ez;
    if (inside) {
      const px = ex - Math.abs(this.localStart.x);
      const py = ey - Math.abs(this.localStart.y);
      const pz = ez - Math.abs(this.localStart.z);
      output.hit = true;
      output.t = 0;
      output.penetration = Math.min(px, py, pz);
      if (px <= py && px <= pz) this.localNormal.set(Math.sign(this.localStart.x) || -Math.sign(this.localDelta.x) || 1, 0, 0);
      else if (py <= pz) this.localNormal.set(0, Math.sign(this.localStart.y) || -Math.sign(this.localDelta.y) || 1, 0);
      else this.localNormal.set(0, 0, Math.sign(this.localStart.z) || -Math.sign(this.localDelta.z) || 1);
      output.normal.copy(this.localNormal).applyQuaternion(ramp.worldQuaternion).normalize();
      output.collider = ramp;
      return;
    }
    let tMin = 0;
    let tMax = 1;
    let axis = 0;
    let sign = 0;
    const extents = this.offset.set(ex, ey, ez);
    for (let component = 0; component < 3; component += 1) {
      const startValue = component === 0 ? this.localStart.x : component === 1 ? this.localStart.y : this.localStart.z;
      const deltaValue = component === 0 ? this.localDelta.x : component === 1 ? this.localDelta.y : this.localDelta.z;
      const extent = component === 0 ? extents.x : component === 1 ? extents.y : extents.z;
      if (Math.abs(deltaValue) < 1e-9) {
        if (startValue < -extent || startValue > extent) return;
        continue;
      }
      const first = (-extent - startValue) / deltaValue;
      const second = (extent - startValue) / deltaValue;
      const enter = Math.min(first, second);
      const exit = Math.max(first, second);
      if (enter > tMin) { tMin = enter; axis = component + 1; sign = deltaValue > 0 ? -1 : 1; }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return;
    }
    if (tMin < 0 || tMin > 1 || axis === 0) return;
    this.localNormal.set(axis === 1 ? sign : 0, axis === 2 ? sign : 0, axis === 3 ? sign : 0);
    output.hit = true;
    output.t = tMin;
    output.normal.copy(this.localNormal).applyQuaternion(ramp.worldQuaternion).normalize();
    output.collider = ramp;
  }

  private sweepShipTerrain(
    start: THREE.Vector3,
    displacement: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number,
    substeps: number,
    output: SweepHit
  ): void {
    this.resetHit(output);
    let previousClearance = start.y - this.tuning.shipTerrainClearance - getTerrainHeight(start.x, start.z);
    if (previousClearance < 0) {
      output.hit = true;
      output.t = 0;
      output.penetration = -previousClearance;
      this.sampleTerrainNormal(start.x, start.z, getTerrainHeight, output.normal);
      return;
    }
    for (let step = 1; step <= substeps; step += 1) {
      const t = step / substeps;
      this.segmentEnd.copy(start).addScaledVector(displacement, t);
      const terrain = getTerrainHeight(this.segmentEnd.x, this.segmentEnd.z);
      const clearance = this.segmentEnd.y - this.tuning.shipTerrainClearance - terrain;
      if (clearance < 0) {
        const previousT = (step - 1) / substeps;
        const denominator = previousClearance - clearance;
        const localT = denominator > 1e-6 ? previousClearance / denominator : 0;
        output.hit = true;
        output.t = THREE.MathUtils.lerp(previousT, t, THREE.MathUtils.clamp(localT, 0, 1));
        output.penetration = -clearance;
        this.sampleTerrainNormal(this.segmentEnd.x, this.segmentEnd.z, getTerrainHeight, output.normal);
        return;
      }
      previousClearance = clearance;
    }
  }

  private depenetrateCharacterPosition(position: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number, result: CharacterCollisionResult): boolean {
    let changed = false;
    for (let iteration = 0; iteration < this.tuning.characterIterations; iteration += 1) {
      let bestPenetration = 0;
      let bestCollider: CollisionCollider | undefined;
      this.worldNormal.set(0, 0, 0);
      for (let index = 0; index < this.candidates.length; index += 1) {
        const collider = this.candidates[index];
        if (collider.shape === 'ramp' || !this.characterVerticalOverlap(position.y, collider)) continue;
        this.sweepCharacterCircle(collider, position, position, this.testHit);
        if (this.testHit.hit && this.testHit.penetration > bestPenetration) {
          bestPenetration = this.testHit.penetration;
          bestCollider = collider;
          this.worldNormal.copy(this.testHit.normal);
        }
      }
      if (bestPenetration <= this.tuning.penetrationTolerance) break;
      position.addScaledVector(this.worldNormal, bestPenetration + this.tuning.penetrationTolerance);
      result.contact = true;
      result.penetration = Math.max(result.penetration, bestPenetration);
      result.normal.copy(this.worldNormal);
      result.collidedWith = bestCollider?.id ?? '';
      changed = true;
    }
    position.y = this.sampleWalkableHeight(position.x, position.z, getTerrainHeight) + 0.04;
    return changed;
  }

  private depenetrateShipPosition(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    compound: readonly ShipSphereDefinition[],
    getTerrainHeight: ((x: number, z: number) => number) | undefined,
    result: ShipCollisionResult
  ): boolean {
    let changed = false;
    for (let iteration = 0; iteration < this.tuning.shipIterations; iteration += 1) {
      let bestPenetration = 0;
      let bestCollider: CollisionCollider | undefined;
      this.worldNormal.set(0, 0, 0);
      for (let sphereIndex = 0; sphereIndex < compound.length; sphereIndex += 1) {
        const sphere = compound[sphereIndex];
        this.sphereStart.copy(sphere.offset).applyQuaternion(quaternion).add(position);
        for (let colliderIndex = 0; colliderIndex < this.candidates.length; colliderIndex += 1) {
          const collider = this.candidates[colliderIndex];
          if (collider.shape === 'ramp') this.sweepSphereAgainstBoxLikeRamp(this.sphereStart, this.sphereStart, sphere.radius, collider, this.testHit);
          else this.sweepSphere(collider, this.sphereStart, this.sphereStart, sphere.radius, this.testHit);
          if (this.testHit.hit && this.testHit.penetration > bestPenetration) {
            bestPenetration = this.testHit.penetration;
            bestCollider = collider;
            this.worldNormal.copy(this.testHit.normal);
          }
        }
      }
      if (getTerrainHeight) {
        const terrain = getTerrainHeight(position.x, position.z);
        const penetration = terrain + this.tuning.shipTerrainClearance - position.y;
        if (penetration > bestPenetration) {
          bestPenetration = penetration;
          bestCollider = undefined;
          this.sampleTerrainNormal(position.x, position.z, getTerrainHeight, this.worldNormal);
        }
      }
      if (bestPenetration <= this.tuning.penetrationTolerance) break;
      position.addScaledVector(this.worldNormal, bestPenetration + this.tuning.penetrationTolerance);
      result.impact = true;
      result.penetration = Math.max(result.penetration, bestPenetration);
      result.normal.copy(this.worldNormal);
      result.collidedWith = bestCollider?.id ?? 'terrain';
      changed = true;
    }
    return changed;
  }

  private characterOverlapsAny(position: THREE.Vector3): boolean {
    for (let index = 0; index < this.candidates.length; index += 1) {
      const collider = this.candidates[index];
      if (collider.shape === 'ramp' || !this.characterVerticalOverlap(position.y, collider)) continue;
      this.sweepCharacterCircle(collider, position, position, this.testHit);
      if (this.testHit.hit && this.testHit.penetration > this.tuning.penetrationTolerance) return true;
    }
    return false;
  }

  private shipOverlapsAny(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    compound: readonly ShipSphereDefinition[],
    getTerrainHeight: ((x: number, z: number) => number) | undefined
  ): boolean {
    for (let sphereIndex = 0; sphereIndex < compound.length; sphereIndex += 1) {
      const sphere = compound[sphereIndex];
      this.sphereStart.copy(sphere.offset).applyQuaternion(quaternion).add(position);
      for (let colliderIndex = 0; colliderIndex < this.candidates.length; colliderIndex += 1) {
        const collider = this.candidates[colliderIndex];
        if (collider.shape === 'ramp') this.sweepSphereAgainstBoxLikeRamp(this.sphereStart, this.sphereStart, sphere.radius, collider, this.testHit);
        else this.sweepSphere(collider, this.sphereStart, this.sphereStart, sphere.radius, this.testHit);
        if (this.testHit.hit && this.testHit.penetration > this.tuning.penetrationTolerance) return true;
      }
    }
    return Boolean(getTerrainHeight && position.y - this.tuning.shipTerrainClearance < getTerrainHeight(position.x, position.z));
  }

  private sampleWalkableHeight(x: number, z: number, getTerrainHeight: (x: number, z: number) => number): number {
    let height = getTerrainHeight(x, z);
    for (let index = 0; index < this.rampColliders.length; index += 1) {
      const collider = this.rampColliders[index];
      if (!this.isEnabled(collider)) continue;
      if (collider.dynamic) this.updateColliderTransform(collider);
      this.localStart.set(x, collider.worldCenter.y, z).sub(collider.worldCenter).applyQuaternion(collider.inverseWorldQuaternion);
      const width = collider.halfWidth * Math.abs(collider.worldScale.x);
      const length = collider.halfLength * Math.abs(collider.worldScale.z);
      if (Math.abs(this.localStart.x) > width || Math.abs(this.localStart.z) > length) continue;
      const rampT = THREE.MathUtils.clamp((this.localStart.z + length) / Math.max(0.001, length * 2), 0, 1);
      const localHeight = THREE.MathUtils.lerp(collider.bottomHeight, collider.topHeight, rampT);
      height = Math.max(height, collider.worldCenter.y + localHeight);
    }
    return height;
  }

  private sampleTerrainNormal(x: number, z: number, getTerrainHeight: (x: number, z: number) => number, output: THREE.Vector3): void {
    const sample = 0.65;
    const left = getTerrainHeight(x - sample, z);
    const right = getTerrainHeight(x + sample, z);
    const back = getTerrainHeight(x, z - sample);
    const front = getTerrainHeight(x, z + sample);
    output.set(left - right, sample * 2, back - front).normalize();
  }

  private sampleWalkableNormal(x: number, z: number, getTerrainHeight: (x: number, z: number) => number, output: THREE.Vector3): void {
    const sample = 0.65;
    const left = this.sampleWalkableHeight(x - sample, z, getTerrainHeight);
    const right = this.sampleWalkableHeight(x + sample, z, getTerrainHeight);
    const back = this.sampleWalkableHeight(x, z - sample, getTerrainHeight);
    const front = this.sampleWalkableHeight(x, z + sample, getTerrainHeight);
    output.set(left - right, sample * 2, back - front).normalize();
  }

  private resetHit(hit: SweepHit): void {
    hit.hit = false;
    hit.t = 1;
    hit.penetration = 0;
    hit.collider = undefined;
    hit.normal.set(0, 0, 0);
  }

  private copyHit(target: SweepHit, source: SweepHit): void {
    target.hit = source.hit;
    target.t = source.t;
    target.penetration = source.penetration;
    target.collider = source.collider;
    target.normal.copy(source.normal);
  }

  private finishQuery(startedAt: number, candidates: number): void {
    this.diagnostics.queriesThisFrame += 1;
    this.diagnostics.queryCandidates += candidates;
    this.diagnostics.collisionTimeMs += performance.now() - startedAt;
  }

  private cellKey(x: number, z: number): number {
    return ((x & 0xffff) << 16) ^ (z & 0xffff);
  }

  private rebuildDebugMeshes(focus?: THREE.Vector3): void {
    this.releaseDebugMeshes();
    for (let index = 0; index < this.colliders.length; index += 1) {
      const collider = this.colliders[index];
      if (!this.isEnabled(collider)) continue;
      this.updateColliderTransform(collider);
      if (focus && collider.worldCenter.distanceToSquared(focus) > 240 * 240) continue;
      const color = collider.category === COLLISION_CATEGORY.TRIGGER || collider.category === COLLISION_CATEGORY.INTERACTION ? 0x55d88b : 0xff795f;
      let mesh: THREE.Mesh;
      if (collider.shape === 'sphere') {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 7),
          new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.42, depthTest: false })
        );
        mesh.scale.setScalar(collider.worldRadius);
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(2, 2, 2),
          new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.42, depthTest: false })
        );
        if (collider.shape === 'box') mesh.scale.copy(collider.worldHalfExtents);
        else mesh.scale.set(collider.halfWidth, Math.abs(collider.topHeight - collider.bottomHeight) * 0.5 + 0.1, collider.halfLength);
      }
      mesh.name = `Collider Debug ${collider.id}`;
      mesh.position.copy(collider.worldCenter);
      mesh.quaternion.copy(collider.worldQuaternion);
      this.debugMeshes.push(mesh);
      this.debugGroup.add(mesh);
    }
  }

  private releaseDebugMeshes(): void {
    for (let index = 0; index < this.debugMeshes.length; index += 1) {
      const mesh = this.debugMeshes[index];
      this.debugGroup.remove(mesh);
      if (mesh instanceof THREE.Mesh) this.disposeMesh(mesh);
    }
    this.debugMeshes.length = 0;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      for (let index = 0; index < mesh.material.length; index += 1) mesh.material[index].dispose();
    } else {
      mesh.material.dispose();
    }
  }

  private ensureDebugShipSpheres(count: number): void {
    while (this.debugShipSpheres.length < count) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 7),
        new THREE.MeshBasicMaterial({ color: 0xffd36a, wireframe: true, transparent: true, opacity: 0.56, depthTest: false })
      );
      mesh.name = `Ship Compound Collider ${this.debugShipSpheres.length + 1}`;
      this.debugShipSpheres.push(mesh);
      this.debugGroup.add(mesh);
    }
  }
}
