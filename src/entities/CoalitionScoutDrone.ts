import * as THREE from 'three';
import {
  coalitionPalette,
  createCoalitionFacetedHullGeometry,
  createCoalitionMaterialFamily,
  createCoalitionSweptWingGeometry,
  type CoalitionMaterialFamily
} from '../assets/coalitionVisualLanguage';
import { createSoftParticleTexture } from '../assets/materials';
import { mission18Tuning } from '../assets/mission18Definitions';
import { combatTuningProfile } from '../game/CombatTuningProfile';
import type { WeaponTarget } from '../systems/WeaponSystem';

/** Lifecycle of one scout drone. */
export type DroneState =
  | 'idle'
  | 'detect'
  | 'intercept'
  | 'align'
  | 'attack'
  | 'break'
  | 'extend'
  | 'reposition'
  | 'support'
  | 'critical'
  | 'retreat'
  | 'destroyed';

/** Deterministic per-drone flight parameters, assigned by slot index. */
type DroneSlot = {
  group: THREE.Group;
  lod: THREE.LOD;
  hull: THREE.Mesh;
  ring: THREE.Mesh;
  barrel: THREE.Mesh;
  thrusterCores: THREE.Mesh[];
  thrusterPlumes: THREE.Mesh[];
  thrusterMaterial: THREE.MeshStandardMaterial;
  thrusterPlumeMaterial: THREE.MeshBasicMaterial;
  eyeMaterial: THREE.MeshStandardMaterial;
  /** Sparse ionized vent, shown from `damaged` onward. */
  smoke: THREE.Points;
  smokeMaterial: THREE.PointsMaterial;
  smokeVelocities: Float32Array;
  state: DroneState;
  health: number;
  /** Angle along the deterministic approach ring. */
  angle: number;
  /** Ring radius and altitude offsets, so drones stay separated. */
  radiusOffset: number;
  altitudeOffset: number;
  /** Seconds since this drone entered its current state. */
  stateAge: number;
  /** Attack passes flown so far. */
  passes: number;
  active: boolean;
  muzzlePulse: number;
  deathVisual: boolean;
  deathAge: number;
  /** Integrated world velocity; also referenced by WeaponTarget. */
  velocity: THREE.Vector3;
  desiredVelocity: THREE.Vector3;
  desiredQuaternion: THREE.Quaternion;
  angularSpeed: number;
  firedThisPass: boolean;
  attackRunStartedAt: number;
  repositionBias: number;
};

export type ScoutCombatDiagnostics = {
  active: number;
  simultaneousAttackers: number;
  maximumSimultaneousAttackersObserved: number;
  averageDistance: number;
  averageSpeed: number;
  closeRangeTimePercent: number;
  firstShotSeconds: number;
  averageAttackRunSeconds: number;
  shotsFired: number;
  completedPasses: number;
  obstacleAvoidanceActive: boolean;
  states: Record<DroneState, number>;
};

const SMOKE_PER_DRONE = 8;
/** Deterministic hash: same slot always flies the same route. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The Coalition's armed-reconnaissance scout drones.
 *
 * A fixed pool of `maxActiveDrones` units, allocated once and reused for every
 * wave — nothing is created or disposed mid-combat. Each is a dark, obviously
 * non-human machine: a faceted dark hull, a cold thruster ring, one dull red
 * sensor eye and a contained energy weapon. Damage shows as smoke and a dimming
 * eye before the unit is lost.
 *
 * The AI is deliberately simple and deterministic: each drone flies a fixed
 * approach ring at its own radius/altitude offset (so they never stack), makes
 * attack passes toward the settlement, and retreats. There is no pathfinding
 * and no `Math.random()` after construction, so a wave is reproducible in a
 * test and a reload always re-flies the same routes.
 *
 * Geometry and materials are shared across the pool; the per-drone eye material
 * is the only per-unit material, so damage can be shown individually. AI runs
 * on a fixed interval rather than every frame.
 */
export class CoalitionScoutDrone {
  readonly group = new THREE.Group();

  /** One WeaponTarget-compatible record per slot; the ship shoots these. */
  readonly targets: WeaponTarget[] = [];

  private readonly slots: DroneSlot[] = [];
  private hullMaterial?: THREE.MeshStandardMaterial;
  private trimMaterial?: THREE.MeshStandardMaterial;
  private materialFamily?: CoalitionMaterialFamily;
  private portNavigationMaterial?: THREE.MeshStandardMaterial;
  private starboardNavigationMaterial?: THREE.MeshStandardMaterial;
  private smokeTexture?: THREE.Texture;
  /** The pool is built on first use, never at boot. */
  private built = false;
  /** Settlement centre the wave orbits and attacks. */
  private readonly origin = new THREE.Vector3();
  private aiAccumulator = 0;
  private environment: 'vacuum' | 'atmosphere' = 'vacuum';
  /** Set by the mission when the runner must break away. */
  private retreatSlot = -1;
  private readonly scratch = new THREE.Vector3();
  private readonly lookAtScratch = new THREE.Vector3();
  private readonly flightDirectionScratch = new THREE.Vector3();
  private readonly muzzleScratch = new THREE.Vector3();
  private readonly steeringScratch = new THREE.Vector3();
  private readonly outwardScratch = new THREE.Vector3();
  private readonly desiredPositionScratch = new THREE.Vector3();
  private readonly obstacleCenter = new THREE.Vector3();
  private readonly orientationMatrix = new THREE.Matrix4();
  private obstacleRadius = 0;
  private obstacleEnabled = false;
  private engagementAge = 0;
  private metricActiveSeconds = 0;
  private metricCloseSeconds = 0;
  private metricDistanceSeconds = 0;
  private metricSpeedSeconds = 0;
  private shotsFired = 0;
  private firstShotAt = -1;
  private completedPasses = 0;
  private attackRunSeconds = 0;
  private maximumSimultaneousAttackersObserved = 0;

  constructor() {
    this.group.name = 'Drones de Reconocimiento // Coalición';
    this.group.visible = false;
  }

  /**
   * Build the pool. Deliberately lazy: M01-M17 never pay for M18's geometry,
   * materials or textures, and a player who never reaches the engagement never
   * allocates a drone. Called on the first wave launch; safe to call again.
   */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.materialFamily = createCoalitionMaterialFamily();
    this.hullMaterial = this.materialFamily.hull;
    this.trimMaterial = this.materialFamily.armor;
    this.portNavigationMaterial = new THREE.MeshStandardMaterial({
      color: 0x271011,
      emissive: 0x8f2828,
      emissiveIntensity: 0.42,
      roughness: 0.4,
      metalness: 0.2
    });
    this.starboardNavigationMaterial = new THREE.MeshStandardMaterial({
      color: 0x10231f,
      emissive: 0x318879,
      emissiveIntensity: 0.38,
      roughness: 0.4,
      metalness: 0.2
    });
    // Cold, dim propulsion: never a bright engine glow.
    this.smokeTexture = createSoftParticleTexture(32);

    // One shared geometry set for the whole pool.
    const hullGeometry = createCoalitionFacetedHullGeometry(4.4, 2.1, 6.2);
    const spineGeometry = createCoalitionFacetedHullGeometry(1.2, 0.55, 5.6);
    const podGeometry = createCoalitionFacetedHullGeometry(0.9, 0.72, 2.5);
    const ringGeometry = createCoalitionSweptWingGeometry(3.8, 3.4, 0.28, 0.75);
    const eyeGeometry = new THREE.CylinderGeometry(0.38, 0.32, 0.16, 12);
    const barrelGeometry = createCoalitionFacetedHullGeometry(0.4, 0.3, 2.1);
    const thrusterCoreGeometry = new THREE.CircleGeometry(0.48, 16);
    const thrusterPlumeGeometry = new THREE.ConeGeometry(0.48, 2.8, 10, 1, true);
    const navigationGeometry = new THREE.TetrahedronGeometry(0.13, 0);

    for (let i = 0; i < mission18Tuning.maxActiveDrones; i += 1) {
      const drone = new THREE.Group();
      drone.name = `Dron Explorador Coalición ${i + 1}`;
      drone.visible = false;
      const lod = new THREE.LOD();
      lod.name = `LOD Explorador Coalición ${i + 1}`;
      const highDetail = new THREE.Group();
      highDetail.name = 'Scout Detail // Close';
      lod.addLevel(highDetail, 0);
      const lowDetail = new THREE.Group();
      lowDetail.name = 'Scout Silhouette // Far';
      lowDetail.add(
        new THREE.Mesh(hullGeometry, this.hullMaterial!),
        new THREE.Mesh(ringGeometry, this.trimMaterial!)
      );
      lod.addLevel(lowDetail, 420);
      drone.add(lod);

      const hull = new THREE.Mesh(hullGeometry, this.hullMaterial!);
      highDetail.add(hull);

      const spine = new THREE.Mesh(spineGeometry, this.trimMaterial!);
      spine.position.y = 0.82;
      highDetail.add(spine);

      const wings = new THREE.Mesh(ringGeometry, this.trimMaterial!);
      wings.position.z = 0.35;
      highDetail.add(wings);

      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(podGeometry, this.trimMaterial!);
        pod.position.set(side * 2.45, -0.18, 0.72);
        pod.rotation.y = side * -0.13;
        highDetail.add(pod);
      }

      // Twin recessed engines make the craft's aft direction readable.
      const thrusterMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2226,
        emissive: coalitionPalette.engine,
        emissiveIntensity: 0.22,
        roughness: 0.4,
        metalness: 0.6
      });
      const thrusterPlumeMaterial = new THREE.MeshBasicMaterial({
        color: coalitionPalette.engine,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const thrusterCores: THREE.Mesh[] = [];
      const thrusterPlumes: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const thrusterCore = new THREE.Mesh(thrusterCoreGeometry, thrusterMaterial);
        thrusterCore.position.set(side * 1.18, -0.18, 2.62);
        thrusterCores.push(thrusterCore);
        highDetail.add(thrusterCore);
        const thrusterPlume = new THREE.Mesh(thrusterPlumeGeometry, thrusterPlumeMaterial);
        thrusterPlume.rotation.x = Math.PI / 2;
        thrusterPlume.position.set(side * 1.18, -0.18, 3.95);
        thrusterPlumes.push(thrusterPlume);
        highDetail.add(thrusterPlume);
      }

      const portNavigation = new THREE.Mesh(navigationGeometry, this.portNavigationMaterial!);
      portNavigation.position.set(-2.9, 0.05, 0.2);
      const starboardNavigation = new THREE.Mesh(navigationGeometry, this.starboardNavigationMaterial!);
      starboardNavigation.position.set(2.9, 0.05, 0.2);
      highDetail.add(portNavigation, starboardNavigation);

      // Contained energy weapon: a short recessed barrel, no muzzle light.
      const barrel = new THREE.Mesh(barrelGeometry, this.trimMaterial!);
      barrel.position.set(0, -0.64, -2.25);
      highDetail.add(barrel);

      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x140b0b,
        emissive: 0x8c2418,
        emissiveIntensity: 0.42,
        roughness: 0.3,
        metalness: 0.3
      });
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(0, 0.12, -3.02);
      highDetail.add(eye);

      // Sparse ionized vent: expelled coolant/plasma, not terrestrial smoke.
      const positions = new Float32Array(SMOKE_PER_DRONE * 3);
      const velocities = new Float32Array(SMOKE_PER_DRONE * 3);
      for (let s = 0; s < SMOKE_PER_DRONE; s += 1) {
        velocities[s * 3] = (hash(i * 5.1 + s) - 0.5) * 2.2;
        velocities[s * 3 + 1] = 0.6 + hash(i * 7.7 + s) * 1.4;
        velocities[s * 3 + 2] = (hash(i * 9.3 + s) - 0.5) * 2.2;
      }
      const smokeGeometry = new THREE.BufferGeometry();
      smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      smokeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);
      const smokeMaterial = new THREE.PointsMaterial({
        color: 0x84b9bd,
        size: 0.8,
        map: this.smokeTexture!,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
      smoke.frustumCulled = false;
      smoke.visible = false;
      highDetail.add(smoke);

      const velocity = new THREE.Vector3();
      this.slots.push({
        group: drone,
        lod,
        hull,
        ring: wings,
        barrel,
        thrusterCores,
        thrusterPlumes,
        thrusterMaterial,
        thrusterPlumeMaterial,
        eyeMaterial,
        smoke,
        smokeMaterial,
        smokeVelocities: velocities,
        state: 'idle',
        health: 0,
        angle: 0,
        radiusOffset: 0,
        altitudeOffset: 0,
        stateAge: 0,
        passes: 0,
        active: false,
        muzzlePulse: 0,
        deathVisual: false,
        deathAge: 0,
        velocity,
        desiredVelocity: new THREE.Vector3(),
        desiredQuaternion: new THREE.Quaternion(),
        angularSpeed: 0,
        firedThisPass: false,
        attackRunStartedAt: 0,
        repositionBias: hash(i * 8.9) * 2 - 1
      });
      drone.userData.combatSurface = 'hull';
      drone.userData.combatMass = 'light';
      drone.userData.combatEngineAnchors = [[-1.18, -0.18, 2.62], [1.18, -0.18, 2.62]];
      drone.userData.combatVisualGeneration = 0;
      this.targets.push({
        id: `coalition-scout-${i + 1}`,
        object: drone,
        radius: mission18Tuning.droneRadius,
        health: 0,
        hostile: true,
        velocity
      });
      this.group.add(drone);
    }
  }

  /** Centre the engagement on the settlement. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y, z);
  }

  setEnvironment(environment: 'vacuum' | 'atmosphere'): void {
    this.environment = environment;
  }

  /** Optional massive structure avoided by every tactical route (the Ark in M25). */
  setNavigationObstacle(center: THREE.Vector3, radius: number): void {
    this.obstacleCenter.copy(center);
    this.obstacleRadius = Math.max(0, radius);
    this.obstacleEnabled = this.obstacleRadius > 0;
  }

  clearNavigationObstacle(): void {
    this.obstacleEnabled = false;
    this.obstacleRadius = 0;
  }

  get activeCount(): number {
    return this.slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }

  /** True while any drone is close enough to be pressing the colony. */
  get anyAttacking(): boolean {
    return this.slots.some((s) => s.active && s.state === 'attack');
  }

  /**
   * Launch a wave of `count` drones. Idempotent per wave: calling it again with
   * a wave already flying does nothing, so a re-sync never duplicates units.
   */
  launchWave(count: number, retreatRunner = false): void {
    if (this.activeCount > 0) return;
    this.ensureBuilt();
    const wanted = Math.min(count, this.slots.length);
    this.group.visible = true;
    this.engagementAge = 0;
    this.metricActiveSeconds = 0;
    this.metricCloseSeconds = 0;
    this.metricDistanceSeconds = 0;
    this.metricSpeedSeconds = 0;
    this.shotsFired = 0;
    this.firstShotAt = -1;
    this.completedPasses = 0;
    this.attackRunSeconds = 0;
    this.maximumSimultaneousAttackersObserved = 0;
    const profile = combatTuningProfile.units.light;
    for (let i = 0; i < wanted; i += 1) {
      const slot = this.slots[i];
      slot.active = true;
      slot.state = 'detect';
      slot.health = mission18Tuning.droneHealth;
      // Deterministic separation: evenly spread on the ring, then nudged by a
      // fixed per-slot hash so the formation is not a perfect polygon.
      slot.angle = (i / wanted) * Math.PI * 2 + hash(i * 3.3) * 0.35;
      slot.radiusOffset = (hash(i * 2.1) - 0.5) * 34;
      slot.altitudeOffset = (hash(i * 4.7) - 0.5) * 18;
      slot.stateAge = -(i % 3) * 0.34;
      slot.passes = 0;
      slot.muzzlePulse = 0;
      slot.deathVisual = false;
      slot.deathAge = 0;
      slot.angularSpeed = 0;
      slot.firedThisPass = false;
      slot.attackRunStartedAt = 0;
      const spawnRadius = profile.interceptDistance + slot.radiusOffset;
      slot.group.position.set(
        this.origin.x + Math.cos(slot.angle) * spawnRadius,
        this.origin.y + mission18Tuning.droneAltitude + slot.altitudeOffset,
        this.origin.z + Math.sin(slot.angle) * spawnRadius
      );
      slot.velocity.set(-Math.sin(slot.angle), 0, Math.cos(slot.angle)).multiplyScalar(profile.maximumSpeed * 0.22);
      slot.group.lookAt(this.origin);
      slot.group.visible = true;
      slot.group.userData.combatVisualGeneration = Number(slot.group.userData.combatVisualGeneration ?? 0) + 1;
      slot.group.userData.combatVisualKick = 0;
      slot.eyeMaterial.emissiveIntensity = 0.42;
      slot.smoke.visible = false;
      slot.smokeMaterial.opacity = 0;
      slot.thrusterMaterial.emissiveIntensity = 0.22;
      slot.thrusterPlumeMaterial.opacity = 0.12;
      this.targets[i].health = slot.health;
      this.targets[i].hostile = true;
    }
    for (let i = wanted; i < this.slots.length; i += 1) this.deactivate(i);
    this.retreatSlot = retreatRunner ? 0 : -1;
  }

  /** Clear the sky immediately (wave complete, mission reset, save load). */
  clearAll(): void {
    for (let i = 0; i < this.slots.length; i += 1) this.deactivate(i);
    this.group.visible = false;
    this.retreatSlot = -1;
  }

  private deactivate(index: number, preserveDeathVisual = false): void {
    const slot = this.slots[index];
    slot.active = false;
    slot.state = preserveDeathVisual ? 'destroyed' : 'idle';
    slot.health = 0;
    // Mirror it into the shared target list immediately. `update()` is what
    // normally syncs these, and it stops running once a wave ends, so a
    // cleared fleet left stale live-looking targets behind for every consumer
    // — the contact tracker kept drawing markers for drones that were gone.
    if (this.targets[index]) this.targets[index].health = 0;
    slot.deathVisual = preserveDeathVisual;
    slot.deathAge = 0;
    slot.group.visible = preserveDeathVisual;
    slot.smoke.visible = preserveDeathVisual;
    slot.smokeMaterial.opacity = preserveDeathVisual ? 0.32 : 0;
    slot.thrusterMaterial.emissiveIntensity = preserveDeathVisual ? 0.08 : 0.22;
    slot.thrusterPlumeMaterial.opacity = preserveDeathVisual ? 0.03 : 0.12;
    slot.group.userData.combatVisualKick = 0;
    slot.velocity.set(0, 0, 0);
    slot.desiredVelocity.set(0, 0, 0);
    slot.angularSpeed = 0;
    slot.firedThisPass = false;
    this.targets[index].health = 0;
    this.targets[index].hostile = false;
  }

  /**
   * Advance the fleet. `onDestroyed` fires once per drone lost, so the mission
   * can count kills; `onColonyHit` fires when an attacking drone completes a
   * pass, so the caller can damage the shield or the struck system.
   */
  update(
    delta: number,
    elapsed: number,
    onDestroyed: () => void,
    onColonyHit: (position: THREE.Vector3, muzzlePosition: THREE.Vector3) => void
  ): void {
    if (!this.group.visible) return;

    this.engagementAge += delta;

    // AI/target re-evaluation runs on a fixed interval, not every frame.
    this.aiAccumulator += delta;
    const runAi = this.aiAccumulator >= combatTuningProfile.aiUpdateSeconds;
    if (runAi) this.aiAccumulator = 0;

    const t = mission18Tuning;
    let simultaneousAttackers = 0;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (slot.active && (slot.state === 'align' || slot.state === 'attack')) simultaneousAttackers += 1;
    }
    this.maximumSimultaneousAttackersObserved = Math.max(
      this.maximumSimultaneousAttackersObserved,
      simultaneousAttackers
    );
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (!slot.active) {
        if (slot.deathVisual) {
          slot.deathAge += delta;
          slot.group.rotation.z += delta * 2.6;
          slot.group.rotation.x += delta * 0.7;
          slot.eyeMaterial.emissiveIntensity *= Math.exp(-8 * delta);
          slot.thrusterMaterial.emissiveIntensity *= Math.exp(-7 * delta);
          slot.thrusterPlumeMaterial.opacity *= Math.exp(-9 * delta);
          slot.smokeMaterial.opacity *= Math.exp(-2.4 * delta);
          if (slot.deathAge >= 0.52) {
            slot.deathVisual = false;
            slot.group.visible = false;
            slot.smoke.visible = false;
          }
        }
        continue;
      }
      const target = this.targets[i];

      // Damage taken by the ship's WeaponSystem writes straight into
      // target.health; mirror it back into the slot.
      if (target.health < slot.health) {
        slot.health = target.health;
        if (slot.health > 0 && slot.state !== 'destroyed') {
          this.enterState(slot, slot.health <= t.droneHealth * 0.45 ? 'critical' : 'break');
          slot.smoke.visible = slot.state === 'critical';
        }
      }

      if (slot.health <= 0 && slot.state !== 'destroyed') {
        slot.state = 'destroyed';
        slot.stateAge = 0;
        this.deactivate(i, true);
        onDestroyed();
        continue;
      }

      slot.stateAge += delta;
      const distanceToFocus = slot.group.position.distanceTo(this.origin);

      if (runAi) {
        simultaneousAttackers = this.advanceTacticalState(
          slot,
          i,
          distanceToFocus,
          simultaneousAttackers,
          onColonyHit
        );
      }
      this.updateTacticalFlight(slot, i, delta, elapsed);

      const impactKick = Number(slot.group.userData.combatVisualKick ?? 0);
      if (impactKick > 0.0001) {
        const impactDirection = Number(slot.group.userData.combatVisualKickDirection ?? 1);
        slot.group.rotateZ(impactDirection * impactKick * 1.8);
        slot.group.rotateX(impactKick * 0.55);
        slot.group.userData.combatVisualKick = impactKick * Math.exp(-7.5 * delta);
      }
      slot.hull.rotation.z = Math.sin(elapsed * 1.7 + i) * 0.008;
      slot.ring.rotation.z = Math.sin(elapsed * 1.15 + i * 0.7) * 0.018;

      // --- Damage read-out: eye dims, smoke thickens.
      const hurt = 1 - Math.max(0, slot.health) / t.droneHealth;
      slot.muzzlePulse = Math.max(0, slot.muzzlePulse - delta * 12);
      slot.eyeMaterial.emissiveIntensity = 0.42 * (1 - hurt * 0.7) + Math.sin(elapsed * 3 + i) * 0.05 + slot.muzzlePulse * 0.38;
      const thrustBase = slot.state === 'attack' || slot.state === 'break'
        ? 0.36
        : slot.state === 'extend' || slot.state === 'intercept'
          ? 0.3
          : 0.22;
      const failurePulse = hurt > 0.55 ? 0.5 + Math.sin(elapsed * 15 + i * 2.1) * 0.5 : 1;
      slot.thrusterMaterial.emissiveIntensity = Math.max(0.035, thrustBase * (1 - hurt * 0.72) * failurePulse);
      const plumeStrength = Math.max(0.02, (thrustBase + slot.muzzlePulse * 0.08) * (1 - hurt * 0.68) * failurePulse);
      slot.thrusterPlumeMaterial.opacity = plumeStrength * (this.environment === 'atmosphere' ? 0.62 : 0.42);
      for (let engine = 0; engine < slot.thrusterPlumes.length; engine += 1) {
        slot.thrusterPlumes[engine].scale.set(0.68 + thrustBase * 0.35, 0.72 + thrustBase * 1.8, 0.68 + thrustBase * 0.35);
        slot.thrusterCores[engine].scale.setScalar(0.86 + thrustBase * 0.22);
      }
      if (slot.smoke.visible) {
        const positions = slot.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = positions.array as Float32Array;
        for (let s = 0; s < array.length; s += 3) {
          array[s] += slot.smokeVelocities[s] * delta;
          array[s + 1] += slot.smokeVelocities[s + 1] * delta;
          array[s + 2] += slot.smokeVelocities[s + 2] * delta;
          // Recycle a mote once it drifts too far: no allocation.
          if (array[s + 1] > 6) { array[s] = 0; array[s + 1] = 0; array[s + 2] = 0; }
        }
        positions.needsUpdate = true;
        slot.smokeMaterial.opacity = Math.min(0.28, hurt * 0.34);
      }
    }
  }

  getCombatDiagnostics(): ScoutCombatDiagnostics {
    const states: Record<DroneState, number> = {
      idle: 0,
      detect: 0,
      intercept: 0,
      align: 0,
      attack: 0,
      break: 0,
      extend: 0,
      reposition: 0,
      support: 0,
      critical: 0,
      retreat: 0,
      destroyed: 0
    };
    let simultaneousAttackers = 0;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (!slot.active && !slot.deathVisual) continue;
      states[slot.state] += 1;
      if (slot.active && (slot.state === 'align' || slot.state === 'attack')) simultaneousAttackers += 1;
    }
    return {
      active: this.activeCount,
      simultaneousAttackers,
      maximumSimultaneousAttackersObserved: this.maximumSimultaneousAttackersObserved,
      averageDistance: this.metricActiveSeconds > 0 ? Number((this.metricDistanceSeconds / this.metricActiveSeconds).toFixed(2)) : 0,
      averageSpeed: this.metricActiveSeconds > 0 ? Number((this.metricSpeedSeconds / this.metricActiveSeconds).toFixed(2)) : 0,
      closeRangeTimePercent: this.metricActiveSeconds > 0 ? Number((this.metricCloseSeconds / this.metricActiveSeconds * 100).toFixed(2)) : 0,
      firstShotSeconds: this.firstShotAt >= 0 ? Number(this.firstShotAt.toFixed(2)) : -1,
      averageAttackRunSeconds: this.completedPasses > 0 ? Number((this.attackRunSeconds / this.completedPasses).toFixed(2)) : 0,
      shotsFired: this.shotsFired,
      completedPasses: this.completedPasses,
      obstacleAvoidanceActive: this.obstacleEnabled,
      states
    };
  }

  private advanceTacticalState(
    slot: DroneSlot,
    index: number,
    distanceToFocus: number,
    simultaneousAttackers: number,
    onColonyHit: (position: THREE.Vector3, muzzlePosition: THREE.Vector3) => void
  ): number {
    const profile = combatTuningProfile.units.light;
    switch (slot.state) {
      case 'detect':
        if (slot.stateAge >= 0.85 + (index % 3) * 0.24) this.enterState(slot, 'intercept');
        break;
      case 'intercept':
        if (distanceToFocus <= profile.preferredAttackDistance + 90 || slot.stateAge >= 6.2) {
          if (simultaneousAttackers < combatTuningProfile.maximumSimultaneousAttackers) {
            this.enterState(slot, 'align');
            simultaneousAttackers += 1;
          } else {
            this.enterState(slot, 'support');
          }
        }
        break;
      case 'support':
        if (
          slot.stateAge >= profile.repositionSeconds + (index % 3) * 0.55 &&
          simultaneousAttackers < combatTuningProfile.maximumSimultaneousAttackers
        ) {
          this.enterState(slot, 'align');
          simultaneousAttackers += 1;
        }
        break;
      case 'align':
        if (slot.stateAge >= profile.alignmentSeconds) this.enterState(slot, 'attack');
        break;
      case 'attack': {
        this.flightDirectionScratch.set(0, 0, -1).applyQuaternion(slot.group.quaternion).normalize();
        this.lookAtScratch.copy(this.origin).sub(slot.group.position).normalize();
        const aligned = this.flightDirectionScratch.dot(this.lookAtScratch) >= profile.firingArcCosine;
        const inWindow = distanceToFocus <= profile.preferredAttackDistance * 1.28 &&
          distanceToFocus >= profile.minimumSeparation * 0.76;
        if (!slot.firedThisPass && slot.stateAge >= profile.alignmentSeconds * 0.56 && aligned && inWindow) {
          slot.group.updateWorldMatrix(true, false);
          this.muzzleScratch.set(0, 0, -1.15);
          slot.barrel.localToWorld(this.muzzleScratch);
          slot.firedThisPass = true;
          slot.muzzlePulse = 1;
          this.shotsFired += 1;
          if (this.firstShotAt < 0) this.firstShotAt = this.engagementAge;
          onColonyHit(slot.group.position, this.muzzleScratch);
        }
        if (
          distanceToFocus <= profile.minimumSeparation ||
          slot.stateAge >= profile.maximumAttackRunSeconds ||
          slot.firedThisPass && slot.stateAge >= profile.maximumAttackRunSeconds * 0.72
        ) {
          slot.passes += 1;
          this.completedPasses += 1;
          this.attackRunSeconds += Math.max(0, this.engagementAge - slot.attackRunStartedAt);
          this.enterState(slot, index === this.retreatSlot && slot.passes >= 1 ? 'retreat' : 'break');
        }
        break;
      }
      case 'break':
        if (slot.stateAge >= 1.2 && distanceToFocus >= profile.breakDistance) this.enterState(slot, 'extend');
        break;
      case 'extend':
        if (slot.stateAge >= profile.extensionSeconds) this.enterState(slot, 'reposition');
        break;
      case 'reposition':
        if (slot.stateAge >= profile.repositionSeconds) this.enterState(slot, 'support');
        break;
      case 'critical':
        if (slot.stateAge >= 2.3) this.enterState(slot, slot.passes > 0 ? 'retreat' : 'break');
        break;
      case 'retreat':
        break;
      default:
        break;
    }
    return simultaneousAttackers;
  }

  private updateTacticalFlight(slot: DroneSlot, index: number, delta: number, elapsed: number): void {
    const profile = combatTuningProfile.units.light;
    const state = slot.state;
    const orbitRate = state === 'attack'
      ? 0.024
      : state === 'support' || state === 'reposition'
        ? 0.052
        : state === 'retreat'
          ? 0.068
          : 0.038;
    slot.angle += delta * orbitRate * (1 + slot.repositionBias * 0.16);

    let radius = profile.preferredAttackDistance;
    // Per-state standoffs, scaled down with the envelope.
    //
    // These additive offsets are why the first tightening under-delivered:
    // most drones sit in `intercept` or `support`, so a 165 m preferred range
    // still put them at 223-310 m. Measured distances stayed around 250 m and
    // the models were still too small to read. Shrinking the offsets alongside
    // the profile keeps the same state structure at a range where the fight is
    // actually visible.
    if (state === 'detect') radius = profile.interceptDistance;
    else if (state === 'intercept') radius = profile.preferredAttackDistance + 30;
    else if (state === 'support') radius = profile.preferredAttackDistance + 70;
    else if (state === 'align') radius = profile.preferredAttackDistance + 12;
    else if (state === 'attack') {
      const progress = THREE.MathUtils.clamp(slot.stateAge / profile.maximumAttackRunSeconds, 0, 1);
      radius = THREE.MathUtils.lerp(profile.preferredAttackDistance, profile.minimumSeparation, progress);
    } else if (state === 'break') {
      radius = profile.breakDistance + slot.stateAge * 45;
    } else if (state === 'extend') {
      radius = THREE.MathUtils.lerp(
        profile.breakDistance,
        profile.interceptDistance * 0.9,
        THREE.MathUtils.clamp(slot.stateAge / profile.extensionSeconds, 0, 1)
      );
    } else if (state === 'reposition') radius = profile.interceptDistance * 0.86;
    else if (state === 'critical') radius = profile.preferredAttackDistance + slot.stateAge * 32;
    else if (state === 'retreat') radius = profile.interceptDistance + slot.stateAge * 54;
    radius += slot.radiusOffset * 0.38;

    const planeOffset = state === 'reposition' || state === 'support' ? slot.repositionBias * 28 : 0;
    const altitude = Math.max(
      24,
      mission18Tuning.droneAltitude + slot.altitudeOffset + planeOffset + Math.sin(elapsed * 0.38 + index) * 3.2
    );
    this.desiredPositionScratch.set(
      this.origin.x + Math.cos(slot.angle) * radius,
      this.origin.y + altitude,
      this.origin.z + Math.sin(slot.angle) * radius
    );

    this.steeringScratch.copy(this.desiredPositionScratch).sub(slot.group.position);
    const desiredDistance = this.steeringScratch.length();
    const healthScale = state === 'critical' ? 0.62 : 1;
    const desiredSpeed = Math.min(profile.maximumSpeed * healthScale, 14 + desiredDistance * 0.42);
    if (desiredDistance > 0.001) this.steeringScratch.multiplyScalar(desiredSpeed / desiredDistance);
    slot.desiredVelocity.copy(this.steeringScratch);
    this.steeringScratch.sub(slot.velocity);
    const steeringLength = this.steeringScratch.length();
    const acceleration = state === 'break' || state === 'extend'
      ? profile.linearAcceleration * 1.18
      : profile.linearAcceleration;
    const maximumVelocityChange = acceleration * delta;
    if (steeringLength > maximumVelocityChange && steeringLength > 0.001) {
      this.steeringScratch.multiplyScalar(maximumVelocityChange / steeringLength);
    }
    slot.velocity.add(this.steeringScratch);

    if (this.obstacleEnabled) {
      this.outwardScratch.copy(slot.group.position).sub(this.obstacleCenter);
      const obstacleDistance = this.outwardScratch.length();
      const safeRadius = this.obstacleRadius + combatTuningProfile.obstacleClearance;
      if (obstacleDistance < safeRadius && obstacleDistance > 0.001) {
        const avoidance = 1 - obstacleDistance / safeRadius;
        this.outwardScratch.multiplyScalar(1 / obstacleDistance);
        slot.velocity.addScaledVector(this.outwardScratch, profile.linearAcceleration * delta * (1.4 + avoidance * 4.6));
        const inward = slot.velocity.dot(this.outwardScratch);
        if (inward < 0) slot.velocity.addScaledVector(this.outwardScratch, -inward * 1.25);
      }
    }

    const maximumSpeed = profile.maximumSpeed * (state === 'retreat' ? 1.12 : healthScale);
    const speed = slot.velocity.length();
    if (speed > maximumSpeed) slot.velocity.multiplyScalar(maximumSpeed / speed);
    slot.group.position.addScaledVector(slot.velocity, delta);

    if (state === 'align' || state === 'attack') {
      this.flightDirectionScratch.copy(this.origin).sub(slot.group.position);
    } else if (state === 'retreat') {
      this.flightDirectionScratch.copy(slot.group.position).sub(this.origin);
    } else {
      this.flightDirectionScratch.copy(slot.velocity);
    }
    if (this.flightDirectionScratch.lengthSq() > 0.001) {
      this.flightDirectionScratch.normalize();
      this.lookAtScratch.copy(slot.group.position).add(this.flightDirectionScratch);
      this.orientationMatrix.lookAt(slot.group.position, this.lookAtScratch, THREE.Object3D.DEFAULT_UP);
      slot.desiredQuaternion.setFromRotationMatrix(this.orientationMatrix);
      const angle = slot.group.quaternion.angleTo(slot.desiredQuaternion);
      const targetAngularSpeed = angle > 0.025 ? profile.maximumAngularSpeed : 0;
      const angularStep = profile.angularAcceleration * delta;
      slot.angularSpeed += THREE.MathUtils.clamp(targetAngularSpeed - slot.angularSpeed, -angularStep, angularStep);
      if (angle > 0.0001) {
        slot.group.quaternion.slerp(slot.desiredQuaternion, Math.min(1, slot.angularSpeed * delta / angle));
      }
    }

    const focusDistance = slot.group.position.distanceTo(this.origin);
    this.metricActiveSeconds += delta;
    this.metricDistanceSeconds += focusDistance * delta;
    this.metricSpeedSeconds += slot.velocity.length() * delta;
    if (focusDistance < combatTuningProfile.closeRangeThreshold) this.metricCloseSeconds += delta;
    slot.group.userData.combatTacticalState = slot.state;
    slot.group.userData.combatSpeed = slot.velocity.length();
  }

  private enterState(slot: DroneSlot, state: DroneState): void {
    if (slot.state === state) return;
    slot.state = state;
    slot.stateAge = 0;
    slot.group.userData.combatTacticalState = state;
    if (state === 'attack') {
      slot.firedThisPass = false;
      slot.attackRunStartedAt = this.engagementAge;
    }
  }

  /** Apply damage from Aurora's own batteries. Returns true if it killed. */
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

  /** World position of the drone a battery should track, or null. */
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

  nearestActiveTarget(from: THREE.Vector3): WeaponTarget | undefined {
    let best: WeaponTarget | undefined;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      if (!target.hostile || target.health <= 0) continue;
      const distanceSq = target.object.position.distanceToSquared(from);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = target;
      }
    }
    return best;
  }

  /** Real recessed-barrel muzzle for the closest active unit. */
  getMuzzlePositionNear(from: THREE.Vector3, output: THREE.Vector3): boolean {
    let best = -1;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (!slot.active) continue;
      const distanceSq = slot.group.position.distanceToSquared(from);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = index;
      }
    }
    if (best < 0) return false;
    const slot = this.slots[best];
    slot.group.updateWorldMatrix(true, false);
    output.set(0, 0, -1.15);
    slot.barrel.localToWorld(output);
    return true;
  }

  /** Position of the retreating runner, for the HUD marker. */
  get runnerPosition(): THREE.Vector3 | null {
    if (this.retreatSlot < 0) return null;
    const slot = this.slots[this.retreatSlot];
    return slot?.active ? slot.group.position : null;
  }

  getVisualDiagnostics(): {
    active: number;
    damaged: number;
    critical: number;
    destroying: number;
    propulsionNominal: number;
    propulsionUnstable: number;
  } {
    let active = 0;
    let damaged = 0;
    let critical = 0;
    let destroying = 0;
    let propulsionNominal = 0;
    let propulsionUnstable = 0;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (slot.deathVisual) destroying += 1;
      if (!slot.active) continue;
      active += 1;
      const ratio = Math.max(0, slot.health) / mission18Tuning.droneHealth;
      if (ratio < 0.28) critical += 1;
      else if (ratio < 0.66) damaged += 1;
      if (ratio < 0.66) propulsionUnstable += 1;
      else propulsionNominal += 1;
    }
    return { active, damaged, critical, destroying, propulsionNominal, propulsionUnstable };
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.eyeMaterial.dispose();
      slot.thrusterMaterial.dispose();
      slot.thrusterPlumeMaterial.dispose();
      slot.smoke.geometry.dispose();
      slot.smokeMaterial.dispose();
    }
    this.hullMaterial?.dispose();
    this.trimMaterial?.dispose();
    this.materialFamily?.recessed.dispose();
    this.materialFamily?.signal.dispose();
    this.portNavigationMaterial?.dispose();
    this.starboardNavigationMaterial?.dispose();
    this.smokeTexture?.dispose();
  }
}
