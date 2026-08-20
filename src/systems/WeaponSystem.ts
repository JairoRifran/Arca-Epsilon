import * as THREE from 'three';

/**
 * Cone the primary will converge inside, as a dot product against the nose.
 *
 * 0.96 is about 16 degrees. The first attempt used 0.995 (5.7 degrees) and
 * measured as never engaging: the air wave engages at ~600 m against drones a
 * couple of metres across, and they are flying, so by the time the shot leaves
 * the nose the lead has already moved outside a cone that tight. The player
 * still has to put the target in front of them; the assist only closes the last
 * fraction of a degree that no one can hold on a moving contact at that range.
 */
const AIM_ASSIST_MIN_ALIGNMENT = 0.96;

/** Integer clamp used when restoring persisted ammunition. */
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));
}
import {
  WeaponVisualDirector,
  type CombatEnvironment,
  type CombatImpactVisual,
  type CombatImpactKind,
  type WeaponVisualDiagnostics,
  type WeaponVisualQuality
} from './WeaponVisualDirector';
import type { CombatVfxPresentationConfig } from './CombatVfxPresentation';
import { combatTuningProfile } from '../game/CombatTuningProfile';
import {
  PLAYER_PRIMARY_WEAPON_MAGAZINE,
  PLAYER_TORPEDO_TUBES
} from '../game/CombatTuningProfile';

export type CombatMassClass = 'light' | 'medium' | 'heavy';

export type CombatVisualCompanion = {
  registerImpact: (event: CombatImpactVisual, mass: CombatMassClass) => void;
  clearTransient: () => void;
};

export type WeaponTarget = {
  id?: string;
  object: THREE.Object3D;
  radius: number;
  health: number;
  hostile: boolean;
  /** World-space velocity reference. Dynamic targets update it in place. */
  velocity?: THREE.Vector3;
};

export type WeaponState = {
  laserCooldown: number;
  laserReady: boolean;
  missileCooldown: number;
  missileReady: boolean;
  missileAmmo: number;
  lockStatus: string;
  lastMessage: string;
  activeBeams: number;
  activeMissiles: number;
  lockTargetPosition: THREE.Vector3 | null;
  hitFeedback: 'none' | 'shield' | 'hull' | 'critical' | 'destroyed' | 'blocked' | 'out-of-range';
  hitPulse: number;
  firePulse: number;
  lastFiredWeapon: 'none' | 'laser' | 'torpedo';
  torpedoEngineActive: boolean;
};

export type WeaponSystemDiagnostics = WeaponVisualDiagnostics & {
  laserReady: boolean;
  missileReady: boolean;
  recoil: number;
  cameraImpulse: number;
  lastImpactPoint: [number, number, number];
  lastImpactKind: CombatImpactKind | 'none';
  lastMissileTrailHead: [number, number, number] | null;
  activeMissilePosition: [number, number, number] | null;
  activeHardpointIndex: number;
  activeHardpointSide: number;
  audioCueRequested: string;
};

type LogicalMissile = {
  active: boolean;
  visualIndex: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  target?: WeaponTarget;
  age: number;
  ignitionSignaled: boolean;
};

/**
 * Logical combat remains intentionally small: hitscan energy cannon and four
 * guided missiles. All frequent presentation objects live in fixed pools in
 * WeaponVisualDirector, keeping damage/cadence identical across quality modes.
 */
export class WeaponSystem {
  readonly visuals = new WeaponVisualDirector();
  readonly group = this.visuals.group;

  readonly state: WeaponState = {
    laserCooldown: 0,
    laserReady: true,
    missileCooldown: 0,
    missileReady: true,
    missileAmmo: PLAYER_TORPEDO_TUBES.initialLoadedTubes,
    lockStatus: 'Sin blanco',
    lastMessage: '',
    activeBeams: 0,
    activeMissiles: 0,
    lockTargetPosition: null,
    hitFeedback: 'none',
    hitPulse: 0,
    firePulse: 0,
    lastFiredWeapon: 'none',
    torpedoEngineActive: false
  };

  readonly events = {
    impacts: 0,
    destructions: 0,
    lastImpactKind: 'none' as CombatImpactKind | 'none',
    lastImpactWeapon: 'none' as 'none' | 'laser' | 'torpedo',
    missileIgnitions: 0,
    torpedoImpacts: 0,
    torpedoDetonations: 0,
    audioCueRequested: 'none'
  };

  // --- Magazines ---------------------------------------------------------
  // WeaponSystem owns ammunition outright: main.ts reads these, never writes
  // them. A second counter anywhere else is how HUD and backend drift apart.
  private primaryMagazine: number = PLAYER_PRIMARY_WEAPON_MAGAZINE.initialMagazine;
  private primaryReserve: number = PLAYER_PRIMARY_WEAPON_MAGAZINE.initialReserve;
  private primaryReloadElapsed = 0;
  private primaryReloading = false;

  /** One entry per physical tube; index is the launch order. */
  private readonly tubeLoaded: boolean[] = Array.from(
    { length: PLAYER_TORPEDO_TUBES.tubeCount },
    (_, i) => i < PLAYER_TORPEDO_TUBES.initialLoadedTubes
  );
  /**
   * Compatibility field for saves written under the former finite-reserve
   * contract. New saves keep it at zero; tube fabrication never reads it.
   */
  private readonly torpedoReserve = 0;
  private torpedoReloadElapsed = 0;
  private torpedoReloading = false;
  private torpedoReloadTarget = 0;
  private torpedoReloadDelivered = 0;
  private nextTube = 0;
  private lastPrimaryBlockReason = 'none';
  private readonly aimAssistTarget = new THREE.Vector3();
  private readonly aimAssistScratch = new THREE.Vector3();
  private aimAssistActive = false;
  private lastAimAssistApplied = false;
  private lastTorpedoBlockReason = 'none';

  private readonly missiles: LogicalMissile[] = [];
  private readonly laserCooldownMax = combatTuningProfile.weapons.laserCooldownSeconds;
  private readonly missileCooldownMax = combatTuningProfile.weapons.torpedoCooldownSeconds;
  private readonly originScratch = new THREE.Vector3();
  private readonly endScratch = new THREE.Vector3();
  private readonly directionScratch = new THREE.Vector3();
  private readonly launchDirectionScratch = new THREE.Vector3();
  private readonly toTargetScratch = new THREE.Vector3();
  private readonly closestScratch = new THREE.Vector3();
  private readonly currentDirectionScratch = new THREE.Vector3();
  private readonly desiredDirectionScratch = new THREE.Vector3();
  private readonly lookAtScratch = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly hitNormal = new THREE.Vector3();
  private readonly lastImpactPoint = new THREE.Vector3();
  private lockTarget?: WeaponTarget;
  private rayHitTarget?: WeaponTarget;
  private cannonSide = 0;
  private recoil = 0;
  private cameraImpulse = 0;
  private missilePodOffsets: THREE.Vector3[] = [new THREE.Vector3(0, -0.9, -1.4)];
  private missileTubeSide = -1;
  private cannonOffsets: THREE.Vector3[] = [
    new THREE.Vector3(-1.6, -0.2, -3.8),
    new THREE.Vector3(1.6, -0.2, -3.8)
  ];
  private visualCompanion?: CombatVisualCompanion;
  private performanceMarker?: (name: string) => void;

  get selectedTarget(): WeaponTarget | undefined {
    return this.lockTarget;
  }

  get laserProjectileSpeed(): number {
    return combatTuningProfile.weapons.laserProjectileSpeed;
  }

  /** Immediate launch capacity: one ready round per physical tube. */
  get torpedoCapacity(): number {
    return PLAYER_TORPEDO_TUBES.tubeCount;
  }

  /** Restores the tubes to full. Called at defined resupply points only. */
  refillTorpedoes(): void {
    for (let i = 0; i < this.tubeLoaded.length; i += 1) this.tubeLoaded[i] = true;
    this.torpedoReloading = false;
    this.torpedoReloadElapsed = 0;
    this.torpedoReloadTarget = 0;
    this.torpedoReloadDelivered = 0;
    this.state.missileAmmo = this.loadedTubeCount;
    this.state.missileReady = this.state.missileCooldown === 0;
  }

  /** The muzzle list actually used when firing; for hardpoint diagnostics. */
  get debugCannonOffsets(): THREE.Vector3[] {
    return this.cannonOffsets;
  }

  /** The tube list actually used when launching. */
  get debugTubeOffsets(): THREE.Vector3[] {
    return this.missilePodOffsets;
  }

  get torpedoProjectileSpeed(): number {
    return combatTuningProfile.weapons.torpedoLaunchSpeed;
  }

  constructor() {
    this.group.name = 'Player Weapon VFX';
    for (let index = 0; index < 4; index += 1) {
      this.missiles.push({
        active: false,
        visualIndex: -1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        target: undefined,
        age: 0,
        ignitionSignaled: false
      });
    }
  }

  /** Ship-local muzzle positions measured from the loaded player model. */
  setCannonOffsets(offsets: readonly THREE.Vector3[]): void {
    if (offsets.length === 0) return;
    this.cannonOffsets = offsets.map((offset) => offset.clone());
    this.cannonSide %= this.cannonOffsets.length;
  }

  setMissilePodOffset(offset: THREE.Vector3): void {
    this.setMissilePodOffsets([offset]);
  }

  setMissilePodOffsets(offsets: readonly THREE.Vector3[]): void {
    if (offsets.length === 0) return;
    this.missilePodOffsets = offsets.map((offset) => offset.clone());
    this.missileTubeSide %= this.missilePodOffsets.length;
  }

  get activeHardpointIndex(): number {
    return this.state.lastFiredWeapon === 'torpedo' ? this.missileTubeSide : this.cannonSide;
  }

  get activeHardpointSide(): number {
    if (this.state.lastFiredWeapon !== 'laser') return 0;
    return this.cannonOffsets[this.cannonSide]?.x < 0 ? -1 : 1;
  }

  setQuality(quality: WeaponVisualQuality): void {
    this.visuals.setQuality(quality);
  }

  setEnvironment(environment: CombatEnvironment): void {
    this.visuals.setEnvironment(environment);
  }

  setPresentationConfig(config: CombatVfxPresentationConfig): void {
    this.visuals.setPresentationConfig(config);
  }

  setVisualCompanion(companion: CombatVisualCompanion): void {
    this.visualCompanion = companion;
  }

  /** Debug-only marker sink shared with the pooled presentation layer. */
  setPerformanceMarker(marker?: (name: string) => void): void {
    this.performanceMarker = marker;
    this.visuals.setPerformanceMarker(marker);
  }

  setCameraResponse(recoil: number, impulse: number): void {
    this.recoil = recoil;
    this.cameraImpulse = impulse;
  }

  clearTransient(): void {
    for (let index = 0; index < this.missiles.length; index += 1) {
      const missile = this.missiles[index];
      missile.active = false;
      missile.target = undefined;
      missile.age = 0;
      missile.ignitionSignaled = false;
      missile.visualIndex = -1;
      missile.velocity.set(0, 0, 0);
    }
    this.visuals.clearTransient();
    this.visualCompanion?.clearTransient();
    this.state.activeBeams = 0;
    this.state.activeMissiles = 0;
    this.state.lockTargetPosition = null;
    this.state.lockStatus = 'Sin blanco';
    this.state.hitFeedback = 'none';
    this.state.hitPulse = 0;
    this.state.firePulse = 0;
    this.state.lastFiredWeapon = 'none';
    this.state.torpedoEngineActive = false;
    this.lockTarget = undefined;
    this.rayHitTarget = undefined;
    this.events.impacts = 0;
    this.events.destructions = 0;
    this.events.lastImpactKind = 'none';
    this.events.lastImpactWeapon = 'none';
    this.events.missileIgnitions = 0;
    this.events.torpedoImpacts = 0;
    this.events.torpedoDetonations = 0;
    this.events.audioCueRequested = 'none';
    this.lastImpactPoint.set(0, 0, 0);
  }

  update(
    delta: number,
    ship: THREE.Object3D,
    targets: WeaponTarget[],
    viewerPosition?: THREE.Vector3,
    timerDelta = delta
  ): void {
    const elapsedTimer = Math.max(0, timerDelta);
    this.updateReloads(elapsedTimer);
    this.state.laserCooldown = Math.max(0, this.state.laserCooldown - elapsedTimer);
    this.state.missileCooldown = Math.max(0, this.state.missileCooldown - elapsedTimer);
    this.state.laserReady = this.state.laserCooldown === 0;
    this.state.missileReady =
      this.state.missileCooldown === 0 && !this.torpedoReloading && this.loadedTubeCount > 0;
    this.state.hitPulse = Math.max(0, this.state.hitPulse - elapsedTimer * 3.8);
    this.state.firePulse = Math.max(0, this.state.firePulse - elapsedTimer * 6.5);
    if (this.state.hitPulse === 0) this.state.hitFeedback = 'none';

    this.lockTarget = this.findLockTarget(ship, targets, combatTuningProfile.weapons.torpedoLockRange);
    this.state.lockStatus = this.lockTarget ? 'Blanco fijado' : 'Sin blanco';
    if (this.lockTarget) {
      if (!this.state.lockTargetPosition) this.state.lockTargetPosition = new THREE.Vector3();
      this.state.lockTargetPosition.copy(this.lockTarget.object.position);
    } else {
      this.state.lockTargetPosition = null;
    }

    if (viewerPosition) this.visuals.setViewerPosition(viewerPosition);
    this.updateMissiles(delta, targets);
    this.visuals.update(delta);
    this.state.activeMissiles = this.activeMissileCount;
    this.state.torpedoEngineActive = this.hasIgnitedMissile;
    this.state.activeBeams = this.state.laserCooldown > this.laserCooldownMax - 0.15 ? 1 : 0;
  }


  // ==========================================================================
  // Magazines, tubes and manual reload
  // ==========================================================================

  get primaryMagazineState(): {
    current: number; maximum: number; reserve: number; reserveMaximum: number;
    reloading: boolean; progress: number; duration: number; blockReason: string;
  } {
    const cfg = PLAYER_PRIMARY_WEAPON_MAGAZINE;
    return {
      current: this.primaryMagazine,
      maximum: cfg.magazineCapacity,
      reserve: this.primaryReserve,
      reserveMaximum: cfg.reserveCapacity,
      reloading: this.primaryReloading,
      progress: this.primaryReloading
        ? Number(Math.min(1, this.primaryReloadElapsed / cfg.reloadDuration).toFixed(3))
        : 0,
      duration: cfg.reloadDuration,
      blockReason: this.lastPrimaryBlockReason
    };
  }

  get torpedoTubeState(): {
    tubes: boolean[]; loadedCount: number; tubeCapacity: number;
    reserve: number; reserveMaximum: number; reloading: boolean;
    progress: number; targetCount: number; blockReason: string;
  } {
    const cfg = PLAYER_TORPEDO_TUBES;
    const duration = Math.max(1, this.torpedoReloadTarget) * cfg.reloadSecondsPerTube;
    return {
      tubes: [...this.tubeLoaded],
      loadedCount: this.loadedTubeCount,
      tubeCapacity: cfg.tubeCount,
      reserve: this.torpedoReserve,
      reserveMaximum: 0,
      reloading: this.torpedoReloading,
      progress: this.torpedoReloading
        ? Number(Math.min(1, this.torpedoReloadElapsed / duration).toFixed(3))
        : 0,
      targetCount: this.torpedoReloadTarget,
      blockReason: this.lastTorpedoBlockReason
    };
  }

  /**
   * Next loaded tube in a deterministic round-robin, skipping empty ones.
   * Returns -1 when every tube is empty.
   */
  private nextLoadedTube(): number {
    for (let step = 0; step < this.tubeLoaded.length; step += 1) {
      const index = (this.nextTube + step) % this.tubeLoaded.length;
      if (this.tubeLoaded[index]) return index;
    }
    return -1;
  }

  private get loadedTubeCount(): number {
    let n = 0;
    for (const loaded of this.tubeLoaded) if (loaded) n += 1;
    return n;
  }

  /** Ready rounds. Kept under the legacy name for diagnostics compatibility. */
  get torpedoTotal(): number {
    return this.loadedTubeCount;
  }

  canReloadPrimary(): boolean {
    return !this.primaryReloading &&
      this.primaryMagazine < PLAYER_PRIMARY_WEAPON_MAGAZINE.magazineCapacity &&
      this.primaryReserve > 0;
  }

  canReloadTorpedoes(): boolean {
    return !this.torpedoReloading &&
      this.loadedTubeCount < PLAYER_TORPEDO_TUBES.tubeCount;
  }

  /**
   * One key press, both systems considered.
   *
   * They reload in parallel and each unblocks on its own timer — a single
   * global `isReloading` would keep the cannon down until the slower tube
   * sequence finished.
   */
  requestReload(): { primaryStarted: boolean; torpedoStarted: boolean; message: string } {
    let primaryStarted = false;
    let torpedoStarted = false;
    let message = '';

    if (this.canReloadPrimary()) {
      this.primaryReloading = true;
      this.primaryReloadElapsed = 0;
      primaryStarted = true;
      message = 'RECARGANDO CANON';
    } else if (this.primaryMagazine >= PLAYER_PRIMARY_WEAPON_MAGAZINE.magazineCapacity) {
      message = 'CARGADOR COMPLETO';
    } else if (this.primaryReserve <= 0) {
      message = 'SIN RESERVA DE CANON';
    }

    if (this.canReloadTorpedoes()) {
      this.torpedoReloading = true;
      this.torpedoReloadElapsed = 0;
      this.torpedoReloadDelivered = 0;
      this.torpedoReloadTarget = PLAYER_TORPEDO_TUBES.tubeCount - this.loadedTubeCount;
      torpedoStarted = true;
      message = primaryStarted ? 'RECARGANDO CANON Y TORPEDOS' : 'RECARGANDO TORPEDOS';
    } else if (!primaryStarted && this.loadedTubeCount >= PLAYER_TORPEDO_TUBES.tubeCount) {
      message = message || 'TUBOS COMPLETOS';
    }

    return { primaryStarted, torpedoStarted, message };
  }

  /**
   * Advances both reload timers. Delta-driven, no browser timers.
   *
   * Tubes fill sequentially, one round per `reloadSecondsPerTube`, so the HUD
   * can show real progress and a partial reload leaves real rounds behind.
   */
  updateReloads(delta: number): void {
    if (this.primaryReloading) {
      this.primaryReloadElapsed += delta;
      if (this.primaryReloadElapsed >= PLAYER_PRIMARY_WEAPON_MAGAZINE.reloadDuration) {
        // Transfer only the shortfall, and only what the reserve holds: a
        // partial reload must not invent charges or discard the ones already
        // sitting in the capacitor.
        const needed = PLAYER_PRIMARY_WEAPON_MAGAZINE.magazineCapacity - this.primaryMagazine;
        const moved = Math.min(needed, this.primaryReserve);
        this.primaryMagazine += moved;
        this.primaryReserve -= moved;
        this.primaryReloading = false;
        this.primaryReloadElapsed = 0;
      }
    }

    if (this.torpedoReloading) {
      this.torpedoReloadElapsed += delta;
      const due = Math.min(
        this.torpedoReloadTarget,
        Math.floor(this.torpedoReloadElapsed / PLAYER_TORPEDO_TUBES.reloadSecondsPerTube)
      );
      while (this.torpedoReloadDelivered < due) {
        const slot = this.tubeLoaded.indexOf(false);
        if (slot < 0) break;
        this.tubeLoaded[slot] = true;
        this.torpedoReloadDelivered += 1;
      }
      if (this.torpedoReloadDelivered >= this.torpedoReloadTarget) {
        this.torpedoReloading = false;
        this.torpedoReloadElapsed = 0;
        this.torpedoReloadTarget = 0;
        this.torpedoReloadDelivered = 0;
      }
      this.state.missileAmmo = this.torpedoTotal;
    }
  }

  /** Full rearm. Cannon reserve stays finite; every torpedo tube is loaded. */
  refillWeaponStores(): void {
    this.primaryMagazine = PLAYER_PRIMARY_WEAPON_MAGAZINE.magazineCapacity;
    this.primaryReserve = PLAYER_PRIMARY_WEAPON_MAGAZINE.reserveCapacity;
    for (let i = 0; i < this.tubeLoaded.length; i += 1) this.tubeLoaded[i] = true;
    this.cancelReloads();
    this.state.missileAmmo = this.torpedoTotal;
  }

  /**
   * Drops in-flight reloads without losing or gifting ammunition.
   *
   * Rounds already fabricated stay in their tubes. Used on mode changes and
   * before a save, so no timer is ever persisted.
   */
  cancelReloads(): void {
    this.primaryReloading = false;
    this.primaryReloadElapsed = 0;
    this.torpedoReloading = false;
    this.torpedoReloadElapsed = 0;
    this.torpedoReloadTarget = 0;
    this.torpedoReloadDelivered = 0;
  }

  /** Serialised ammunition, for the save payload. */
  get ammoSnapshot(): {
    primaryMagazine: number; primaryReserve: number;
    torpedoTubes: boolean[]; torpedoReserve: number;
  } {
    return {
      primaryMagazine: this.primaryMagazine,
      primaryReserve: this.primaryReserve,
      torpedoTubes: [...this.tubeLoaded],
      torpedoReserve: this.torpedoReserve
    };
  }

  /**
   * Restores ammunition, migrating saves that predate the magazine split.
   *
   * Older saves may carry a finite reserve or only a single torpedo total.
   * Both load safely, but only the physical tube states remain authoritative.
   */
  restoreAmmo(data: {
    primaryMagazine?: number; primaryReserve?: number;
    torpedoTubes?: boolean[]; torpedoReserve?: number; torpedoTotal?: number;
  }): void {
    const cfg = PLAYER_PRIMARY_WEAPON_MAGAZINE;
    const tubes = PLAYER_TORPEDO_TUBES;
    this.cancelReloads();

    this.primaryMagazine = clampInt(data.primaryMagazine ?? cfg.magazineCapacity, 0, cfg.magazineCapacity);
    this.primaryReserve = clampInt(data.primaryReserve ?? cfg.reserveCapacity, 0, cfg.reserveCapacity);

    if (Array.isArray(data.torpedoTubes) && data.torpedoTubes.length === tubes.tubeCount) {
      for (let i = 0; i < tubes.tubeCount; i += 1) this.tubeLoaded[i] = Boolean(data.torpedoTubes[i]);
    } else {
      const total = clampInt(
        data.torpedoTotal ?? tubes.initialLoadedTubes + tubes.initialReserve,
        0,
        tubes.tubeCount + tubes.reserveCapacity
      );
      const loaded = Math.min(tubes.tubeCount, total);
      for (let i = 0; i < tubes.tubeCount; i += 1) this.tubeLoaded[i] = i < loaded;
    }
    this.nextTube = 0;
    this.state.missileAmmo = this.torpedoTotal;
  }

  /**
   * Locked contact the primary may bias its aim toward.
   *
   * Set from the selected contact each frame; cleared when nothing is locked.
   * Stored as a position copy so the weapon never holds a scene reference.
   */
  setAimAssistTarget(position: THREE.Vector3 | null): void {
    if (position) {
      this.aimAssistTarget.copy(position);
      this.aimAssistActive = true;
    } else {
      this.aimAssistActive = false;
    }
  }

  get aimAssistEngaged(): boolean {
    return this.lastAimAssistApplied;
  }

  fireLaser(ship: THREE.Object3D, targets: WeaponTarget[]): boolean {
    // Reloading holds the cannon only; torpedoes and flight stay available.
    if (this.primaryReloading) {
      this.lastPrimaryBlockReason = 'primary-reloading';
      this.state.lastMessage = 'RECARGANDO CANON';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }
    if (this.primaryMagazine <= 0) {
      // Empty means empty: no auto-reload, no reserve touched, no projectile.
      this.lastPrimaryBlockReason = 'primary-magazine-empty';
      this.state.lastMessage = 'CARGADOR VACIO - G RECARGAR';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }
    if (!this.state.laserReady) {
      this.lastPrimaryBlockReason = 'primary-cooldown';
      this.state.lastMessage = 'Laser recargando.';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }

    // One charge per trigger event. The cannons alternate rather than firing
    // together, so an event is exactly one projectile — the pulse count and
    // the projectile count are the same number and cannot drift apart.
    this.primaryMagazine -= 1;
    this.lastPrimaryBlockReason = 'none';
    this.state.laserCooldown = this.laserCooldownMax;
    this.state.laserReady = false;
    this.cannonSide = (this.cannonSide + 1) % this.cannonOffsets.length;
    const muzzleLocal = this.cannonOffsets[this.cannonSide];
    this.originScratch.copy(muzzleLocal).applyQuaternion(ship.quaternion).add(ship.position);
    this.directionScratch.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize();

    // Aim assist toward the locked contact.
    //
    // The hitscan already forgives 16 m of miss distance, but at the ~600 m the
    // air wave engages at that is still under 1.5 degrees of pointing error, on
    // a target a couple of metres across. Selecting with T told the player where
    // the drone was and then left them to thread it by hand. Inside a narrow
    // cone the shot now converges on the lock, so the selection is worth making;
    // outside it the raw nose direction is used and the player still has to aim.
    this.lastAimAssistApplied = false;
    if (this.aimAssistActive) {
      this.aimAssistScratch.copy(this.aimAssistTarget).sub(this.originScratch);
      const reach = this.aimAssistScratch.length();
      if (reach > 0.001) {
        this.aimAssistScratch.multiplyScalar(1 / reach);
        const alignment = this.aimAssistScratch.dot(this.directionScratch);
        if (alignment >= AIM_ASSIST_MIN_ALIGNMENT) {
          // Ease in across the cone so the edge is not a hard snap.
          const strength = THREE.MathUtils.smoothstep(alignment, AIM_ASSIST_MIN_ALIGNMENT, 1);
          this.directionScratch.lerp(this.aimAssistScratch, strength).normalize();
          this.lastAimAssistApplied = true;
        }
      }
    }

    const range = combatTuningProfile.weapons.laserRange;
    const hit = this.findRayHit(this.originScratch, this.directionScratch, targets, range, 16);
    if (hit) this.endScratch.copy(this.hitPoint);
    else this.endScratch.copy(this.directionScratch).multiplyScalar(range).add(this.originScratch);

    this.performanceMarker?.('player-shot');
    this.visuals.emitMuzzle(this.originScratch, this.directionScratch, 'laser');
    this.visuals.emitEnergyBurst(this.originScratch, this.endScratch, this.cannonSide);
    this.state.firePulse = 1;
    this.state.lastFiredWeapon = 'laser';
    this.events.audioCueRequested = this.cannonSide % 2 === 0 ? 'playerLaserBurstA' : 'playerLaserBurstB';
    if (hit) {
      this.applyImpact(hit, combatTuningProfile.weapons.laserDamage, this.hitPoint, this.hitNormal, this.directionScratch, 1, 'laser');
      this.state.lastMessage = 'Impacto confirmado.';
    } else {
      this.state.lastMessage = 'Laser disparado: sin impacto.';
      this.state.hitFeedback = 'out-of-range';
      this.state.hitPulse = 1;
    }
    return true;
  }

  fireMissile(ship: THREE.Object3D, targets: WeaponTarget[], shooterVelocity?: THREE.Vector3): boolean {
    if (this.torpedoReloading) {
      this.lastTorpedoBlockReason = 'torpedo-reloading';
      this.state.lastMessage = 'RECARGANDO TORPEDOS';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }
    // A launch comes out of a loaded tube, never straight out of reserve.
    const tube = this.nextLoadedTube();
    if (tube < 0) {
      this.lastTorpedoBlockReason = 'torpedo-tubes-empty';
      this.state.lastMessage = 'TUBOS VACIOS - G RECARGAR';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }
    if (!this.state.missileReady) {
      this.lastTorpedoBlockReason = 'torpedo-cooldown';
      this.state.lastMessage = 'Torpedo recargando.';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }
    const logical = this.findFreeMissile();
    if (!logical) {
      this.state.lastMessage = 'Lanzador ocupado.';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }

    this.state.missileCooldown = this.missileCooldownMax;
    this.state.missileReady = false;
    this.tubeLoaded[tube] = false;
    this.nextTube = (tube + 1) % this.tubeLoaded.length;
    this.state.missileAmmo = this.torpedoTotal;
    this.lastTorpedoBlockReason = 'none';
    const lockTarget = this.findLockTarget(ship, targets, combatTuningProfile.weapons.torpedoLockRange);
    this.missileTubeSide = (this.missileTubeSide + 1) % this.missilePodOffsets.length;
    this.originScratch.copy(this.missilePodOffsets[this.missileTubeSide]).applyQuaternion(ship.quaternion).add(ship.position);
    this.launchDirectionScratch.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    this.directionScratch.copy(this.launchDirectionScratch);
    if (lockTarget) this.directionScratch.copy(lockTarget.object.position).sub(this.originScratch).normalize();
    this.performanceMarker?.('player-torpedo-launch');
    const visualIndex = this.visuals.activateMissile(this.originScratch, this.launchDirectionScratch, this.missileTubeSide);
    if (visualIndex < 0) {
      // Nothing was created, so the tube keeps its round.
      this.tubeLoaded[tube] = true;
      this.nextTube = tube;
      this.state.missileAmmo = this.torpedoTotal;
      this.state.missileCooldown = 0;
      this.state.lastMessage = 'Lanzador no disponible.';
      this.state.hitFeedback = 'blocked';
      this.state.hitPulse = 1;
      return false;
    }

    logical.active = true;
    logical.visualIndex = visualIndex;
    logical.position.copy(this.originScratch);
    logical.velocity.copy(this.directionScratch).multiplyScalar(combatTuningProfile.weapons.torpedoLaunchSpeed);
    if (shooterVelocity) logical.velocity.add(shooterVelocity);
    logical.target = lockTarget;
    logical.age = 0;
    logical.ignitionSignaled = false;
    this.state.firePulse = 1;
    this.state.lastFiredWeapon = 'torpedo';
    this.events.audioCueRequested = 'playerTorpedoEject';
    this.state.lastMessage = lockTarget ? 'Misil lanzado con fijacion.' : 'Misil lanzado en trayectoria libre.';
    return true;
  }

  getDiagnostics(): WeaponSystemDiagnostics {
    const visuals = this.visuals.getDiagnostics();
    let lastMissileTrailHead: [number, number, number] | null = null;
    let activeMissilePosition: [number, number, number] | null = null;
    for (let index = 0; index < this.missiles.length; index += 1) {
      if (!this.missiles[index].active) continue;
      lastMissileTrailHead = this.visuals.getMissileTrailHead(this.missiles[index].visualIndex);
      activeMissilePosition = this.missiles[index].position.toArray() as [number, number, number];
      break;
    }
    return {
      ...visuals,
      laserReady: this.state.laserReady,
      missileReady: this.state.missileReady,
      recoil: this.recoil,
      cameraImpulse: this.cameraImpulse,
      lastImpactPoint: [this.lastImpactPoint.x, this.lastImpactPoint.y, this.lastImpactPoint.z],
      lastImpactKind: this.events.lastImpactKind,
      lastMissileTrailHead,
      activeMissilePosition,
      activeHardpointIndex: this.activeHardpointIndex,
      activeHardpointSide: this.activeHardpointSide,
      audioCueRequested: this.events.audioCueRequested
    };
  }

  private get activeMissileCount(): number {
    let count = 0;
    for (let index = 0; index < this.missiles.length; index += 1) if (this.missiles[index].active) count += 1;
    return count;
  }

  private get hasIgnitedMissile(): boolean {
    for (let index = 0; index < this.missiles.length; index += 1) {
      const missile = this.missiles[index];
      if (missile.active && missile.age >= 0.055) return true;
    }
    return false;
  }

  private findFreeMissile(): LogicalMissile | undefined {
    for (let index = 0; index < this.missiles.length; index += 1) if (!this.missiles[index].active) return this.missiles[index];
    return undefined;
  }

  private updateMissiles(delta: number, targets: WeaponTarget[]): void {
    for (let index = 0; index < this.missiles.length; index += 1) {
      const missile = this.missiles[index];
      if (!missile.active) continue;
      missile.age += delta;
      if (!missile.ignitionSignaled && missile.age >= 0.055) {
        missile.ignitionSignaled = true;
        this.events.missileIgnitions += 1;
        this.events.audioCueRequested = 'playerTorpedoIgnite';
      }
      if (missile.target && missile.target.health > 0) {
        this.desiredDirectionScratch.copy(missile.target.object.position).sub(missile.position).normalize();
        const speed = missile.velocity.length();
        this.currentDirectionScratch.copy(missile.velocity).normalize();
        this.currentDirectionScratch.lerp(
          this.desiredDirectionScratch,
          Math.min(1, delta * combatTuningProfile.weapons.torpedoTurnResponse)
        ).normalize();
        missile.velocity.copy(this.currentDirectionScratch).multiplyScalar(
          speed * (1 + delta * combatTuningProfile.weapons.torpedoAccelerationPerSecond)
        );
      }
      missile.position.addScaledVector(missile.velocity, delta);
      this.directionScratch.copy(missile.velocity).normalize();
      this.visuals.updateMissile(missile.visualIndex, missile.position, this.directionScratch, missile.velocity.length());

      let hit: WeaponTarget | undefined;
      if (missile.target && missile.target.hostile && missile.target.health > 0) {
        const targetRadius = missile.target.radius + 8;
        if (missile.position.distanceToSquared(missile.target.object.position) <= targetRadius * targetRadius) {
          hit = missile.target;
        }
      }
      if (!hit) hit = this.findMissileHit(missile.position, targets);
      if (hit) {
        this.hitNormal.copy(missile.position).sub(hit.object.position);
        if (this.hitNormal.lengthSq() < 0.001) this.hitNormal.copy(this.directionScratch).negate();
        else this.hitNormal.normalize();
        this.applyImpact(
          hit,
          combatTuningProfile.weapons.torpedoDamage,
          missile.position,
          this.hitNormal,
          this.directionScratch,
          1.75,
          'torpedo'
        );
        this.events.torpedoImpacts += 1;
        this.events.torpedoDetonations += 1;
        this.events.audioCueRequested = 'playerTorpedoDetonation';
        this.state.lastMessage = 'Misil impacto amenaza.';
        this.releaseMissile(missile);
      } else if (missile.age > combatTuningProfile.weapons.torpedoMaximumFlightSeconds) {
        this.releaseMissile(missile);
      }
    }
  }

  private releaseMissile(missile: LogicalMissile): void {
    this.visuals.releaseMissile(missile.visualIndex);
    missile.active = false;
    missile.visualIndex = -1;
    missile.target = undefined;
    missile.age = 0;
    missile.ignitionSignaled = false;
  }

  private applyImpact(
    target: WeaponTarget,
    damage: number,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    direction: THREE.Vector3,
    power: number,
    weapon: 'laser' | 'torpedo'
  ): void {
    const visualData = target.object.userData as {
      combatSurface?: CombatImpactKind;
      combatMaximumHealth?: number;
      combatLastImpactAt?: number;
      combatMass?: CombatMassClass;
      combatVisualKick?: number;
      combatVisualKickDirection?: number;
    };
    if (!visualData.combatMaximumHealth || visualData.combatMaximumHealth < target.health) {
      visualData.combatMaximumHealth = target.health;
    }
    const maximumHealth = Math.max(1, visualData.combatMaximumHealth);
    target.health -= damage;
    const destroyed = target.health <= 0;
    const integrity = Math.max(0, target.health / maximumHealth);
    const kind = visualData.combatSurface ?? this.inferImpactKind(target);
    this.lastImpactPoint.copy(point);
    this.events.impacts += 1;
    this.events.lastImpactKind = kind;
    this.events.lastImpactWeapon = weapon;
    if (destroyed) this.events.destructions += 1;
    this.state.hitFeedback = destroyed ? 'destroyed' : integrity < 0.28 ? 'critical' : kind === 'shield' ? 'shield' : 'hull';
    this.state.hitPulse = 1;
    visualData.combatLastImpactAt = performance.now();

    // Light targets visibly absorb momentum; heavy structures barely twitch.
    const mass = visualData.combatMass ?? (target.radius < 14 ? 'light' : target.radius < 30 ? 'medium' : 'heavy');
    const reaction = mass === 'light' ? 0.026 : mass === 'medium' ? 0.009 : 0.0025;
    const reactionDirection = THREE.MathUtils.clamp(direction.x - direction.y, -1, 1);
    target.object.rotation.z += reactionDirection * reaction * power;
    visualData.combatVisualKick = Math.max(Number(visualData.combatVisualKick ?? 0), reaction * power);
    visualData.combatVisualKickDirection = reactionDirection || 1;
    const event: CombatImpactVisual = {
      target: target.object,
      point,
      normal,
      direction,
      kind,
      power,
      scale: THREE.MathUtils.clamp(target.radius / 11, 0.72, 3.2),
      integrity,
      destroyed,
      weapon: weapon === 'torpedo' ? 'torpedo' : 'energy-burst'
    };
    this.visuals.emitImpact(event);
    this.visualCompanion?.registerImpact(event, mass);
  }

  private inferImpactKind(target: WeaponTarget): CombatImpactKind {
    const name = `${target.object.name} ${target.object.parent?.name ?? ''}`.toLowerCase();
    if (name.includes('shield') || name.includes('protection')) return 'shield';
    if (target.radius > 28 || name.includes('core') || name.includes('platform')) return 'structure';
    return 'hull';
  }

  private findLockTarget(ship: THREE.Object3D, targets: WeaponTarget[], range: number): WeaponTarget | undefined {
    this.originScratch.copy(ship.position);
    this.directionScratch.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    const previous = this.lockTarget;
    if (previous && previous.hostile && previous.health > 0 && targets.includes(previous)) {
      this.toTargetScratch.copy(previous.object.position).sub(this.originScratch);
      const previousDistance = this.toTargetScratch.length();
      if (previousDistance > 0.001 && previousDistance <= range * 1.08) {
        const previousDot = this.directionScratch.dot(this.toTargetScratch.multiplyScalar(1 / previousDistance));
        if (previousDot >= 0.7) return previous;
      }
    }
    let best: WeaponTarget | undefined;
    let bestDot = 0.76;
    let bestDistance = range;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (!target.hostile || target.health <= 0) continue;
      this.toTargetScratch.copy(target.object.position).sub(this.originScratch);
      const distance = this.toTargetScratch.length();
      if (distance > range || distance <= 0.001) continue;
      const dot = this.directionScratch.dot(this.toTargetScratch.multiplyScalar(1 / distance));
      if (dot > bestDot || (Math.abs(dot - bestDot) < 0.001 && distance < bestDistance)) {
        best = target;
        bestDot = dot;
        bestDistance = distance;
      }
    }
    return best;
  }

  private findRayHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    targets: WeaponTarget[],
    range: number,
    width: number
  ): WeaponTarget | undefined {
    this.rayHitTarget = undefined;
    let nearest = range;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (!target.hostile || target.health <= 0) continue;
      this.toTargetScratch.copy(target.object.position).sub(origin);
      const forwardDistance = this.toTargetScratch.dot(direction);
      if (forwardDistance <= 0 || forwardDistance >= nearest) continue;
      this.closestScratch.copy(direction).multiplyScalar(forwardDistance).add(origin);
      const missDistanceSq = this.closestScratch.distanceToSquared(target.object.position);
      const collisionRadius = target.radius + width;
      if (missDistanceSq > collisionRadius * collisionRadius) continue;
      const entryDepth = Math.sqrt(Math.max(0, collisionRadius * collisionRadius - missDistanceSq));
      nearest = Math.max(0.1, forwardDistance - entryDepth);
      this.rayHitTarget = target;
    }
    if (this.rayHitTarget) {
      this.hitPoint.copy(direction).multiplyScalar(nearest).add(origin);
      this.hitNormal.copy(this.hitPoint).sub(this.rayHitTarget.object.position);
      if (this.hitNormal.lengthSq() < 0.001) this.hitNormal.copy(direction).negate();
      else this.hitNormal.normalize();
    }
    return this.rayHitTarget;
  }

  private findMissileHit(position: THREE.Vector3, targets: WeaponTarget[]): WeaponTarget | undefined {
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (!target.hostile || target.health <= 0) continue;
      const radius = target.radius + 8;
      if (position.distanceToSquared(target.object.position) <= radius * radius) return target;
    }
    return undefined;
  }
}
