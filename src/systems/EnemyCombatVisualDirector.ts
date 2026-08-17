import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type {
  CombatEnvironment,
  CombatImpactVisual,
  DamageVisualState,
  WeaponVisualQuality
} from './WeaponVisualDirector';

export type EnemyWeaponClass = 'light' | 'medium' | 'heavy' | 'structure';
export type EnemyMassClass = 'light' | 'medium' | 'heavy';

export type EnemyCombatVisualDiagnostics = {
  built: boolean;
  quality: WeaponVisualQuality;
  environment: CombatEnvironment;
  activeEnemyType: EnemyWeaponClass | 'none';
  activeProjectiles: number;
  activeTrails: number;
  activeMuzzleFlashes: number;
  activeDamageRigs: number;
  activeLeaks: number;
  activeEngineFailures: number;
  activeCombatLights: number;
  nearMisses: number;
  lastShotNearMissEligible: boolean;
  heavyDestructions: number;
  damageVisualState: DamageVisualState;
  engineVisualState: 'nominal' | 'unstable' | 'partial' | 'offline';
  lastMuzzlePoint: [number, number, number];
  lastProjectilePoint: [number, number, number];
  lastTrailHead: [number, number, number];
  lastTrailTail: [number, number, number];
  lastImpactPoint: [number, number, number];
  lastNearMissPoint: [number, number, number];
  lastReactionStrength: number;
  poolCapacity: number;
  poolsAvailable: number;
  effectsReleased: number;
  resourcesReturned: boolean;
};

type ProjectileSlot = {
  active: boolean;
  age: number;
  duration: number;
  distance: number;
  weapon: EnemyWeaponClass;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  trail: THREE.Mesh;
  trailMaterial: THREE.MeshBasicMaterial;
  start: THREE.Vector3;
  end: THREE.Vector3;
  current: THREE.Vector3;
  previous: THREE.Vector3;
  direction: THREE.Vector3;
  nearMissT: number;
  nearMissEligible: boolean;
  nearMissTriggered: boolean;
  nearMissPoint: THREE.Vector3;
};

type MuzzleSlot = {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  plume: THREE.Mesh;
  plumeMaterial: THREE.MeshBasicMaterial;
};

type DamageRigSlot = {
  active: boolean;
  age: number;
  duration: number;
  target?: THREE.Object3D;
  targetGeneration: number;
  state: DamageVisualState;
  mass: EnemyMassClass;
  group: THREE.Group;
  hotZone: THREE.Sprite;
  hotMaterial: THREE.SpriteMaterial;
  engine: THREE.Sprite;
  engineMaterial: THREE.SpriteMaterial;
  leak: THREE.Points;
  leakMaterial: THREE.PointsMaterial;
  leakPositions: Float32Array;
  localImpact: THREE.Vector3;
  localEngine: THREE.Vector3;
  localNormal: THREE.Vector3;
};

const PROJECTILE_POOL_SIZE = 12;
const MUZZLE_POOL_SIZE = 6;
const DAMAGE_RIG_POOL_SIZE = 12;
const LEAK_PARTICLES = 8;
const POOL_CAPACITY = PROJECTILE_POOL_SIZE + MUZZLE_POOL_SIZE + DAMAGE_RIG_POOL_SIZE;

const QUALITY_BUDGETS: Record<WeaponVisualQuality, {
  projectiles: number;
  damageRigs: number;
  leakParticles: number;
}> = {
  performance: { projectiles: 7, damageRigs: 4, leakParticles: 3 },
  high: { projectiles: 10, damageRigs: 8, leakParticles: 6 },
  ultra: { projectiles: 12, damageRigs: 12, leakParticles: 8 }
};

const WEAPON_SPEED: Record<EnemyWeaponClass, number> = {
  light: 760,
  medium: 610,
  heavy: 470,
  structure: 390
};

const WEAPON_CORE_COLOR: Record<EnemyWeaponClass, number> = {
  light: 0xffdfc9,
  medium: 0xffd0a6,
  heavy: 0xffc197,
  structure: 0xffad87
};

const WEAPON_GLOW_COLOR: Record<EnemyWeaponClass, number> = {
  light: 0xd96348,
  medium: 0xc14a37,
  heavy: 0xa93430,
  structure: 0x84252c
};

function massReactionStrength(mass: EnemyMassClass): number {
  return mass === 'light' ? 0.026 : mass === 'medium' ? 0.009 : 0.0025;
}

/**
 * Pooled enemy presentation attached to the existing combat events. It never
 * changes health, cadence, AI, trajectories or mission state.
 */
export class EnemyCombatVisualDirector {
  readonly group = new THREE.Group();
  readonly events = { nearMisses: 0, heavyDestructions: 0, destructions: 0 };
  readonly lastNearMissPoint = new THREE.Vector3();
  readonly lastHeavyDestructionPoint = new THREE.Vector3();

  private readonly projectiles: ProjectileSlot[] = [];
  private readonly muzzles: MuzzleSlot[] = [];
  private readonly damageRigs: DamageRigSlot[] = [];
  private readonly particleTexture = createSoftParticleTexture(64);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly directionScratch = new THREE.Vector3();
  private readonly midpointScratch = new THREE.Vector3();
  private readonly closestScratch = new THREE.Vector3();
  private readonly viewerScratch = new THREE.Vector3();
  private readonly targetPositionScratch = new THREE.Vector3();
  private readonly targetQuaternionScratch = new THREE.Quaternion();
  private readonly inverseQuaternionScratch = new THREE.Quaternion();
  private readonly localScratch = new THREE.Vector3();
  private quality: WeaponVisualQuality = 'high';
  private environment: CombatEnvironment = 'vacuum';
  private built = false;
  private projectileCursor = 0;
  private muzzleCursor = 0;
  private damageCursor = 0;
  private effectsReleased = 0;
  private activeEnemyType: EnemyWeaponClass | 'none' = 'none';
  private damageVisualState: DamageVisualState = 'stable';
  private engineVisualState: EnemyCombatVisualDiagnostics['engineVisualState'] = 'nominal';
  private lastReactionStrength = 0;
  private lastShotNearMissEligible = false;
  private readonly lastMuzzlePoint = new THREE.Vector3();
  private readonly lastProjectilePoint = new THREE.Vector3();
  private readonly lastTrailHead = new THREE.Vector3();
  private readonly lastTrailTail = new THREE.Vector3();
  private readonly lastImpactPoint = new THREE.Vector3();

  constructor() {
    this.group.name = 'Enemy Combat Visuals // Pooled';
  }

  setQuality(quality: WeaponVisualQuality): void {
    this.quality = quality;
  }

  setEnvironment(environment: CombatEnvironment): void {
    this.environment = environment;
  }

  emitShot(
    origin: THREE.Vector3,
    destination: THREE.Vector3,
    weapon: EnemyWeaponClass,
    viewerPosition: THREE.Vector3
  ): boolean {
    this.ensureBuilt();
    this.directionScratch.copy(destination).sub(origin);
    const distance = this.directionScratch.length();
    if (distance < 0.01) return false;
    this.directionScratch.multiplyScalar(1 / distance);

    const budget = QUALITY_BUDGETS[this.quality].projectiles;
    const slot = this.projectiles[this.projectileCursor % budget];
    this.projectileCursor = (this.projectileCursor + 1) % budget;
    if (slot.active) this.releaseProjectile(slot);
    slot.active = true;
    slot.age = 0;
    slot.distance = distance;
    slot.duration = THREE.MathUtils.clamp(distance / WEAPON_SPEED[weapon], 0.075, 0.92);
    slot.weapon = weapon;
    slot.start.copy(origin);
    slot.end.copy(destination);
    slot.current.copy(origin);
    slot.previous.copy(origin);
    slot.direction.copy(this.directionScratch);
    slot.core.visible = true;
    slot.trail.visible = true;
    slot.core.position.copy(origin);
    slot.coreMaterial.color.setHex(WEAPON_CORE_COLOR[weapon]);
    slot.trailMaterial.color.setHex(WEAPON_GLOW_COLOR[weapon]);
    const scale = weapon === 'light' ? 0.72 : weapon === 'medium' ? 0.94 : weapon === 'heavy' ? 1.28 : 1.58;
    slot.core.scale.set(scale * 0.48, scale, 1);
    slot.coreMaterial.opacity = weapon === 'light' ? 0.82 : 0.92;
    slot.trailMaterial.opacity = weapon === 'light' ? 0.24 : weapon === 'medium' ? 0.31 : 0.38;

    this.viewerScratch.copy(viewerPosition).sub(origin);
    slot.nearMissT = THREE.MathUtils.clamp(this.viewerScratch.dot(slot.direction) / distance, 0, 1);
    slot.nearMissPoint.copy(origin).addScaledVector(slot.direction, distance * slot.nearMissT);
    const nearDistance = slot.nearMissPoint.distanceTo(viewerPosition);
    slot.nearMissEligible = slot.nearMissT > 0.05 && slot.nearMissT < 0.96 && nearDistance > 6 && nearDistance < 24;
    this.lastShotNearMissEligible = slot.nearMissEligible;
    slot.nearMissTriggered = false;
    this.emitMuzzle(origin, slot.direction, weapon);
    this.activeEnemyType = weapon;
    this.lastProjectilePoint.copy(origin);
    this.lastTrailHead.copy(origin);
    this.lastTrailTail.copy(origin);
    return true;
  }

  registerImpact(event: CombatImpactVisual, mass: EnemyMassClass): void {
    this.ensureBuilt();
    this.lastImpactPoint.copy(event.point);
    this.lastReactionStrength = massReactionStrength(mass);
    this.damageVisualState = event.destroyed
      ? 'destroyed'
      : event.integrity < 0.28
        ? 'critical'
        : event.integrity < 0.66
          ? 'damaged'
          : 'stable';
    if (event.destroyed) {
      this.events.destructions += 1;
      if (mass === 'heavy') {
        this.events.heavyDestructions += 1;
        this.lastHeavyDestructionPoint.copy(event.point);
      }
    }
    if (event.kind === 'shield') {
      this.engineVisualState = 'nominal';
      return;
    }

    const slot = this.findDamageRig(event.target);
    slot.active = true;
    slot.age = 0;
    slot.duration = event.destroyed ? (mass === 'heavy' ? 2.1 : 1.25) : this.damageVisualState === 'stable' ? 3.2 : 18;
    slot.target = event.target;
    slot.targetGeneration = Number(event.target.userData.combatVisualGeneration ?? 0);
    slot.state = this.damageVisualState;
    slot.mass = mass;
    slot.group.visible = true;
    slot.hotZone.visible = true;
    slot.hotMaterial.opacity = this.damageVisualState === 'stable' ? 0.32 : 0.68;
    slot.hotMaterial.color.setHex(this.damageVisualState === 'critical' || event.destroyed ? 0xff6a31 : 0xc34325);
    slot.hotZone.scale.setScalar(THREE.MathUtils.clamp(event.scale * (mass === 'heavy' ? 3.1 : 1.45), 0.8, 7.5));

    slot.localImpact.copy(event.point);
    event.target.worldToLocal(slot.localImpact);
    event.target.getWorldQuaternion(this.targetQuaternionScratch);
    this.inverseQuaternionScratch.copy(this.targetQuaternionScratch).invert();
    slot.localNormal.copy(event.normal).applyQuaternion(this.inverseQuaternionScratch).normalize();
    this.resolveEngineAnchor(event.target, slot.localImpact, slot.localEngine);

    const leaksVisible = this.damageVisualState === 'damaged' || this.damageVisualState === 'critical' || event.destroyed;
    slot.leak.visible = leaksVisible;
    slot.engine.visible = leaksVisible;
    const leakBudget = QUALITY_BUDGETS[this.quality].leakParticles;
    slot.leak.geometry.setDrawRange(0, leaksVisible ? leakBudget : 0);
    slot.leakMaterial.opacity = this.damageVisualState === 'critical' || event.destroyed ? 0.42 : 0.2;
    slot.engineMaterial.opacity = this.damageVisualState === 'critical' || event.destroyed ? 0.22 : 0.38;
    slot.engineMaterial.color.setHex(this.damageVisualState === 'critical' || event.destroyed ? 0xc5402d : 0x5f9da6);
    this.engineVisualState = event.destroyed ? 'offline' : this.damageVisualState === 'critical' ? 'partial' : leaksVisible ? 'unstable' : 'nominal';
  }

  update(delta: number, elapsed: number): void {
    if (!this.built || delta <= 0) return;
    this.updateProjectiles(delta);
    this.updateMuzzles(delta);
    this.updateDamageRigs(delta, elapsed);
  }

  clearTransient(): void {
    if (!this.built) return;
    for (let index = 0; index < this.projectiles.length; index += 1) this.releaseProjectile(this.projectiles[index]);
    for (let index = 0; index < this.muzzles.length; index += 1) this.releaseMuzzle(this.muzzles[index]);
    for (let index = 0; index < this.damageRigs.length; index += 1) this.releaseDamageRig(this.damageRigs[index]);
    this.activeEnemyType = 'none';
    this.damageVisualState = 'stable';
    this.engineVisualState = 'nominal';
    this.lastReactionStrength = 0;
  }

  getDiagnostics(): EnemyCombatVisualDiagnostics {
    let projectiles = 0;
    let muzzles = 0;
    let rigs = 0;
    let leaks = 0;
    let engines = 0;
    if (this.built) {
      for (let index = 0; index < this.projectiles.length; index += 1) if (this.projectiles[index].active) projectiles += 1;
      for (let index = 0; index < this.muzzles.length; index += 1) if (this.muzzles[index].active) muzzles += 1;
      for (let index = 0; index < this.damageRigs.length; index += 1) {
        const slot = this.damageRigs[index];
        if (!slot.active) continue;
        rigs += 1;
        if (slot.leak.visible) leaks += 1;
        if (slot.engine.visible) engines += 1;
      }
    }
    const active = projectiles + muzzles + rigs;
    return {
      built: this.built,
      quality: this.quality,
      environment: this.environment,
      activeEnemyType: this.activeEnemyType,
      activeProjectiles: projectiles,
      activeTrails: projectiles,
      activeMuzzleFlashes: muzzles,
      activeDamageRigs: rigs,
      activeLeaks: leaks,
      activeEngineFailures: engines,
      activeCombatLights: 0,
      nearMisses: this.events.nearMisses,
      lastShotNearMissEligible: this.lastShotNearMissEligible,
      heavyDestructions: this.events.heavyDestructions,
      damageVisualState: this.damageVisualState,
      engineVisualState: this.engineVisualState,
      lastMuzzlePoint: this.vectorTuple(this.lastMuzzlePoint),
      lastProjectilePoint: this.vectorTuple(this.lastProjectilePoint),
      lastTrailHead: this.vectorTuple(this.lastTrailHead),
      lastTrailTail: this.vectorTuple(this.lastTrailTail),
      lastImpactPoint: this.vectorTuple(this.lastImpactPoint),
      lastNearMissPoint: this.vectorTuple(this.lastNearMissPoint),
      lastReactionStrength: this.lastReactionStrength,
      poolCapacity: POOL_CAPACITY,
      poolsAvailable: Math.max(0, POOL_CAPACITY - active),
      effectsReleased: this.effectsReleased,
      resourcesReturned: active === 0
    };
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    const trailGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const plumeGeometry = new THREE.ConeGeometry(1, 1, 7, 1, true);
    for (let index = 0; index < PROJECTILE_POOL_SIZE; index += 1) {
      const coreMaterial = new THREE.SpriteMaterial({
        map: this.particleTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const core = new THREE.Sprite(coreMaterial);
      core.visible = false;
      const trailMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const trail = new THREE.Mesh(trailGeometry, trailMaterial);
      trail.visible = false;
      this.group.add(trail, core);
      this.projectiles.push({
        active: false,
        age: 0,
        duration: 0,
        distance: 0,
        weapon: 'light',
        core,
        coreMaterial,
        trail,
        trailMaterial,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        current: new THREE.Vector3(),
        previous: new THREE.Vector3(),
        direction: new THREE.Vector3(0, 0, -1),
        nearMissT: 0,
        nearMissEligible: false,
        nearMissTriggered: false,
        nearMissPoint: new THREE.Vector3()
      });
    }

    for (let index = 0; index < MUZZLE_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const coreMaterial = new THREE.SpriteMaterial({
        map: this.particleTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const core = new THREE.Sprite(coreMaterial);
      const plumeMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const plume = new THREE.Mesh(plumeGeometry, plumeMaterial);
      plume.position.y = 0.45;
      group.add(core, plume);
      group.visible = false;
      this.group.add(group);
      this.muzzles.push({ active: false, age: 0, duration: 0.1, group, core, coreMaterial, plume, plumeMaterial });
    }

    for (let index = 0; index < DAMAGE_RIG_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      group.visible = false;
      const hotMaterial = new THREE.SpriteMaterial({
        map: this.particleTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const hotZone = new THREE.Sprite(hotMaterial);
      const engineMaterial = new THREE.SpriteMaterial({
        map: this.particleTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const engine = new THREE.Sprite(engineMaterial);
      engine.scale.set(3.4, 1.5, 1);
      const leakPositions = new Float32Array(LEAK_PARTICLES * 3);
      const leakGeometry = new THREE.BufferGeometry();
      leakGeometry.setAttribute('position', new THREE.BufferAttribute(leakPositions, 3));
      leakGeometry.setDrawRange(0, 0);
      const leakMaterial = new THREE.PointsMaterial({
        map: this.particleTexture,
        color: 0x8eb4b5,
        size: 0.7,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const leak = new THREE.Points(leakGeometry, leakMaterial);
      leak.frustumCulled = false;
      group.add(hotZone, engine, leak);
      this.group.add(group);
      this.damageRigs.push({
        active: false,
        age: 0,
        duration: 0,
        target: undefined,
        targetGeneration: 0,
        state: 'stable',
        mass: 'light',
        group,
        hotZone,
        hotMaterial,
        engine,
        engineMaterial,
        leak,
        leakMaterial,
        leakPositions,
        localImpact: new THREE.Vector3(),
        localEngine: new THREE.Vector3(),
        localNormal: new THREE.Vector3(0, 0, 1)
      });
    }
  }

  private emitMuzzle(origin: THREE.Vector3, direction: THREE.Vector3, weapon: EnemyWeaponClass): void {
    const slot = this.muzzles[this.muzzleCursor % this.muzzles.length];
    this.muzzleCursor = (this.muzzleCursor + 1) % this.muzzles.length;
    slot.active = true;
    slot.age = 0;
    slot.duration = weapon === 'light' ? 0.075 : weapon === 'medium' ? 0.09 : 0.12;
    slot.group.visible = true;
    slot.group.position.copy(origin);
    slot.group.quaternion.setFromUnitVectors(this.yAxis, direction);
    slot.coreMaterial.color.setHex(WEAPON_CORE_COLOR[weapon]);
    slot.plumeMaterial.color.setHex(WEAPON_GLOW_COLOR[weapon]);
    const scale = weapon === 'light' ? 0.82 : weapon === 'medium' ? 1.08 : weapon === 'heavy' ? 1.42 : 1.72;
    slot.core.scale.set(scale * 0.58, scale, 1);
    slot.plume.scale.set(scale * 0.16, scale * 0.92, scale * 0.16);
    slot.coreMaterial.opacity = 1;
    slot.plumeMaterial.opacity = 0.5;
    this.lastMuzzlePoint.copy(origin);
  }

  private updateProjectiles(delta: number): void {
    for (let index = 0; index < this.projectiles.length; index += 1) {
      const slot = this.projectiles[index];
      if (!slot.active) continue;
      slot.age += delta;
      const progress = Math.min(1, slot.age / slot.duration);
      slot.previous.copy(slot.current);
      slot.current.lerpVectors(slot.start, slot.end, progress);
      slot.core.position.copy(slot.current);
      const visualLength = slot.weapon === 'light' ? 5.5 : slot.weapon === 'medium' ? 7.5 : slot.weapon === 'heavy' ? 10.5 : 13.5;
      this.midpointScratch.copy(slot.current).addScaledVector(slot.direction, -visualLength * 0.5);
      slot.trail.position.copy(this.midpointScratch);
      slot.trail.quaternion.setFromUnitVectors(this.yAxis, slot.direction);
      const thickness = slot.weapon === 'light' ? 0.055 : slot.weapon === 'medium' ? 0.08 : slot.weapon === 'heavy' ? 0.13 : 0.18;
      slot.trail.scale.set(thickness, visualLength, thickness);
      const life = Math.min(1, (1 - progress) * 3.2);
      const pulse = slot.weapon === 'heavy' || slot.weapon === 'structure'
        ? 0.74 + Math.sin(slot.age * 62) * 0.26
        : 1;
      slot.coreMaterial.opacity = life * pulse;
      slot.trailMaterial.opacity = life * pulse * (slot.weapon === 'light' ? 0.24 : slot.weapon === 'medium' ? 0.31 : 0.38);
      this.lastProjectilePoint.copy(slot.current);
      this.lastTrailHead.copy(slot.current);
      this.lastTrailTail.copy(slot.current).addScaledVector(slot.direction, -visualLength);
      if (slot.nearMissEligible && !slot.nearMissTriggered && progress >= slot.nearMissT) {
        slot.nearMissTriggered = true;
        this.events.nearMisses += 1;
        this.lastNearMissPoint.copy(slot.nearMissPoint);
        slot.trailMaterial.opacity = Math.min(0.72, slot.trailMaterial.opacity + 0.22);
      }
      if (progress >= 1) this.releaseProjectile(slot);
    }
  }

  private updateMuzzles(delta: number): void {
    for (let index = 0; index < this.muzzles.length; index += 1) {
      const slot = this.muzzles[index];
      if (!slot.active) continue;
      slot.age += delta;
      const life = Math.max(0, 1 - slot.age / slot.duration);
      slot.coreMaterial.opacity = life;
      slot.plumeMaterial.opacity = life * 0.45;
      slot.plume.scale.y += delta * 5;
      if (slot.age >= slot.duration) this.releaseMuzzle(slot);
    }
  }

  private updateDamageRigs(delta: number, elapsed: number): void {
    const rigBudget = QUALITY_BUDGETS[this.quality].damageRigs;
    for (let index = 0; index < this.damageRigs.length; index += 1) {
      const slot = this.damageRigs[index];
      if (!slot.active) continue;
      if (
        index >= rigBudget ||
        !slot.target ||
        Number(slot.target.userData.combatVisualGeneration ?? 0) !== slot.targetGeneration ||
        (!slot.target.visible && slot.state !== 'destroyed')
      ) {
        this.releaseDamageRig(slot);
        continue;
      }
      slot.age += delta;
      slot.target.getWorldPosition(this.targetPositionScratch);
      slot.target.getWorldQuaternion(this.targetQuaternionScratch);
      slot.group.position.copy(this.targetPositionScratch);
      slot.group.quaternion.copy(this.targetQuaternionScratch);
      slot.hotZone.position.copy(slot.localImpact).addScaledVector(slot.localNormal, 0.08);
      slot.engine.position.copy(slot.localEngine);
      slot.leak.position.copy(slot.localImpact);
      const critical = slot.state === 'critical' || slot.state === 'destroyed';
      const pulse = 0.72 + Math.sin(elapsed * (critical ? 13 : 5) + index * 1.7) * (critical ? 0.28 : 0.1);
      slot.hotMaterial.opacity = Math.max(0, (critical ? 0.72 : slot.state === 'damaged' ? 0.45 : 0.24) * pulse);
      slot.engineMaterial.opacity = Math.max(0, (critical ? 0.17 : 0.34) * pulse);
      const positions = slot.leakPositions;
      const leakCount = QUALITY_BUDGETS[this.quality].leakParticles;
      for (let particle = 0; particle < leakCount; particle += 1) {
        const offset = particle * 3;
        positions[offset] += slot.localNormal.x * delta * (0.8 + particle * 0.12);
        positions[offset + 1] += slot.localNormal.y * delta * (0.8 + particle * 0.12) + delta * 0.08;
        positions[offset + 2] += slot.localNormal.z * delta * (0.8 + particle * 0.12);
        if (positions[offset] * positions[offset] + positions[offset + 1] * positions[offset + 1] + positions[offset + 2] * positions[offset + 2] > 16) {
          positions[offset] = 0;
          positions[offset + 1] = 0;
          positions[offset + 2] = 0;
        }
      }
      (slot.leak.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      if (slot.age >= slot.duration) this.releaseDamageRig(slot);
    }
  }

  private findDamageRig(target: THREE.Object3D): DamageRigSlot {
    for (let index = 0; index < this.damageRigs.length; index += 1) {
      const slot = this.damageRigs[index];
      if (slot.active && slot.target === target) return slot;
    }
    const budget = QUALITY_BUDGETS[this.quality].damageRigs;
    for (let offset = 0; offset < budget; offset += 1) {
      const index = (this.damageCursor + offset) % budget;
      const slot = this.damageRigs[index];
      if (!slot.active) {
        this.damageCursor = (index + 1) % budget;
        return slot;
      }
    }
    const slot = this.damageRigs[this.damageCursor % budget];
    this.damageCursor = (this.damageCursor + 1) % budget;
    this.releaseDamageRig(slot);
    return slot;
  }

  private resolveEngineAnchor(target: THREE.Object3D, fallback: THREE.Vector3, output: THREE.Vector3): void {
    const anchors = target.userData.combatEngineAnchors as readonly (readonly [number, number, number])[] | undefined;
    if (anchors?.length) {
      output.set(anchors[0][0], anchors[0][1], anchors[0][2]);
      return;
    }
    output.copy(fallback).add(this.localScratch.set(0, 0, 2.5));
  }

  private releaseProjectile(slot: ProjectileSlot): void {
    if (!slot.active) return;
    slot.active = false;
    slot.core.visible = false;
    slot.trail.visible = false;
    slot.nearMissEligible = false;
    slot.nearMissTriggered = false;
    this.effectsReleased += 1;
  }

  private releaseMuzzle(slot: MuzzleSlot): void {
    if (!slot.active) return;
    slot.active = false;
    slot.group.visible = false;
    this.effectsReleased += 1;
  }

  private releaseDamageRig(slot: DamageRigSlot): void {
    if (!slot.active) return;
    slot.active = false;
    slot.target = undefined;
    slot.group.visible = false;
    slot.hotZone.visible = false;
    slot.engine.visible = false;
    slot.leak.visible = false;
    slot.leakPositions.fill(0);
    slot.leak.geometry.setDrawRange(0, 0);
    this.effectsReleased += 1;
  }

  private vectorTuple(vector: THREE.Vector3): [number, number, number] {
    return [vector.x, vector.y, vector.z];
  }
}
