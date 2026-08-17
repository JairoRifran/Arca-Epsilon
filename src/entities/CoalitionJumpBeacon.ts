import * as THREE from 'three';
import { mission23Tuning } from '../assets/mission23Definitions';
import type { WeaponTarget } from '../systems/WeaponSystem';

/** Lightweight three-anchor jump beacon and contained route distortion. */
export class CoalitionJumpBeacon {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly collisionAnchor = new THREE.Object3D();
  readonly anchorTargets: WeaponTarget[] = [];

  private built = false;
  private hullMaterial?: THREE.MeshStandardMaterial;
  private activeMaterial?: THREE.MeshStandardMaterial;
  private distortionMaterial?: THREE.MeshBasicMaterial;
  private distortion?: THREE.Mesh;
  private core?: THREE.Mesh;
  private updateAccumulator = 0;

  constructor() {
    this.group.name = 'Baliza de Salto de la Coalición M23';
    this.group.visible = false;
  }
  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get visibleAnchorCount(): number {
    let count = 0;
    for (let index = 0; index < this.anchorTargets.length; index += 1) if (this.anchorTargets[index].object.visible) count += 1;
    return count;
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.collisionAnchor.position.copy(this.position);
  }

  setState(visible: boolean, disabled: readonly boolean[], collapsed: boolean, collapseProgress: number): void {
    if (!visible && !collapsed) { this.group.visible = false; return; }
    this.ensureBuilt();
    this.group.visible = visible || collapsed;
    for (let index = 0; index < this.anchorTargets.length; index += 1) {
      const target = this.anchorTargets[index];
      const isDisabled = Boolean(disabled[index]);
      const wasHostile = target.hostile;
      target.hostile = visible && !collapsed && !isDisabled;
      if (isDisabled || collapsed) target.health = 0;
      else if (target.health <= 0 && !wasHostile) target.health = mission23Tuning.beaconAnchorHealth;
      target.object.visible = !collapsed && !isDisabled;
    }
    if (this.core) this.core.visible = !collapsed;
    if (this.distortion) {
      this.distortion.visible = collapsed || collapseProgress > 0;
      const scale = collapsed ? 1.8 : 0.7 + collapseProgress * 0.009;
      this.distortion.scale.setScalar(scale);
    }
    if (this.distortionMaterial) this.distortionMaterial.opacity = collapsed ? 0.46 : Math.min(0.38, collapseProgress * 0.0038);
  }

  appendWeaponTargets(targets: WeaponTarget[]): void {
    if (!this.group.visible) return;
    for (let index = 0; index < this.anchorTargets.length; index += 1) {
      const target = this.anchorTargets[index];
      if (target.hostile && target.health > 0) targets.push(target);
    }
  }

  /** Reset volatile anchor damage before restoring a stable save checkpoint. */
  resetEncounterHealth(): void {
    for (let index = 0; index < this.anchorTargets.length; index += 1) {
      this.anchorTargets[index].hostile = false;
      this.anchorTargets[index].health = 0;
    }
  }

  update(delta: number, elapsed: number, collapsed: boolean): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < 0.08) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    if (this.core?.visible) this.core.rotation.y += step * 0.16;
    if (this.distortion?.visible) {
      this.distortion.rotation.z += step * (collapsed ? 0.7 : 0.22);
      this.distortion.rotation.x = Math.sin(elapsed * 0.25) * 0.08;
    }
    if (this.activeMaterial) this.activeMaterial.emissiveIntensity = 0.42 + Math.sin(elapsed * 2.8) * 0.08;
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
    this.hullMaterial = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.54, metalness: 0.8 });
    this.activeMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1112, emissive: 0x872a22, emissiveIntensity: 0.44, roughness: 0.38, metalness: 0.58 });
    this.distortionMaterial = new THREE.MeshBasicMaterial({ color: 0x6f3538, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

    this.core = new THREE.Mesh(new THREE.CylinderGeometry(24, 38, 142, 12), this.hullMaterial);
    this.core.position.copy(this.position);
    this.group.add(this.core);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(66, 4, 8, 40), this.activeMaterial);
    coreRing.position.copy(this.position);
    coreRing.rotation.x = Math.PI / 2;
    this.group.add(coreRing);

    const anchorGeometry = new THREE.CylinderGeometry(8, 15, 74, 9);
    for (let index = 0; index < 3; index += 1) {
      const angle = index / 3 * Math.PI * 2;
      const anchor = new THREE.Group();
      anchor.userData.combatSurface = 'structure';
      anchor.userData.combatMass = 'heavy';
      anchor.userData.combatEngineAnchors = [[0, 28, 0]];
      anchor.name = `Anclaje energético ${index + 1} M23`;
      anchor.position.set(this.position.x + Math.cos(angle) * 118, this.position.y - 12, this.position.z + Math.sin(angle) * 118);
      const body = new THREE.Mesh(anchorGeometry, this.hullMaterial);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2.2, 6, 28), this.activeMaterial);
      ring.rotation.x = Math.PI / 2;
      anchor.add(body, ring);
      this.group.add(anchor);
      this.anchorTargets.push({
        id: `coalition-jump-anchor-${index + 1}`,
        object: anchor,
        radius: 26,
        health: mission23Tuning.beaconAnchorHealth,
        hostile: true
      });
    }

    this.distortion = new THREE.Mesh(new THREE.TorusGeometry(88, 7, 10, 48), this.distortionMaterial);
    this.distortion.position.copy(this.position);
    this.distortion.rotation.x = Math.PI / 2;
    this.distortion.visible = false;
    this.group.add(this.distortion);
  }
}
