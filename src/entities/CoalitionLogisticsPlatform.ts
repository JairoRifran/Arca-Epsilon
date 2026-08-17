import * as THREE from 'three';
import { mission23Tuning, type Mission23PlatformMethod } from '../assets/mission23Definitions';
import type { WeaponTarget } from '../systems/WeaponSystem';

export type LogisticsPlatformState = {
  visible: boolean;
  defensesDisabled: boolean;
  energyDisabled: boolean;
  destroyed: boolean;
  method: Mission23PlatformMethod;
};

/** Lazy, modular Coalition supply platform for Mission 23. */
export class CoalitionLogisticsPlatform {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly defenseTarget: WeaponTarget = { id: 'coalition-platform-defense', object: new THREE.Group(), radius: 34, health: 0, hostile: false };
  readonly energyTarget: WeaponTarget = { id: 'coalition-platform-energy', object: new THREE.Group(), radius: 30, health: 0, hostile: false };
  readonly coreTarget: WeaponTarget = { id: 'coalition-platform-core', object: new THREE.Group(), radius: 38, health: 0, hostile: false };

  private built = false;
  private hullMaterial?: THREE.MeshStandardMaterial;
  private activeMaterial?: THREE.MeshStandardMaterial;
  private coreMaterial?: THREE.MeshStandardMaterial;
  private defenseRing?: THREE.Mesh;
  private energyRing?: THREE.Mesh;
  private coreRing?: THREE.Mesh;
  private updateAccumulator = 0;
  private destructionVisualRemaining = 0;
  private wasDestroyed = false;

  constructor() {
    this.group.name = 'Plataforma Logística de la Coalición M23';
    this.group.visible = false;
    this.defenseTarget.object.userData.combatSurface = 'shield';
    this.defenseTarget.object.userData.combatMass = 'heavy';
    this.energyTarget.object.userData.combatSurface = 'structure';
    this.energyTarget.object.userData.combatMass = 'heavy';
    this.energyTarget.object.userData.combatEngineAnchors = [[0, 0, 18]];
    this.coreTarget.object.userData.combatSurface = 'structure';
    this.coreTarget.object.userData.combatMass = 'heavy';
    this.coreTarget.object.userData.combatEngineAnchors = [[0, 0, 22]];
    this.defenseTarget.object.name = 'Defensa exterior plataforma M23';
    this.energyTarget.object.name = 'Depósitos energéticos plataforma M23';
    this.coreTarget.object.name = 'Núcleo logístico plataforma M23';
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get activeModuleCount(): number {
    return Number(this.defenseTarget.hostile) + Number(this.energyTarget.hostile) + Number(this.coreTarget.hostile);
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.defenseTarget.object.position.set(x - 58, y + 10, z + 4);
    this.energyTarget.object.position.set(x + 54, y - 6, z + 8);
    this.coreTarget.object.position.set(x, y, z - 8);
  }

  setState(state: LogisticsPlatformState): void {
    if (!state.visible && !state.destroyed) { this.group.visible = false; return; }
    this.ensureBuilt();
    if (state.destroyed && !this.wasDestroyed && this.group.visible) this.destructionVisualRemaining = 1.6;
    this.wasDestroyed = state.destroyed;
    this.group.visible = (state.visible && !state.destroyed) || this.destructionVisualRemaining > 0;
    const defenseWasHostile = this.defenseTarget.hostile;
    const energyWasHostile = this.energyTarget.hostile;
    const coreWasHostile = this.coreTarget.hostile;
    this.defenseTarget.hostile = this.group.visible && !state.defensesDisabled;
    this.energyTarget.hostile = this.group.visible && state.defensesDisabled && !state.energyDisabled;
    this.coreTarget.hostile = this.group.visible && state.energyDisabled && !state.destroyed && state.method !== 'none';
    if (state.defensesDisabled) this.defenseTarget.health = 0;
    else if (this.defenseTarget.health <= 0 && !defenseWasHostile) this.defenseTarget.health = mission23Tuning.platformDefenseHealth;
    if (state.energyDisabled) this.energyTarget.health = 0;
    else if (this.energyTarget.health <= 0 && !energyWasHostile) this.energyTarget.health = mission23Tuning.platformEnergyHealth;
    if (state.destroyed) this.coreTarget.health = 0;
    else if (this.coreTarget.health <= 0 && !coreWasHostile) this.coreTarget.health = mission23Tuning.platformCoreHealth;
    if (this.defenseRing) this.defenseRing.visible = !state.defensesDisabled;
    if (this.energyRing) this.energyRing.visible = state.defensesDisabled && !state.energyDisabled;
    if (this.coreRing) this.coreRing.visible = state.energyDisabled && !state.destroyed;
    if (this.coreMaterial) {
      this.coreMaterial.emissive.setHex(state.method === 'overload' ? 0xb34b2c : state.method === 'powerCut' ? 0x315461 : 0x842a22);
    }
  }

  appendWeaponTargets(targets: WeaponTarget[]): void {
    if (!this.group.visible) return;
    if (this.defenseTarget.hostile && this.defenseTarget.health > 0) targets.push(this.defenseTarget);
    if (this.energyTarget.hostile && this.energyTarget.health > 0) targets.push(this.energyTarget);
    if (this.coreTarget.hostile && this.coreTarget.health > 0) targets.push(this.coreTarget);
  }

  applyCoordinatedDamage(amount: number): void {
    if (this.coreTarget.hostile && this.coreTarget.health > 0) this.coreTarget.health = Math.max(0, this.coreTarget.health - amount);
  }

  /** Reset volatile combat damage before restoring a stable save checkpoint. */
  resetEncounterHealth(): void {
    this.defenseTarget.hostile = false;
    this.energyTarget.hostile = false;
    this.coreTarget.hostile = false;
    this.defenseTarget.health = 0;
    this.energyTarget.health = 0;
    this.coreTarget.health = 0;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    if (this.destructionVisualRemaining > 0) {
      this.destructionVisualRemaining = Math.max(0, this.destructionVisualRemaining - delta);
      this.group.rotation.z += delta * 0.08;
      if (this.activeMaterial) this.activeMaterial.emissiveIntensity = 0.12 + Math.abs(Math.sin(elapsed * 15)) * 0.5;
      if (this.coreMaterial) this.coreMaterial.emissiveIntensity = 0.18 + Math.abs(Math.sin(elapsed * 19)) * 0.75;
      if (this.destructionVisualRemaining === 0) this.group.visible = false;
      return;
    }
    this.updateAccumulator += delta;
    if (this.updateAccumulator < 0.08) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    if (this.defenseRing?.visible) this.defenseRing.rotation.z += step * 0.22;
    if (this.energyRing?.visible) this.energyRing.rotation.z -= step * 0.34;
    if (this.coreRing?.visible) this.coreRing.rotation.z += step * 0.18;
    if (this.activeMaterial) {
      const defenseRatio = this.defenseTarget.hostile
        ? Math.max(0, this.defenseTarget.health / Math.max(1, mission23Tuning.platformDefenseHealth))
        : 1;
      const energyRatio = this.energyTarget.hostile
        ? Math.max(0, this.energyTarget.health / Math.max(1, mission23Tuning.platformEnergyHealth))
        : 1;
      const weakest = Math.min(defenseRatio, energyRatio);
      const unstable = weakest < 0.42 ? 0.55 + Math.sin(elapsed * 13) * 0.35 : 1;
      this.activeMaterial.emissiveIntensity = (0.22 + weakest * 0.2 + Math.sin(elapsed * 2.4) * 0.05) * unstable;
    }
    if (this.coreMaterial) {
      const ratio = this.coreTarget.hostile
        ? Math.max(0, this.coreTarget.health / Math.max(1, mission23Tuning.platformCoreHealth))
        : 1;
      const unstable = ratio < 0.35 ? 0.45 + Math.sin(elapsed * 16) * 0.38 : 1;
      this.coreMaterial.emissiveIntensity = (0.3 + ratio * 0.2 + Math.sin(elapsed * 3.1) * 0.06) * unstable;
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (Array.isArray(mesh.material)) for (const material of mesh.material) materials.add(material);
      else if (mesh.material) materials.add(mesh.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    this.hullMaterial = new THREE.MeshStandardMaterial({ color: 0x181b1f, roughness: 0.58, metalness: 0.78 });
    this.activeMaterial = new THREE.MeshStandardMaterial({ color: 0x211615, emissive: 0x7e281f, emissiveIntensity: 0.36, roughness: 0.42, metalness: 0.62 });
    this.coreMaterial = new THREE.MeshStandardMaterial({ color: 0x180d0d, emissive: 0x842a22, emissiveIntensity: 0.48, roughness: 0.36, metalness: 0.5 });

    const spine = new THREE.Mesh(new THREE.BoxGeometry(156, 18, 34), this.hullMaterial);
    spine.position.copy(this.position);
    this.group.add(spine);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(42, 12, 118), this.hullMaterial);
    cross.position.copy(this.position);
    this.group.add(cross);

    const defense = this.defenseTarget.object;
    const defenseBody = new THREE.Mesh(new THREE.CylinderGeometry(14, 20, 38, 10), this.hullMaterial);
    defenseBody.rotation.z = Math.PI / 2;
    this.defenseRing = new THREE.Mesh(new THREE.TorusGeometry(29, 2.2, 6, 28), this.activeMaterial);
    this.defenseRing.rotation.y = Math.PI / 2;
    defense.add(defenseBody, this.defenseRing);

    const energy = this.energyTarget.object;
    const tankGeometry = new THREE.CylinderGeometry(10, 10, 46, 10);
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(tankGeometry, this.activeMaterial);
      tank.position.z = side * 14;
      tank.rotation.z = Math.PI / 2;
      energy.add(tank);
    }
    this.energyRing = new THREE.Mesh(new THREE.TorusGeometry(31, 2, 6, 28), this.activeMaterial);
    this.energyRing.rotation.y = Math.PI / 2;
    energy.add(this.energyRing);

    const core = this.coreTarget.object;
    core.add(new THREE.Mesh(new THREE.OctahedronGeometry(22, 1), this.coreMaterial));
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(38, 2.4, 6, 32), this.coreMaterial);
    this.coreRing.rotation.x = Math.PI / 2;
    core.add(this.coreRing);
    this.group.add(defense, energy, core);
  }
}
