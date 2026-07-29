import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export class AtlasSeedArchive {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly archiveAssembly = new THREE.Group();
  private readonly coreMaterial: THREE.MeshStandardMaterial;
  private readonly glyphMaterial: THREE.MeshStandardMaterial;
  private readonly mistMaterial: THREE.PointsMaterial;
  private readonly crystalMaterial: THREE.MeshStandardMaterial;
  private readonly motes: THREE.Points;
  private readonly moteSeeds: Float32Array;
  private unlocked = false;
  private activated = false;

  constructor() {
    this.group.name = 'Fractura Atlas';
    this.group.visible = false;

    const darkStone = new THREE.MeshStandardMaterial({
      color: 0x202826,
      roughness: 0.96,
      metalness: 0.04
    });
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x6bbcad,
      emissive: 0x2b8f82,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.62,
      roughness: 0.25,
      metalness: 0.1
    });
    this.crystalMaterial = crystalMaterial;
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x334f4b,
      emissive: 0x1f6d62,
      emissiveIntensity: 0.04,
      roughness: 0.46,
      metalness: 0.42
    });
    this.glyphMaterial = new THREE.MeshStandardMaterial({
      color: 0x8ce0d0,
      emissive: 0x4fe0cf,
      emissiveIntensity: 0,
      roughness: 0.28,
      metalness: 0.38
    });

    const fractureFloor = new THREE.Group();
    fractureFloor.name = 'Fractura Atlas - grieta superficial';
    for (let i = 0; i < 9; i += 1) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(7 + (i % 3) * 2.4, 0.08, 1.1 + (i % 2) * 0.55), darkStone);
      slab.position.set(-18 + i * 4.7, 0.04, Math.sin(i * 1.4) * 2.4);
      slab.rotation.y = 0.18 + Math.sin(i) * 0.22;
      slab.rotation.z = Math.sin(i * 2.1) * 0.045;
      fractureFloor.add(slab);
    }
    this.group.add(fractureFloor);

    for (let i = 0; i < 14; i += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + (i % 4) * 0.18, 0), darkStone);
      const side = i % 2 === 0 ? -1 : 1;
      rock.position.set(-21 + i * 3.2, 0.18, side * (2.3 + (i % 5) * 0.34));
      rock.scale.y = 0.42 + (i % 3) * 0.1;
      rock.rotation.y = i * 0.71;
      this.group.add(rock);
    }

    for (let i = 0; i < 7; i += 1) {
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.18 + (i % 3) * 0.04, 0.9 + (i % 2) * 0.35, 5), crystalMaterial);
      crystal.position.set(-16 + i * 5.1, 0.42, (i % 2 === 0 ? -1 : 1) * (1.5 + (i % 3) * 0.28));
      crystal.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.16;
      this.group.add(crystal);
    }

    const archiveBase = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.9, 0.45, 7), darkStone);
    archiveBase.position.y = 0.24;
    this.archiveAssembly.add(archiveBase);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.82, 3.2, 6), this.coreMaterial);
    core.position.y = 1.96;
    this.archiveAssembly.add(core);
    for (let i = 0; i < 4; i += 1) {
      const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.65, 0.025), this.glyphMaterial);
      const angle = i * Math.PI / 2 + 0.32;
      glyph.position.set(Math.cos(angle) * 0.67, 1.95, Math.sin(angle) * 0.67);
      glyph.rotation.y = -angle + Math.PI / 2;
      this.archiveAssembly.add(glyph);
    }
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), this.coreMaterial);
    crown.position.y = 3.82;
    this.archiveAssembly.add(crown);
    this.archiveAssembly.visible = false;
    this.group.add(this.archiveAssembly);

    const moteCount = 28;
    const positions = new Float32Array(moteCount * 3);
    this.moteSeeds = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i += 1) {
      this.moteSeeds[i] = i / moteCount;
      positions[i * 3 + 1] = -6;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mistMaterial = new THREE.PointsMaterial({
      color: 0x8bd8ca,
      map: createSoftParticleTexture(32),
      size: 0.16,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.motes = new THREE.Points(moteGeometry, this.mistMaterial);
    this.group.add(this.motes);
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.25, z);
  }

  restore(fractureVisible: boolean, unlocked: boolean, activated: boolean): void {
    this.group.visible = fractureVisible;
    this.unlocked = unlocked;
    this.activated = activated;
    this.archiveAssembly.visible = unlocked || activated;
    this.coreMaterial.emissiveIntensity = activated ? 0.48 : unlocked ? 0.2 : 0.04;
    this.glyphMaterial.emissiveIntensity = activated ? 0.74 : unlocked ? 0.24 : 0;
    this.crystalMaterial.emissiveIntensity = activated ? 0.22 : fractureVisible ? 0.08 : 0;
  }

  unlock(): void {
    this.unlocked = true;
    this.archiveAssembly.visible = true;
  }

  activate(): void {
    this.unlock();
    this.activated = true;
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * 1.35) * 0.5;
    this.archiveAssembly.rotation.y = Math.sin(elapsed * 0.16) * 0.035;
    this.coreMaterial.emissiveIntensity = this.activated ? 0.38 + pulse * 0.16 : this.unlocked ? 0.14 + pulse * 0.08 : 0.04;
    this.glyphMaterial.emissiveIntensity = this.activated ? 0.62 + pulse * 0.16 : this.unlocked ? 0.2 + pulse * 0.05 : 0;
    this.crystalMaterial.emissiveIntensity = 0.08 + (this.activated ? pulse * 0.16 : 0);
    this.mistMaterial.opacity = this.activated ? 0.12 + pulse * 0.05 : this.unlocked ? 0.08 : 0.045;

    const attribute = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i += 1) {
      const seed = this.moteSeeds[i];
      const angle = seed * Math.PI * 2 + elapsed * (0.08 + seed * 0.04);
      const radius = 2.2 + Math.sin(elapsed * 0.4 + seed * 9) * 1.2;
      attribute.setXYZ(
        i,
        Math.cos(angle) * radius + Math.sin(seed * 37) * 7,
        0.22 + ((elapsed * 0.05 + seed) % 1) * 1.8,
        Math.sin(angle) * radius + Math.cos(seed * 31) * 2.8
      );
    }
    attribute.needsUpdate = true;
  }
}
