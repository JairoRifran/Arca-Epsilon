import * as THREE from 'three';
import { mission24Tuning, type Mission24StepId } from '../assets/mission24Definitions';

export type AtmosphericAscentInput = {
  thrustUp: boolean;
  thrustForward: boolean;
  brake: boolean;
  turn: number;
  boost: boolean;
};

export type AtmosphericAscentMetrics = {
  altitude: number;
  worldClearance: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  totalSpeed: number;
  pressure: number;
  density: number;
  temperature: number;
  enginePower: number;
  heading: number;
  pitch: number;
  phase: string;
  orbitalStability: number;
  wind: number;
  cloudOpacity: number;
  starOpacity: number;
  curvature: number;
  maxFrameDisplacement: number;
  checkpoint: string;
};

const phaseLabels: Partial<Record<Mission24StepId, string>> = {
  lowAtmosphereAscent: 'ATMOSFERA BAJA',
  cloudLayerCrossing: 'CAPA DE NUBES',
  midAtmosphereAscent: 'ATMOSFERA MEDIA',
  upperAtmosphereAscent: 'ALTA ATMOSFERA',
  vacuumTransition: 'TRANSICION AL VACIO',
  orbitalInsertion: 'INSERCION ORBITAL',
  stabilizeOrbit: 'ORBITA ESTABLE'
};

/** M24-only adapter over the existing ship transform and velocity. */
export class AtmosphericAscentController {
  readonly metrics: AtmosphericAscentMetrics = {
    altitude: 0,
    worldClearance: 0,
    verticalSpeed: 0,
    horizontalSpeed: 0,
    totalSpeed: 0,
    pressure: 101.3,
    density: 1,
    temperature: 16,
    enginePower: 0,
    heading: 0,
    pitch: 90,
    phase: 'EN ESPERA',
    orbitalStability: 0,
    wind: 1,
    cloudOpacity: 0,
    starOpacity: 0,
    curvature: 0,
    maxFrameDisplacement: 0,
    checkpoint: 'surface'
  };

  readonly launchOrigin = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly horizontal = new THREE.Vector3();
  private initialized = false;
  private enginePower = 0;
  private heading = 0;
  private pitch = Math.PI / 2;
  private maxFrameDisplacement = 0;

  begin(position: THREE.Vector3, heading: number): void {
    this.launchOrigin.copy(position);
    this.previousPosition.copy(position);
    this.heading = heading;
    this.pitch = Math.PI / 2;
    this.enginePower = 0;
    this.maxFrameDisplacement = 0;
    this.initialized = true;
  }

  updateFlight(
    delta: number,
    step: Mission24StepId,
    ship: THREE.Object3D,
    velocity: THREE.Vector3,
    groundHeight: number,
    input: AtmosphericAscentInput
  ): void {
    if (!this.initialized) this.begin(ship.position, ship.rotation.y);
    const safeDelta = Math.min(Math.max(0, delta), 0.1);
    this.previousPosition.copy(ship.position);
    const clearance = Math.max(0, ship.position.y - groundHeight);
    const altitudeT = THREE.MathUtils.clamp(clearance / mission24Tuning.vacuumAltitude, 0, 1);
    const density = Math.exp(-altitudeT * 5.4);
    const targetPower = input.thrustUp || input.thrustForward ? (input.boost ? 1 : 0.82) : 0.34;
    this.enginePower += (targetPower - this.enginePower) * (1 - Math.exp(-safeDelta * (targetPower > this.enginePower ? 2.5 : 1.2)));

    this.heading -= input.turn * safeDelta * THREE.MathUtils.lerp(0.34, 0.62, altitudeT);
    const desiredPitch = step === 'lowAtmosphereAscent' || step === 'cloudLayerCrossing'
      ? THREE.MathUtils.degToRad(86)
      : step === 'midAtmosphereAscent'
        ? THREE.MathUtils.degToRad(input.thrustForward ? 54 : 68)
        : step === 'upperAtmosphereAscent' || step === 'vacuumTransition'
          ? THREE.MathUtils.degToRad(input.thrustForward ? 28 : 46)
          : THREE.MathUtils.degToRad(input.thrustForward ? 8 : 20);
    this.pitch += (desiredPitch - this.pitch) * (1 - Math.exp(-safeDelta * 0.8));

    const thrust = 12 + this.enginePower * 22;
    const verticalIntent = input.thrustUp ? 1 : 0;
    const assistedLift = step === 'orbitalInsertion' ? 0 : 0.32 + altitudeT * 0.12;
    velocity.y += (verticalIntent * thrust + assistedLift * thrust - 5.8 * density) * safeDelta;

    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const trajectoryAssist = THREE.MathUtils.smoothstep(clearance, mission24Tuning.cloudLayerTop, mission24Tuning.vacuumAltitude);
    const horizontalIntent = input.thrustForward ? 1 : 0.18 * trajectoryAssist;
    velocity.addScaledVector(this.forward, thrust * horizontalIntent * safeDelta * (0.42 + altitudeT * 0.7));

    const horizontalDrag = Math.exp(-safeDelta * THREE.MathUtils.lerp(1.55, 0.03, 1 - density));
    const verticalDrag = Math.exp(-safeDelta * THREE.MathUtils.lerp(1.1, 0.04, 1 - density));
    velocity.x *= horizontalDrag;
    velocity.z *= horizontalDrag;
    velocity.y *= verticalDrag;
    if (step === 'orbitalInsertion' && !input.thrustUp) {
      velocity.y *= Math.exp(-safeDelta * 0.9);
    }
    if (input.brake) velocity.multiplyScalar(Math.exp(-safeDelta * 1.2));

    const maxVertical = THREE.MathUtils.lerp(18, 34, altitudeT);
    velocity.y = THREE.MathUtils.clamp(velocity.y, -8, maxVertical);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const maxHorizontal = THREE.MathUtils.lerp(16, 34, altitudeT);
    if (horizontalSpeed > maxHorizontal) {
      const scale = maxHorizontal / horizontalSpeed;
      velocity.x *= scale;
      velocity.z *= scale;
    }

    ship.position.addScaledVector(velocity, safeDelta);
    const minimum = groundHeight + 3.05;
    if (ship.position.y < minimum) {
      ship.position.y = minimum;
      if (velocity.y < 0) velocity.y = 0;
    }
    const frameDisplacement = ship.position.distanceTo(this.previousPosition);
    this.maxFrameDisplacement = Math.max(this.maxFrameDisplacement, frameDisplacement);
    this.updateMetrics(step, ship, velocity, groundHeight);
  }

  updateOrbitStabilization(delta: number, ship: THREE.Object3D, velocity: THREE.Vector3): void {
    if (!this.initialized) this.begin(ship.position, ship.rotation.y);
    const safeDelta = Math.min(Math.max(0, delta), 0.1);
    this.previousPosition.copy(ship.position);
    velocity.y *= Math.exp(-safeDelta * 2.8);
    velocity.x *= Math.exp(-safeDelta * 0.08);
    velocity.z *= Math.exp(-safeDelta * 0.08);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const minimumOrbitalSpeed = mission24Tuning.insertionHorizontalSpeed * 0.8;
    if (horizontalSpeed < minimumOrbitalSpeed) {
      if (horizontalSpeed > 0.01) {
        const correction = minimumOrbitalSpeed / horizontalSpeed;
        velocity.x *= correction;
        velocity.z *= correction;
      } else {
        this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        velocity.x = this.forward.x * minimumOrbitalSpeed;
        velocity.z = this.forward.z * minimumOrbitalSpeed;
      }
    }
    ship.position.addScaledVector(velocity, safeDelta);
    this.pitch += (0 - this.pitch) * (1 - Math.exp(-safeDelta * 1.1));
    this.maxFrameDisplacement = Math.max(this.maxFrameDisplacement, ship.position.distanceTo(this.previousPosition));
    this.updateMetrics('stabilizeOrbit', ship, velocity, this.launchOrigin.y - 3.05);
  }

  restoreCheckpoint(step: Mission24StepId, ship: THREE.Object3D, velocity: THREE.Vector3, groundHeight: number): void {
    if (!this.initialized) this.begin(ship.position, ship.rotation.y);
    this.launchOrigin.set(ship.position.x, groundHeight + 3.05, ship.position.z);
    const clearance = this.checkpointClearance(step);
    if (clearance !== undefined) ship.position.y = groundHeight + clearance;
    const atmosphericCheckpoint = step === 'lowAtmosphereAscent' || step === 'cloudLayerCrossing' ||
      step === 'midAtmosphereAscent' || step === 'upperAtmosphereAscent' || step === 'vacuumTransition';
    velocity.set(0, step === 'orbitalInsertion' ? 1.2 : atmosphericCheckpoint ? 2.5 : 0, 0);
    if (step === 'orbitalInsertion') velocity.z = -mission24Tuning.insertionHorizontalSpeed * 0.72;
    if (step === 'stabilizeOrbit') velocity.z = -mission24Tuning.insertionHorizontalSpeed;
    this.previousPosition.copy(ship.position);
    this.maxFrameDisplacement = 0;
    this.updateMetrics(step, ship, velocity, groundHeight);
  }

  insertionReady(velocity: THREE.Vector3): boolean {
    return Math.hypot(velocity.x, velocity.z) >= mission24Tuning.insertionHorizontalSpeed &&
      Math.abs(velocity.y) <= mission24Tuning.insertionMaxVerticalSpeed &&
      this.metrics.worldClearance >= mission24Tuning.vacuumAltitude * 0.94;
  }

  orbitStable(velocity: THREE.Vector3): boolean {
    return Math.abs(velocity.y) <= mission24Tuning.orbitStableMaxVerticalSpeed &&
      Math.hypot(velocity.x, velocity.z) >= mission24Tuning.insertionHorizontalSpeed * 0.72;
  }

  reset(): void {
    this.initialized = false;
    this.enginePower = 0;
    this.maxFrameDisplacement = 0;
    Object.assign(this.metrics, {
      altitude: 0, worldClearance: 0, verticalSpeed: 0, horizontalSpeed: 0, totalSpeed: 0,
      pressure: 101.3, density: 1, temperature: 16, enginePower: 0, heading: 0, pitch: 90,
      phase: 'EN ESPERA', orbitalStability: 0, wind: 1, cloudOpacity: 0, starOpacity: 0,
      curvature: 0, maxFrameDisplacement: 0, checkpoint: 'surface'
    });
  }

  private updateMetrics(step: Mission24StepId, ship: THREE.Object3D, velocity: THREE.Vector3, groundHeight: number): void {
    const clearance = Math.max(0, ship.position.y - groundHeight);
    const altitudeT = THREE.MathUtils.clamp(clearance / mission24Tuning.vacuumAltitude, 0, 1);
    const density = Math.exp(-altitudeT * 5.4);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const cloudCenter = (mission24Tuning.lowAtmosphereTop + mission24Tuning.cloudLayerTop) * 0.5;
    const cloudHalf = (mission24Tuning.cloudLayerTop - mission24Tuning.lowAtmosphereTop) * 0.72;
    const cloudOpacity = THREE.MathUtils.clamp(1 - Math.abs(clearance - cloudCenter) / cloudHalf, 0, 1);
    const stability = THREE.MathUtils.clamp(
      100 - Math.abs(velocity.y) * 4.2 - Math.abs(horizontalSpeed - mission24Tuning.insertionHorizontalSpeed) * 1.2,
      0,
      100
    );
    this.metrics.altitude = Math.round(clearance * 720);
    this.metrics.worldClearance = Number(clearance.toFixed(2));
    this.metrics.verticalSpeed = Number((velocity.y * 12).toFixed(1));
    this.metrics.horizontalSpeed = Number((horizontalSpeed * 12).toFixed(1));
    this.metrics.totalSpeed = Number((velocity.length() * 12).toFixed(1));
    this.metrics.pressure = Number((101.3 * density).toFixed(2));
    this.metrics.density = Number(density.toFixed(4));
    this.metrics.temperature = Number((16 - altitudeT * 72 + this.enginePower * 22).toFixed(1));
    this.metrics.enginePower = Math.round(this.enginePower * 100);
    this.metrics.heading = Math.round(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(this.heading), 360));
    this.metrics.pitch = Number(THREE.MathUtils.radToDeg(this.pitch).toFixed(1));
    this.metrics.phase = phaseLabels[step] ?? 'ORBITA';
    this.metrics.orbitalStability = Math.round(stability);
    this.metrics.wind = Number((density * (0.45 + Math.min(1, velocity.length() / 22))).toFixed(3));
    this.metrics.cloudOpacity = Number(cloudOpacity.toFixed(3));
    this.metrics.starOpacity = Number(THREE.MathUtils.smoothstep(clearance, mission24Tuning.cloudLayerTop, mission24Tuning.vacuumAltitude).toFixed(3));
    this.metrics.curvature = Number(THREE.MathUtils.smoothstep(clearance, mission24Tuning.midAtmosphereTop * 0.65, mission24Tuning.vacuumAltitude).toFixed(3));
    this.metrics.maxFrameDisplacement = Number(this.maxFrameDisplacement.toFixed(3));
    this.metrics.checkpoint = step;
  }

  private checkpointClearance(step: Mission24StepId): number | undefined {
    switch (step) {
      case 'lowAtmosphereAscent': return 16;
      case 'cloudLayerCrossing': return mission24Tuning.lowAtmosphereTop + 2;
      case 'midAtmosphereAscent': return mission24Tuning.cloudLayerTop + 3;
      case 'upperAtmosphereAscent': return mission24Tuning.midAtmosphereTop + 3;
      case 'vacuumTransition': return mission24Tuning.upperAtmosphereTop + 3;
      case 'orbitalInsertion': return mission24Tuning.vacuumAltitude;
      case 'stabilizeOrbit':
      case 'approachArk':
      case 'arriveAtOrigin': return mission24Tuning.vacuumAltitude + 4;
      default: return undefined;
    }
  }
}
