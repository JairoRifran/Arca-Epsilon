import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetLoader } from '../core/AssetLoader';

export type CharacterGlbStatus = 'loading' | 'loaded' | 'fallback' | 'error';
export type CharacterAnimationState =
  | 'idle'
  | 'walkForward'
  | 'runForward'
  | 'walkBackward'
  | 'strafeLeft'
  | 'strafeRight'
  | 'interact'
  | 'exitingShip'
  | 'enteringShip'
  | 'waitingOnLift'
  | 'ridingLiftDown'
  | 'ridingLiftUp';

export type CharacterMoveState =
  | 'idle'
  | 'walkForward'
  | 'runForward'
  | 'walkBackward'
  | 'strafeLeft'
  | 'strafeRight'
  | 'interact'
  | 'exitingShip'
  | 'enteringShip'
  | 'waitingOnLift'
  | 'ridingLiftDown'
  | 'ridingLiftUp';

export const ON_FOOT_MOVEMENT_TUNING = {
  WALK_FORWARD_SPEED: 3.35,
  RUN_FORWARD_SPEED: 6.4,
  WALK_BACKWARD_SPEED: 2.15,
  STRAFE_SPEED: 2.9,
  ACCELERATION: 15,
  DECELERATION: 20,
  ROTATION_RESPONSE: 11.5,
  GROUND_RESPONSE: 18,
  GROUND_OFFSET: 0.04
} as const;

export type CharacterObstacle = {
  position: THREE.Vector3;
  radius: number;
};

export type CharacterMovementInput = {
  forward: number;
  strafe: number;
  run: boolean;
  cameraYaw: number;
  cameraForward: THREE.Vector3;
  cameraRight: THREE.Vector3;
};

export type CharacterMovementCollisionResponse = {
  readonly position: THREE.Vector3;
  grounded: boolean;
};

export type CharacterMovementCollisionResolver = (
  start: THREE.Vector3,
  displacement: THREE.Vector3,
  velocity: THREE.Vector3
) => CharacterMovementCollisionResponse;

export type SurfaceCharacterDiagnostics = {
  status: CharacterGlbStatus;
  paths: string[];
  meshCount: number;
  materialCount: number;
  triangles: number;
  scale: number;
  animationClips: string[];
  currentAnimation: string;
  missingAnimations: string[];
  loadedAnimationSources: number;
  discardedDuplicateMeshes: number;
  mixerUpdateSkipped: number;
  error: string;
};

type AnimationMap = Partial<Record<CharacterAnimationState, THREE.AnimationClip>>;

/** Skinned surface pilot plus a small kinematic, terrain-aware controller. */
export class SurfaceCharacter {
  readonly group = new THREE.Group();

  readonly velocity = new THREE.Vector3();

  // Reused every movement step: this runs at frame rate, so allocating four
  // vectors per call would hand the collector a steady drip of garbage.
  private readonly scratchForward = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchDesired = new THREE.Vector3();
  private readonly scratchOutward = new THREE.Vector3();
  private readonly scratchNextPosition = new THREE.Vector3();
  private readonly scratchDisplacement = new THREE.Vector3();
  private readonly scratchFacing = new THREE.Vector3();
  private readonly scratchRotation = new THREE.Quaternion();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  readonly diagnostics: SurfaceCharacterDiagnostics = {
    status: 'loading',
    paths: [],
    meshCount: 0,
    materialCount: 0,
    triangles: 0,
    scale: 1,
    animationClips: [],
    currentAnimation: 'none',
    missingAnimations: [],
    loadedAnimationSources: 0,
    discardedDuplicateMeshes: 0,
    mixerUpdateSkipped: 0,
    error: ''
  };

  grounded = false;

  speed = 0;

  moveState: CharacterMoveState = 'idle';

  private normalizedRoot?: THREE.Group;

  private liftSwayTime = 0;

  private liftSwayBlend = 0;

  readonly inputVector = new THREE.Vector2();

  facingYaw = 0;

  debugVisible = false;

  private mixer?: THREE.AnimationMixer;

  private readonly actions = new Map<CharacterAnimationState, THREE.AnimationAction>();

  private currentState: CharacterAnimationState = 'idle';

  private currentAction?: THREE.AnimationAction;

  constructor(private readonly assetLoader: AssetLoader) {
    this.group.name = 'Arca Pilot Character';
    this.group.visible = false;
  }

  async load(basePath: string, animationPaths: string[] = []): Promise<CharacterGlbStatus> {
    this.diagnostics.status = 'loading';
    this.diagnostics.paths = [basePath, ...animationPaths];
    this.diagnostics.error = '';

    try {
      const base = await this.assetLoader.loadGLTF(basePath);
      const animationGlbs: GLTF[] = [];
      for (const path of animationPaths) {
        try {
          animationGlbs.push(await this.assetLoader.loadGLTF(path));
        } catch (error) {
          this.diagnostics.error = `Animacion opcional no disponible (${path}): ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      this.installModel(base, animationGlbs);
      this.diagnostics.status = 'loaded';
      return this.diagnostics.status;
    } catch (error) {
      this.diagnostics.status = 'error';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      console.error('Character GLB failed to load; installing safe fallback.', this.diagnostics);
      this.installFallback();
      this.diagnostics.status = 'fallback';
      return this.diagnostics.status;
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (this.mixer) this.mixer.timeScale = visible ? 1 : 0;
  }

  get visibleMeshCount(): number {
    return this.group.visible ? this.diagnostics.meshCount : 0;
  }

  get activeSkinnedMeshCount(): number {
    if (!this.group.visible) return 0;
    let count = 0;
    this.group.traverse((object) => {
      if (object.visible && object instanceof THREE.SkinnedMesh) count += 1;
    });
    return count;
  }

  get visibleTriangleCount(): number {
    return this.group.visible ? this.diagnostics.triangles : 0;
  }

  get mixerActive(): boolean {
    return Boolean(this.mixer && this.group.visible && this.mixer.timeScale > 0);
  }

  get lodLevel(): 'hidden' | 'high' {
    return this.group.visible ? 'high' : 'hidden';
  }

  get performanceWarning(): string {
    return this.diagnostics.triangles > 150_000
      ? `Piloto de alta densidad: ${this.diagnostics.triangles.toLocaleString('en-US')} triangulos.`
      : '';
  }

  noteInactiveFrame(): void {
    if (!this.group.visible && this.mixer) this.diagnostics.mixerUpdateSkipped += 1;
  }

  placeAt(position: THREE.Vector3, facingYaw?: number): void {
    this.group.position.copy(position);
    if (facingYaw !== undefined) this.group.rotation.y = facingYaw;
    this.velocity.set(0, 0, 0);
    this.inputVector.set(0, 0);
    this.speed = 0;
    this.moveState = 'idle';
    this.facingYaw = this.group.rotation.y;
    this.grounded = true;
    this.setAnimation('idle');
  }

  updateMovement(
    delta: number,
    movement: CharacterMovementInput,
    getGroundHeight: (x: number, z: number) => number,
    obstacles: CharacterObstacle[],
    boundaryRadius: number,
    /** Anchor the walkable disc; defaults to Base Nereida at the origin. */
    boundaryCenterX = 0,
    boundaryCenterZ = 0,
    collisionResolver?: CharacterMovementCollisionResolver
  ): void {
    const cameraForward = this.scratchForward.copy(movement.cameraForward).setY(0);
    if (cameraForward.lengthSq() < 0.0001) cameraForward.set(0, 0, -1);
    cameraForward.normalize();
    const cameraRight = this.scratchRight.copy(movement.cameraRight).setY(0);
    if (cameraRight.lengthSq() < 0.0001) cameraRight.crossVectors(cameraForward, SurfaceCharacter.UP);
    cameraRight.normalize();

    this.inputVector.set(movement.strafe, movement.forward);
    const desiredDirection = this.scratchDesired
      .copy(cameraForward)
      .multiplyScalar(movement.forward)
      .addScaledVector(cameraRight, movement.strafe);
    if (desiredDirection.lengthSq() > 1) desiredDirection.normalize();

    const backwardDominant = movement.forward < -0.05 && Math.abs(movement.forward) >= Math.abs(movement.strafe);
    const strafeOnly = Math.abs(movement.strafe) > 0.05 && Math.abs(movement.forward) < 0.05;
    const runningForward = movement.run && movement.forward > 0.05 && !backwardDominant;
    const targetSpeed = desiredDirection.lengthSq() < 0.001
      ? 0
      : backwardDominant
        ? ON_FOOT_MOVEMENT_TUNING.WALK_BACKWARD_SPEED
        : runningForward
          ? ON_FOOT_MOVEMENT_TUNING.RUN_FORWARD_SPEED
          : strafeOnly
            ? ON_FOOT_MOVEMENT_TUNING.STRAFE_SPEED
            : ON_FOOT_MOVEMENT_TUNING.WALK_FORWARD_SPEED;
    const desiredVelocity = desiredDirection.multiplyScalar(targetSpeed);
    const velocityDelta = desiredVelocity.sub(this.velocity);
    const changingDirection = this.velocity.lengthSq() > 0.01 && this.velocity.dot(desiredDirection) < 0;
    const maxVelocityChange =
      (targetSpeed <= this.speed || changingDirection
        ? ON_FOOT_MOVEMENT_TUNING.DECELERATION
        : ON_FOOT_MOVEMENT_TUNING.ACCELERATION) * delta;
    if (velocityDelta.length() > maxVelocityChange) velocityDelta.setLength(maxVelocityChange);
    this.velocity.add(velocityDelta);
    this.velocity.y = 0;
    if (this.velocity.lengthSq() < 0.001) this.velocity.set(0, 0, 0);

    const nextPosition = this.scratchNextPosition.copy(this.group.position).addScaledVector(this.velocity, delta);

    const offsetX = nextPosition.x - boundaryCenterX;
    const offsetZ = nextPosition.z - boundaryCenterZ;
    const radialDistance = Math.hypot(offsetX, offsetZ);
    if (radialDistance > boundaryRadius) {
      const scale = boundaryRadius / radialDistance;
      nextPosition.x = boundaryCenterX + offsetX * scale;
      nextPosition.z = boundaryCenterZ + offsetZ * scale;
      const outward = this.scratchOutward.set(offsetX, 0, offsetZ).normalize();
      const outwardSpeed = this.velocity.dot(outward);
      if (outwardSpeed > 0) this.velocity.addScaledVector(outward, -outwardSpeed);
    }

    if (collisionResolver) {
      const collision = collisionResolver(
        this.group.position,
        this.scratchDisplacement.copy(nextPosition).sub(this.group.position),
        this.velocity
      );
      nextPosition.copy(collision.position);
      this.grounded = collision.grounded;
    } else {
      this.resolveObstacles(nextPosition, obstacles);
      const targetGroundY = getGroundHeight(nextPosition.x, nextPosition.z) + ON_FOOT_MOVEMENT_TUNING.GROUND_OFFSET;
      const heightDelta = targetGroundY - this.group.position.y;
      nextPosition.y = Math.abs(heightDelta) > 2.5
        ? targetGroundY
        : THREE.MathUtils.lerp(
            this.group.position.y,
            targetGroundY,
            1 - Math.exp(-delta * ON_FOOT_MOVEMENT_TUNING.GROUND_RESPONSE)
          );
      this.grounded = true;
    }
    this.group.position.copy(nextPosition);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.speed > 0.12) {
      const facing = backwardDominant
        ? this.scratchFacing.copy(cameraForward).addScaledVector(cameraRight, movement.strafe * 0.28).normalize()
        : this.scratchFacing.copy(this.velocity).setY(0).normalize();
      const targetYaw = Math.atan2(facing.x, facing.z);
      this.scratchRotation.setFromAxisAngle(SurfaceCharacter.UP, targetYaw);
      this.group.quaternion.slerp(this.scratchRotation, 1 - Math.exp(-delta * ON_FOOT_MOVEMENT_TUNING.ROTATION_RESPONSE));
      this.facingYaw = this.group.rotation.y;
    }

    if (targetSpeed === 0 && this.speed < 0.16) {
      this.moveState = 'idle';
      this.setAnimation('idle');
    } else if (backwardDominant) {
      this.moveState = 'walkBackward';
      this.setAnimation('walkBackward');
    } else if (runningForward && targetSpeed > 4) {
      this.moveState = 'runForward';
      this.setAnimation('runForward');
    } else if (strafeOnly) {
      this.moveState = movement.strafe < 0 ? 'strafeLeft' : 'strafeRight';
      this.setAnimation(this.moveState);
    } else {
      this.moveState = 'walkForward';
      this.setAnimation('walkForward');
    }

    this.syncAnimationPlayback(this.moveState);
    this.advanceMixer(delta);
    // Normal ground control: ease any leftover lift brace back to neutral.
    this.applyLiftBalance(delta, this.moveState);
  }

  updateAnimation(delta: number, state: CharacterAnimationState): void {
    this.moveState = state;
    this.setAnimation(state);
    this.advanceMixer(delta);
    this.applyLiftBalance(delta, state);
  }

  /**
   * Procedural balance layer for the platform ride. The animation clip for
   * the lift states is a static pose, so a rider would read as a statue;
   * this leans the body into a subtle brace and lets it compensate on two
   * slow incommensurate frequencies — a person keeping their footing on a
   * moving mechanism. Applied to the inner normalized root so the group
   * transform (owned by the main loop during transitions) stays untouched.
   * Blend eases in and out so posture never pops at state changes.
   */
  private applyLiftBalance(delta: number, state: CharacterAnimationState): void {
    const riding = state === 'ridingLiftDown' || state === 'ridingLiftUp';
    const onLift = riding || state === 'waitingOnLift';
    const target = onLift ? 1 : 0;
    this.liftSwayBlend += (target - this.liftSwayBlend) * Math.min(1, delta * 5.5);
    const root = this.normalizedRoot;
    if (!root) return;
    if (this.liftSwayBlend < 0.01) {
      root.rotation.x = 0;
      root.rotation.z = 0;
      root.position.y = 0;
      return;
    }
    this.liftSwayTime += delta;
    const t = this.liftSwayTime;
    // Riding sways more than waiting; everything stays in the ±1° range.
    const ride = riding ? 1 : 0.5;
    const blend = this.liftSwayBlend * ride;
    const brace = riding ? 0.02 : 0.008;
    root.rotation.x = (brace + Math.sin(t * 1.9) * 0.009 + Math.sin(t * 3.7) * 0.004) * blend;
    root.rotation.z = (Math.sin(t * 1.31 + 0.7) * 0.011 + Math.sin(t * 2.9) * 0.004) * blend;
    // A hair of knee give, breathing with the servo rhythm.
    root.position.y = (-0.012 + Math.sin(t * 2.3) * 0.006) * blend;
  }

  setAnimation(state: CharacterAnimationState): void {
    if (this.currentState === state && this.currentAction) return;
    this.currentState = state;
    const next = this.actions.get(state) ?? this.actions.get('idle');
    const clipName = next?.getClip().name ?? `${state}-procedural`;
    this.diagnostics.currentAnimation = `${state}:${clipName}`;
    if (!next || next === this.currentAction) return;

    next.enabled = true;
    next.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
    next.setEffectiveWeight(1);
    const initialTimeScale = state === 'runForward'
      ? 1.08
      : state === 'walkBackward'
        ? -0.72
        : state === 'exitingShip' || state === 'enteringShip'
          ? 0.82
          : 1;
    next.setEffectiveTimeScale(initialTimeScale);
    next.reset();
    if (initialTimeScale < 0) next.time = next.getClip().duration;
    next.fadeIn(0.18).play();
    this.currentAction?.fadeOut(0.18);
    this.currentAction = next;
  }

  toggleDebug(force?: boolean): boolean {
    this.debugVisible = force ?? !this.debugVisible;
    let debug = this.group.getObjectByName('Arca Pilot Control Debug');
    if (!debug) {
      debug = new THREE.Group();
      debug.name = 'Arca Pilot Control Debug';
      const facing = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.08, 0), 2, 0x58ffd1, 0.32, 0.18);
      facing.name = 'Character Facing Direction';
      debug.add(facing, new THREE.AxesHelper(0.8));
      this.group.add(debug);
    }
    debug.visible = this.debugVisible;
    return this.debugVisible;
  }

  private syncAnimationPlayback(state: CharacterMoveState): void {
    const action = this.actions.get(state);
    if (!action) return;
    if (state === 'walkBackward') {
      action.setEffectiveTimeScale(-THREE.MathUtils.clamp(this.speed / ON_FOOT_MOVEMENT_TUNING.WALK_BACKWARD_SPEED, 0.42, 0.9));
    } else if (state === 'runForward') {
      action.setEffectiveTimeScale(THREE.MathUtils.clamp(this.speed / ON_FOOT_MOVEMENT_TUNING.RUN_FORWARD_SPEED, 0.72, 1.12));
    } else if (state === 'walkForward' || state === 'strafeLeft' || state === 'strafeRight') {
      action.setEffectiveTimeScale(THREE.MathUtils.clamp(this.speed / ON_FOOT_MOVEMENT_TUNING.WALK_FORWARD_SPEED, 0.55, 1.05));
    }
  }

  private installModel(base: GLTF, animationGlbs: GLTF[]): void {
    this.group.clear();
    const imported = base.scene;
    imported.name = 'Arca Pilot GLB';
    const materials = new Set<THREE.Material>();
    let meshCount = 0;
    let triangles = 0;

    imported.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshCount += 1;
      // The pilot is the one thing on foot that must read as standing ON the
      // ground, so every visible mesh casts. `receiveShadow` also lets the
      // torso shade the legs and the helmet shade the shoulders, which is what
      // stops the figure looking like a flat cut-out under the key light.
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      const geometry = child.geometry;
      triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of childMaterials) {
        materials.add(material);
        if ('roughness' in material && typeof material.roughness === 'number') material.roughness = Math.max(0.42, material.roughness);
      }
    });

    const box = new THREE.Box3().setFromObject(imported);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? 1.78 / size.y : 1;
    imported.position.set(-center.x, -box.min.y, -center.z);
    const normalized = new THREE.Group();
    normalized.name = 'Arca Pilot Normalized Root';
    normalized.scale.setScalar(scale);
    normalized.add(imported);
    this.normalizedRoot = normalized;
    this.group.add(normalized);
    this.addContactShadow();

    this.diagnostics.meshCount = meshCount;
    this.diagnostics.materialCount = materials.size;
    this.diagnostics.triangles = Math.round(triangles);
    this.diagnostics.scale = scale;

    const sourceClips = [base, ...animationGlbs].flatMap((gltf) => gltf.animations);
    this.diagnostics.animationClips = sourceClips.map((clip) => clip.name || 'unnamed');
    this.diagnostics.loadedAnimationSources = animationGlbs.length;
    const clips = sourceClips.map((clip) => this.withoutHorizontalRootMotion(clip));
    this.diagnostics.discardedDuplicateMeshes = animationGlbs.reduce(
      (count, gltf) => count + this.disposeAnimationSourceScene(gltf.scene),
      0
    );
    const animationMap = this.mapAnimations(clips);
    this.mixer = new THREE.AnimationMixer(this.group);
    this.mixer.timeScale = this.group.visible ? 1 : 0;
    this.actions.clear();
    for (const [state, clip] of Object.entries(animationMap) as [CharacterAnimationState, THREE.AnimationClip][]) {
      this.actions.set(state, this.mixer.clipAction(clip));
    }
    this.currentAction = undefined;
    this.currentState = 'interact';
    this.setAnimation('idle');
  }

  private advanceMixer(delta: number): void {
    if (!this.mixer) return;
    if (!this.group.visible || this.mixer.timeScale <= 0) {
      this.diagnostics.mixerUpdateSkipped += 1;
      return;
    }
    this.mixer.update(delta);
  }

  private disposeAnimationSourceScene(root: THREE.Object3D): number {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    let discardedMeshes = 0;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      discardedMeshes += 1;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    root.clear();
    return discardedMeshes;
  }

  private mapAnimations(clips: THREE.AnimationClip[]): AnimationMap {
    const find = (pattern: RegExp): THREE.AnimationClip | undefined => clips.find((clip) => pattern.test(clip.name));
    const walk = find(/walk(?!.*back)|walking/i) ?? clips[0];
    const run = find(/run|jog|sprint/i) ?? walk;
    const trueIdle = find(/idle|breath|stand/i);
    const idle = trueIdle ?? (walk ? this.createStaticPoseClip(walk) : undefined);
    const backward = find(/back|reverse|retreat/i) ?? (walk ? walk.clone() : undefined);
    const interact = find(/interact|use|scan|inspect/i) ?? idle;
    const boarding = find(/enter|exit|board|climb|descend/i) ?? walk ?? idle;

    const missing: string[] = [];
    if (!trueIdle) missing.push('idle (pose estatica derivada del primer frame)');
    if (!find(/back|reverse|retreat/i)) missing.push('backward (ciclo walk invertido)');
    if (!find(/interact|use|scan|inspect/i)) missing.push('interact (idle reutilizado)');
    if (!find(/enter|exit|board|climb|descend/i)) missing.push('enter/exit (walk guiado por trayectoria)');
    this.diagnostics.missingAnimations = missing;

    return {
      idle,
      walkForward: walk,
      runForward: run,
      walkBackward: backward,
      strafeLeft: walk,
      strafeRight: walk,
      interact,
      exitingShip: boarding,
      enteringShip: boarding,
      waitingOnLift: idle,
      ridingLiftDown: idle,
      ridingLiftUp: idle
    };
  }

  private withoutHorizontalRootMotion(source: THREE.AnimationClip): THREE.AnimationClip {
    const clip = source.clone();
    clip.name = source.name || 'character-animation';
    for (const track of clip.tracks) {
      if (!/hips.*position|hips.*translation/i.test(track.name) || track.getValueSize() !== 3) continue;
      const values = track.values;
      const baseX = values[0];
      const baseZ = values[2];
      for (let i = 0; i < values.length; i += 3) {
        values[i] = baseX;
        values[i + 2] = baseZ;
      }
    }
    return clip;
  }

  private createStaticPoseClip(source: THREE.AnimationClip): THREE.AnimationClip {
    const tracks = source.tracks.map((track) => {
      const clone = track.clone();
      const valueSize = track.getValueSize();
      const values = new Float32Array(valueSize * 2);
      for (let i = 0; i < valueSize; i += 1) {
        values[i] = track.values[i];
        values[i + valueSize] = track.values[i];
      }
      clone.times = new Float32Array([0, 1]);
      clone.values = values;
      return clone;
    });
    return new THREE.AnimationClip('idle-derived-pose', 1, tracks);
  }

  private resolveObstacles(nextPosition: THREE.Vector3, obstacles: CharacterObstacle[]): void {
    for (const obstacle of obstacles) {
      const dx = nextPosition.x - obstacle.position.x;
      const dz = nextPosition.z - obstacle.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= obstacle.radius || distance < 0.0001) continue;
      const nx = dx / distance;
      const nz = dz / distance;
      nextPosition.x = obstacle.position.x + nx * obstacle.radius;
      nextPosition.z = obstacle.position.z + nz * obstacle.radius;
      const inwardSpeed = this.velocity.x * -nx + this.velocity.z * -nz;
      if (inwardSpeed > 0) {
        this.velocity.x += nx * inwardSpeed;
        this.velocity.z += nz * inwardSpeed;
      }
    }
  }

  private installFallback(): void {
    this.group.clear();
    const suit = new THREE.Group();
    suit.name = 'Arca Pilot Procedural Fallback';
    const shell = new THREE.MeshStandardMaterial({ color: 0xc5ccd1, roughness: 0.7, metalness: 0.2 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.8, metalness: 0.45 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x182a31, emissive: 0x27617a, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.5 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.58, 6, 10), shell);
    torso.position.y = 1.12;
    suit.add(torso);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), visor);
    helmet.position.y = 1.72;
    suit.add(helmet);
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.22), joint);
    backpack.position.set(0, 1.18, 0.3);
    suit.add(backpack);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.58, 4, 7), shell);
      arm.position.set(side * 0.4, 1.13, 0);
      suit.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.64, 4, 7), joint);
      leg.position.set(side * 0.16, 0.42, 0);
      suit.add(leg);
    }
    suit.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
    this.group.add(suit);
    this.addContactShadow();
    this.diagnostics.meshCount = 7;
    this.diagnostics.materialCount = 3;
    this.diagnostics.triangles = 0;
    this.diagnostics.animationClips = [];
    this.diagnostics.missingAnimations = ['all (fallback procedural)'];
    this.diagnostics.loadedAnimationSources = 0;
    this.diagnostics.discardedDuplicateMeshes = 0;
    this.diagnostics.currentAnimation = 'idle-procedural';
    this.mixer = undefined;
    this.actions.clear();
  }

  /**
   * Secondary ambient-occlusion patch directly under the boots.
   *
   * This is NOT the character's shadow: the real one is cast by the key light
   * into the shadow map. This only darkens the few centimetres the shadow map
   * cannot resolve at grazing sun angles, so the feet never look detached when
   * the real shadow stretches far to one side. Deliberately small and faint —
   * at 0.34 it used to read as the shadow itself and double-darkened the
   * ground once a real one existed.
   */
  private addContactShadow(): void {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 20),
      new THREE.MeshBasicMaterial({
        color: 0x080b0c,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        toneMapped: false
      })
    );
    shadow.name = 'Arca Pilot Contact Shadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    shadow.renderOrder = 2;
    this.group.add(shadow);
  }
}
