import * as THREE from 'three';
import { mission25Tuning, type Mission25StateId } from '../assets/mission25Definitions';
import type { WeaponTarget } from '../systems/WeaponSystem';

const NODE_OFFSETS = [
  [-58, 22, 4],
  [58, 22, 4],
  [0, -46, 18]
] as const;

/** Small modular command matrix used as M25's staged final target. */
export class CoalitionSiegeCommand {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly nodeTargets: WeaponTarget[] = [];
  readonly coreTarget: WeaponTarget = { id: 'coalition-siege-core', object: new THREE.Object3D(), radius: 18, health: 0, hostile: false };

  private readonly nodeVisuals: THREE.Group[] = [];
  private readonly nodeProxies: THREE.Object3D[] = [];
  private readonly nodeMaterials: THREE.MeshStandardMaterial[] = [];
  private coreMaterial?: THREE.MeshStandardMaterial;
  private readonly core = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly collapseRings: THREE.Mesh[] = [];
  private readonly offsetScratch = new THREE.Vector3();
  private built = false;
  private updateAccumulator = 0;
  private state: Mission25StateId = 'inactive';
  private previousState: Mission25StateId = 'inactive';
  private coreMaximumHealth: number = mission25Tuning.commandCoreHealth;

  constructor() {
    this.group.name = 'Coalition Siege Command // M25';
    this.group.visible = false;
    this.core.name = 'Siege Command Core';
    this.shield.name = 'Siege Command Protection';
    this.coreTarget.object.name = 'Siege Command Core Target';
    this.coreTarget.object.userData.combatSurface = 'structure';
    this.coreTarget.object.userData.combatMass = 'heavy';
    this.coreTarget.object.userData.combatEngineAnchors = [[0, 0, 17]];
  }

  get isBuilt(): boolean { return this.built; }
  get isVisible(): boolean { return this.group.visible; }
  get activeNodeCount(): number {
    let count = 0;
    for (let index = 0; index < this.nodeTargets.length; index += 1) if (this.nodeTargets[index].health > 0) count += 1;
    return count;
  }
  get coreExposed(): boolean { return this.coreTarget.hostile; }
  get coreIntegrityPercent(): number {
    return this.coreMaximumHealth > 0 ? Math.max(0, Math.min(100, this.coreTarget.health / this.coreMaximumHealth * 100)) : 0;
  }

  setArkRelativeTransform(arkPosition: THREE.Vector3, arkQuaternion: THREE.Quaternion): void {
    const offset = mission25Tuning.commandTargetOffset;
    this.offsetScratch.set(offset[0], offset[1], offset[2]).applyQuaternion(arkQuaternion);
    this.position.copy(arkPosition).add(this.offsetScratch);
    this.group.position.copy(this.position);
    this.group.quaternion.copy(arkQuaternion);
    for (let index = 0; index < NODE_OFFSETS.length; index += 1) {
      const nodeOffset = NODE_OFFSETS[index];
      this.offsetScratch.set(nodeOffset[0], nodeOffset[1], nodeOffset[2]).applyQuaternion(arkQuaternion);
      this.nodeProxies[index]?.position.copy(this.position).add(this.offsetScratch);
    }
    this.coreTarget.object.position.copy(this.position);
  }

  setState(
    state: Mission25StateId,
    destroyedNodes: readonly boolean[],
    coreIntegrity: number,
    supportActive: boolean
  ): void {
    const visible = state === 'commandTargetLocated' || state === 'commandTargetProtected' ||
      state === 'commandTargetExposed' || state === 'finalAssault' || state === 'threatCollapse';
    if (!visible) {
      this.group.visible = false;
      return;
    }
    this.ensureBuilt();
    this.group.visible = true;
    this.previousState = this.state;
    this.state = state;
    const nodeHealth = mission25Tuning.nodeHealth * (supportActive ? 0.78 : 1);
    this.coreMaximumHealth = mission25Tuning.commandCoreHealth * (supportActive ? 0.88 : 1);
    for (let index = 0; index < this.nodeTargets.length; index += 1) {
      const destroyed = Boolean(destroyedNodes[index]);
      if (!destroyed && this.previousState !== 'commandTargetProtected' && state === 'commandTargetProtected') {
        this.nodeTargets[index].health = nodeHealth;
      }
      if (destroyed) this.nodeTargets[index].health = 0;
      this.nodeTargets[index].hostile = state === 'commandTargetProtected' && !destroyed;
      this.nodeVisuals[index].visible = !destroyed;
      this.nodeMaterials[index].emissiveIntensity = state === 'commandTargetProtected' ? 0.55 : 0.18;
    }
    const exposed = state === 'commandTargetExposed' || state === 'finalAssault';
    this.coreTarget.hostile = state === 'finalAssault';
    if (this.previousState !== 'finalAssault' && state === 'finalAssault') {
      this.coreTarget.health = Math.max(0, this.coreMaximumHealth * Math.max(0, Math.min(100, coreIntegrity)) / 100);
    }
    this.core.visible = exposed || state === 'threatCollapse';
    this.shield.visible = state === 'commandTargetLocated' || state === 'commandTargetProtected';
    for (let index = 0; index < this.collapseRings.length; index += 1) {
      this.collapseRings[index].visible = state === 'threatCollapse';
    }
  }

  appendWeaponTargets(output: WeaponTarget[]): void {
    if (!this.group.visible) return;
    if (this.state === 'commandTargetProtected') {
      for (let index = 0; index < this.nodeTargets.length; index += 1) {
        const target = this.nodeTargets[index];
        if (target.hostile && target.health > 0) output.push(target);
      }
    } else if (this.state === 'finalAssault' && this.coreTarget.health > 0) {
      output.push(this.coreTarget);
    }
  }

  nextDestroyedNode(saved: readonly boolean[]): number {
    for (let index = 0; index < this.nodeTargets.length; index += 1) {
      if (!saved[index] && this.nodeTargets[index].health <= 0) return index;
    }
    return -1;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible || !this.built) return;
    this.updateAccumulator += delta;
    if (this.updateAccumulator < mission25Tuning.visualUpdateInterval) return;
    const step = this.updateAccumulator;
    this.updateAccumulator = 0;
    this.shield.rotation.y += step * 0.22;
    this.core.rotation.y -= step * (this.state === 'finalAssault' ? 0.55 : 0.18);
    for (let index = 0; index < this.nodeVisuals.length; index += 1) {
      this.nodeVisuals[index].rotation.z += step * (index % 2 === 0 ? 0.3 : -0.24);
      const target = this.nodeTargets[index];
      const ratio = Math.max(0, Math.min(1, target.health / Math.max(1, mission25Tuning.nodeHealth)));
      const unstable = ratio < 0.45 ? 0.5 + Math.sin(elapsed * 12 + index * 2.3) * 0.5 : 1;
      this.nodeMaterials[index].emissiveIntensity = target.hostile
        ? (0.16 + ratio * 0.4) * unstable
        : 0.18;
    }
    if (this.coreMaterial && (this.state === 'finalAssault' || this.state === 'threatCollapse')) {
      const ratio = Math.max(0, Math.min(1, this.coreTarget.health / Math.max(1, this.coreMaximumHealth)));
      const criticalPulse = ratio < 0.3 ? 0.42 + Math.sin(elapsed * 16) * 0.36 : 1;
      this.coreMaterial.emissiveIntensity = (0.32 + ratio * 0.58) * criticalPulse;
    }
    if (this.state === 'threatCollapse') {
      for (let index = 0; index < this.collapseRings.length; index += 1) {
        const ring = this.collapseRings[index];
        const pulse = 0.35 + Math.sin(elapsed * (4 + index)) * 0.18;
        ring.scale.setScalar(1 + pulse * (0.2 + index * 0.08));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.28 + pulse * 0.22;
      }
    }
  }

  dispose(): void {
    if (!this.built) return;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Line;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.group.clear();
    this.nodeVisuals.length = 0;
    this.nodeTargets.length = 0;
    this.nodeProxies.length = 0;
    this.nodeMaterials.length = 0;
    this.core.clear();
    this.shield.clear();
    this.collapseRings.length = 0;
    this.coreTarget.health = 0;
    this.coreTarget.hostile = false;
    this.group.visible = false;
    this.state = 'inactive';
    this.previousState = 'inactive';
    this.built = false;
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x12151a, roughness: 0.62, metalness: 0.76 });
    const nodeGeometry = new THREE.OctahedronGeometry(12, 0);
    const nodeRing = new THREE.TorusGeometry(20, 1.5, 6, 28);
    for (let index = 0; index < NODE_OFFSETS.length; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x241419,
        emissive: 0xa82e29,
        emissiveIntensity: 0.18,
        roughness: 0.42,
        metalness: 0.68
      });
      const node = new THREE.Group();
      node.name = `Siege Protection Node ${index + 1}`;
      node.position.set(NODE_OFFSETS[index][0], NODE_OFFSETS[index][1], NODE_OFFSETS[index][2]);
      node.add(new THREE.Mesh(nodeGeometry, material));
      const ring = new THREE.Mesh(nodeRing, material);
      ring.rotation.x = Math.PI / 2;
      node.add(ring);
      this.nodeVisuals.push(node);
      this.nodeMaterials.push(material);
      const proxy = new THREE.Object3D();
      proxy.name = `Siege Protection Target ${index + 1}`;
      proxy.userData.combatSurface = 'shield';
      proxy.userData.combatMass = 'heavy';
      this.nodeProxies.push(proxy);
      this.nodeTargets.push({
        id: `coalition-siege-node-${index + 1}`,
        object: proxy,
        radius: 16,
        health: mission25Tuning.nodeHealth,
        hostile: false
      });
      this.group.add(node);
    }

    const spine = new THREE.Mesh(new THREE.BoxGeometry(102, 14, 26), hullMaterial);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(18, 104, 22), hullMaterial);
    vertical.rotation.z = 0.12;
    this.group.add(spine, vertical);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x201116,
      emissive: 0xe14d37,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.48
    });
    this.coreMaterial = coreMaterial;
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(17, 1), coreMaterial);
    this.core.add(coreMesh);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(29, 2, 7, 36), coreMaterial);
    coreRing.rotation.x = Math.PI / 2;
    this.core.add(coreRing);
    this.core.visible = false;
    this.group.add(this.core);

    const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0xa14343, transparent: true, opacity: 0.2, wireframe: true, depthWrite: false });
    const shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(82, 2), shieldMaterial);
    shieldMesh.scale.set(1.15, 0.8, 0.72);
    this.shield.add(shieldMesh);
    this.group.add(this.shield);

    for (let index = 0; index < 3; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xff654f : 0xb33736,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(46 + index * 16, 2.2, 6, 42), material);
      ring.rotation.set(Math.PI / 2 + index * 0.28, index * 0.34, index * 0.7);
      ring.visible = false;
      this.collapseRings.push(ring);
      this.group.add(ring);
    }
  }
}
