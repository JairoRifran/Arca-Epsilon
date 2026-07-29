import * as THREE from 'three';
import { INCURSION_LANES, mission19Tuning } from '../assets/mission19Definitions';

/** Lifecycle of one ground breach unit. */
export type BreachState = 'idle' | 'approach' | 'infiltrate' | 'extract' | 'evade' | 'damaged' | 'destroyed';

type BreachSlot = {
  group: THREE.Group;
  body: THREE.Mesh;
  eyeMaterial: THREE.MeshStandardMaterial;
  legs: THREE.Mesh[];
  state: BreachState;
  health: number;
  /** 0..1 along its lane toward the Atlas gate. */
  progress: number;
  laneIndex: number;
  stateAge: number;
  active: boolean;
  /** True for the single heavier extraction unit. */
  extraction: boolean;
};

/** Deterministic hash: a slot always walks the same lane the same way. */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 47.3) * 27183.845;
  return s - Math.floor(s);
}

/**
 * The Coalition's ground breach units for M19.
 *
 * Small, dark and obviously not human: a low hovering chassis on three stubby
 * mechanical legs, one dull red sensor slit, no face and no arms. They walk
 * fixed lanes from the perimeter toward the Atlas gate — no pathfinding — and
 * are stopped by Nereida's remote defences, never by the pilot on foot.
 *
 * The pool is built lazily on the first wave, so M01-M18 never pay for it, and
 * geometry/materials are shared across the pool. AI runs on a fixed interval
 * rather than every frame, and no `Math.random()` is used after construction.
 */
export class CoalitionBreachDrone {
  readonly group = new THREE.Group();

  /** WeaponTarget-compatible records: the ship's guns work on these too. */
  readonly targets: { object: THREE.Object3D; radius: number; health: number; hostile: boolean }[] = [];

  private readonly slots: BreachSlot[] = [];
  private chassisMaterial?: THREE.MeshStandardMaterial;
  private legMaterial?: THREE.MeshStandardMaterial;
  private built = false;
  /** The Atlas gate every lane converges on. */
  private readonly goal = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private aiAccumulator = 0;
  /** Ground height provider, so units sit on the real terrain. */
  private groundHeight: (x: number, z: number) => number = () => 0;

  constructor() {
    this.group.name = 'Unidades de Brecha // Coalición';
    this.group.visible = false;
  }

  /** Where the lanes converge, and how to seat units on the terrain. */
  setGoal(x: number, y: number, z: number, groundHeight: (gx: number, gz: number) => number): void {
    this.goal.set(x, y, z);
    this.groundHeight = groundHeight;
  }

  /** Build the pool on first use. Never at boot. */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2023, roughness: 0.58, metalness: 0.7 });
    this.legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3237, roughness: 0.5, metalness: 0.78 });

    const bodyGeometry = new THREE.OctahedronGeometry(1.15, 0);
    const shellGeometry = new THREE.BoxGeometry(1.9, 0.44, 1.35);
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.14, 1.25, 6);
    const slitGeometry = new THREE.BoxGeometry(0.62, 0.12, 0.1);

    for (let i = 0; i < mission19Tuning.maxGroundEnemies; i += 1) {
      const unit = new THREE.Group();
      unit.name = `Unidad de Brecha Coalición ${i + 1}`;
      unit.visible = false;

      const body = new THREE.Mesh(bodyGeometry, this.chassisMaterial!);
      body.scale.set(1, 0.68, 1.1);
      body.position.y = 1.15;
      unit.add(body);

      const shell = new THREE.Mesh(shellGeometry, this.legMaterial!);
      shell.position.y = 1.2;
      unit.add(shell);

      // Three stubby legs: it walks low, it does not stride.
      const legs: THREE.Mesh[] = [];
      for (let l = 0; l < 3; l += 1) {
        const angle = l * ((Math.PI * 2) / 3) + 0.4;
        const leg = new THREE.Mesh(legGeometry, this.legMaterial!);
        leg.position.set(Math.cos(angle) * 0.72, 0.6, Math.sin(angle) * 0.72);
        leg.rotation.z = Math.cos(angle) * 0.28;
        leg.rotation.x = -Math.sin(angle) * 0.28;
        legs.push(leg);
        unit.add(leg);
      }

      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x150c0c,
        emissive: 0x8f2616,
        emissiveIntensity: 0.4,
        roughness: 0.32,
        metalness: 0.3
      });
      const slit = new THREE.Mesh(slitGeometry, eyeMaterial);
      slit.position.set(0, 1.22, -0.72);
      unit.add(slit);

      unit.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });

      this.slots.push({
        group: unit,
        body,
        eyeMaterial,
        legs,
        state: 'idle',
        health: 0,
        progress: 0,
        laneIndex: 0,
        stateAge: 0,
        active: false,
        extraction: false
      });
      this.targets.push({ object: unit, radius: mission19Tuning.breachDroneRadius, health: 0, hostile: true });
      this.group.add(unit);
    }
  }

  get activeCount(): number {
    return this.slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }

  /** The extraction unit's position, for the counterattack marker. */
  get extractionPosition(): THREE.Vector3 | null {
    const slot = this.slots.find((s) => s.active && s.extraction);
    return slot ? slot.group.position : null;
  }

  /**
   * Launch a ground wave. Idempotent while a wave is live, so a re-sync never
   * duplicates units. The last unit of a wave can be the heavier extractor.
   */
  launchWave(count: number, withExtractionUnit = false): void {
    if (this.activeCount > 0) return;
    this.ensureBuilt();
    const wanted = Math.min(count, this.slots.length);
    this.group.visible = true;
    for (let i = 0; i < wanted; i += 1) {
      const slot = this.slots[i];
      const isExtractor = withExtractionUnit && i === wanted - 1;
      slot.active = true;
      slot.extraction = isExtractor;
      slot.state = 'approach';
      slot.health = isExtractor ? mission19Tuning.extractionUnitHealth : mission19Tuning.breachDroneHealth;
      slot.laneIndex = i % INCURSION_LANES.length;
      // Deterministic stagger so units never overlap on a shared lane.
      slot.progress = -hash(i * 3.1) * 0.22;
      slot.stateAge = 0;
      slot.group.visible = true;
      slot.group.scale.setScalar(isExtractor ? 1.5 : 1);
      slot.eyeMaterial.emissiveIntensity = 0.4;
      this.targets[i].health = slot.health;
      this.targets[i].radius = mission19Tuning.breachDroneRadius * (isExtractor ? 1.5 : 1);
      this.targets[i].hostile = true;
    }
    for (let i = wanted; i < this.slots.length; i += 1) this.deactivate(i);
  }

  clearAll(): void {
    for (let i = 0; i < this.slots.length; i += 1) this.deactivate(i);
    this.group.visible = false;
  }

  private deactivate(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.active = false;
    slot.state = 'idle';
    slot.health = 0;
    slot.extraction = false;
    slot.group.visible = false;
    this.targets[index].health = 0;
  }

  /**
   * Advance the incursion. `onDestroyed` fires once per unit lost;
   * `onReachedGoal` fires when a unit arrives at the gate, so the caller can
   * damage the base. Units that arrive keep working (they do not despawn) so
   * the pressure is visible until the defences kill them.
   */
  update(
    delta: number,
    elapsed: number,
    onDestroyed: (wasExtraction: boolean) => void,
    onReachedGoal: (position: THREE.Vector3) => void
  ): void {
    if (!this.group.visible) return;

    this.aiAccumulator += delta;
    const runAi = this.aiAccumulator >= mission19Tuning.aiIntervalSeconds;
    if (runAi) this.aiAccumulator = 0;

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (!slot.active) continue;
      const target = this.targets[i];

      // Damage written by the ship's WeaponSystem or Nereida's defences.
      if (target.health < slot.health) {
        slot.health = target.health;
        if (slot.health > 0 && slot.state !== 'destroyed') {
          slot.state = 'damaged';
          slot.stateAge = 0;
        }
      }
      if (slot.health <= 0 && slot.state !== 'destroyed') {
        const wasExtraction = slot.extraction;
        slot.state = 'destroyed';
        this.deactivate(i);
        onDestroyed(wasExtraction);
        if (this.activeCount === 0) this.group.visible = false;
        continue;
      }

      slot.stateAge += delta;

      // --- Deterministic lane walk toward the gate. A damaged unit slows; an
      // extractor pushes on regardless.
      const speedScale = slot.state === 'damaged' ? 0.55 : slot.state === 'evade' ? 0.75 : 1;
      const lane = INCURSION_LANES[slot.laneIndex];
      const previous = slot.progress;
      if (slot.state !== 'extract') {
        slot.progress = Math.min(1, slot.progress + (delta * mission19Tuning.breachSpeed * speedScale) / 160);
      }
      const t = Math.max(0, slot.progress);
      const x = lane[0] + (this.goal.x - lane[0]) * t;
      const z = lane[1] + (this.goal.z - lane[1]) * t;
      const y = this.groundHeight(x, z);
      slot.group.position.set(x, y, z);
      this.scratch.set(this.goal.x, y, this.goal.z);
      slot.group.lookAt(this.scratch);
      // Legs bob as it walks: cheap, deterministic, no allocation.
      for (let l = 0; l < slot.legs.length; l += 1) {
        slot.legs[l].position.y = 0.6 + Math.sin(elapsed * 5 + l * 2.1 + i) * 0.06 * speedScale;
      }

      // Arrival at the gate: reported once, on the frame it crosses.
      if (previous < 1 && slot.progress >= 1) {
        slot.state = 'extract';
        slot.stateAge = 0;
        onReachedGoal(slot.group.position);
      }

      if (runAi) {
        switch (slot.state) {
          case 'approach':
            if (slot.progress > 0.55) { slot.state = 'infiltrate'; slot.stateAge = 0; }
            break;
          case 'infiltrate':
            // Nothing to decide: it keeps walking until it arrives or dies.
            break;
          case 'damaged':
            if (slot.stateAge > 2.4) { slot.state = 'evade'; slot.stateAge = 0; }
            break;
          case 'evade':
            if (slot.stateAge > 1.8) { slot.state = 'infiltrate'; slot.stateAge = 0; }
            break;
          case 'extract':
            // Siphoning at the gate; the mission's own timer governs the leak.
            break;
          default:
            break;
        }
      }

      const maxHealth = slot.extraction ? mission19Tuning.extractionUnitHealth : mission19Tuning.breachDroneHealth;
      const hurt = 1 - Math.max(0, slot.health) / maxHealth;
      slot.eyeMaterial.emissiveIntensity =
        (slot.state === 'extract' ? 0.75 : 0.4) * (1 - hurt * 0.6) + Math.sin(elapsed * 4 + i) * 0.05;
      slot.body.rotation.y += delta * 0.25;
    }
  }

  /** Damage the nearest unit from a remote defence. True if it killed. */
  damageNearest(from: THREE.Vector3, range: number, amount: number): boolean {
    let best = -1;
    let bestDistance = range;
    for (let i = 0; i < this.slots.length; i += 1) {
      if (!this.slots[i].active) continue;
      const d = this.slots[i].group.position.distanceTo(from);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    if (best < 0) return false;
    this.targets[best].health -= amount;
    return this.targets[best].health <= 0;
  }

  /** Nearest unit position within range, for a defence to track. */
  nearestPosition(from: THREE.Vector3, range: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDistance = range;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const d = slot.group.position.distanceTo(from);
      if (d < bestDistance) { bestDistance = d; best = slot.group.position; }
    }
    return best;
  }

  dispose(): void {
    for (const slot of this.slots) slot.eyeMaterial.dispose();
    this.chassisMaterial?.dispose();
    this.legMaterial?.dispose();
  }
}
