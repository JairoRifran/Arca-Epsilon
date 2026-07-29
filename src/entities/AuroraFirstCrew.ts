import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { auroraCrewDefinitions } from '../assets/mission12Definitions';

type CrewSlot = {
  /** Where this member ends up standing, world space. */
  home: THREE.Vector3;
  /** Where they step off the capsule, world space. */
  start: THREE.Vector3;
  /** Facing once settled. */
  yaw: number;
  /** Idle offsets so the three never move in lockstep. */
  phase: number;
  accent: THREE.Color;
};

const PART_COUNT = 3;

/**
 * The first three people on Aurora.
 *
 * Deliberately not an NPC system: three figures built from six shared
 * primitives — boots, torso, backpack, helmet, visor and a shoulder lamp —
 * each drawn as a 3-instance InstancedMesh, so the entire crew costs six
 * draw calls and has no AI, no pathfinding and no per-frame allocation.
 *
 * They do exactly two things. On disembark they walk a short line from the
 * capsule hatch to their post near the core (a timed lerp, not navigation),
 * and once there they idle: a slow breathing bob and an occasional slow head
 * turn to look around the valley. Roles read through the suit accent colour
 * rather than through different meshes.
 */
export class AuroraFirstCrew {
  readonly group = new THREE.Group();

  private readonly slots: CrewSlot[] = [];
  private readonly boots: THREE.InstancedMesh;
  private readonly torsos: THREE.InstancedMesh;
  private readonly packs: THREE.InstancedMesh;
  private readonly helmets: THREE.InstancedMesh;
  private readonly visors: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly walkFrom = new THREE.Vector3();
  private readonly lampMaterial: THREE.MeshStandardMaterial;
  private readonly visorMaterial: THREE.MeshStandardMaterial;
  /** 0 = at the capsule, 1 = at their posts. */
  private walkProgress = 1;
  private walking = false;

  constructor() {
    this.group.name = 'Primeros Habitantes Aurora';
    this.group.visible = false;

    const suit = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.72, metalness: 0.12 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6, metalness: 0.42 });
    this.visorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2430,
      emissive: 0x3d6d7a,
      emissiveIntensity: 0.16,
      roughness: 0.18,
      metalness: 0.6
    });
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f31,
      emissive: 0xffdca8,
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.3
    });

    // Human scale: ~1.8 m from boots to the top of the helmet.
    this.boots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.78, 0.34), gear, PART_COUNT);
    this.torsos = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.27, 0.52, 4, 8), suit, PART_COUNT);
    this.packs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.5, 0.22), gear, PART_COUNT);
    this.helmets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), suit, PART_COUNT);
    this.visors = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.225, 10, 8, -0.9, 1.8, 0.7, 1.1),
      this.visorMaterial,
      PART_COUNT
    );
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 5), this.lampMaterial, PART_COUNT);
    // Contact shadows so they stand on the ground rather than hover on it.
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 12),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(32),
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      }),
      PART_COUNT
    );
    for (const part of [this.shadows, this.boots, this.torsos, this.packs, this.helmets, this.visors, this.lamps]) {
      part.frustumCulled = false;
      this.group.add(part);
    }

    for (const definition of auroraCrewDefinitions) {
      this.slots.push({
        home: new THREE.Vector3(definition.position[0], 0, definition.position[1]),
        start: new THREE.Vector3(definition.position[0], 0, definition.position[1]),
        yaw: 0,
        phase: this.slots.length * 2.1,
        accent: new THREE.Color(definition.accent)
      });
    }
    // Per-role accent on the torso, via instance colour rather than three
    // separate materials.
    this.torsos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PART_COUNT * 3), 3);
    for (let i = 0; i < this.slots.length; i += 1) {
      this.torsos.setColorAt(i, this.slots[i].accent);
    }
    if (this.torsos.instanceColor) this.torsos.instanceColor.needsUpdate = true;
  }

  /**
   * Place the crew: each member's post plus the capsule hatch they step off
   * from. Called whenever the mission visuals resync.
   */
  setLayout(
    capsuleHatch: THREE.Vector3,
    getGroundHeight: (x: number, z: number) => number
  ): void {
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      slot.home.y = getGroundHeight(slot.home.x, slot.home.z);
      // Fan out slightly from the hatch so they do not overlap on exit.
      const spread = (i - 1) * 1.1;
      slot.start.set(capsuleHatch.x + spread, 0, capsuleHatch.z + 1.2);
      slot.start.y = getGroundHeight(slot.start.x, slot.start.z);
      // Settle facing the core, which is northwest of every post.
      slot.yaw = Math.atan2(120 - slot.home.x, -4160 - slot.home.z);
    }
    this.applyPose(0);
  }

  restore(visible: boolean, disembarked: boolean): void {
    this.group.visible = visible && disembarked;
    this.walking = false;
    this.walkProgress = disembarked ? 1 : 0;
    this.applyPose(0);
  }

  /** Starts the short walk from the hatch to their posts. */
  beginDisembark(): void {
    this.group.visible = true;
    this.walkProgress = 0;
    this.walking = true;
    this.applyPose(0);
  }

  get settled(): boolean {
    return this.walkProgress > 0.999;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    if (this.walking && this.walkProgress < 1) {
      // ~5 s to cross from the capsule to the posts.
      this.walkProgress = Math.min(1, this.walkProgress + delta / 5);
      if (this.walkProgress >= 1) this.walking = false;
    }
    this.applyPose(elapsed);
    const pulse = 0.5 + Math.sin(elapsed * 1.5) * 0.5;
    this.lampMaterial.emissiveIntensity = 0.32 + pulse * 0.16;
    this.visorMaterial.emissiveIntensity = 0.12 + pulse * 0.08;
  }

  private applyPose(elapsed: number): void {
    const eased = this.walkProgress * this.walkProgress * (3 - 2 * this.walkProgress);
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      // Stagger the three so they do not arrive as one block.
      const own = THREE.MathUtils.clamp((eased - i * 0.08) / 0.84, 0, 1);
      this.walkFrom.copy(slot.start).lerp(slot.home, own);
      const walking = own > 0.001 && own < 0.999;
      // Breathing bob while idle, a longer stride bounce while walking.
      const bob = walking
        ? Math.abs(Math.sin(elapsed * 5.2 + slot.phase)) * 0.05
        : Math.sin(elapsed * 0.9 + slot.phase) * 0.014;
      // Idle: a slow look around the valley every few seconds.
      const glance = Math.sin(elapsed * 0.23 + slot.phase) * 0.5 + Math.sin(elapsed * 0.11 + slot.phase * 1.7) * 0.28;
      const facing = walking
        ? Math.atan2(slot.home.x - slot.start.x, slot.home.z - slot.start.z)
        : slot.yaw + glance;
      const lean = walking ? Math.sin(elapsed * 5.2 + slot.phase) * 0.05 : 0;

      const baseY = this.walkFrom.y + bob;
      this.euler.set(lean, facing, 0);
      this.quat.setFromEuler(this.euler);

      // Shadow stays flat on the ground, unaffected by the bob.
      this.euler.set(-Math.PI / 2, 0, 0);
      this.matrix.compose(
        this.position.set(this.walkFrom.x, this.walkFrom.y + 0.03, this.walkFrom.z),
        this.quat.clone().setFromEuler(this.euler),
        this.scale.set(1, 1, 1)
      );
      this.shadows.setMatrixAt(i, this.matrix);
      this.euler.set(lean, facing, 0);
      this.quat.setFromEuler(this.euler);

      this.setPart(this.boots, i, this.walkFrom.x, baseY + 0.39, this.walkFrom.z);
      this.setPart(this.torsos, i, this.walkFrom.x, baseY + 1.13, this.walkFrom.z);
      this.setPart(
        this.packs,
        i,
        this.walkFrom.x - Math.sin(facing) * 0.3,
        baseY + 1.16,
        this.walkFrom.z - Math.cos(facing) * 0.3
      );
      this.setPart(this.helmets, i, this.walkFrom.x, baseY + 1.62, this.walkFrom.z);
      this.setPart(
        this.visors,
        i,
        this.walkFrom.x + Math.sin(facing) * 0.02,
        baseY + 1.62,
        this.walkFrom.z + Math.cos(facing) * 0.02
      );
      this.setPart(
        this.lamps,
        i,
        this.walkFrom.x + Math.sin(facing + 1.3) * 0.26,
        baseY + 1.42,
        this.walkFrom.z + Math.cos(facing + 1.3) * 0.26
      );
    }
    for (const part of [this.shadows, this.boots, this.torsos, this.packs, this.helmets, this.visors, this.lamps]) {
      part.instanceMatrix.needsUpdate = true;
    }
  }

  private setPart(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number): void {
    this.matrix.compose(this.position.set(x, y, z), this.quat, this.scale.set(1, 1, 1));
    mesh.setMatrixAt(index, this.matrix);
  }
}
