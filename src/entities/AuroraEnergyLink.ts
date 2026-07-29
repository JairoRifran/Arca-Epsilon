import * as THREE from 'three';
import { sharedBasicMaterial } from '../assets/materialCache';
import { polymer, structuralMetal } from '../assets/auroraDetailKit';
import { createSoftParticleTexture } from '../assets/materials';

const CONDUIT_SEGMENTS = 8;

/**
 * The conduit joining Aurora-01 and Aurora-02: a low cable slung between a
 * row of short support posts, a coupling box at the midpoint where the pilot
 * makes the connection, and a handful of charge motes that only start moving
 * once the link is online. The cable follows the terrain so it reads as laid
 * on the ground rather than floating over it.
 *
 * Restrained on purpose — status lights, not neon. Built once and re-shaped
 * whenever the endpoints move, with no per-frame allocation.
 */
export class AuroraEnergyLink {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly cableSegments: THREE.Mesh[] = [];
  private readonly posts: THREE.Mesh[] = [];
  private readonly clamps: THREE.Mesh[] = [];
  /**
   * Insulator stacks under the clamps. One instanced mesh for the whole run
   * rather than a mesh per post: they are identical and never move apart.
   */
  private readonly insulators: THREE.InstancedMesh;
  private readonly insulatorMatrix = new THREE.Matrix4();
  private readonly insulatorScale = new THREE.Vector3(1, 1, 1);
  private readonly groundMarks: THREE.Mesh[] = [];
  private readonly endBoxes: THREE.Mesh[] = [];
  private readonly cableMaterial: THREE.MeshStandardMaterial;
  private readonly couplingMaterial: THREE.MeshStandardMaterial;
  private readonly coupling: THREE.Mesh;
  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.PointsMaterial;
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private progress = 0;

  constructor() {
    this.group.name = 'Enlace Energético Aurora';
    this.group.visible = false;

    const postMaterial = structuralMetal(0x3a4147);
    // Ceramic-look insulator between the clamp and the post head.
    const insulatorMaterial = polymer(0x6a6257);
    // One insulator per post (every other conduit segment carries a post).
    const postCount = Math.ceil(CONDUIT_SEGMENTS / 2);
    this.insulators = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.062, 0.075, 0.11, 8),
      insulatorMaterial,
      postCount
    );
    this.insulators.name = 'Aisladores Enlace Aurora';
    this.insulators.frustumCulled = false;
    this.group.add(this.insulators);
    this.cableMaterial = new THREE.MeshStandardMaterial({
      color: 0x24292c,
      emissive: 0x3f9fc4,
      emissiveIntensity: 0,
      roughness: 0.65,
      metalness: 0.35
    });
    this.couplingMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5258,
      emissive: 0x3f9fc4,
      emissiveIntensity: 0.08,
      roughness: 0.45,
      metalness: 0.58
    });

    // Cable built from short reusable segments, repositioned on setEndpoints.
    for (let i = 0; i < CONDUIT_SEGMENTS; i += 1) {
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 5), this.cableMaterial);
      this.cableSegments.push(segment);
      this.group.add(segment);
      if (i % 2 === 0) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.75, 5), postMaterial);
        this.posts.push(post);
        this.group.add(post);
        // Bracket holding the cable onto the post head.
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.17), postMaterial);
        this.clamps.push(clamp);
        this.group.add(clamp);
        // Soft dark patch where the post was driven into the soil. One shared
        // material for every mark instead of one per post.
        const mark = new THREE.Mesh(
          new THREE.CircleGeometry(0.4, 10),
          sharedBasicMaterial({
            map: createSoftParticleTexture(32),
            color: 0x000000,
            transparent: true,
            opacity: 0.26,
            depthWrite: false
          })
        );
        mark.rotation.x = -Math.PI / 2;
        this.groundMarks.push(mark);
        this.group.add(mark);
      }
    }

    // Physical junction boxes bolted at both module ends, so the conduit
    // terminates in hardware instead of vanishing into the hull.
    for (let i = 0; i < 2; i += 1) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.34), postMaterial);
      this.endBoxes.push(box);
      this.group.add(box);
    }

    // Coupling box at the midpoint: the interaction point.
    this.coupling = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.42), this.couplingMaterial);
    this.group.add(this.coupling);
    const couplingShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 12),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(48),
        color: 0x000000,
        transparent: true,
        opacity: 0.26,
        depthWrite: false
      })
    );
    couplingShadow.rotation.x = -Math.PI / 2;
    this.coupling.add(couplingShadow);
    couplingShadow.position.y = -0.24;

    // Charge motes travelling the cable once the link carries load.
    const positions = new Float32Array(6 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    this.moteMaterial = new THREE.PointsMaterial({
      color: 0x8fd4ef,
      size: 0.22,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.motes = new THREE.Points(geometry, this.moteMaterial);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  /**
   * Lay the conduit between the two modules, following the ground so each
   * segment sits on the terrain rather than spanning it.
   */
  setEndpoints(
    start: THREE.Vector3,
    end: THREE.Vector3,
    getGroundHeight: (x: number, z: number) => number
  ): void {
    this.start.copy(start);
    this.end.copy(end);
    let postIndex = 0;
    for (let i = 0; i < CONDUIT_SEGMENTS; i += 1) {
      const t0 = i / CONDUIT_SEGMENTS;
      const t1 = (i + 1) / CONDUIT_SEGMENTS;
      const x0 = THREE.MathUtils.lerp(start.x, end.x, t0);
      const z0 = THREE.MathUtils.lerp(start.z, end.z, t0);
      const x1 = THREE.MathUtils.lerp(start.x, end.x, t1);
      const z1 = THREE.MathUtils.lerp(start.z, end.z, t1);
      const y0 = getGroundHeight(x0, z0) + 0.42;
      const y1 = getGroundHeight(x1, z1) + 0.42;
      const segment = this.cableSegments[i];
      segment.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      segment.scale.y = Math.max(0.001, length);
      // Point the cylinder's local +Y along the segment.
      segment.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()
      );
      if (i % 2 === 0 && this.posts[postIndex]) {
        const groundY = getGroundHeight(x0, z0);
        this.posts[postIndex].position.set(x0, groundY + 0.36, z0);
        // Insulator sits between the post head and the clamp.
        this.insulatorMatrix.identity();
        this.insulatorMatrix.scale(this.insulatorScale);
        this.insulatorMatrix.setPosition(x0, groundY + 0.66, z0);
        this.insulators.setMatrixAt(postIndex, this.insulatorMatrix);
        this.insulators.instanceMatrix.needsUpdate = true;
        this.clamps[postIndex]?.position.set(x0, groundY + 0.74, z0);
        this.groundMarks[postIndex]?.position.set(x0, groundY + 0.03, z0);
        postIndex += 1;
      }
    }

    // Junction boxes sit just inboard of each endpoint, at cable height.
    const inset = 0.12;
    for (let i = 0; i < this.endBoxes.length; i += 1) {
      const t = i === 0 ? inset : 1 - inset;
      const bx = THREE.MathUtils.lerp(start.x, end.x, t);
      const bz = THREE.MathUtils.lerp(start.z, end.z, t);
      this.endBoxes[i].position.set(bx, getGroundHeight(bx, bz) + 0.5, bz);
      this.endBoxes[i].rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    }
    const mx = (start.x + end.x) / 2;
    const mz = (start.z + end.z) / 2;
    this.coupling.position.set(mx, getGroundHeight(mx, mz) + 0.55, mz);
    this.interactionPosition.set(mx, this.coupling.position.y, mz);
  }

  restore(visible: boolean, progressPercent: number): void {
    this.group.visible = visible;
    this.progress = Math.min(1, Math.max(0, progressPercent / 100));
    this.applyProgress(this.progress);
  }

  update(elapsed: number, progressPercent: number): void {
    if (!this.group.visible) return;
    this.progress = Math.min(1, Math.max(0, progressPercent / 100));
    this.applyProgress(this.progress);

    // Motes only travel once the handshake has actually carried charge.
    const positions = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const t = (elapsed * 0.22 + i / positions.count) % 1;
      positions.setXYZ(
        i,
        THREE.MathUtils.lerp(this.start.x, this.end.x, t),
        THREE.MathUtils.lerp(this.start.y, this.end.y, t) + 0.62,
        THREE.MathUtils.lerp(this.start.z, this.end.z, t)
      );
    }
    positions.needsUpdate = true;
    const pulse = 0.5 + Math.sin(elapsed * 1.8) * 0.5;
    this.moteMaterial.opacity = this.progress >= 1 ? 0.34 + pulse * 0.14 : this.progress * 0.2;
    this.cableMaterial.emissiveIntensity =
      this.progress >= 1 ? 0.24 + pulse * 0.1 : this.progress * 0.18;
    this.couplingMaterial.emissiveIntensity =
      this.progress >= 1 ? 0.42 + pulse * 0.16 : 0.08 + this.progress * 0.2;
  }

  private applyProgress(value: number): void {
    this.cableMaterial.emissiveIntensity = value >= 1 ? 0.28 : value * 0.18;
    this.couplingMaterial.emissiveIntensity = value >= 1 ? 0.5 : 0.08 + value * 0.2;
    this.moteMaterial.opacity = value >= 1 ? 0.38 : value * 0.2;
  }
}
