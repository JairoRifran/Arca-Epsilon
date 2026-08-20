import * as THREE from 'three';
import { materialLibrary } from '../assets/materials';
import {
  LANDING_GEAR_TUNING,
  PLAYER_SHIP_LANDING_GEAR,
  type LandingGearLegConfig,
  type LandingGearLegId
} from '../game/PlayerShipDimensions';

/**
 * Deployment phases. One state for the whole assembly — the three legs share
 * it and differ only in how far each strut had to reach for its own ground.
 */
export type LandingGearState =
  | 'retracted'
  | 'deployingDoors'
  | 'swingingOut'
  | 'extending'
  | 'seekingGround'
  | 'compressing'
  | 'stabilising'
  | 'deployed'
  /** Suspension bleeding off while the hull starts to rise; legs still down. */
  | 'unloading'
  | 'retracting'
  | 'failed';

type Leg = {
  readonly config: LandingGearLegConfig;
  /** Hinge group for the bay door; rotating it swings from the edge. */
  readonly doorHinge: THREE.Group;
  /** Pivot the whole leg swings down from. */
  readonly pivot: THREE.Group;
  /** Sliding piston: the only part that changes length, via position. */
  readonly piston: THREE.Group;
  /** Foot plate, articulated to the ground it lands on. */
  readonly foot: THREE.Group;
  /** Mount point in ship-local space, resolved from hull bounds. */
  readonly mount: THREE.Vector3;
  /**
   * Distance from the piston group's origin down to the foot, in the leg's own
   * space. Read from the geometry so the reach solver stays correct if the rod
   * is ever resized.
   */
  readonly footRodOffset: number;
  /** Extension frozen at the moment retraction began, so it folds from there. */
  holdExtension: number;
  extension: number;
  compression: number;
  terrainHeight: number;
  footClearance: number;
  grounded: boolean;
};

/**
 * Three-point deployable landing gear.
 *
 * Owns geometry, deployment animation and per-foot ground seeking. It does not
 * move the ship: it reports the belly height the hull should settle to, and
 * `parkShipOnTerrain` remains the single authority that positions the hull.
 * That split is deliberate — two systems writing the ship transform is how a
 * parked ship starts jittering.
 */
export class PlayerShipLandingGear {
  readonly group = new THREE.Group();

  private state: LandingGearState = 'retracted';
  private phaseProgress = 0;
  private deploymentProgress = 0;
  private settlingProgress = 0;
  private surfaceSafeFlag = true;
  private built = false;
  private distanceDetailVisible = true;

  private readonly legs: Leg[] = [];
  private readonly legById = new Map<LandingGearLegId, Leg>();

  // Scratch: the update path must not allocate.
  private readonly mountWorldScratch = new THREE.Vector3();
  private readonly footWorldScratch = new THREE.Vector3();
  /** World direction of a leg's own downward axis, for the reach solver. */
  private readonly legAxisScratch = new THREE.Vector3();
  private readonly normalScratch = new THREE.Vector3();

  private groundSampler?: (x: number, z: number) => number;

  constructor() {
    this.group.name = 'Player Ship Landing Gear';
    this.group.visible = false;
  }

  /** Same terrain source the hull parks against, injected once. */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundSampler = sampler;
  }

  get currentState(): LandingGearState {
    return this.state;
  }
  get deployProgress(): number {
    return this.deploymentProgress;
  }
  get settleProgress(): number {
    return this.settlingProgress;
  }
  get surfaceSafe(): boolean {
    return this.surfaceSafeFlag;
  }
  get isDeployed(): boolean {
    return this.state === 'deployed';
  }
  get isStowed(): boolean {
    return this.state === 'retracted';
  }
  get legCount(): number {
    return this.legs.length;
  }

  /** Cull only a fully settled gear assembly once it is sub-pixel at range. */
  setObserverDistance(distance: number): void {
    if (this.state !== 'deployed') {
      this.distanceDetailVisible = true;
    } else if (this.distanceDetailVisible && distance > 60) {
      this.distanceDetailVisible = false;
    } else if (!this.distanceDetailVisible && distance < 52) {
      this.distanceDetailVisible = true;
    }
    this.group.visible = this.state !== 'retracted' && this.distanceDetailVisible;
  }

  legReadout(id: LandingGearLegId): {
    extension: number;
    compression: number;
    terrainHeight: number;
    footClearance: number;
    grounded: boolean;
    footWorld: [number, number, number];
  } | undefined {
    const leg = this.legById.get(id);
    if (!leg) return undefined;
    leg.foot.getWorldPosition(this.footWorldScratch);
    return {
      extension: Number(leg.extension.toFixed(3)),
      compression: Number(leg.compression.toFixed(3)),
      terrainHeight: Number(leg.terrainHeight.toFixed(3)),
      footClearance: Number(leg.footClearance.toFixed(3)),
      grounded: leg.grounded,
      footWorld: this.footWorldScratch.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number]
    };
  }

  /**
   * Builds the three legs once, sized from the hull's own extents.
   *
   * Called on the first deployment rather than at boot, so a player who never
   * lands never allocates the geometry — the same lazy rule the drone pools
   * and the access bay follow.
   */
  ensureBuilt(bounds: THREE.Vector3, hullBottomLocalY: number): void {
    if (this.built) return;
    this.built = true;

    const structural = materialLibrary.darkMetal;
    // Door skin: the shared `wornMetal` reads as a pale grey plate against
    // this hull, which is what made closed doors look like floating panels.
    // Own instance tuned to the fuselage's darker, rougher tone so a shut
    // door disappears into the belly.
    const skin = materialLibrary.wornMetal.clone();
    skin.color.setHex(0x55606a);
    skin.roughness = 0.62;
    skin.metalness = 0.78;
    // Dark seal running around the panel: breaks the flat silhouette and
    // reads as a real joint rather than a painted rectangle.
    const seal = new THREE.MeshStandardMaterial({
      color: 0x101418,
      roughness: 0.9,
      metalness: 0.2
    });
    const piston = materialLibrary.energyBlue.clone();
    piston.color.setHex(0x9aa6ad);
    piston.emissive.setHex(0x000000);
    piston.emissiveIntensity = 0;
    piston.roughness = 0.24;
    piston.metalness = 0.95;
    // Compliant pad: matte, high roughness, reads as composite not chrome.
    const pad = new THREE.MeshStandardMaterial({
      color: 0x14181b,
      roughness: 0.95,
      metalness: 0.08
    });

    for (const config of PLAYER_SHIP_LANDING_GEAR) {
      const scale = config.heavy ? 1 : 0.82;

      // --- Bay door: hinged at its outboard edge, flush when closed ------
      // Built as hinge -> mesh with the mesh offset half its width, so the
      // rotation axis lands on the real edge. Rotating the mesh about its own
      // centre is what made the doors read as grey slabs hanging in mid-air.
      const doorWidth = 0.9 * scale;
      const doorDepth = 1.5 * scale;
      const hingeSide = config.lateralFraction >= 0 ? 1 : -1;

      const doorHinge = new THREE.Group();
      doorHinge.name = `Landing Gear Bay Door Hinge ${config.id}`;

      const door = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, 0.09, doorDepth),
        skin
      );
      door.name = `Landing Gear Bay Door ${config.id}`;
      door.castShadow = true;
      // Offset so the hinge group's origin sits on the door's outboard edge.
      door.position.x = -hingeSide * doorWidth * 0.5;

      // Darker mechanical inner face, visible once the door swings down.
      const doorInner = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth * 0.92, 0.02, doorDepth * 0.92),
        structural
      );
      doorInner.position.y = -0.055;
      door.add(doorInner);
      // Stiffening rib across the inner face.
      const doorRib = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth * 0.8, 0.05, 0.08),
        structural
      );
      doorRib.position.y = -0.07;
      door.add(doorRib);
      // Hinge barrel on the pivot edge, so the axis is visibly hardware.
      const doorBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, doorDepth * 0.9, 8),
        structural
      );
      doorBarrel.rotation.x = Math.PI / 2;
      doorBarrel.position.x = hingeSide * doorWidth * 0.5;
      door.add(doorBarrel);

      // Perimeter seal: a thin dark lip proud of the panel edges, so a closed
      // door reads as a seam in the hull instead of a pale rectangle sitting
      // on top of it.
      for (const [sx, sz, sw, sd] of [
        [0, doorDepth * 0.5, doorWidth, 0.05],
        [0, -doorDepth * 0.5, doorWidth, 0.05],
        [doorWidth * 0.5, 0, 0.05, doorDepth],
        [-doorWidth * 0.5, 0, 0.05, doorDepth]
      ] as [number, number, number, number][]) {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.05, sd), seal);
        lip.position.set(sx, 0.025, sz);
        door.add(lip);
      }

      doorHinge.add(door);

      // --- Leg: pivot -> upper arm + shock -> piston -> foot -------------
      const pivot = new THREE.Group();
      pivot.name = `Landing Gear Leg ${config.id}`;

      const upperArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.26 * scale, 1.0, 0.3 * scale),
        structural
      );
      upperArm.position.y = -0.5;
      upperArm.castShadow = true;
      pivot.add(upperArm);

      // Oleo shock beside the arm: the part that visibly takes the load.
      const shock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11 * scale, 0.13 * scale, 0.85, 10),
        structural
      );
      shock.position.set(0.2 * scale, -0.45, 0);
      shock.castShadow = true;
      pivot.add(shock);

      // Drag brace tying the leg back into the bay.
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.86, 0.09),
        structural
      );
      brace.position.set(-0.16 * scale, -0.42, 0.2 * scale);
      brace.rotation.x = 0.28;
      pivot.add(brace);

      // --- Sliding piston: extension moves this, nothing scales ----------
      const pistonGroup = new THREE.Group();
      pistonGroup.name = `Landing Gear Piston ${config.id}`;
      const pistonRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085 * scale, 0.085 * scale, 1.25, 10),
        piston
      );
      pistonRod.position.y = -0.5;
      pistonRod.castShadow = true;
      pistonGroup.add(pistonRod);
      const scissor = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.6, 0.05),
        structural
      );
      scissor.position.set(0.13 * scale, -0.35, 0);
      scissor.rotation.z = -0.22;
      pistonGroup.add(scissor);
      pivot.add(pistonGroup);

      // --- Foot: wide articulated pad ------------------------------------
      const foot = new THREE.Group();
      foot.name = `Landing Gear Foot ${config.id}`;
      const yoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * scale, 0.16, 0.2 * scale),
        structural
      );
      yoke.position.y = 0.1;
      foot.add(yoke);
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42 * scale, 0.46 * scale, 0.1, 12),
        structural
      );
      plate.castShadow = true;
      foot.add(plate);
      const sole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 0.045, 12),
        pad
      );
      sole.position.y = -0.06;
      foot.add(sole);
      // Seat the foot at the BOTTOM of the piston rod, not at the piston
      // group's origin. The rod is 1.25 long centred at -0.5, so its lower end
      // is at -1.125; leaving the foot at 0 put it up at the rod's top, which
      // is why one foot read as detached and sitting loose on the ground.
      foot.position.y = -1.125;
      pistonGroup.add(foot);

      // Mount from hull proportions, seated at the real belly line.
      const mount = new THREE.Vector3(
        bounds.x * config.lateralFraction,
        hullBottomLocalY,
        bounds.z * config.longitudinalFraction
      );
      pivot.position.copy(mount);
      // Hinge sits on the belly line at the door's outboard edge.
      doorHinge.position.copy(mount);
      doorHinge.position.x += hingeSide * doorWidth * 0.5;
      doorHinge.position.y += 0.02;

      this.group.add(doorHinge);
      this.group.add(pivot);

      const leg: Leg = {
        config,
        doorHinge,
        pivot,
        piston: pistonGroup,
        foot,
        mount,
        footRodOffset: -foot.position.y,
        holdExtension: 0,
        extension: 0,
        compression: 0,
        terrainHeight: 0,
        footClearance: 0,
        grounded: false
      };
      this.legs.push(leg);
      this.legById.set(config.id, leg);
    }
  }

  /** Begins deployment. Ignored if already down or on the way down. */
  deploy(): void {
    if (this.state === 'retracted' || this.state === 'retracting') {
      this.state = 'deployingDoors';
      this.phaseProgress = 0;
      this.distanceDetailVisible = true;
      this.group.visible = true;
    }
  }

  /** Begins retraction from any deployed or partially deployed state. */
  retract(): void {
    if (this.state !== 'retracted' && this.state !== 'retracting') {
      this.captureHold();
      this.state = 'retracting';
      this.phaseProgress = 0;
    }
  }

  /** Freezes each strut's current length as the folding start point. */
  private captureHold(): void {
    for (const leg of this.legs) leg.holdExtension = leg.extension;
  }

  /**
   * Normal-gameplay takeoff entry point: bleed the suspension first, then
   * retract. Legs stay down and planted through the unload, so the hull can
   * rise off them before anything folds — retracting a leg that is still
   * carrying the ship is what makes gear look weightless.
   */
  requestRetract(): void {
    if (this.state === 'retracted' || this.state === 'retracting' || this.state === 'unloading') return;
    this.captureHold();
    this.state = 'unloading';
    this.phaseProgress = 0;
  }

  /**
   * Pins the retraction at a fraction of its run, for diagnostics.
   *
   * Same contract as `setDeploymentFraction`: it selects the real state and a
   * phase offset within it rather than bypassing the machine, so a capture
   * taken here shows what the animation actually renders at that moment.
   */
  setRetractionFraction(fraction: number): LandingGearState {
    const clamped = THREE.MathUtils.clamp(fraction, 0, 1);
    if (clamped <= 0) {
      this.forceDeployed();
      return this.state;
    }
    if (clamped >= 1) {
      this.forceRetracted();
      return this.state;
    }
    if (this.state !== 'retracting') {
      this.captureHold();
      this.state = 'retracting';
    }
    this.phaseProgress = clamped * this.retractTotalSeconds;
    return this.state;
  }

  /** Wall-clock length of the folding sequence, excluding the unload. */
  get retractTotalSeconds(): number {
    const t = LANDING_GEAR_TUNING;
    return (t.extendSeconds + t.swingSeconds + t.bayDoorSeconds) * t.retractSpeedFactor;
  }

  /** Full post-access takeoff budget: unload plus fold. */
  get takeoffTotalSeconds(): number {
    return LANDING_GEAR_TUNING.unloadSeconds + this.retractTotalSeconds;
  }

  /** True once the suspension has finished bleeding off. */
  get unloadComplete(): boolean {
    return this.state !== 'unloading' || this.phaseProgress >= LANDING_GEAR_TUNING.unloadSeconds;
  }

  /** How many feet are still touching their own ground. */
  get footContactCount(): number {
    let n = 0;
    for (const leg of this.legs) if (leg.grounded) n += 1;
    return n;
  }

  /**
   * Colliders the gear currently contributes. The legs have no separate
   * collision volumes yet — they are visual children of the hull, covered by
   * the six main ship colliders — so this is zero unless a leg is out. It
   * exists so "airborne with active gear colliders" is an assertable state
   * rather than an assumption.
   */
  get activeColliderCount(): number {
    return this.state === 'retracted' ? 0 : this.legs.length;
  }


  /**
   * Snaps straight to the settled stance.
   *
   * Debug hooks, save restores and probes need the end state without waiting
   * out the animation, and waiting on wall-clock in a test is exactly how
   * flaky timing bugs get written.
   */
  forceDeployed(): void {
    this.state = 'deployed';
    this.phaseProgress = 1;
    this.deploymentProgress = 1;
    this.settlingProgress = 1;
    this.distanceDetailVisible = true;
    this.group.visible = true;
  }

  /**
   * Drives the real machine to a fraction of the full deployment.
   *
   * Diagnostics only. It walks the same phase list the animation walks and
   * leaves the assembly parked mid-phase, so the progressive sequence can be
   * photographed and asserted without waiting on wall-clock — which under a
   * software renderer never lands on the phase you wanted. It does not bypass
   * the state machine: it selects a state and a phase offset within it.
   */
  setDeploymentFraction(fraction: number): LandingGearState {
    const t = LANDING_GEAR_TUNING;
    const phases: [LandingGearState, number][] = [
      ['deployingDoors', t.bayDoorSeconds],
      ['swingingOut', t.swingSeconds],
      ['extending', t.extendSeconds],
      ['seekingGround', t.contactSeconds],
      ['compressing', t.contactSeconds],
      ['stabilising', t.stabiliseSeconds]
    ];
    const total = phases.reduce((sum, [, d]) => sum + d, 0);
    const clamped = THREE.MathUtils.clamp(fraction, 0, 1);

    if (clamped <= 0) {
      this.forceRetracted();
      return this.state;
    }
    if (clamped >= 1) {
      this.forceDeployed();
      return this.state;
    }

    this.group.visible = true;
    let remaining = clamped * total;
    for (const [phase, duration] of phases) {
      if (remaining <= duration) {
        this.state = phase;
        this.phaseProgress = remaining;
        return this.state;
      }
      remaining -= duration;
    }
    this.state = 'stabilising';
    this.phaseProgress = t.stabiliseSeconds;
    return this.state;
  }

  /** Phase-resolved progress values, for the sequence assertions. */
  /**
   * Normalised progress of each mechanical phase, for the visuals and for the
   * diagnostics readout alike.
   *
   * One source for both: the readout used to recompute this independently via
   * `progressThrough`, which returns 0 for any state not in its forward order
   * list — so `unloading` and `retracting` reported all-zeros while the gear
   * was visibly mid-motion.
   */
  private computePhases(): {
    doorOpen: number; swing: number; extend: number;
    seek: number; compress: number; stabilise: number;
  } {
    const t = LANDING_GEAR_TUNING;
    if (this.state === 'retracting') {
      // Runs the deployment backwards in stages, and the staging is the point:
      // struts shorten, THEN arms fold into the bays, THEN the doors close over
      // them. The previous version scaled the forward phase values by a single
      // falling `retreat`, but those values are already 0 while retracting, so
      // the gear snapped shut on the first frame instead of animating.
      const f = t.retractSpeedFactor;
      const dExtend = t.extendSeconds * f;
      const dSwing = t.swingSeconds * f;
      const dDoor = t.bayDoorSeconds * f;
      const rExtend = THREE.MathUtils.clamp(this.phaseProgress / dExtend, 0, 1);
      const rSwing = THREE.MathUtils.clamp((this.phaseProgress - dExtend) / dSwing, 0, 1);
      const rDoor = THREE.MathUtils.clamp((this.phaseProgress - dExtend - dSwing) / dDoor, 0, 1);
      return {
        doorOpen: 1 - rDoor, swing: 1 - rSwing, extend: 1 - rExtend,
        seek: 0, compress: 0, stabilise: 0
      };
    }
    if (this.state === 'unloading') {
      // Everything holds where it settled; only the suspension bleeds off.
      return {
        doorOpen: 1, swing: 1, extend: 1, seek: 1, stabilise: 1,
        compress: 1 - THREE.MathUtils.clamp(this.phaseProgress / t.unloadSeconds, 0, 1)
      };
    }
    return {
      doorOpen: this.progressThrough('deployingDoors', t.bayDoorSeconds),
      swing: this.progressThrough('swingingOut', t.swingSeconds),
      extend: this.progressThrough('extending', t.extendSeconds),
      seek: this.progressThrough('seekingGround', t.contactSeconds),
      compress: this.progressThrough('compressing', t.contactSeconds),
      stabilise: this.progressThrough('stabilising', t.stabiliseSeconds)
    };
  }

  get phaseReadout(): {
    door: number;
    swing: number;
    extension: number;
    seeking: number;
    compression: number;
    stabilise: number;
  } {
    const p = this.computePhases();
    return {
      door: Number(p.doorOpen.toFixed(3)),
      swing: Number(p.swing.toFixed(3)),
      extension: Number(p.extend.toFixed(3)),
      seeking: Number(p.seek.toFixed(3)),
      compression: Number(p.compress.toFixed(3)),
      stabilise: Number(p.stabilise.toFixed(3))
    };
  }

  /**
   * Per-leg mechanical audit: where the strut ends versus where the foot is.
   * A non-trivial `legToFootDistance` means the foot has come off its leg.
   */
  auditLegs(): {
    id: string;
    parentName: string;
    strutEndWorld: [number, number, number];
    footWorld: [number, number, number];
    legToFootDistance: number;
    extension: number;
    compression: number;
    terrainHeight: number;
    footClearance: number;
  }[] {
    const out: ReturnType<PlayerShipLandingGear['auditLegs']> = [];
    for (const leg of this.legs) {
      // End of the piston rod: the point the foot must be attached to.
      const strutEnd = new THREE.Vector3(0, -1.125, 0);
      leg.piston.updateWorldMatrix(true, false);
      strutEnd.applyMatrix4(leg.piston.matrixWorld);
      const footWorld = leg.foot.getWorldPosition(new THREE.Vector3());
      out.push({
        id: leg.config.id,
        parentName: leg.foot.parent?.name ?? 'none',
        strutEndWorld: strutEnd.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
        footWorld: footWorld.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
        legToFootDistance: Number(strutEnd.distanceTo(footWorld).toFixed(4)),
        extension: Number(leg.extension.toFixed(3)),
        compression: Number(leg.compression.toFixed(3)),
        terrainHeight: Number(leg.terrainHeight.toFixed(3)),
        footClearance: Number(leg.footClearance.toFixed(3))
      });
    }
    return out;
  }

  forceRetracted(): void {
    this.state = 'retracted';
    this.phaseProgress = 0;
    this.deploymentProgress = 0;
    this.settlingProgress = 0;
    this.distanceDetailVisible = true;
    this.group.visible = false;
    for (const leg of this.legs) {
      leg.extension = 0;
      leg.holdExtension = 0;
      leg.compression = 0;
      leg.grounded = false;
    }
  }

  /**
   * Belly height the hull should settle to, given what the feet found.
   *
   * Returns the target clearance clamped into the configured band. The hull is
   * moved by `parkShipOnTerrain`, never here.
   */
  get targetBellyClearance(): number {
    return THREE.MathUtils.clamp(
      LANDING_GEAR_TUNING.targetBellyClearance,
      LANDING_GEAR_TUNING.minBellyClearance,
      LANDING_GEAR_TUNING.maxBellyClearance
    );
  }

  /**
   * Advances the deployment and seats each foot on its own ground.
   *
   * Terrain is sampled per leg and only while the gear is moving or parked on
   * a surface — never in flight, where the whole system is invisible and
   * costs a single early return.
   */
  update(delta: number, shipMatrixWorld: THREE.Matrix4): void {
    if (this.state === 'retracted') return;

    const t = LANDING_GEAR_TUNING;
    this.phaseProgress += delta;

    // Advance the phase machine. One clock for the whole assembly.
    switch (this.state) {
      case 'deployingDoors':
        if (this.phaseProgress >= t.bayDoorSeconds) this.advance('swingingOut');
        break;
      case 'swingingOut':
        if (this.phaseProgress >= t.swingSeconds) this.advance('extending');
        break;
      case 'extending':
        if (this.phaseProgress >= t.extendSeconds) this.advance('seekingGround');
        break;
      case 'seekingGround':
        if (this.phaseProgress >= t.contactSeconds) this.advance('compressing');
        break;
      case 'compressing':
        if (this.phaseProgress >= t.contactSeconds) this.advance('stabilising');
        break;
      case 'stabilising':
        if (this.phaseProgress >= t.stabiliseSeconds) this.advance('deployed');
        break;
      case 'unloading':
        // Folding a leg that is still carrying the ship is the thing this
        // phase exists to prevent, so contact gates the hand-off. The timeout
        // keeps a caller that never lifts the hull from hanging here forever.
        if (
          this.phaseProgress >= t.unloadSeconds &&
          (this.footContactCount === 0 || this.phaseProgress >= t.unloadSeconds * 4)
        ) {
          this.advance('retracting');
        }
        break;
      case 'retracting':
        if (this.phaseProgress >= this.retractTotalSeconds) this.forceRetracted();
        break;
      default:
        break;
    }

    // Normalised progress for the visuals.
    const retracting = this.state === 'retracting';
    const unloading = this.state === 'unloading';
    const { doorOpen, swing, extend, seek, compress, stabilise } = this.computePhases();

    this.deploymentProgress = THREE.MathUtils.clamp((doorOpen + swing + extend) / 3, 0, 1);
    this.settlingProgress = THREE.MathUtils.clamp((seek + compress + stabilise) / 3, 0, 1);

    let allGrounded = true;
    for (const leg of this.legs) {
      // Bay door drops clear before anything swings.
      leg.doorHinge.rotation.z = -Math.sign(leg.config.lateralFraction || 1) * doorOpen * 1.25;

      // Leg swings down out of the bay.
      leg.pivot.rotation.x = (1 - swing) * -1.15;

      // Strut extends toward the ground it is over.
      leg.foot.getWorldPosition(this.footWorldScratch);
      const ground = this.groundSampler
        ? this.groundSampler(this.footWorldScratch.x, this.footWorldScratch.z)
        : 0;
      leg.terrainHeight = ground;

      // Where the mount sits in world space decides how far to reach.
      this.mountWorldScratch.copy(leg.mount).applyMatrix4(shipMatrixWorld);

      // The foot does NOT hang straight down from the mount: it sits at the end
      // of a rod that has already swung outboard, and the ship itself may be
      // pitched. The span from pivot to foot is (rodOffset + extension -
      // compression) measured along the pivot's own -Y, so only `axialDrop` of
      // it becomes height. Treating that span as vertical over-extended every
      // leg by the cosine error and drove the feet ~0.9 m under the terrain.
      leg.pivot.updateWorldMatrix(true, false);
      this.legAxisScratch.set(0, -1, 0).transformDirection(leg.pivot.matrixWorld);
      const axialDrop = Math.max(this.legAxisScratch.y * -1, 0.25);

      leg.compression = compress * t.maxCompression * (leg.config.heavy ? 1 : 0.7);
      if (unloading) {
        // Hold the strut exactly where it settled. Re-solving here would let
        // the leg stretch to chase the ground as the hull rises, so the feet
        // would stay planted forever and contact would never break.
        this.piston(leg);
      } else if (retracting) {
        leg.extension = leg.holdExtension * extend;
        this.piston(leg);
      } else {
        const verticalGap = this.mountWorldScratch.y - ground - t.footClearance;
        const reach = THREE.MathUtils.clamp(
          verticalGap / axialDrop - leg.footRodOffset + leg.compression,
          t.minExtension,
          t.maxExtension
        );
        leg.extension = reach * extend;
        this.piston(leg);
      }

      leg.foot.getWorldPosition(this.footWorldScratch);
      leg.footClearance = this.footWorldScratch.y - ground;
      // Contact is a measured fact about where the foot is, not a phase label:
      // during the unload the hull rises and the feet must genuinely leave the
      // ground, which only shows up if this is evaluated the same way there.
      leg.grounded = (seek > 0.5 || unloading) && Math.abs(leg.footClearance) < 0.12;
      if (!leg.grounded) allGrounded = false;

      // Foot articulates to the local slope, within a believable limit.
      if (this.groundSampler && seek > 0.1) {
        this.estimateSlope(this.footWorldScratch.x, this.footWorldScratch.z);
        leg.foot.rotation.x = THREE.MathUtils.clamp(this.normalScratch.z, -0.28, 0.28);
        leg.foot.rotation.z = THREE.MathUtils.clamp(-this.normalScratch.x, -0.28, 0.28);
      }
    }

    this.surfaceSafeFlag = this.state !== 'failed' && (this.state !== 'deployed' || allGrounded);
  }

  /** Applies extension and compression to the sliding piston. */
  private piston(leg: Leg): void {
    leg.piston.position.y = -(leg.extension - leg.compression);
  }

  private advance(next: LandingGearState): void {
    if (next === 'retracting') this.captureHold();
    this.state = next;
    this.phaseProgress = 0;
  }

  /** 0..1 through a phase, and 1 for every phase already completed. */
  private progressThrough(phase: LandingGearState, duration: number): number {
    const order: LandingGearState[] = [
      'deployingDoors', 'swingingOut', 'extending', 'seekingGround',
      'compressing', 'stabilising', 'deployed'
    ];
    const currentIndex = order.indexOf(this.state);
    const phaseIndex = order.indexOf(phase);
    if (this.state === 'deployed') return 1;
    if (currentIndex < 0 || phaseIndex < 0) return 0;
    if (currentIndex > phaseIndex) return 1;
    if (currentIndex < phaseIndex) return 0;
    return THREE.MathUtils.clamp(this.phaseProgress / duration, 0, 1);
  }

  /**
   * Cheap slope estimate from four height samples around a point. Enough to
   * cant a foot plate; far cheaper than a mesh raycast, and it reuses the same
   * terrain source everything else does.
   */
  private estimateSlope(x: number, z: number): void {
    if (!this.groundSampler) {
      this.normalScratch.set(0, 1, 0);
      return;
    }
    const step = 0.6;
    const hx = this.groundSampler(x + step, z) - this.groundSampler(x - step, z);
    const hz = this.groundSampler(x, z + step) - this.groundSampler(x, z - step);
    this.normalScratch.set(hx / (2 * step), 1, hz / (2 * step));
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    this.legs.length = 0;
    this.legById.clear();
    this.built = false;
  }
}
