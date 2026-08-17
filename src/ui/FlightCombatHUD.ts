import * as THREE from 'three';
import { combatTuningProfile } from '../game/CombatTuningProfile';
import { computeLeadSolution, type LeadSolution } from '../systems/LeadSolutionComputer';
import type { WeaponTarget } from '../systems/WeaponSystem';

export type CombatWeaponMode = 'laser' | 'torpedo';
export type FireSolutionState = 'no-target' | 'off-arc' | 'tracking' | 'near' | 'solution';
export type HorizonReferenceMode = 'planetary' | 'inertial';

export type FlightCombatHudFrame = {
  camera: THREE.Camera;
  ship: THREE.Object3D;
  shipVelocity: THREE.Vector3;
  referenceUp: THREE.Vector3;
  target?: WeaponTarget;
  visible: boolean;
  horizonMode: HorizonReferenceMode;
  weapon: CombatWeaponMode;
  projectileSpeed: number;
  weaponReady: boolean;
  torpedoLocked: boolean;
  targetOccluded: boolean;
  jammed: boolean;
  critical: boolean;
  hitFeedback: 'none' | 'shield' | 'hull' | 'critical' | 'destroyed' | 'blocked' | 'out-of-range';
  hitPulse: number;
};

export type FlightCombatHudDiagnostics = {
  visible: boolean;
  updateRateHz: number;
  updates: number;
  targetId: string;
  targetOnScreen: boolean;
  targetOccluded: boolean;
  leadSolutionValid: boolean;
  solutionState: FireSolutionState;
  range: number;
  closingSpeed: number;
  interceptTime: number;
  boresight: [number, number];
  flightPathMarker: [number, number];
  horizonMode: HorizonReferenceMode;
  heading: number;
  pitch: number;
  bank: number;
  weapon: CombatWeaponMode;
  torpedoLocked: boolean;
  solutionErrorDegrees: number;
  jammed: boolean;
  signalRestored: boolean;
  damageDirectionActive: boolean;
  critical: boolean;
};

const ZERO_VELOCITY = new THREE.Vector3();

export class FlightCombatHUD {
  readonly root: HTMLElement;

  private readonly boresight: HTMLElement;
  private readonly flightPathMarker: HTMLElement;
  private readonly accelerationMarker: HTMLElement;
  private readonly horizonAssembly: HTMLElement;
  private readonly horizonLine: HTMLElement;
  private readonly pitchLadder: HTMLElement;
  private readonly bankPointer: HTMLElement;
  private readonly headingTape: HTMLElement;
  private readonly referenceLabel: HTMLElement;
  private readonly targetDesignator: HTMLElement;
  private readonly targetLabel: HTMLElement;
  private readonly targetRange: HTMLElement;
  private readonly targetMotion: HTMLElement;
  private readonly targetDirection: HTMLElement;
  private readonly targetDirectionRange: HTMLElement;
  private readonly leadPipper: HTMLElement;
  private readonly predictedImpact: HTMLElement;
  private readonly solutionLabel: HTMLElement;
  private readonly torpedoLock: HTMLElement;
  private readonly systemState: HTMLElement;
  private readonly damageDirection: HTMLElement;

  private readonly shipPosition = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly relativePosition = new THREE.Vector3();
  private readonly relativeVelocity = new THREE.Vector3();
  private readonly lineOfSight = new THREE.Vector3();
  private readonly shipForward = new THREE.Vector3();
  private readonly shipRight = new THREE.Vector3();
  private readonly shipUp = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly worldPoint = new THREE.Vector3();
  private readonly localDirection = new THREE.Vector3();
  private readonly lastVelocity = new THREE.Vector3();
  private readonly acceleration = new THREE.Vector3();
  private readonly smoothedAcceleration = new THREE.Vector3();
  private readonly referenceUp = new THREE.Vector3(0, 1, 0);
  private readonly lead: LeadSolution = { valid: false, time: 0, point: new THREE.Vector3() };
  private readonly inverseCameraQuaternion = new THREE.Quaternion();
  private readonly damageVector = new THREE.Vector3();

  private accumulator = 0;
  private updates = 0;
  private initializedVelocity = false;
  private targetOnScreen = false;
  private targetOccluded = false;
  private solutionState: FireSolutionState = 'no-target';
  private range = 0;
  private closingSpeed = 0;
  private heading = 0;
  private pitch = 0;
  private bank = 0;
  private weapon: CombatWeaponMode = 'laser';
  private horizonMode: HorizonReferenceMode = 'inertial';
  private torpedoLocked = false;
  private solutionErrorDegrees = 0;
  private targetId = '';
  private boresightX = 0.5;
  private boresightY = 0.5;
  private flightPathX = 0.5;
  private flightPathY = 0.5;
  private screenWidth = 1;
  private screenHeight = 1;
  private solutionCueCooldown = 0;
  private previousSolutionState: FireSolutionState = 'no-target';
  private readonly onSolutionAcquired?: () => void;
  private readonly onSignalRestored?: () => void;
  private previousJammed = false;
  private signalRestoredRemaining = 0;
  private damageDirectionRemaining = 0;
  private damageDirectionAngle = 0;
  private jammed = false;
  private critical = false;

  constructor(container: HTMLElement, onSolutionAcquired?: () => void, onSignalRestored?: () => void) {
    this.onSolutionAcquired = onSolutionAcquired;
    this.onSignalRestored = onSignalRestored;
    this.root = document.createElement('section');
    this.root.id = 'flight-combat-hud';
    this.root.className = 'flight-combat-hud';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="combat-horizon" data-role="horizon">
        <div class="combat-pitch-ladder" data-role="pitch-ladder">
          <span data-pitch="30">30</span><i data-pitch="30"></i>
          <span data-pitch="15">15</span><i data-pitch="15"></i>
          <i data-pitch="0"></i>
          <span data-pitch="-15">-15</span><i data-pitch="-15"></i>
          <span data-pitch="-30">-30</span><i data-pitch="-30"></i>
        </div>
        <div class="combat-horizon-line" data-role="horizon-line"></div>
      </div>
      <div class="combat-bank-scale" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b data-role="bank-pointer"></b></div>
      <div class="combat-heading-tape" data-role="heading-tape"></div>
      <div class="combat-reference-label" data-role="reference-label">INR</div>
      <div class="combat-symbol combat-boresight" data-role="boresight"><i></i><i></i><b></b></div>
      <div class="combat-symbol combat-flight-path" data-role="flight-path"><i></i><i></i><b></b></div>
      <div class="combat-symbol combat-acceleration" data-role="acceleration"><i></i></div>
      <div class="combat-target" data-role="target">
        <i></i><i></i><i></i><i></i>
        <strong data-role="target-label"></strong>
        <span data-role="target-range"></span>
        <span data-role="target-motion"></span>
      </div>
      <div class="combat-target-direction" data-role="target-direction"><i></i><span></span></div>
      <div class="combat-symbol combat-lead-pipper" data-role="lead-pipper"><i></i><b></b></div>
      <div class="combat-symbol combat-impact-prediction" data-role="predicted-impact"><i></i><i></i></div>
      <div class="combat-solution-label" data-role="solution-label">SIN SOL</div>
      <div class="combat-torpedo-lock" data-role="torpedo-lock"><i></i><span>TORP</span></div>
      <div class="combat-system-state" data-role="system-state"></div>
      <div class="combat-damage-direction" data-role="damage-direction"><i></i></div>
    `;
    container.append(this.root);

    this.boresight = this.require('[data-role="boresight"]');
    this.flightPathMarker = this.require('[data-role="flight-path"]');
    this.accelerationMarker = this.require('[data-role="acceleration"]');
    this.horizonAssembly = this.require('[data-role="horizon"]');
    this.horizonLine = this.require('[data-role="horizon-line"]');
    this.pitchLadder = this.require('[data-role="pitch-ladder"]');
    this.bankPointer = this.require('[data-role="bank-pointer"]');
    this.headingTape = this.require('[data-role="heading-tape"]');
    this.referenceLabel = this.require('[data-role="reference-label"]');
    this.targetDesignator = this.require('[data-role="target"]');
    this.targetLabel = this.require('[data-role="target-label"]');
    this.targetRange = this.require('[data-role="target-range"]');
    this.targetMotion = this.require('[data-role="target-motion"]');
    this.targetDirection = this.require('[data-role="target-direction"]');
    this.targetDirectionRange = this.require('[data-role="target-direction"] span');
    this.leadPipper = this.require('[data-role="lead-pipper"]');
    this.predictedImpact = this.require('[data-role="predicted-impact"]');
    this.solutionLabel = this.require('[data-role="solution-label"]');
    this.torpedoLock = this.require('[data-role="torpedo-lock"]');
    this.systemState = this.require('[data-role="system-state"]');
    this.damageDirection = this.require('[data-role="damage-direction"]');
  }

  registerDamageDirection(worldPosition: THREE.Vector3, shipPosition: THREE.Vector3, camera: THREE.Camera): void {
    this.inverseCameraQuaternion.copy(camera.quaternion).invert();
    this.damageVector.copy(worldPosition).sub(shipPosition).applyQuaternion(this.inverseCameraQuaternion);
    if (this.damageVector.lengthSq() < 0.0001) return;
    this.damageDirectionAngle = Math.atan2(this.damageVector.x, this.damageVector.y || -this.damageVector.z);
    this.damageDirectionRemaining = 0.62;
  }

  update(delta: number, frame: FlightCombatHudFrame): void {
    this.accumulator += delta;
    this.solutionCueCooldown = Math.max(0, this.solutionCueCooldown - delta);
    this.signalRestoredRemaining = Math.max(0, this.signalRestoredRemaining - delta);
    this.damageDirectionRemaining = Math.max(0, this.damageDirectionRemaining - delta);
    if (!frame.visible) {
      if (this.root.classList.contains('is-active')) {
        this.root.classList.remove('is-active');
        this.root.setAttribute('aria-hidden', 'true');
      }
      this.solutionState = 'no-target';
      return;
    }
    this.root.classList.add('is-active');
    this.root.setAttribute('aria-hidden', 'false');
    if (this.previousJammed && !frame.jammed) {
      this.signalRestoredRemaining = 1.05;
      this.onSignalRestored?.();
    }
    this.previousJammed = frame.jammed;
    this.jammed = frame.jammed;
    this.critical = frame.critical;
    if (this.accumulator < combatTuningProfile.hud.updateSeconds) return;
    const sampleDelta = this.accumulator;
    this.accumulator = 0;
    this.updates += 1;

    const interferenceState = String(frame.jammed);
    const signalState = this.signalRestoredRemaining > 0 ? 'restored' : frame.jammed ? 'jammed' : 'nominal';
    const hitState = frame.hitPulse > 0 ? frame.hitFeedback : 'none';
    if (this.root.dataset.interference !== interferenceState) this.root.dataset.interference = interferenceState;
    if (this.root.dataset.signal !== signalState) this.root.dataset.signal = signalState;
    if (this.root.dataset.hit !== hitState) this.root.dataset.hit = hitState;
    this.root.classList.toggle('is-critical', frame.critical);
    const systemText = frame.jammed
      ? 'INTERFERENCIA // FIJACION DEGRADADA'
      : this.signalRestoredRemaining > 0
        ? 'SEÑAL RESTAURADA // FIJACION DISPONIBLE'
        : frame.critical
          ? 'INTEGRIDAD CRITICA'
          : '';
    if (this.systemState.textContent !== systemText) this.systemState.textContent = systemText;
    const damageDirectionVisible = this.damageDirectionRemaining > 0;
    this.damageDirection.hidden = !damageDirectionVisible;
    if (damageDirectionVisible) {
      this.damageDirection.style.transform = `translate(-50%, -50%) rotate(${this.damageDirectionAngle.toFixed(3)}rad)`;
      this.damageDirection.style.opacity = `${THREE.MathUtils.clamp(this.damageDirectionRemaining / 0.35, 0, 1).toFixed(2)}`;
    }

    this.weapon = frame.weapon;
    this.horizonMode = frame.horizonMode;
    this.torpedoLocked = frame.torpedoLocked;
    this.targetOccluded = frame.targetOccluded;
    this.screenWidth = Math.max(1, window.innerWidth);
    this.screenHeight = Math.max(1, window.innerHeight);
    frame.ship.getWorldPosition(this.shipPosition);
    this.shipForward.set(0, 0, -1).applyQuaternion(frame.ship.quaternion).normalize();
    this.shipRight.set(1, 0, 0).applyQuaternion(frame.ship.quaternion).normalize();
    this.shipUp.set(0, 1, 0).applyQuaternion(frame.ship.quaternion).normalize();
    this.referenceUp.copy(frame.referenceUp).normalize();

    if (this.initializedVelocity) {
      this.acceleration.copy(frame.shipVelocity).sub(this.lastVelocity).multiplyScalar(1 / Math.max(0.001, sampleDelta));
      this.smoothedAcceleration.lerp(this.acceleration, 0.34);
    } else {
      this.initializedVelocity = true;
      this.smoothedAcceleration.set(0, 0, 0);
    }
    this.lastVelocity.copy(frame.shipVelocity);

    this.updateAttitude(frame.camera);
    this.updateMotionSymbols(frame.camera, frame.shipVelocity);
    this.updateTarget(frame);
  }

  getDiagnostics(): FlightCombatHudDiagnostics {
    return {
      visible: this.root.classList.contains('is-active'),
      updateRateHz: Math.round(1 / combatTuningProfile.hud.updateSeconds),
      updates: this.updates,
      targetId: this.targetId,
      targetOnScreen: this.targetOnScreen,
      targetOccluded: this.targetOccluded,
      leadSolutionValid: this.lead.valid,
      solutionState: this.solutionState,
      range: Number(this.range.toFixed(2)),
      closingSpeed: Number(this.closingSpeed.toFixed(2)),
      interceptTime: Number(this.lead.time.toFixed(3)),
      boresight: [Number(this.boresightX.toFixed(4)), Number(this.boresightY.toFixed(4))],
      flightPathMarker: [Number(this.flightPathX.toFixed(4)), Number(this.flightPathY.toFixed(4))],
      horizonMode: this.horizonMode,
      heading: Number(this.heading.toFixed(2)),
      pitch: Number(this.pitch.toFixed(2)),
      bank: Number(this.bank.toFixed(2)),
      weapon: this.weapon,
      torpedoLocked: this.torpedoLocked,
      solutionErrorDegrees: Number(this.solutionErrorDegrees.toFixed(3)),
      jammed: this.jammed,
      signalRestored: this.signalRestoredRemaining > 0,
      damageDirectionActive: this.damageDirectionRemaining > 0,
      critical: this.critical
    };
  }

  private updateAttitude(camera: THREE.Camera): void {
    this.pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.shipForward.dot(this.referenceUp), -1, 1)));
    this.bank = THREE.MathUtils.radToDeg(Math.atan2(this.shipRight.dot(this.referenceUp), this.shipUp.dot(this.referenceUp)));
    this.heading = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(-this.shipForward.x, -this.shipForward.z)), 360);
    const pitchOffset = THREE.MathUtils.clamp(this.pitch * 2.15, -88, 88);
    this.horizonAssembly.style.transform = `translate3d(-50%, calc(-50% + ${pitchOffset.toFixed(1)}px), 0) rotate(${(-this.bank).toFixed(2)}deg)`;
    this.horizonLine.dataset.mode = this.horizonMode;
    this.pitchLadder.dataset.mode = this.horizonMode;
    this.bankPointer.style.transform = `translateX(-50%) rotate(${this.bank.toFixed(2)}deg) translateY(-27px)`;
    this.referenceLabel.textContent = this.horizonMode === 'planetary' ? 'GRV' : 'INR';
    const left = THREE.MathUtils.euclideanModulo(Math.round(this.heading / 5) * 5 - 15, 360);
    const center = THREE.MathUtils.euclideanModulo(left + 15, 360);
    const right = THREE.MathUtils.euclideanModulo(center + 15, 360);
    this.headingTape.textContent = `${this.heading.toFixed(0).padStart(3, '0')}  |  ${left.toString().padStart(3, '0')}   ${this.cardinal(center)}   ${right.toString().padStart(3, '0')}`;
    camera.getWorldDirection(this.cameraForward);
  }

  private updateMotionSymbols(camera: THREE.Camera, shipVelocity: THREE.Vector3): void {
    this.worldPoint.copy(this.shipForward).multiplyScalar(900).add(this.shipPosition);
    this.project(camera, this.worldPoint);
    this.boresightX = this.normalizedX();
    this.boresightY = this.normalizedY();
    this.position(this.boresight, this.boresightX, this.boresightY);

    if (shipVelocity.lengthSq() > 0.12) {
      this.worldPoint.copy(shipVelocity).normalize().multiplyScalar(900).add(this.shipPosition);
      const inFront = this.project(camera, this.worldPoint);
      const x = this.clampedX();
      const y = this.clampedY();
      this.flightPathX = x;
      this.flightPathY = y;
      this.position(this.flightPathMarker, x, y);
      this.flightPathMarker.classList.toggle('is-offscreen', !inFront || !this.withinNdc());
      this.flightPathMarker.hidden = false;
    } else {
      this.flightPathMarker.hidden = true;
      this.flightPathX = 0.5;
      this.flightPathY = 0.5;
    }

    if (this.smoothedAcceleration.lengthSq() > 0.9) {
      this.worldPoint.copy(this.smoothedAcceleration).normalize().multiplyScalar(720).add(this.shipPosition);
      this.project(camera, this.worldPoint);
      this.position(this.accelerationMarker, this.clampedX(), this.clampedY());
      this.accelerationMarker.hidden = false;
    } else {
      this.accelerationMarker.hidden = true;
    }
  }

  private updateTarget(frame: FlightCombatHudFrame): void {
    const target = frame.target;
    if (!target || !target.hostile || target.health <= 0) {
      this.clearTarget();
      return;
    }

    target.object.getWorldPosition(this.targetPosition);
    this.relativePosition.copy(this.targetPosition).sub(this.shipPosition);
    this.range = this.relativePosition.length();
    if (this.range <= 0.001) {
      this.clearTarget();
      return;
    }
    this.lineOfSight.copy(this.relativePosition).multiplyScalar(1 / this.range);
    this.relativeVelocity.copy(target.velocity ?? ZERO_VELOCITY).sub(frame.shipVelocity);
    this.closingSpeed = -this.relativeVelocity.dot(this.lineOfSight);
    this.targetId = target.id ?? (target.object.name || target.object.uuid);

    const inFront = this.project(frame.camera, this.targetPosition);
    this.targetOnScreen = inFront && this.withinNdc() && !frame.targetOccluded;
    const targetX = this.clampedX();
    const targetY = this.clampedY();
    this.position(this.targetDesignator, targetX, targetY);
    const apparentSize = THREE.MathUtils.clamp(
      (target.radius / Math.max(1, this.range)) * this.screenHeight * 2.1,
      combatTuningProfile.hud.targetBracketMinimumPx,
      combatTuningProfile.hud.targetBracketMaximumPx
    );
    this.targetDesignator.style.width = `${apparentSize.toFixed(1)}px`;
    this.targetDesignator.style.height = `${apparentSize.toFixed(1)}px`;
    this.targetDesignator.hidden = !this.targetOnScreen;
    this.targetDirection.hidden = this.targetOnScreen;
    if (!this.targetOnScreen) {
      this.position(this.targetDirection, targetX, targetY);
      const angle = Math.atan2(targetY - 0.5, targetX - 0.5) + Math.PI / 2;
      this.targetDirection.style.rotate = `${angle.toFixed(3)}rad`;
      this.targetDirectionRange.textContent = this.formatRange(this.range);
    }

    const maximumHealth = Number(target.object.userData.combatMaximumHealth ?? target.health);
    const integrity = maximumHealth > 0 ? THREE.MathUtils.clamp(target.health / maximumHealth, 0, 1) : 1;
    this.targetLabel.textContent = `${this.targetType(target)} // ${Math.round(integrity * 100)}%`;
    this.targetRange.textContent = `R ${this.formatRange(this.range)}`;
    this.targetMotion.textContent = `C ${this.signed(this.closingSpeed)} m/s`;

    computeLeadSolution(this.shipPosition, this.relativePosition, this.relativeVelocity, frame.projectileSpeed, this.lead);
    const arcDot = this.shipForward.dot(this.lineOfSight);
    if (!this.lead.valid || frame.targetOccluded || frame.jammed) {
      this.solutionState = arcDot < combatTuningProfile.hud.targetArcCosine ? 'off-arc' : 'tracking';
      this.leadPipper.hidden = true;
    } else {
      this.lineOfSight.copy(this.lead.point).sub(this.shipPosition).normalize();
      const solutionAngle = Math.acos(THREE.MathUtils.clamp(this.shipForward.dot(this.lineOfSight), -1, 1));
      this.solutionErrorDegrees = THREE.MathUtils.radToDeg(solutionAngle);
      if (arcDot < combatTuningProfile.hud.targetArcCosine) this.solutionState = 'off-arc';
      else if (solutionAngle <= combatTuningProfile.hud.validSolutionRadians && frame.weaponReady) this.solutionState = 'solution';
      else if (solutionAngle <= combatTuningProfile.hud.nearSolutionRadians) this.solutionState = 'near';
      else this.solutionState = 'tracking';
      const leadInFront = this.project(frame.camera, this.lead.point);
      this.leadPipper.hidden = !leadInFront || !this.withinNdc() || frame.targetOccluded;
      if (!this.leadPipper.hidden) this.position(this.leadPipper, this.normalizedX(), this.normalizedY());
    }

    this.worldPoint.copy(this.shipForward).multiplyScalar(Math.min(this.range, combatTuningProfile.weapons.laserRange)).add(this.shipPosition);
    this.project(frame.camera, this.worldPoint);
    this.position(this.predictedImpact, this.clampedX(), this.clampedY());
    this.predictedImpact.hidden = frame.targetOccluded;

    this.root.dataset.solution = this.solutionState;
    this.root.dataset.weapon = frame.weapon;
    this.solutionLabel.textContent = frame.jammed
      ? 'LOCK INTERFERIDO'
      : this.solutionState === 'solution'
      ? 'SOL'
      : this.solutionState === 'near'
        ? 'AJUSTE'
        : this.solutionState === 'off-arc'
          ? 'FUERA ARCO'
          : 'SIN SOL';
    this.solutionLabel.dataset.state = this.solutionState;
    this.torpedoLock.hidden = frame.weapon !== 'torpedo';
    this.torpedoLock.dataset.locked = String(!frame.jammed && frame.torpedoLocked && this.solutionState !== 'off-arc');
    if (
      this.solutionState === 'solution' &&
      this.previousSolutionState !== 'solution' &&
      this.solutionCueCooldown === 0
    ) {
      this.solutionCueCooldown = 0.8;
      this.onSolutionAcquired?.();
    }
    this.previousSolutionState = this.solutionState;
  }

  private clearTarget(): void {
    this.targetId = '';
    this.targetOnScreen = false;
    this.targetOccluded = false;
    this.range = 0;
    this.closingSpeed = 0;
    this.lead.valid = false;
    this.lead.time = 0;
    this.solutionState = 'no-target';
    this.solutionErrorDegrees = 0;
    this.previousSolutionState = 'no-target';
    this.root.dataset.solution = 'no-target';
    this.targetDesignator.hidden = true;
    this.targetDirection.hidden = true;
    this.leadPipper.hidden = true;
    this.predictedImpact.hidden = true;
    this.torpedoLock.hidden = true;
    this.solutionLabel.textContent = 'SIN BLANCO';
  }

  private project(camera: THREE.Camera, world: THREE.Vector3): boolean {
    this.localDirection.copy(world).sub(camera.position);
    const inFront = this.localDirection.dot(this.cameraForward) > 0;
    this.projected.copy(world).project(camera);
    if (!inFront) {
      this.projected.x *= -1;
      this.projected.y *= -1;
    }
    return inFront;
  }

  private withinNdc(): boolean {
    return Math.abs(this.projected.x) <= 1 && Math.abs(this.projected.y) <= 1 && this.projected.z >= -1 && this.projected.z <= 1;
  }

  private normalizedX(): number { return this.projected.x * 0.5 + 0.5; }
  private normalizedY(): number { return -this.projected.y * 0.5 + 0.5; }
  private clampedX(): number {
    return THREE.MathUtils.clamp(this.normalizedX(), combatTuningProfile.hud.edgePadding, 1 - combatTuningProfile.hud.edgePadding);
  }
  private clampedY(): number {
    return THREE.MathUtils.clamp(this.normalizedY(), combatTuningProfile.hud.edgePadding, 1 - combatTuningProfile.hud.edgePadding);
  }

  private position(element: HTMLElement, x: number, y: number): void {
    element.style.transform = `translate3d(${(x * this.screenWidth).toFixed(1)}px, ${(y * this.screenHeight).toFixed(1)}px, 0) translate(-50%, -50%)`;
  }

  private targetType(target: WeaponTarget): string {
    const mass = String(target.object.userData.combatMass ?? 'CONTACTO').toUpperCase();
    return mass === 'LIGHT' ? 'LIGERO' : mass === 'MEDIUM' ? 'MEDIO' : mass === 'HEAVY' ? 'PESADO' : mass;
  }

  private formatRange(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
  }

  private signed(value: number): string {
    const rounded = Math.round(value);
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  }

  private cardinal(value: number): string {
    const normalized = THREE.MathUtils.euclideanModulo(value, 360);
    if (normalized < 23 || normalized >= 338) return 'N';
    if (normalized < 68) return 'NE';
    if (normalized < 113) return 'E';
    if (normalized < 158) return 'SE';
    if (normalized < 203) return 'S';
    if (normalized < 248) return 'SW';
    if (normalized < 293) return 'W';
    return 'NW';
  }

  private require(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Flight combat HUD missing ${selector}`);
    return element;
  }
}
