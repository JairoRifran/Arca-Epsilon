import * as THREE from 'three';
import {
  coalitionPalette,
  createCoalitionFacetedHullGeometry,
  createCoalitionMaterialFamily,
  createCoalitionSweptWingGeometry,
  type CoalitionMaterialFamily
} from '../assets/coalitionVisualLanguage';
import { mission20Tuning } from '../assets/mission20Definitions';
import { combatTuningProfile } from '../game/CombatTuningProfile';

/** Lifecycle of the electronic-warfare unit. */
export type JammerState = 'idle' | 'drift' | 'jamming' | 'damaged' | 'destroyed';

export interface CoalitionJammerVisualDiagnostics {
  built: boolean;
  state: JammerState;
  active: boolean;
  alive: boolean;
  visible: boolean;
  health: number;
  healthRatio: number;
  deathVisualActive: boolean;
  signalRingOpacity: number;
  engineOpacity: number;
  meshCount: number;
}

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
    id: 'coalition-heavy-jammer',
    object: this.group as THREE.Object3D,
    radius: mission20Tuning.jammerRadius,
    health: 0,
    hostile: true,
    velocity: new THREE.Vector3()
  };

  private hullMaterial?: THREE.MeshStandardMaterial;
  private dishMaterial?: THREE.MeshStandardMaterial;
  private coreMaterial?: THREE.MeshStandardMaterial;
  private materialFamily?: CoalitionMaterialFamily;
  private engineMaterial?: THREE.MeshBasicMaterial;
  private readonly enginePlumes: THREE.Mesh[] = [];
  private readonly signalRings: THREE.Mesh[] = [];
  private readonly signalRingMaterials: THREE.MeshBasicMaterial[] = [];
  private dishes: THREE.Mesh[] = [];
  private built = false;
  private state: JammerState = 'idle';
  private active = false;
  /** Angle along its deterministic drift arc around the Ark. */
  private angle = 0;
  private readonly origin = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly steering = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredQuaternion = new THREE.Quaternion();
  private readonly orientationMatrix = new THREE.Matrix4();
  private angularSpeed = 0;
  private aiAccumulator = 0;
  private deathVisualRemaining = 0;

  constructor() {
    this.group.name = 'Interferidor de la Coalición';
    this.group.userData.combatSurface = 'structure';
    this.group.userData.combatMass = 'heavy';
    this.group.userData.combatEngineAnchors = [[-4.6, -0.8, 17], [4.6, -0.8, 17]];
    this.group.userData.combatDestructionProfile = 'neutralize';
    this.group.userData.combatVisualGeneration = 0;
    this.group.visible = false;
  }

  /** Centre the drift arc on the Ark. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y, z);
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.materialFamily = createCoalitionMaterialFamily();
    this.hullMaterial = this.materialFamily.hull;
    this.dishMaterial = this.materialFamily.armor;
    this.coreMaterial = this.materialFamily.signal;

    // Long faceted command hull with a protected dorsal electronics spine.
    const hull = new THREE.Mesh(createCoalitionFacetedHullGeometry(17, 8.5, 34), this.hullMaterial);
    this.group.add(hull);
    const dorsalSpine = new THREE.Mesh(createCoalitionFacetedHullGeometry(6.2, 4.2, 25), this.dishMaterial);
    dorsalSpine.position.y = 4.4;
    dorsalSpine.position.z = 1.8;
    this.group.add(dorsalSpine);
    const arrayShoulders = new THREE.Mesh(createCoalitionSweptWingGeometry(16, 8, 0.65, 1.9), this.dishMaterial);
    arrayShoulders.position.z = -1;
    this.group.add(arrayShoulders);

    // Directional folded arrays: recognizable electronic-warfare hardware.
    const dishGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(1.1, 0),
      new THREE.Vector2(3.6, 0.35),
      new THREE.Vector2(6.2, 1.45),
      new THREE.Vector2(7.1, 2.35)
    ], 18);
    const signalRingGeometry = new THREE.TorusGeometry(7.8, 0.24, 6, 28);
    for (const side of [-1, 1]) {
      const dish = new THREE.Mesh(dishGeometry, this.dishMaterial!);
      dish.position.set(side * 13.5, 2.5, -0.8);
      dish.rotation.z = side * Math.PI * 0.5;
      dish.rotation.y = side * 0.16;
      this.dishes.push(dish);
      this.group.add(dish);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: coalitionPalette.signal,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const signalRing = new THREE.Mesh(signalRingGeometry, ringMaterial);
      signalRing.position.copy(dish.position);
      signalRing.rotation.y = Math.PI / 2;
      signalRing.scale.set(1, 0.72, 1);
      this.signalRings.push(signalRing);
      this.signalRingMaterials.push(ringMaterial);
      this.group.add(signalRing);
    }

    const core = new THREE.Mesh(createCoalitionFacetedHullGeometry(4.2, 3.6, 5.5), this.coreMaterial!);
    core.position.set(0, -1.2, -11.8);
    this.group.add(core);

    const engineCoreGeometry = new THREE.CircleGeometry(1.6, 18);
    const plumeGeometry = new THREE.ConeGeometry(1.35, 8.5, 12, 1, true);
    this.engineMaterial = new THREE.MeshBasicMaterial({
      color: coalitionPalette.engine,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    for (const side of [-1, 1]) {
      const coreMesh = new THREE.Mesh(engineCoreGeometry, this.engineMaterial);
      coreMesh.position.set(side * 4.6, -0.8, 17.05);
      this.group.add(coreMesh);
      const plume = new THREE.Mesh(plumeGeometry, this.engineMaterial);
      plume.rotation.x = Math.PI / 2;
      plume.position.set(side * 4.6, -0.8, 21.2);
      this.enginePlumes.push(plume);
      this.group.add(plume);
    }
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

  /** On-demand visual probe; never evaluated from the render loop. */
  getVisualDiagnostics(): CoalitionJammerVisualDiagnostics {
    let meshCount = 0;
    this.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshCount += 1;
    });
    return {
      built: this.built,
      state: this.state,
      active: this.active,
      alive: this.alive,
      visible: this.group.visible,
      health: this.target.health,
      healthRatio: THREE.MathUtils.clamp(this.target.health / mission20Tuning.jammerHealth, 0, 1),
      deathVisualActive: this.deathVisualRemaining > 0,
      signalRingOpacity: this.signalRingMaterials[0]?.opacity ?? 0,
      engineOpacity: this.engineMaterial?.opacity ?? 0,
      meshCount
    };
  }

  /** Deploy the jammer. Idempotent: re-calling while live changes nothing. */
  deploy(): void {
    if (this.active) return;
    this.ensureBuilt();
    this.active = true;
    this.state = 'drift';
    this.target.health = mission20Tuning.jammerHealth;
    this.target.hostile = true;
    this.deathVisualRemaining = 0;
    this.group.scale.setScalar(1);
    this.group.userData.combatVisualGeneration = Number(this.group.userData.combatVisualGeneration ?? 0) + 1;
    this.group.userData.combatVisualKick = 0;
    this.angle = 0.7;
    // Place it on its arc immediately. Without this the group sits at the world
    // origin for the first frames, which can read as "already located" from
    // anywhere near it — the hunt has to start at a real distance.
    this.group.position.set(
      this.origin.x + Math.cos(this.angle) * 760,
      this.origin.y + 120,
      this.origin.z + Math.sin(this.angle) * 760
    );
    this.target.velocity.set(-Math.sin(this.angle), 0, Math.cos(this.angle)).multiplyScalar(12);
    this.angularSpeed = 0;
    this.group.visible = true;
    if (this.coreMaterial) this.coreMaterial.emissiveIntensity = 0.46;
    if (this.engineMaterial) this.engineMaterial.opacity = 0.2;
    for (const material of this.signalRingMaterials) material.opacity = 0.1;
  }

  clear(): void {
    this.active = false;
    this.state = 'idle';
    this.target.health = 0;
    this.target.hostile = false;
    this.deathVisualRemaining = 0;
    this.group.scale.setScalar(1);
    this.group.visible = false;
    this.target.velocity.set(0, 0, 0);
    this.angularSpeed = 0;
  }

  /**
   * Advance the jammer. `onDestroyed` fires once, on the frame it dies.
   * Movement is a fixed arc: slow, predictable and easy to run down.
   */
  update(delta: number, elapsed: number, onDestroyed: () => void): void {
    if (!this.active) {
      if (this.deathVisualRemaining > 0) {
        this.deathVisualRemaining = Math.max(0, this.deathVisualRemaining - delta);
        this.group.rotation.z += delta * 0.1;
        for (let index = 0; index < this.dishes.length; index += 1) {
          this.dishes[index].rotation.y += Math.sin(elapsed * 31 + index) * delta * 0.22;
        }
        if (this.coreMaterial) this.coreMaterial.emissiveIntensity *= Math.exp(-4 * delta);
        if (this.engineMaterial) this.engineMaterial.opacity *= Math.exp(-5.5 * delta);
        for (const material of this.signalRingMaterials) material.opacity *= Math.exp(-5 * delta);
        if (this.deathVisualRemaining === 0) {
          this.group.visible = false;
        }
      }
      return;
    }

    if (this.target.health <= 0) {
      this.state = 'destroyed';
      this.active = false;
      this.target.hostile = false;
      this.deathVisualRemaining = 1.65;
      onDestroyed();
      return;
    }
    if (this.target.health < mission20Tuning.jammerHealth * 0.5) this.state = 'damaged';

    this.aiAccumulator += delta;
    if (this.aiAccumulator >= combatTuningProfile.aiUpdateSeconds) {
      this.aiAccumulator = 0;
      if (this.state === 'drift') this.state = 'jamming';
    }

    // Wide, slow arc well off the Ark's hull.
    const profile = combatTuningProfile.units.heavy;
    this.angle += delta * 0.032;
    const radius = 760;
    this.scratch.set(
      this.origin.x + Math.cos(this.angle) * radius,
      this.origin.y + 120 + Math.sin(elapsed * 0.18) * 14,
      this.origin.z + Math.sin(this.angle) * radius
    );
    this.steering.copy(this.scratch).sub(this.group.position);
    const desiredDistance = this.steering.length();
    if (desiredDistance > 0.001) {
      this.steering.multiplyScalar(Math.min(profile.maximumSpeed, 8 + desiredDistance * 0.25) / desiredDistance);
    }
    this.steering.sub(this.target.velocity);
    const steeringLength = this.steering.length();
    const maximumChange = profile.linearAcceleration * delta;
    if (steeringLength > maximumChange && steeringLength > 0.001) this.steering.multiplyScalar(maximumChange / steeringLength);
    this.target.velocity.add(this.steering);
    const speed = this.target.velocity.length();
    if (speed > profile.maximumSpeed) this.target.velocity.multiplyScalar(profile.maximumSpeed / speed);
    this.group.position.addScaledVector(this.target.velocity, delta);

    this.lookTarget.copy(this.origin);
    this.orientationMatrix.lookAt(this.group.position, this.lookTarget, THREE.Object3D.DEFAULT_UP);
    this.desiredQuaternion.setFromRotationMatrix(this.orientationMatrix);
    const angle = this.group.quaternion.angleTo(this.desiredQuaternion);
    const angularStep = profile.angularAcceleration * delta;
    this.angularSpeed += THREE.MathUtils.clamp(profile.maximumAngularSpeed - this.angularSpeed, -angularStep, angularStep);
    if (angle > 0.0001) this.group.quaternion.slerp(this.desiredQuaternion, Math.min(1, this.angularSpeed * delta / angle));
    const impactKick = Number(this.group.userData.combatVisualKick ?? 0);
    if (impactKick > 0.0001) {
      this.group.rotateZ(Number(this.group.userData.combatVisualKickDirection ?? 1) * impactKick * 0.45);
      this.group.userData.combatVisualKick = impactKick * Math.exp(-4.5 * delta);
    }

    const hurt = 1 - Math.max(0, this.target.health) / mission20Tuning.jammerHealth;
    for (let i = 0; i < this.dishes.length; i += 1) {
      this.dishes[i].rotation.y += delta * (i === 0 ? 0.5 : -0.4) * (this.state === 'damaged' ? 0.4 : 1);
    }
    if (this.coreMaterial) {
      const irregular = hurt > 0.48 ? 0.58 + Math.sin(elapsed * 17.3) * 0.42 : 1;
      this.coreMaterial.emissiveIntensity = Math.max(0.04, (0.46 * (1 - hurt * 0.72) + Math.sin(elapsed * 5) * 0.05) * irregular);
    }
    for (let index = 0; index < this.signalRings.length; index += 1) {
      this.signalRings[index].rotation.z += delta * (index === 0 ? 0.18 : -0.14) * (1 - hurt * 0.68);
      this.signalRingMaterials[index].opacity = Math.max(0.018, (0.1 + Math.sin(elapsed * 2.6 + index) * 0.025) * (1 - hurt * 0.78));
    }
    if (this.engineMaterial) {
      const drive = THREE.MathUtils.clamp(this.target.velocity.length() / Math.max(1, combatTuningProfile.units.heavy.maximumSpeed), 0.18, 1);
      this.engineMaterial.opacity = (0.11 + drive * 0.17) * (1 - hurt * 0.7);
      for (let index = 0; index < this.enginePlumes.length; index += 1) {
        this.enginePlumes[index].scale.set(0.72 + drive * 0.22, 0.72 + drive * 0.9, 0.72 + drive * 0.22);
      }
    }
  }

  dispose(): void {
    this.hullMaterial?.dispose();
    this.dishMaterial?.dispose();
    this.coreMaterial?.dispose();
    this.materialFamily?.recessed.dispose();
    this.engineMaterial?.dispose();
    for (const material of this.signalRingMaterials) material.dispose();
  }
}
