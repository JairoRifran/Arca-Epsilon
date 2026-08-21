import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createSoftParticleTexture } from '../assets/materials';
import { CHARACTER_HEIGHT_METRES, withoutHorizontalRootMotion } from '../assets/characterClips';
import { auroraCrewDefinitions } from '../assets/mission12Definitions';
import type { AssetLoader } from '../core/AssetLoader';

type CrewSlot = {
  /** Where this member ends up standing, world space. */
  home: THREE.Vector3;
  /** Where they step off the capsule, world space. */
  start: THREE.Vector3;
  /** Facing once settled. */
  yaw: number;
  /** Idle offsets so the three never move in lockstep. */
  phase: number;
  accent: THREE.Color;
  /** The figure itself, once the model has loaded. */
  root?: THREE.Group;
  mixer?: THREE.AnimationMixer;
  idle?: THREE.AnimationAction;
  walk?: THREE.AnimationAction;
  /** Which action is currently faded in, so the crossfade only fires on change. */
  playing?: 'idle' | 'walk';
};

const PART_COUNT = 3;

/**
 * The first three people on Aurora.
 *
 * They used to be six shared primitives -- boots, torso, backpack, helmet,
 * visor, lamp -- drawn as 3-instance InstancedMeshes. That was cheap and it
 * read as three people from a distance, but they were mannequins: the only
 * motion they had was a sine-wave bob and a yaw drift, so the closer the player
 * walked the more obviously they were furniture.
 *
 * Now each is a skinned figure sharing one loaded model, cloned three times
 * with `SkeletonUtils` so the three can pose independently. Roles still read
 * through the suit accent, applied as a tint over the shared texture rather
 * than as three separate materials.
 *
 * What did NOT change is the part that was already right: they have no AI and
 * no pathfinding. On disembark they walk a timed line from the capsule hatch
 * to their posts, and once there they stand and watch the valley. The walk is
 * still a lerp -- the animation moves the legs, the code moves the person.
 */
export class AuroraFirstCrew {
  readonly group = new THREE.Group();

  private readonly slots: CrewSlot[] = [];
  /** Contact shadows and shoulder lamps stay instanced: one draw call each. */
  private readonly shadows: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly walkFrom = new THREE.Vector3();
  private readonly lampMaterial: THREE.MeshStandardMaterial;
  private readonly assetLoader?: AssetLoader;
  /** 0 = at the capsule, 1 = at their posts. */
  private walkProgress = 1;
  private walking = false;
  private modelStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';

  constructor(assetLoader?: AssetLoader) {
    this.assetLoader = assetLoader;
    this.group.name = 'Primeros Habitantes Aurora';
    this.group.visible = false;

    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f31,
      emissive: 0xffdca8,
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.3
    });
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 5), this.lampMaterial, PART_COUNT);
    // Contact shadows so they stand on the ground rather than hover on it.
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 12),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(32),
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      }),
      PART_COUNT
    );
    for (const part of [this.shadows, this.lamps]) {
      part.frustumCulled = false;
      this.group.add(part);
    }

    for (const definition of auroraCrewDefinitions) {
      this.slots.push({
        home: new THREE.Vector3(definition.position[0], 0, definition.position[1]),
        start: new THREE.Vector3(definition.position[0], 0, definition.position[1]),
        yaw: 0,
        phase: this.slots.length * 2.1,
        accent: new THREE.Color(definition.accent)
      });
    }
  }

  get diagnostics(): {
    status: string;
    figures: number;
    /**
     * Distinct `Skeleton` instances across the three figures.
     *
     * This is the property that separates a crowd from a chorus line. A plain
     * `Object3D.clone()` copies the mesh but keeps pointing at the original
     * bones, so all three would be driven by whichever mixer ran last and would
     * stand in identical poses. Anything below `figures` here means the clone
     * silently degraded.
     */
    distinctSkeletons: number;
    clips: string[];
    settled: boolean;
    walkProgress: number;
    playing: string[];
  } {
    const skeletons = new Set<THREE.Skeleton>();
    const clips = new Set<string>();
    for (const slot of this.slots) {
      slot.root?.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton);
      });
      if (slot.idle) clips.add(slot.idle.getClip().name);
      if (slot.walk) clips.add(slot.walk.getClip().name);
    }
    return {
      status: this.modelStatus,
      figures: this.slots.filter((slot) => slot.root).length,
      distinctSkeletons: skeletons.size,
      clips: [...clips],
      settled: this.settled,
      walkProgress: Number(this.walkProgress.toFixed(3)),
      playing: this.slots.map((slot) => slot.playing ?? 'none')
    };
  }

  /**
   * Load the figures.
   *
   * `walkPath` is an animation-only GLB. The observer model ships one clip --
   * standing and looking around -- so without a walk cycle the disembark would
   * be three statues sliding along the ground. Every character rig in the
   * project shares a skeleton, so the pilot's walk plays on these bodies for
   * the cost of 15 KB rather than another copy of the mesh.
   *
   * Failure is not fatal: the crew simply stays unloaded and invisible, the
   * same state they are in before mission 12 reaches them.
   */
  async load(modelPath: string, walkPath?: string): Promise<void> {
    if (!this.assetLoader || this.modelStatus === 'loading' || this.modelStatus === 'loaded') return;
    this.modelStatus = 'loading';
    try {
      const gltf = await this.assetLoader.loadGLTF(modelPath);
      const clips = [...gltf.animations];
      if (walkPath) {
        try {
          const walkGltf = await this.assetLoader.loadGLTF(walkPath);
          clips.push(...walkGltf.animations);
        } catch {
          // A missing walk clip costs the disembark its footwork, nothing else.
        }
      }
      this.installFigures(gltf.scene, clips.map((clip) => withoutHorizontalRootMotion(clip)));
      this.modelStatus = 'loaded';
      this.applyPose(0);
    } catch (error) {
      this.modelStatus = 'error';
      console.error('Aurora crew model failed to load; the crew stays hidden.', error);
    }
  }

  /**
   * Place the crew: each member's post plus the capsule hatch they step off
   * from. Called whenever the mission visuals resync.
   */
  setLayout(
    capsuleHatch: THREE.Vector3,
    getGroundHeight: (x: number, z: number) => number
  ): void {
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      slot.home.y = getGroundHeight(slot.home.x, slot.home.z);
      // Fan out slightly from the hatch so they do not overlap on exit.
      const spread = (i - 1) * 1.1;
      slot.start.set(capsuleHatch.x + spread, 0, capsuleHatch.z + 1.2);
      slot.start.y = getGroundHeight(slot.start.x, slot.start.z);
      // Settle facing the core, which is northwest of every post.
      slot.yaw = Math.atan2(120 - slot.home.x, -4160 - slot.home.z);
    }
    this.applyPose(0);
  }

  /**
   * Resync to a stored mission state -- loading a save, or returning to Aurora.
   *
   * The guard is load-bearing. The real disembark runs
   * `beginDisembark(); syncMission12Visuals();` back to back, and the resync
   * inside that second call lands here with `disembarked = true`. Unguarded,
   * it set `walkProgress = 1` on the very next line and the crew snapped to
   * their posts: the five second walk out of the capsule has never actually
   * played. A resync reports where the mission is, so it must not cancel a
   * movement that is already under way.
   */
  restore(visible: boolean, disembarked: boolean): void {
    this.group.visible = visible && disembarked;
    if (this.walking && disembarked) {
      this.applyPose(0);
      return;
    }
    this.walking = false;
    this.walkProgress = disembarked ? 1 : 0;
    this.applyPose(0);
  }

  /** Starts the short walk from the hatch to their posts. */
  beginDisembark(): void {
    this.group.visible = true;
    this.walkProgress = 0;
    this.walking = true;
    this.applyPose(0);
  }

  get settled(): boolean {
    return this.walkProgress > 0.999;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    if (this.walking && this.walkProgress < 1) {
      // ~5 s to cross from the capsule to the posts.
      this.walkProgress = Math.min(1, this.walkProgress + delta / 5);
      if (this.walkProgress >= 1) this.walking = false;
    }
    this.applyPose(elapsed);
    for (let i = 0; i < this.slots.length; i += 1) this.slots[i].mixer?.update(delta);
    const pulse = 0.5 + Math.sin(elapsed * 1.5) * 0.5;
    this.lampMaterial.emissiveIntensity = 0.32 + pulse * 0.16;
  }

  private installFigures(source: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    // Height first, from the source, before anything is cloned: the observer
    // model stands 1.70 m in its bind pose and the pilot 1.69 m, close enough
    // to look like a mistake rather than a difference if left alone.
    const box = new THREE.Box3().setFromObject(source);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? CHARACTER_HEIGHT_METRES / size.y : 1;

    // `Alert` is the observer clip; anything else in the file is a stub. The
    // walk arrives from the pilot rig under the name the extractor gave it.
    const idleClip = clips.find((clip) => /alert|idle|stand|observ/i.test(clip.name)) ?? clips[0];
    const walkClip = clips.find((clip) => /walk/i.test(clip.name));

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      // `SkeletonUtils.clone` rather than `Object3D.clone`: a skinned mesh has
      // to be rebound to its own copy of the skeleton, otherwise all three
      // figures share one set of bones and move as a single body.
      const figure = cloneSkinned(source);
      figure.position.set(-centre.x, -box.min.y, -centre.z);

      const root = new THREE.Group();
      root.name = `Aurora Crew ${i + 1}`;
      root.scale.setScalar(scale);
      root.add(figure);

      figure.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        // The figures are placed by matrix every frame and their bones move
        // well outside the bind-pose bounds, so the default cull test on the
        // clone's stale bounding sphere would blink them out at glancing angles.
        child.frustumCulled = false;
        // Role accent as a tint over the shared texture, not a repaint: at full
        // strength the suit loses every detail the texture carries.
        const tint = (material: THREE.Material): THREE.Material => {
          const tinted = material.clone();
          if ('color' in tinted && tinted.color instanceof THREE.Color) {
            tinted.color.lerp(slot.accent, 0.35);
          }
          if ('roughness' in tinted && typeof tinted.roughness === 'number') {
            tinted.roughness = Math.max(0.45, tinted.roughness);
          }
          return tinted;
        };
        child.material = Array.isArray(child.material)
          ? child.material.map(tint)
          : tint(child.material);
      });

      const mixer = new THREE.AnimationMixer(root);
      slot.root = root;
      slot.mixer = mixer;
      if (idleClip) {
        slot.idle = mixer.clipAction(idleClip);
        // Offset each figure into a different part of the cycle. Three people
        // breathing and glancing on exactly the same frame is the tell that
        // gives away a crowd built from one model.
        slot.idle.time = (idleClip.duration / PART_COUNT) * i;
        slot.idle.play();
        slot.playing = 'idle';
      }
      if (walkClip) {
        slot.walk = mixer.clipAction(walkClip);
        slot.walk.time = (walkClip.duration / PART_COUNT) * i;
        slot.walk.setEffectiveWeight(0);
        slot.walk.play();
      }
      this.group.add(root);
    }
  }

  private applyPose(elapsed: number): void {
    const eased = this.walkProgress * this.walkProgress * (3 - 2 * this.walkProgress);
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      // Stagger the three so they do not arrive as one block.
      const own = THREE.MathUtils.clamp((eased - i * 0.08) / 0.84, 0, 1);
      this.walkFrom.copy(slot.start).lerp(slot.home, own);
      const walking = own > 0.001 && own < 0.999;
      // Idle: a slow look around the valley. Much smaller than it used to be --
      // the clip now turns the head, so this only needs to keep the whole body
      // from being planted on one bearing for ever.
      const glance = Math.sin(elapsed * 0.23 + slot.phase) * 0.16 + Math.sin(elapsed * 0.11 + slot.phase * 1.7) * 0.09;
      const facing = walking
        ? Math.atan2(slot.home.x - slot.start.x, slot.home.z - slot.start.z)
        : slot.yaw + glance;

      this.setFigureAnimation(slot, walking ? 'walk' : 'idle');
      if (slot.root) {
        slot.root.position.copy(this.walkFrom);
        slot.root.rotation.set(0, facing, 0);
      }

      // Shadow stays flat on the ground.
      this.euler.set(-Math.PI / 2, 0, 0);
      this.quat.setFromEuler(this.euler);
      this.matrix.compose(
        this.position.set(this.walkFrom.x, this.walkFrom.y + 0.03, this.walkFrom.z),
        this.quat,
        this.scale.set(1, 1, 1)
      );
      this.shadows.setMatrixAt(i, this.matrix);

      // Shoulder lamp, roughly where it sat on the old figure so the night
      // read of the settlement does not change.
      this.euler.set(0, facing, 0);
      this.quat.setFromEuler(this.euler);
      this.matrix.compose(
        this.position.set(
          this.walkFrom.x + Math.sin(facing + 1.3) * 0.26,
          this.walkFrom.y + 1.42,
          this.walkFrom.z + Math.cos(facing + 1.3) * 0.26
        ),
        this.quat,
        this.scale.set(1, 1, 1)
      );
      this.lamps.setMatrixAt(i, this.matrix);
    }
    this.shadows.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  /** Crossfade between standing and walking, only on an actual change. */
  private setFigureAnimation(slot: CrewSlot, next: 'idle' | 'walk'): void {
    if (slot.playing === next) return;
    const to = next === 'walk' ? slot.walk : slot.idle;
    const from = next === 'walk' ? slot.idle : slot.walk;
    if (!to) return;
    to.enabled = true;
    to.setEffectiveWeight(1);
    if (from) from.crossFadeTo(to, 0.32, false);
    else to.fadeIn(0.32);
    slot.playing = next;
  }
}
