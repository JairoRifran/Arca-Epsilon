import * as THREE from 'three';

export type CombatImpulseKind = 'laser' | 'missile' | 'received' | 'near-miss' | 'heavy-destruction';

export type CombatCameraDiagnostics = {
  magnitude: number;
  recoil: number;
  nearMissImpulses: number;
  receivedImpulses: number;
  heavyDestructionImpulses: number;
  peakMagnitude: number;
  bounded: boolean;
  environmentalShake: number;
};

/**
 * Small critically damped camera response for weapons and received hits.
 * It is applied after the normal camera solve, so it never changes flight,
 * aiming, save data or the camera's long-term follow target.
 */
export class CombatCameraImpulse {
  private readonly translation = new THREE.Vector3();
  private readonly translationVelocity = new THREE.Vector3();
  private readonly rotation = new THREE.Vector2();
  private readonly rotationVelocity = new THREE.Vector2();
  private readonly worldDirection = new THREE.Vector3();
  private readonly localDirection = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly inverseCameraQuaternion = new THREE.Quaternion();
  private readonly cameraRight = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3();
  private recoil = 0;
  private nearMissImpulses = 0;
  private receivedImpulses = 0;
  private heavyDestructionImpulses = 0;
  private peakMagnitude = 0;
  private environmentalShake = 0;
  private environmentalSway = 0;
  private environmentalScale = 1;
  private elapsed = 0;

  get magnitude(): number {
    return this.translation.length() + this.rotation.length() * 2.5;
  }

  get recoilAmount(): number {
    return this.recoil;
  }

  triggerFire(kind: Exclude<CombatImpulseKind, 'received'>, shipQuaternion: THREE.Quaternion): void {
    const strength = kind === 'missile' ? 0.115 : 0.032;
    this.worldDirection.set(0, 0, 1).applyQuaternion(shipQuaternion);
    this.translationVelocity.addScaledVector(this.worldDirection, strength);
    this.rotationVelocity.x += kind === 'missile' ? 0.012 : 0.003;
    this.rotationVelocity.y += kind === 'missile' ? -0.007 : 0.002;
    this.recoil = Math.min(1, this.recoil + (kind === 'missile' ? 0.55 : 0.2));
  }

  triggerReceived(fromWorldPosition: THREE.Vector3, shipPosition: THREE.Vector3, camera: THREE.Camera): void {
    this.worldDirection.copy(shipPosition).sub(fromWorldPosition);
    if (this.worldDirection.lengthSq() < 0.0001) this.worldDirection.set(1, 0, 0);
    this.worldDirection.normalize();
    this.inverseCameraQuaternion.copy(camera.quaternion).invert();
    this.localDirection.copy(this.worldDirection).applyQuaternion(this.inverseCameraQuaternion);
    this.translationVelocity.addScaledVector(this.worldDirection, 0.09);
    this.rotationVelocity.x += THREE.MathUtils.clamp(this.localDirection.y * 0.025, -0.02, 0.02);
    this.rotationVelocity.y += THREE.MathUtils.clamp(-this.localDirection.x * 0.03, -0.026, 0.026);
    this.receivedImpulses += 1;
  }

  triggerNearMiss(closestWorldPosition: THREE.Vector3, shipPosition: THREE.Vector3, camera: THREE.Camera): void {
    this.worldDirection.copy(shipPosition).sub(closestWorldPosition);
    if (this.worldDirection.lengthSq() < 0.0001) this.worldDirection.set(1, 0, 0);
    this.worldDirection.normalize();
    this.inverseCameraQuaternion.copy(camera.quaternion).invert();
    this.localDirection.copy(this.worldDirection).applyQuaternion(this.inverseCameraQuaternion);
    this.translationVelocity.addScaledVector(this.worldDirection, 0.036);
    this.rotationVelocity.x += THREE.MathUtils.clamp(this.localDirection.y * 0.009, -0.007, 0.007);
    this.rotationVelocity.y += THREE.MathUtils.clamp(-this.localDirection.x * 0.012, -0.01, 0.01);
    this.nearMissImpulses += 1;
  }

  triggerHeavyDestruction(fromWorldPosition: THREE.Vector3, shipPosition: THREE.Vector3, camera: THREE.Camera): void {
    this.worldDirection.copy(shipPosition).sub(fromWorldPosition);
    const distance = Math.max(1, this.worldDirection.length());
    if (distance > 460) return;
    this.worldDirection.multiplyScalar(1 / distance);
    this.inverseCameraQuaternion.copy(camera.quaternion).invert();
    this.localDirection.copy(this.worldDirection).applyQuaternion(this.inverseCameraQuaternion);
    const falloff = 1 - distance / 460;
    this.translationVelocity.addScaledVector(this.worldDirection, 0.075 * falloff);
    this.rotationVelocity.x += THREE.MathUtils.clamp(this.localDirection.y * 0.015 * falloff, -0.012, 0.012);
    this.rotationVelocity.y += THREE.MathUtils.clamp(-this.localDirection.x * 0.018 * falloff, -0.015, 0.015);
    this.heavyDestructionImpulses += 1;
  }

  /** Central input for turbulence/boost vibration. The camera is modified only in update(). */
  setEnvironmentalFeedback(shake: number, sway = 0, scale = 1): void {
    this.environmentalShake = Math.max(0, shake);
    this.environmentalSway = Math.max(0, sway);
    this.environmentalScale = THREE.MathUtils.clamp(scale, 0, 1);
  }

  triggerMechanicalLock(): void {
    this.translationVelocity.y += 0.035;
    this.rotationVelocity.x += 0.0035;
  }

  update(delta: number, camera: THREE.Camera): void {
    if (delta <= 0) return;
    this.elapsed += delta;
    const spring = 44;
    const damping = 12;
    this.translationVelocity.addScaledVector(this.translation, -spring * delta);
    this.translationVelocity.multiplyScalar(Math.exp(-damping * delta));
    this.translation.addScaledVector(this.translationVelocity, delta);

    this.rotationVelocity.x += -this.rotation.x * spring * delta;
    this.rotationVelocity.y += -this.rotation.y * spring * delta;
    const rotationalDamping = Math.exp(-damping * delta);
    this.rotationVelocity.multiplyScalar(rotationalDamping);
    this.rotation.addScaledVector(this.rotationVelocity, delta);

    this.recoil *= Math.exp(-9 * delta);
    this.offset.copy(this.translation);
    if (this.offset.lengthSq() > 0.0225) this.offset.setLength(0.15);
    camera.position.add(this.offset);
    camera.rotateX(THREE.MathUtils.clamp(this.rotation.x, -0.018, 0.018));
    camera.rotateY(THREE.MathUtils.clamp(this.rotation.y, -0.022, 0.022));

    // Deterministic multi-frequency vibration avoids random per-frame noise and
    // keeps every shake source under this single camera authority.
    const shake = this.environmentalShake * this.environmentalScale;
    const sway = this.environmentalSway * this.environmentalScale;
    if (shake > 0.0001 || sway > 0.0001) {
      this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      this.cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const x = Math.sin(this.elapsed * 31.7) * shake * 0.34 + Math.sin(this.elapsed * 19.1) * shake * 0.16;
      const y = Math.sin(this.elapsed * 27.3 + 0.8) * shake * 0.28 + Math.sin(this.elapsed * 1.7 + 1.2) * sway * 0.4;
      const slowX = Math.sin(this.elapsed * 1.3) * sway * 0.55;
      camera.position.addScaledVector(this.cameraRight, x + slowX);
      camera.position.addScaledVector(this.cameraUp, y);
    }

    this.peakMagnitude = Math.max(this.peakMagnitude, this.magnitude);

    if (this.magnitude < 0.00005) this.reset();
  }

  reset(): void {
    this.translation.set(0, 0, 0);
    this.translationVelocity.set(0, 0, 0);
    this.rotation.set(0, 0);
    this.rotationVelocity.set(0, 0);
    this.recoil = 0;
  }

  getDiagnostics(): CombatCameraDiagnostics {
    return {
      magnitude: this.magnitude,
      recoil: this.recoil,
      nearMissImpulses: this.nearMissImpulses,
      receivedImpulses: this.receivedImpulses,
      heavyDestructionImpulses: this.heavyDestructionImpulses,
      peakMagnitude: this.peakMagnitude,
      bounded: this.translation.length() <= 0.151 && Math.abs(this.rotation.x) <= 0.0181 && Math.abs(this.rotation.y) <= 0.0221,
      environmentalShake: Number(this.environmentalShake.toFixed(4))
    };
  }
}
