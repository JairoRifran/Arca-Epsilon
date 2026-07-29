import * as THREE from 'three';
import { mission20Tuning } from '../assets/mission20Definitions';

/** Lifecycle of the electronic-warfare unit. */
export type JammerState = 'idle' | 'drift' | 'jamming' | 'damaged' | 'destroyed';

/**
 * The Coalition's electronic-warfare unit for M20.
 *
 * One slow, heavily built machine that suppresses lock-on and part of the HUD
 * while it lives. Deliberately not a fighter: a broad dark spine, two folded
 * dish arrays and a dull red core, drifting on a fixed deterministic arc around
 * the Ark rather than manoeuvring. It is protected by escorts (M18's scout
 * drone pool), so the pilot has to clear those before it can be finished.
 *
 * Built lazily on first deployment, so M01-M19 never pay for it. Geometry and
 * materials are created once; nothing is allocated per frame and no
 * `Math.random()` is used after construction.
 */
export class CoalitionJammer {
  readonly group = new THREE.Group();

  /** WeaponTarget-compatible record, so the ship's guns work on it unchanged. */
  readonly target = {
    object: this.group as THREE.Object3D,
    radius: mission20Tuning.jammerRadius,
    health: 0,
    hostile: true
  };

  private hullMaterial?: THREE.MeshStandardMaterial;
  private dishMaterial?: THREE.MeshStandardMaterial;
  private coreMaterial?: THREE.MeshStandardMaterial;
  private dishes: THREE.Mesh[] = [];
  private built = false;
  private state: JammerState = 'idle';
  private active = false;
  /** Angle along its deterministic drift arc around the Ark. */
  private angle = 0;
  private readonly origin = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private aiAccumulator = 0;

  constructor() {
    this.group.name = 'Interferidor de la Coalición';
    this.group.visible = false;
  }

  /** Centre the drift arc on the Ark. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y, z);
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.hullMaterial = new THREE.MeshStandardMaterial({ color: 0x191d21, roughness: 0.6, metalness: 0.72 });
    this.dishMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3037, roughness: 0.44, metalness: 0.8 });
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x160c0c,
      emissive: 0x93261a,
      emissiveIntensity: 0.5,
      roughness: 0.34,
      metalness: 0.3
    });

    // Broad spine: reads as equipment, not as a fighter.
    const spine = new THREE.Mesh(new THREE.BoxGeometry(26, 4.4, 8), this.hullMaterial);
    this.group.add(spine);
    const block = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 11), this.hullMaterial);
    this.group.add(block);

    // Two folded dish arrays, slowly counter-rotating while jamming.
    const dishGeometry = new THREE.CylinderGeometry(7.5, 1.6, 1.6, 14, 1, true);
    for (const side of [-1, 1]) {
      const dish = new THREE.Mesh(dishGeometry, this.dishMaterial!);
      dish.position.set(side * 13, 3.2, 0);
      dish.rotation.z = side * 0.5;
      this.dishes.push(dish);
      this.group.add(dish);
    }

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), this.coreMaterial!);
    core.position.y = -1.4;
    this.group.add(core);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  get isActive(): boolean {
    return this.active;
  }
  get position(): THREE.Vector3 {
    return this.group.position;
  }
  get alive(): boolean {
    return this.active && this.target.health > 0;
  }

  /** Deploy the jammer. Idempotent: re-calling while live changes nothing. */
  deploy(): void {
    if (this.active) return;
    this.ensureBuilt();
    this.active = true;
    this.state = 'drift';
    this.target.health = mission20Tuning.jammerHealth;
    this.target.hostile = true;
    this.angle = 0.7;
    // Place it on its arc immediately. Without this the group sits at the world
    // origin for the first frames, which can read as "already located" from
    // anywhere near it — the hunt has to start at a real distance.
    this.group.position.set(
      this.origin.x + Math.cos(this.angle) * 760,
      this.origin.y + 120,
      this.origin.z + Math.sin(this.angle) * 760
    );
    this.group.visible = true;
  }

  clear(): void {
    this.active = false;
    this.state = 'idle';
    this.target.health = 0;
    this.group.visible = false;
  }

  /**
   * Advance the jammer. `onDestroyed` fires once, on the frame it dies.
   * Movement is a fixed arc: slow, predictable and easy to run down.
   */
  update(delta: number, elapsed: number, onDestroyed: () => void): void {
    if (!this.active) return;

    if (this.target.health <= 0) {
      this.state = 'destroyed';
      this.clear();
      onDestroyed();
      return;
    }
    if (this.target.health < mission20Tuning.jammerHealth * 0.5) this.state = 'damaged';

    this.aiAccumulator += delta;
    if (this.aiAccumulator >= mission20Tuning.aiIntervalSeconds) {
      this.aiAccumulator = 0;
      if (this.state === 'drift') this.state = 'jamming';
    }

    // Wide, slow arc well off the Ark's hull.
    this.angle += delta * 0.055;
    const radius = 760;
    this.scratch.set(
      this.origin.x + Math.cos(this.angle) * radius,
      this.origin.y + 120 + Math.sin(elapsed * 0.18) * 14,
      this.origin.z + Math.sin(this.angle) * radius
    );
    this.group.position.lerp(this.scratch, Math.min(1, delta * 0.9));
    this.group.lookAt(this.origin);

    const hurt = 1 - Math.max(0, this.target.health) / mission20Tuning.jammerHealth;
    for (let i = 0; i < this.dishes.length; i += 1) {
      this.dishes[i].rotation.y += delta * (i === 0 ? 0.5 : -0.4) * (this.state === 'damaged' ? 0.4 : 1);
    }
    if (this.coreMaterial) {
      this.coreMaterial.emissiveIntensity = 0.5 * (1 - hurt * 0.6) + Math.sin(elapsed * 5) * 0.08;
    }
  }

  dispose(): void {
    this.hullMaterial?.dispose();
    this.dishMaterial?.dispose();
    this.coreMaterial?.dispose();
    for (const dish of this.dishes) dish.geometry.dispose();
  }
}
