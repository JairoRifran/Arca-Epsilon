import * as THREE from 'three';

type LightSource = {
  /** The light the world built. Kept as a descriptor, never rendered. */
  readonly light: THREE.PointLight;
  readonly position: THREE.Vector3;
  score: number;
  /** Slot this source is currently driving, or -1. */
  slot: number;
};

/**
 * A fixed pool of real point lights.
 *
 * three.js compiles a separate shader program for every distinct light count,
 * so a scene whose visible-light total moves as the camera turns recompiles
 * every lit material on the way — the exact stutter a decorative lamp is not
 * worth. This keeps the renderer looking at a constant number of point lights
 * for the whole session: the world's own lights become descriptors that are
 * never drawn, and each frame the most relevant ones are copied into the pool.
 * Unused slots stay in the scene with zero intensity, so the count the shader
 * sees never changes and no recompile is ever triggered by lighting.
 *
 * A source is judged on whether the volume it can reach is on screen at all,
 * then on distance, mission relevance and how bright it actually is. Selection
 * runs a few times a second with hysteresis, so a light already lit is not
 * dropped the moment a nearer one appears.
 *
 * The lamp meshes themselves are untouched: an unselected lamp keeps its
 * emissive material and still reads as lit hardware, it simply stops casting
 * light onto its surroundings from off screen.
 */
export class LightPool {
  private readonly slots: THREE.PointLight[] = [];
  private readonly sources: LightSource[] = [];
  private readonly order: number[] = [];

  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly influence = new THREE.Sphere();
  private readonly cameraPosition = new THREE.Vector3();
  /** Objective the active mission wants lit, if any. */
  private readonly priority = new THREE.Vector3();
  private hasPriority = false;

  private accumulator = Number.POSITIVE_INFINITY;
  private assignedCount = 0;

  readonly group = new THREE.Group();

  constructor(
    slotCount = 10,
    /** Seconds between selections; 4-8 Hz is well above how fast this changes. */
    private readonly interval = 0.16,
    /** Score bonus a selected source keeps, as a fraction of its reach. */
    private readonly stickiness = 0.3
  ) {
    this.group.name = 'Light Pool';
    // The pool never moves as a group; only the individual slots do.
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
    this.setSlotCount(slotCount);
  }

  get slotCount(): number {
    return this.slots.length;
  }

  get activeCount(): number {
    return this.assignedCount;
  }

  get sourceCount(): number {
    return this.sources.length;
  }

  /**
   * Resize the pool. Changing this changes the light count the renderer sees,
   * so it recompiles once — which is why it is a profile switch and not
   * something the selection loop is allowed to do.
   */
  setSlotCount(count: number): void {
    const target = Math.max(1, Math.round(count));
    while (this.slots.length > target) {
      const light = this.slots.pop();
      if (light) this.group.remove(light);
    }
    while (this.slots.length < target) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.name = `Pool Light ${this.slots.length}`;
      // Slots are positioned explicitly every selection, never animated by a
      // parent, so they compose their own matrix on demand.
      light.matrixAutoUpdate = false;
      light.castShadow = false;
      this.slots.push(light);
      this.group.add(light);
    }
    for (const source of this.sources) source.slot = -1;
    this.accumulator = Number.POSITIVE_INFINITY;
  }

  /**
   * Adopt a light as a descriptor. It stops being rendered immediately; its
   * contribution now arrives through the pool.
   */
  register(light: THREE.PointLight): void {
    if (light.userData.isPoolSlot) return;
    for (const source of this.sources) if (source.light === light) return;
    light.visible = false;
    light.userData.pooled = true;
    this.sources.push({ light, position: new THREE.Vector3(), score: Number.POSITIVE_INFINITY, slot: -1 });
    this.order.push(this.sources.length - 1);
  }

  /** Adopt every point light under a root that is not a pool slot already. */
  registerSubtree(root: THREE.Object3D): void {
    root.traverse((object) => {
      const light = object as THREE.PointLight;
      if (light.isPointLight && !light.userData.pooled && !this.slots.includes(light)) {
        this.register(light);
      }
    });
  }

  /** Bias selection toward the active objective so mission hardware stays lit. */
  setPriorityTarget(position: THREE.Vector3 | null): void {
    this.hasPriority = position !== null;
    if (position) this.priority.copy(position);
  }

  update(deltaSeconds: number, camera: THREE.Camera): void {
    this.accumulator += deltaSeconds;
    if (this.accumulator < this.interval) return;
    this.accumulator = 0;

    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);

    for (let i = 0; i < this.sources.length; i += 1) {
      const source = this.sources[i];
      const light = source.light;
      // A pooled source must never render itself; entity code that flips the
      // flag back is corrected here rather than fought every frame.
      if (light.visible) light.visible = false;

      if (light.intensity <= 0 || !this.parentsVisible(light)) {
        source.score = Number.POSITIVE_INFINITY;
        continue;
      }
      light.getWorldPosition(source.position);
      const reach = light.distance > 0 ? light.distance : LightPool.INFINITE_REACH;
      const margin = source.slot >= 0 ? reach * this.stickiness : 0;
      this.influence.center.copy(source.position);
      this.influence.radius = reach + margin;
      // Nothing outside the frustum can put light on a pixel that is drawn.
      if (!this.frustum.intersectsSphere(this.influence)) {
        source.score = Number.POSITIVE_INFINITY;
        continue;
      }
      // Lower is better: near, bright, mission-relevant lights win a slot.
      const distance = source.position.distanceTo(this.cameraPosition);
      const relative = distance / Math.max(1, reach);
      const brightness = 1 / (1 + light.intensity);
      const missionBonus =
        this.hasPriority && source.position.distanceTo(this.priority) < reach ? LightPool.PRIORITY_BONUS : 0;
      source.score = relative + brightness * 0.25 - missionBonus - (source.slot >= 0 ? this.stickiness : 0);
    }

    // Insertion sort over the reused index array: the list is short and almost
    // always already ordered, so this beats allocating a sorted copy per tick.
    for (let i = 0; i < this.order.length; i += 1) this.order[i] = i;
    for (let i = 1; i < this.order.length; i += 1) {
      const current = this.order[i];
      const score = this.sources[current].score;
      let j = i - 1;
      while (j >= 0 && this.sources[this.order[j]].score > score) {
        this.order[j + 1] = this.order[j];
        j -= 1;
      }
      this.order[j + 1] = current;
    }

    let assigned = 0;
    for (let i = 0; i < this.order.length; i += 1) {
      const source = this.sources[this.order[i]];
      if (assigned < this.slots.length && source.score !== Number.POSITIVE_INFINITY) {
        const slot = this.slots[assigned];
        slot.position.copy(source.position);
        slot.color.copy(source.light.color);
        slot.intensity = source.light.intensity;
        slot.distance = source.light.distance;
        slot.decay = source.light.decay;
        slot.updateMatrix();
        slot.updateMatrixWorld(true);
        source.slot = assigned;
        assigned += 1;
      } else {
        source.slot = -1;
      }
    }
    // Spare slots stay in the scene so the count never changes; a zero
    // intensity costs the shader a multiply and contributes nothing.
    for (let i = assigned; i < this.slots.length; i += 1) {
      if (this.slots[i].intensity !== 0) this.slots[i].intensity = 0;
    }
    this.assignedCount = assigned;
  }

  private parentsVisible(light: THREE.Object3D): boolean {
    let parent = light.parent;
    while (parent) {
      if (!parent.visible) return false;
      parent = parent.parent;
    }
    return true;
  }

  /** Stand-in reach for a light three.js treats as unbounded. */
  private static readonly INFINITE_REACH = 1e6;
  /** How strongly the active objective pulls a slot toward itself. */
  private static readonly PRIORITY_BONUS = 0.6;
}
