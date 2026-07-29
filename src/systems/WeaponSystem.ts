import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export type WeaponTarget = {
  object: THREE.Object3D;
  radius: number;
  health: number;
  hostile: boolean;
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
};

type Beam = {
  core: THREE.Mesh;
  glow: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  age: number;
};

type Missile = {
  group: THREE.Group;
  velocity: THREE.Vector3;
  target?: WeaponTarget;
  trail: THREE.Points;
  trailMaterial: THREE.PointsMaterial;
  trailHistory: THREE.Vector3[];
  age: number;
};

type Flash = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  duration: number;
  growth: number;
};

type SparkBurst = {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  velocities: Float32Array;
  age: number;
};

/** Soft annulus texture for explosion shockwaves. */
function createRingTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create ring texture.');
  }
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0.55, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.74, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.86, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Defensive weapons VFX: twin alternating laser cannons with dual-layer
 * beams, muzzle flashes and impact sparks; guided missiles with exhaust
 * ribbons, shockwave rings and debris bursts. Impact events are queued so
 * the main loop can drive camera shake and audio.
 */
export class WeaponSystem {
  readonly group = new THREE.Group();

  readonly state: WeaponState = {
    laserCooldown: 0,
    laserReady: true,
    missileCooldown: 0,
    missileReady: true,
    missileAmmo: 4,
    lockStatus: 'Sin blanco',
    lastMessage: '',
    activeBeams: 0,
    activeMissiles: 0,
    lockTargetPosition: null
  };

  readonly events = { impacts: 0 };

  private readonly beams: Beam[] = [];

  private readonly missiles: Missile[] = [];

  private readonly flashes: Flash[] = [];

  private readonly sparks: SparkBurst[] = [];

  private readonly particleTexture = createSoftParticleTexture(64);

  private readonly ringTexture = createRingTexture();

  private readonly muzzleLight = new THREE.PointLight(0x86f5ff, 0, 40, 2);

  private readonly impactLight = new THREE.PointLight(0xffb060, 0, 120, 1.8);

  private readonly laserCooldownMax = 0.28;

  private readonly missileCooldownMax = 5.5;

  private cannonSide = 0;

  private cannonOffsets: THREE.Vector3[] = [
    new THREE.Vector3(-1.6, -0.2, -3.8),
    new THREE.Vector3(1.6, -0.2, -3.8)
  ];

  constructor() {
    this.group.name = 'Player Weapon VFX';
    this.group.add(this.muzzleLight, this.impactLight);
  }

  /** Ship-local muzzle positions, taken from the loaded GLB's cannon nodes. */
  setCannonOffsets(offsets: THREE.Vector3[]): void {
    if (offsets.length > 0) {
      this.cannonOffsets = offsets.map((offset) => offset.clone());
    }
  }

  update(delta: number, ship: THREE.Object3D, targets: WeaponTarget[]): void {
    this.state.laserCooldown = Math.max(0, this.state.laserCooldown - delta);
    this.state.missileCooldown = Math.max(0, this.state.missileCooldown - delta);
    this.state.laserReady = this.state.laserCooldown === 0;
    this.state.missileReady = this.state.missileCooldown === 0 && this.state.missileAmmo > 0;

    const lockTarget = this.findLockTarget(ship, targets, 780);
    this.state.lockStatus = lockTarget ? 'Blanco fijado' : 'Sin blanco';
    this.state.lockTargetPosition = lockTarget ? lockTarget.object.position.clone() : null;

    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - delta * 60);
    this.impactLight.intensity = Math.max(0, this.impactLight.intensity - delta * 26);

    this.updateBeams(delta);
    this.updateMissiles(delta, targets);
    this.updateFlashes(delta);
    this.updateSparks(delta);

    this.state.activeBeams = this.beams.length;
    this.state.activeMissiles = this.missiles.length;
  }

  fireLaser(ship: THREE.Object3D, targets: WeaponTarget[]): boolean {
    if (!this.state.laserReady) {
      this.state.lastMessage = 'Laser recargando.';
      return false;
    }

    this.state.laserCooldown = this.laserCooldownMax;
    this.cannonSide = (this.cannonSide + 1) % this.cannonOffsets.length;
    const muzzleLocal = this.cannonOffsets[this.cannonSide];
    const origin = ship.position.clone().add(muzzleLocal.clone().applyQuaternion(ship.quaternion));
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    const range = 680;
    const hit = this.findRayHit(origin, direction, targets, range, 16);
    const end = hit ? hit.object.position.clone() : origin.clone().addScaledVector(direction, range);

    this.spawnBeam(origin, end);
    this.spawnFlash(origin, 0x9df4ff, 3.2, 0.12, 18);
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 5;

    if (hit) {
      hit.health -= 24;
      this.spawnFlash(end, 0xbfefff, 6, 0.2, 34);
      this.spawnSparks(end, 0x9df4ff, 14, 26);
      this.state.lastMessage = 'Laser impacto blanco.';
    } else {
      this.state.lastMessage = 'Laser disparado: sin impacto.';
    }

    return true;
  }

  fireMissile(ship: THREE.Object3D, targets: WeaponTarget[]): boolean {
    if (!this.state.missileReady) {
      this.state.lastMessage = this.state.missileAmmo <= 0 ? 'Misiles agotados.' : 'Misil recargando.';
      return false;
    }

    this.state.missileCooldown = this.missileCooldownMax;
    this.state.missileAmmo -= 1;
    const lockTarget = this.findLockTarget(ship, targets, 780);
    const origin = ship.position.clone().add(new THREE.Vector3(0, -0.9, -1.4).applyQuaternion(ship.quaternion));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    const direction = lockTarget ? lockTarget.object.position.clone().sub(origin).normalize() : forward;

    const missile = new THREE.Group();
    missile.position.copy(origin);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.34, 2.2, 10),
      new THREE.MeshStandardMaterial({
        color: 0xdce9ef,
        emissive: 0x1b5f89,
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.6
      })
    );
    body.rotation.x = -Math.PI / 2;
    missile.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0x87313a, roughness: 0.5, metalness: 0.5 })
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.45;
    missile.add(nose);

    const flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.particleTexture,
        color: 0xffc584,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    flare.position.z = 1.4;
    flare.scale.setScalar(3.4);
    missile.add(flare);

    // Exhaust ribbon: a short history of positions rendered as fading motes.
    const trailLength = 22;
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailLength * 3), 3));
    const trailMaterial = new THREE.PointsMaterial({
      color: 0xffb37a,
      size: 1.5,
      map: this.particleTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Points(trailGeometry, trailMaterial);
    trail.frustumCulled = false;
    this.group.add(trail);

    this.group.add(missile);
    this.spawnFlash(origin, 0xffd9a8, 4.5, 0.16, 26);
    this.missiles.push({
      group: missile,
      velocity: direction.multiplyScalar(165),
      target: lockTarget,
      trail,
      trailMaterial,
      trailHistory: [],
      age: 0
    });
    this.state.lastMessage = lockTarget ? 'Misil lanzado con fijacion.' : 'Misil lanzado en trayectoria libre.';
    return true;
  }

  private updateBeams(delta: number): void {
    for (let i = this.beams.length - 1; i >= 0; i -= 1) {
      const beam = this.beams[i];
      beam.age += delta;
      const life = Math.max(0, 1 - beam.age / 0.16);
      beam.coreMaterial.opacity = life;
      beam.glowMaterial.opacity = life * 0.45;
      if (beam.age > 0.16) {
        this.group.remove(beam.core, beam.glow);
        beam.core.geometry.dispose();
        beam.glow.geometry.dispose();
        beam.coreMaterial.dispose();
        beam.glowMaterial.dispose();
        this.beams.splice(i, 1);
      }
    }
  }

  private updateMissiles(delta: number, targets: WeaponTarget[]): void {
    for (let i = this.missiles.length - 1; i >= 0; i -= 1) {
      const missile = this.missiles[i];
      missile.age += delta;

      // Soft homing: bend the velocity toward a live lock, capped turn rate.
      if (missile.target && missile.target.health > 0) {
        const desired = missile.target.object.position.clone().sub(missile.group.position).normalize();
        const speed = missile.velocity.length();
        const current = missile.velocity.clone().normalize();
        current.lerp(desired, Math.min(1, delta * 2.4)).normalize();
        missile.velocity.copy(current.multiplyScalar(speed * (1 + delta * 0.25)));
      }

      missile.group.position.addScaledVector(missile.velocity, delta);
      missile.group.lookAt(missile.group.position.clone().add(missile.velocity));

      // Trail history feeds the exhaust ribbon.
      missile.trailHistory.unshift(missile.group.position.clone());
      if (missile.trailHistory.length > 22) missile.trailHistory.pop();
      const positions = missile.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let p = 0; p < 22; p += 1) {
        const point = missile.trailHistory[Math.min(p, missile.trailHistory.length - 1)] ?? missile.group.position;
        positions.setXYZ(p, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;

      const hit = targets.find((target) => missile.group.position.distanceTo(target.object.position) <= target.radius + 8);
      if (hit || missile.age > 4.2) {
        if (hit) {
          hit.health -= 90;
          this.spawnExplosion(missile.group.position);
          this.state.lastMessage = 'Misil impacto amenaza.';
          this.events.impacts += 1;
        }
        this.group.remove(missile.group, missile.trail);
        missile.trail.geometry.dispose();
        missile.trailMaterial.dispose();
        this.missiles.splice(i, 1);
      }
    }
  }

  private updateFlashes(delta: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const flash = this.flashes[i];
      flash.age += delta;
      const t = flash.age / flash.duration;
      flash.sprite.scale.setScalar(flash.sprite.scale.x + flash.growth * delta);
      flash.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (t >= 1) {
        this.group.remove(flash.sprite);
        flash.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }

  private updateSparks(delta: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const burst = this.sparks[i];
      burst.age += delta;
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let p = 0; p < array.length; p += 3) {
        array[p] += burst.velocities[p] * delta;
        array[p + 1] += burst.velocities[p + 1] * delta;
        array[p + 2] += burst.velocities[p + 2] * delta;
      }
      positions.needsUpdate = true;
      burst.material.opacity = Math.max(0, 0.9 - burst.age * 2);
      if (burst.age > 0.5) {
        this.group.remove(burst.points);
        burst.points.geometry.dispose();
        burst.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }

  private findLockTarget(ship: THREE.Object3D, targets: WeaponTarget[], range: number): WeaponTarget | undefined {
    const origin = ship.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    return targets
      .filter((target) => target.hostile && target.health > 0)
      .map((target) => {
        const toTarget = target.object.position.clone().sub(origin);
        return { target, distance: toTarget.length(), dot: forward.dot(toTarget.normalize()) };
      })
      .filter((candidate) => candidate.distance <= range && candidate.dot > 0.76)
      .sort((a, b) => b.dot - a.dot || a.distance - b.distance)[0]?.target;
  }

  private findRayHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    targets: WeaponTarget[],
    range: number,
    width: number
  ): WeaponTarget | undefined {
    return targets
      .filter((target) => target.hostile && target.health > 0)
      .map((target) => {
        const toTarget = target.object.position.clone().sub(origin);
        const forwardDistance = toTarget.dot(direction);
        const closestPoint = origin.clone().addScaledVector(direction, forwardDistance);
        const missDistance = closestPoint.distanceTo(target.object.position);
        return { target, forwardDistance, missDistance };
      })
      .filter((hit) => hit.forwardDistance > 0 && hit.forwardDistance < range && hit.missDistance <= width + hit.target.radius)
      .sort((a, b) => a.forwardDistance - b.forwardDistance)[0]?.target;
  }

  private spawnBeam(origin: THREE.Vector3, end: THREE.Vector3): void {
    const length = origin.distanceTo(end);
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.clone().sub(origin).normalize()
    );
    const midpoint = origin.clone().lerp(end, 0.5);

    // Hot white core inside a soft cyan sheath.
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xf4feff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 6, 1, true), coreMaterial);
    core.position.copy(midpoint);
    core.quaternion.copy(orientation);

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x57d2ff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, length, 8, 1, true), glowMaterial);
    glow.position.copy(midpoint);
    glow.quaternion.copy(orientation);

    this.group.add(core, glow);
    this.beams.push({ core, glow, coreMaterial, glowMaterial, age: 0 });
  }

  private spawnFlash(position: THREE.Vector3, color: number, size: number, duration: number, growth: number): void {
    const material = new THREE.SpriteMaterial({
      map: this.particleTexture,
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.group.add(sprite);
    this.flashes.push({ sprite, material, age: 0, duration, growth });
  }

  private spawnSparks(position: THREE.Vector3, color: number, count: number, speed: number): void {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const burst = speed * (0.4 + Math.random() * 0.8);
      velocities[i * 3] = direction.x * burst;
      velocities[i * 3 + 1] = direction.y * burst;
      velocities[i * 3 + 2] = direction.z * burst;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size: 1,
      map: this.particleTexture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.group.add(points);
    this.sparks.push({ points, material, velocities, age: 0 });
  }

  private spawnExplosion(position: THREE.Vector3): void {
    // Fireball flash + expanding shockwave annulus + debris sparks + light.
    this.spawnFlash(position, 0xffc071, 9, 0.5, 78);
    this.spawnFlash(position, 0xfff3da, 5, 0.22, 40);
    this.spawnSparks(position, 0xffb37a, 26, 44);

    const shockMaterial = new THREE.SpriteMaterial({
      map: this.ringTexture,
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const shock = new THREE.Sprite(shockMaterial);
    shock.position.copy(position);
    shock.scale.setScalar(6);
    this.group.add(shock);
    this.flashes.push({ sprite: shock, material: shockMaterial, age: 0, duration: 0.55, growth: 130 });

    this.impactLight.position.copy(position);
    this.impactLight.intensity = 9;
  }
}
