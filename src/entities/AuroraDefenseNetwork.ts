import * as THREE from 'three';
import { createContactShadow } from '../assets/materialCache';
import {
  defenseSensorDefinitions,
  energyReserveDefinition,
  shieldEmitterDefinitions,
  EMITTER_COUNT,
  SENSOR_COUNT
} from '../assets/mission17Definitions';
import { defenseTurretDefinitions, TURRET_COUNT } from '../assets/mission18Definitions';

/** Lifecycle of one piece of M17 defence hardware. */
export type DefensePartState = 'stowed' | 'deploying' | 'online';

/**
 * Aurora's M17 defence hardware: three perimeter sensor masts, three shield
 * emitters and the defensive energy accumulator.
 *
 * Human industrial build with a Pleyadian influence: grey structural metal,
 * exposed anchors, cable runs and functional dishes, lit only by dim cyan and
 * gold emissives — nothing magical, nothing arcade. Parts read as crates on
 * their anchors until deployed, then raise their mast/dish and come online.
 *
 * All three families share one geometry/material set; every part is built once
 * in the constructor. Nothing here allocates geometry, materials or vectors
 * during update, and no light is added per part beyond one shared pool of three
 * (one per emitter) that only turns on while the shield is under test.
 */
export class AuroraDefenseNetwork {
  readonly group = new THREE.Group();
  readonly sensorPositions: THREE.Vector3[] = [];
  readonly emitterPositions: THREE.Vector3[] = [];
  readonly reservePosition = new THREE.Vector3();
  /** M18: muzzle points of the three point-defence batteries. */
  readonly turretPositions: THREE.Vector3[] = [];

  private readonly sensorGroups: THREE.Group[] = [];
  private readonly sensorMasts: THREE.Mesh[] = [];
  private readonly sensorLensMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly sensorDishes: THREE.Mesh[] = [];

  private readonly emitterGroups: THREE.Group[] = [];
  private readonly emitterCores: THREE.Mesh[] = [];
  private readonly emitterCoreMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly emitterLights: THREE.PointLight[] = [];

  // --- M18 point-defence batteries ---------------------------------------
  private readonly turretGroups: THREE.Group[] = [];
  /** Horizontal traverse ring: rotates to bear on the tracked drone. */
  private readonly turretYokes: THREE.Group[] = [];
  /** Cannon barrel: elevates, and kicks back on each shot. */
  private readonly turretBarrels: THREE.Object3D[] = [];
  private readonly turretCovers: THREE.Mesh[] = [];
  private readonly turretGlowMaterials: THREE.MeshStandardMaterial[] = [];
  /** Seconds of visual recoil left per battery. */
  private readonly turretRecoil: number[] = [];
  private turretsAuthorized = false;

  private readonly reserveGroup = new THREE.Group();
  private readonly reserveCellMaterial: THREE.MeshStandardMaterial;
  private readonly reserveGaugeMaterial: THREE.MeshStandardMaterial;

  private readonly structural: THREE.MeshStandardMaterial;
  private readonly darkMetal: THREE.MeshStandardMaterial;
  private readonly cableMaterial: THREE.MeshStandardMaterial;

  /** Mirrored state so update never reads mission objects. */
  private readonly sensorStates: DefensePartState[] = ['stowed', 'stowed', 'stowed'];
  private readonly emitterStates: DefensePartState[] = ['stowed', 'stowed', 'stowed'];
  private reserveOnline = false;
  private shieldTestLevel = 0;
  private calibrated = false;

  constructor() {
    this.group.name = 'Red de Defensa Aurora';
    this.group.visible = false;

    this.structural = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.66, metalness: 0.42 });
    this.darkMetal = new THREE.MeshStandardMaterial({ color: 0x333a3f, roughness: 0.52, metalness: 0.72 });
    this.cableMaterial = new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.82, metalness: 0.2 });

    // Shared geometry across every part in the network.
    const padGeometry = new THREE.CylinderGeometry(0.78, 0.94, 0.22, 10);
    const anchorGeometry = new THREE.BoxGeometry(0.22, 0.16, 0.5);
    const mastGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2.1, 8);
    const dishGeometry = new THREE.CylinderGeometry(0.52, 0.12, 0.18, 12);
    const lensGeometry = new THREE.SphereGeometry(0.12, 8, 6);
    const cableGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
    const crateGeometry = new THREE.BoxGeometry(0.9, 0.62, 0.72);
    const emitterColumnGeometry = new THREE.CylinderGeometry(0.2, 0.3, 1.15, 8);
    const emitterCoreGeometry = new THREE.OctahedronGeometry(0.26, 0);
    const ringGeometry = new THREE.TorusGeometry(0.42, 0.04, 6, 20);

    // ---- Perimeter sensors -------------------------------------------------
    for (let i = 0; i < SENSOR_COUNT; i += 1) {
      const node = new THREE.Group();
      node.name = defenseSensorDefinitions[i].name;
      node.visible = false;
      node.add(createContactShadow(1.05, 0.3));

      const pad = new THREE.Mesh(padGeometry, this.darkMetal);
      pad.position.y = 0.11;
      node.add(pad);
      // Three ground anchors: this thing is bolted down, not placed.
      for (let a = 0; a < 3; a += 1) {
        const angle = a * ((Math.PI * 2) / 3);
        const anchor = new THREE.Mesh(anchorGeometry, this.darkMetal);
        anchor.position.set(Math.cos(angle) * 0.86, 0.08, Math.sin(angle) * 0.86);
        anchor.rotation.y = -angle;
        node.add(anchor);
      }
      // The equipment crate stays whether stowed or deployed.
      const crate = new THREE.Mesh(crateGeometry, this.structural);
      crate.position.set(0.62, 0.53, 0.24);
      crate.rotation.y = 0.3;
      node.add(crate);

      const mast = new THREE.Mesh(mastGeometry, this.structural);
      mast.position.y = 1.28;
      this.sensorMasts.push(mast);
      node.add(mast);

      const dish = new THREE.Mesh(dishGeometry, this.structural);
      dish.position.y = 2.35;
      dish.rotation.z = 0.42;
      this.sensorDishes.push(dish);
      node.add(dish);

      const lensMaterial = new THREE.MeshStandardMaterial({
        color: 0x1b2529,
        emissive: 0x7fd4e8,
        emissiveIntensity: 0,
        roughness: 0.3,
        metalness: 0.25
      });
      this.sensorLensMaterials.push(lensMaterial);
      const lens = new THREE.Mesh(lensGeometry, lensMaterial);
      lens.position.set(0, 2.42, 0.2);
      node.add(lens);

      // Cable run from the crate down to the anchor ring.
      const cable = new THREE.Mesh(cableGeometry, this.cableMaterial);
      cable.scale.y = 0.72;
      cable.position.set(0.44, 0.4, 0.2);
      cable.rotation.z = 0.6;
      node.add(cable);

      node.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });
      this.sensorGroups.push(node);
      this.sensorPositions.push(new THREE.Vector3());
      this.group.add(node);
    }

    // ---- Shield emitters ---------------------------------------------------
    for (let i = 0; i < EMITTER_COUNT; i += 1) {
      const node = new THREE.Group();
      node.name = shieldEmitterDefinitions[i].name;
      node.visible = false;
      node.add(createContactShadow(0.95, 0.3));

      const pad = new THREE.Mesh(padGeometry, this.darkMetal);
      pad.position.y = 0.11;
      node.add(pad);
      for (let a = 0; a < 3; a += 1) {
        const angle = a * ((Math.PI * 2) / 3) + 0.5;
        const anchor = new THREE.Mesh(anchorGeometry, this.darkMetal);
        anchor.position.set(Math.cos(angle) * 0.82, 0.08, Math.sin(angle) * 0.82);
        anchor.rotation.y = -angle;
        node.add(anchor);
      }
      const column = new THREE.Mesh(emitterColumnGeometry, this.structural);
      column.position.y = 0.8;
      node.add(column);

      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x1d2427,
        emissive: 0xc9a86a,
        emissiveIntensity: 0,
        roughness: 0.34,
        metalness: 0.3
      });
      this.emitterCoreMaterials.push(coreMaterial);
      const core = new THREE.Mesh(emitterCoreGeometry, coreMaterial);
      core.position.y = 1.62;
      this.emitterCores.push(core);
      node.add(core);

      const ring = new THREE.Mesh(ringGeometry, this.darkMetal);
      ring.position.y = 1.62;
      ring.rotation.x = Math.PI / 2;
      node.add(ring);

      const cable = new THREE.Mesh(cableGeometry, this.cableMaterial);
      cable.scale.y = 0.6;
      cable.position.set(-0.36, 0.36, 0.2);
      cable.rotation.z = -0.55;
      node.add(cable);

      // One light per emitter, dark unless the shield is actually under test.
      const light = new THREE.PointLight(0xd8c089, 0, 14, 2);
      light.position.y = 1.62;
      light.visible = false;
      this.emitterLights.push(light);
      node.add(light);

      node.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });
      this.emitterGroups.push(node);
      this.emitterPositions.push(new THREE.Vector3());
      this.group.add(node);
    }

    // ---- M18 point-defence batteries ---------------------------------------
    // Installed as sealed modules during M17; the cover only comes off when
    // M18 authorises weapons, so no gun is visible before the first fire.
    const yokeGeometry = new THREE.CylinderGeometry(0.46, 0.58, 0.4, 10);
    const cheekGeometry = new THREE.BoxGeometry(0.2, 0.46, 0.62);
    const cannonGeometry = new THREE.CylinderGeometry(0.14, 0.19, 2.3, 8);
    const muzzleGeometry = new THREE.CylinderGeometry(0.2, 0.16, 0.28, 8);
    const coverGeometry = new THREE.BoxGeometry(1.5, 0.95, 1.5);
    for (let i = 0; i < TURRET_COUNT; i += 1) {
      const node = new THREE.Group();
      node.name = defenseTurretDefinitions[i].name;
      node.visible = false;
      node.add(createContactShadow(1.0, 0.3));

      const pad = new THREE.Mesh(padGeometry, this.darkMetal);
      pad.position.y = 0.11;
      node.add(pad);
      for (let a = 0; a < 3; a += 1) {
        const angle = a * ((Math.PI * 2) / 3) + 1.1;
        const anchor = new THREE.Mesh(anchorGeometry, this.darkMetal);
        anchor.position.set(Math.cos(angle) * 0.84, 0.08, Math.sin(angle) * 0.84);
        anchor.rotation.y = -angle;
        node.add(anchor);
      }

      // Sealed transport cover: the only thing visible before authorisation.
      const cover = new THREE.Mesh(coverGeometry, this.structural);
      cover.position.y = 0.72;
      this.turretCovers.push(cover);
      node.add(cover);

      // Traverse yoke -> elevation barrel. Two nested groups, no per-frame math.
      const yoke = new THREE.Group();
      yoke.position.y = 0.42;
      yoke.visible = false;
      this.turretYokes.push(yoke);
      node.add(yoke);

      const yokeBase = new THREE.Mesh(yokeGeometry, this.darkMetal);
      yoke.add(yokeBase);
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(cheekGeometry, this.structural);
        cheek.position.set(side * 0.42, 0.42, 0);
        yoke.add(cheek);
      }

      const barrelPivot = new THREE.Group();
      barrelPivot.position.y = 0.5;
      yoke.add(barrelPivot);
      const cannon = new THREE.Mesh(cannonGeometry, this.structural);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.z = -0.9;
      barrelPivot.add(cannon);
      const muzzle = new THREE.Mesh(muzzleGeometry, this.darkMetal);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = -2.0;
      barrelPivot.add(muzzle);
      // A single dim charge indicator — no dynamic light per shot.
      const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0x1d2427,
        emissive: 0x8fd4e8,
        emissiveIntensity: 0,
        roughness: 0.32,
        metalness: 0.3
      });
      this.turretGlowMaterials.push(glowMaterial);
      const charge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.42), glowMaterial);
      charge.position.set(0, 0.28, 0.1);
      barrelPivot.add(charge);
      // Barrel elevation: fixed slight upward cant toward the approach ring.
      barrelPivot.rotation.x = -0.26;
      this.turretBarrels.push(barrelPivot);
      this.turretRecoil.push(0);

      node.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });
      this.turretGroups.push(node);
      this.turretPositions.push(new THREE.Vector3());
      this.group.add(node);
    }

    // ---- Defensive energy accumulator --------------------------------------
    this.reserveGroup.name = energyReserveDefinition.name;
    this.reserveGroup.visible = false;
    this.reserveGroup.add(createContactShadow(1.4, 0.32));
    const skid = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 1.5), this.darkMetal);
    skid.position.y = 0.09;
    this.reserveGroup.add(skid);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 1.15), this.structural);
    bank.position.y = 0.72;
    this.reserveGroup.add(bank);
    this.reserveCellMaterial = new THREE.MeshStandardMaterial({
      color: 0x222a2d,
      emissive: 0x7fd4e8,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.4
    });
    // Three visible cells, one per balanced circuit.
    for (let c = 0; c < 3; c += 1) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.08), this.reserveCellMaterial);
      cell.position.set(-0.62 + c * 0.62, 0.76, 0.6);
      this.reserveGroup.add(cell);
    }
    this.reserveGaugeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2326,
      emissive: 0xc9a86a,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.3
    });
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.05), this.reserveGaugeMaterial);
    gauge.position.set(0, 1.32, 0.58);
    this.reserveGroup.add(gauge);
    const conduit = new THREE.Mesh(cableGeometry, this.cableMaterial);
    conduit.scale.y = 1.6;
    conduit.position.set(-1.2, 0.5, 0.3);
    conduit.rotation.z = 0.8;
    this.reserveGroup.add(conduit);
    this.reserveGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
    this.group.add(this.reserveGroup);
  }

  /** Seat every part on the terrain. Called on sync, never per frame. */
  setLayout(getGroundHeight: (x: number, z: number) => number): void {
    for (let i = 0; i < SENSOR_COUNT; i += 1) {
      const [x, z] = defenseSensorDefinitions[i].position;
      const y = getGroundHeight(x, z);
      this.sensorGroups[i].position.set(x, y, z);
      this.sensorPositions[i].set(x, y + defenseSensorDefinitions[i].height, z);
    }
    for (let i = 0; i < EMITTER_COUNT; i += 1) {
      const [x, z] = shieldEmitterDefinitions[i].position;
      const y = getGroundHeight(x, z);
      this.emitterGroups[i].position.set(x, y, z);
      this.emitterPositions[i].set(x, y + shieldEmitterDefinitions[i].height, z);
    }
    for (let i = 0; i < TURRET_COUNT; i += 1) {
      const [x, z] = defenseTurretDefinitions[i].position;
      const y = getGroundHeight(x, z);
      this.turretGroups[i].position.set(x, y, z);
      this.turretPositions[i].set(x, y + defenseTurretDefinitions[i].height, z);
    }
    const [rx, rz] = energyReserveDefinition.position;
    const ry = getGroundHeight(rx, rz);
    this.reserveGroup.position.set(rx, ry, rz);
    this.reservePosition.set(rx, ry + energyReserveDefinition.height, rz);
  }

  /**
   * Show the batteries. `authorized` swaps the sealed cover for the live gun —
   * M17 installs them closed, M18 opens them on the first fire order.
   * Idempotent: repeated calls never duplicate or rebuild anything.
   */
  restoreTurrets(visible: boolean, authorized: boolean): void {
    this.turretsAuthorized = authorized;
    for (let i = 0; i < TURRET_COUNT; i += 1) {
      this.turretGroups[i].visible = visible;
      this.turretCovers[i].visible = visible && !authorized;
      this.turretYokes[i].visible = visible && authorized;
      this.turretGlowMaterials[i].emissiveIntensity = authorized ? 0.22 : 0;
    }
  }

  /** Point one battery at a world position. Cheap: yaw only, no allocation. */
  aimTurret(index: number, target: THREE.Vector3 | null): void {
    const yoke = this.turretYokes[index];
    if (!yoke || !yoke.visible || !target) return;
    const base = this.turretGroups[index].position;
    yoke.rotation.y = Math.atan2(target.x - base.x, target.z - base.z);
  }

  /** Visual recoil for one battery shot. No light is spawned per shot. */
  fireTurret(index: number): void {
    if (index < 0 || index >= TURRET_COUNT) return;
    this.turretRecoil[index] = 0.16;
  }

  /** Muzzle world position of a battery, for spawning a tracer. */
  turretMuzzle(index: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.turretPositions[index] ?? this.reservePosition);
  }

  /**
   * Push mission state in. Called on sync and on every state change, never per
   * frame — `update` only animates what is set here. Idempotent: calling it
   * repeatedly never duplicates or re-creates a part.
   */
  restore(
    visible: boolean,
    sensorStates: readonly DefensePartState[],
    emitterStates: readonly DefensePartState[],
    reserveOnline: boolean,
    calibrated: boolean
  ): void {
    this.group.visible = visible;
    this.calibrated = calibrated;
    this.reserveOnline = reserveOnline;
    // The accumulator appears as soon as the network exists: it is the first
    // thing M17 builds and stays for the rest of the game.
    this.reserveGroup.visible = visible;

    for (let i = 0; i < SENSOR_COUNT; i += 1) {
      const next = sensorStates[i] ?? 'stowed';
      this.sensorStates[i] = next;
      // A sensor is only in the world once its step is live; stowed parts still
      // show their crate and anchors so the site reads as prepared.
      this.sensorGroups[i].visible = visible;
      const deployed = next === 'online';
      this.sensorMasts[i].scale.y = deployed ? 1 : 0.22;
      this.sensorMasts[i].position.y = deployed ? 1.28 : 0.34;
      this.sensorDishes[i].visible = deployed;
      this.sensorLensMaterials[i].emissiveIntensity = deployed ? (calibrated ? 0.5 : 0.16) : 0;
    }
    for (let i = 0; i < EMITTER_COUNT; i += 1) {
      const next = emitterStates[i] ?? 'stowed';
      this.emitterStates[i] = next;
      this.emitterGroups[i].visible = visible;
      const online = next === 'online';
      this.emitterCores[i].visible = online;
      this.emitterCoreMaterials[i].emissiveIntensity = online ? 0.32 : 0;
      this.emitterLights[i].visible = false;
      this.emitterLights[i].intensity = 0;
    }
    this.reserveCellMaterial.emissiveIntensity = reserveOnline ? 0.42 : 0;
    this.reserveGaugeMaterial.emissiveIntensity = reserveOnline ? 0.35 : 0;
  }

  /** 0 = shield idle, 1 = full load test. Drives the emitter lights only. */
  setShieldTestLevel(level: number): void {
    this.shieldTestLevel = THREE.MathUtils.clamp(level, 0, 1);
  }

  update(elapsed: number, elapsedDelta = 0.016): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * 1.7) * 0.5;
    const scan = 0.5 + Math.sin(elapsed * 0.6) * 0.5;

    for (let i = 0; i < SENSOR_COUNT; i += 1) {
      if (this.sensorStates[i] !== 'online' || !this.sensorGroups[i].visible) continue;
      // A calibrated dish sweeps its corridor slowly; an uncalibrated one sits.
      if (this.calibrated) this.sensorDishes[i].rotation.y = Math.sin(elapsed * 0.35 + i) * 0.6;
      this.sensorLensMaterials[i].emissiveIntensity = this.calibrated
        ? 0.32 + scan * 0.34
        : 0.12 + pulse * 0.08;
    }

    for (let i = 0; i < EMITTER_COUNT; i += 1) {
      if (this.emitterStates[i] !== 'online' || !this.emitterGroups[i].visible) continue;
      this.emitterCores[i].rotation.y += 0.01;
      const test = this.shieldTestLevel;
      this.emitterCoreMaterials[i].emissiveIntensity = 0.28 + pulse * 0.18 + test * 0.7;
      // Lights only burn while the shield is genuinely under test.
      const lit = test > 0.02;
      this.emitterLights[i].visible = lit;
      this.emitterLights[i].intensity = lit ? test * (0.5 + pulse * 0.25) : 0;
    }

    if (this.reserveOnline) {
      this.reserveCellMaterial.emissiveIntensity = 0.3 + pulse * 0.22;
      this.reserveGaugeMaterial.emissiveIntensity = 0.26 + scan * 0.2;
    }

    // Batteries: recoil decays and the charge indicator breathes. Recoil is a
    // barrel offset, never a spawned light.
    if (this.turretsAuthorized) {
      for (let i = 0; i < TURRET_COUNT; i += 1) {
        if (!this.turretGroups[i].visible) continue;
        if (this.turretRecoil[i] > 0) {
          this.turretRecoil[i] = Math.max(0, this.turretRecoil[i] - elapsedDelta);
          this.turretBarrels[i].position.z = (this.turretRecoil[i] / 0.16) * 0.28;
          this.turretGlowMaterials[i].emissiveIntensity = 0.3 + (this.turretRecoil[i] / 0.16) * 0.7;
        } else {
          this.turretBarrels[i].position.z = 0;
          this.turretGlowMaterials[i].emissiveIntensity = 0.2 + pulse * 0.1;
        }
      }
    }
  }

  dispose(): void {
    for (const m of this.sensorLensMaterials) m.dispose();
    for (const m of this.emitterCoreMaterials) m.dispose();
    this.reserveCellMaterial.dispose();
    this.reserveGaugeMaterial.dispose();
    this.structural.dispose();
    this.darkMetal.dispose();
    this.cableMaterial.dispose();
  }
}
