import * as THREE from 'three';
import { materialLibrary } from '../assets/materials';
import { createRockGeometry } from './AsteroidField';

export type RuinArchetype = 'ring' | 'cryo' | 'lighthouse' | 'monolith' | 'antenna' | 'vault';

/** Vertical strip of alien glyphs used as an emissive inscription band. */
function createGlyphTexture(hue: number): THREE.CanvasTexture {
  const width = 64;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create glyph texture.');
  }

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  const color = new THREE.Color().setHSL(hue, 0.85, 0.62);
  context.strokeStyle = `#${color.getHexString()}`;
  context.fillStyle = context.strokeStyle;
  context.lineWidth = 2;

  for (let y = 14; y < height - 14; y += 22) {
    if (Math.random() < 0.18) continue;
    const glyphWidth = 10 + Math.random() * 30;
    const x = (width - glyphWidth) / 2;
    if (Math.random() < 0.5) {
      context.strokeRect(x, y, glyphWidth, 10);
      if (Math.random() < 0.6) {
        context.fillRect(x + glyphWidth * 0.3, y + 3, glyphWidth * 0.4, 4);
      }
    } else {
      context.beginPath();
      context.moveTo(x, y + 10);
      context.lineTo(x + glyphWidth / 2, y);
      context.lineTo(x + glyphWidth, y + 10);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type FloatingPiece = {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  bobAmplitude: number;
  bobSpeed: number;
  spinSpeed: number;
  phase: number;
};

/**
 * Ancient structure factory. Every archetype shares the same living-idle
 * behaviour (floating slabs, pulsing inscriptions, orbiting fragments) but
 * composes a distinct silhouette so each discovery reads differently.
 */
export class AlienRuin {
  readonly group = new THREE.Group();

  private readonly floaters: FloatingPiece[] = [];

  private readonly pulseMaterials: THREE.MeshStandardMaterial[] = [];

  private readonly orbiters: THREE.Group[] = [];

  private beam?: THREE.Object3D;

  private highlightEnergy = 0;

  constructor(readonly archetype: RuinArchetype, position: THREE.Vector3, scale = 1) {
    this.group.name = `Alien Ruin (${archetype})`;
    this.group.position.copy(position);
    this.group.scale.setScalar(scale);

    switch (archetype) {
      case 'ring':
        this.buildBrokenRing();
        break;
      case 'cryo':
        this.buildCryoGarden();
        break;
      case 'lighthouse':
        this.buildLighthouse();
        break;
      case 'monolith':
        this.buildSilentMonolith();
        break;
      case 'antenna':
        this.buildAntennaField();
        break;
      case 'vault':
        this.buildCrystalVault();
        break;
    }
  }

  /** Called by the scanner when this site is discovered. */
  flashHighlight(): void {
    this.highlightEnergy = 1;
  }

  update(delta: number, elapsed: number): void {
    this.highlightEnergy = Math.max(0, this.highlightEnergy - delta * 0.6);

    for (const floater of this.floaters) {
      floater.object.position.y =
        floater.basePosition.y + Math.sin(elapsed * floater.bobSpeed + floater.phase) * floater.bobAmplitude;
      floater.object.rotation.y += delta * floater.spinSpeed;
    }

    const pulse = 0.55 + Math.sin(elapsed * 1.4) * 0.3 + this.highlightEnergy * 2.4;
    for (const material of this.pulseMaterials) {
      material.emissiveIntensity = pulse;
    }

    for (const orbiter of this.orbiters) {
      orbiter.rotation.y += delta * 0.09;
    }

    if (this.beam) {
      this.beam.rotation.y += delta * 0.5;
    }
  }

  private stoneMaterial(): THREE.MeshStandardMaterial {
    const material = materialLibrary.alienStone.clone();
    material.color.offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.05);
    return material;
  }

  private inscribedMaterial(hue: number): THREE.MeshStandardMaterial {
    const glyphs = createGlyphTexture(hue);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4c565c,
      metalness: 0.22,
      roughness: 0.72,
      emissive: new THREE.Color().setHSL(hue, 0.85, 0.5),
      emissiveMap: glyphs,
      emissiveIntensity: 0.8
    });
    this.pulseMaterials.push(material);
    return material;
  }

  private addFloater(object: THREE.Object3D, bobAmplitude = 1.6, bobSpeed = 0.5, spinSpeed = 0.08): void {
    this.floaters.push({
      object,
      basePosition: object.position.clone(),
      bobAmplitude,
      bobSpeed,
      spinSpeed,
      phase: Math.random() * Math.PI * 2
    });
  }

  private addOrbitingFragments(radius: number, count: number, size: number): void {
    const orbit = new THREE.Group();
    const material = this.stoneMaterial();
    for (let i = 0; i < count; i += 1) {
      const fragment = new THREE.Mesh(createRockGeometry(200 + Math.random() * 90, 1), material);
      const angle = (i / count) * Math.PI * 2;
      fragment.position.set(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * radius * 0.28,
        Math.sin(angle) * radius
      );
      fragment.scale.setScalar(size * (0.5 + Math.random()));
      fragment.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      orbit.add(fragment);
    }
    this.orbiters.push(orbit);
    this.group.add(orbit);
  }

  private addCoreLight(color: number, intensity = 2.2, range = 160): void {
    const light = new THREE.PointLight(color, intensity, range, 1.8);
    this.group.add(light);
  }

  private buildBrokenRing(): void {
    const stone = this.stoneMaterial();
    const inscribed = this.inscribedMaterial(0.52);

    // Weathered ancient asteroid clusters instead of primitive vertical columns or TorusGeometry rings.
    for (let i = 0; i < 8; i += 1) {
      const rock = new THREE.Mesh(createRockGeometry(35 + i * 17, 2), i % 2 === 0 ? inscribed : stone);
      rock.scale.set(6 + Math.random() * 4, 4 + Math.random() * 3, 5 + Math.random() * 4);
      const angle = (i / 8) * Math.PI * 2 + 0.3;
      rock.position.set(Math.cos(angle) * 38, (Math.random() - 0.5) * 14, Math.sin(angle) * 38);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(rock);
      this.addFloater(rock, 1.2, 0.35 + Math.random() * 0.3, 0.02);
    }

    // Free-floating weathered stone slabs drifting through the cluster interior.
    for (let i = 0; i < 5; i += 1) {
      const slab = new THREE.Mesh(createRockGeometry(12 + i * 9, 1), stone);
      slab.scale.set(7 + Math.random() * 5, 1.4, 5 + Math.random() * 4);
      slab.position.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 44);
      slab.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
      this.group.add(slab);
      this.addFloater(slab, 2.4, 0.4 + Math.random() * 0.4, 0.12);
    }

    this.addOrbitingFragments(54, 10, 1.5);
    this.addCoreLight(0x3fe8dc, 2.4, 220);
  }

  private buildCryoGarden(): void {
    const podGlass = new THREE.MeshPhysicalMaterial({
      color: 0x9fe8d9,
      emissive: 0x1b5c48,
      emissiveIntensity: 0.5,
      metalness: 0.08,
      roughness: 0.18,
      transparent: true,
      opacity: 0.5
    });
    const bioGlow = new THREE.MeshStandardMaterial({
      color: 0x2f7a4c,
      emissive: 0x3fca6e,
      emissiveIntensity: 0.9,
      roughness: 0.5
    });
    this.pulseMaterials.push(bioGlow);

    for (let i = 0; i < 7; i += 1) {
      const pod = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(3.4, 7.5, 8, 20), podGlass);
      pod.add(shell);

      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), bioGlow);
      plant.scale.y = 2.3;
      pod.add(plant);

      const angle = (i / 7) * Math.PI * 2;
      const radius = 14 + (i % 3) * 11;
      pod.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 18, Math.sin(angle) * radius);
      pod.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      this.group.add(pod);
      this.addFloater(pod, 1.8, 0.32 + Math.random() * 0.25, 0.05);
    }

    this.addOrbitingFragments(42, 8, 1.1);
    this.addCoreLight(0x51e39a, 2, 180);
  }

  private buildLighthouse(): void {
    const stone = this.stoneMaterial();
    const inscribed = this.inscribedMaterial(0.02);

    // Weathered floating asteroid cluster with a central warning core instead of primitive cylinders.
    const coreRock = new THREE.Mesh(createRockGeometry(180.5, 2), inscribed);
    coreRock.scale.set(12, 16, 12);
    this.group.add(coreRock);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 12), materialLibrary.warningRed.clone());
    this.pulseMaterials.push(lamp.material as THREE.MeshStandardMaterial);
    lamp.position.y = 12;
    this.group.add(lamp);

    const lampLight = new THREE.PointLight(0xff4a3a, 3.2, 320, 1.7);
    lampLight.position.y = 12;
    this.group.add(lampLight);

    this.addOrbitingFragments(38, 9, 1.4);
  }

  private buildSilentMonolith(): void {
    const stone = this.stoneMaterial();
    // Weathered dark rock cluster instead of vertical box column and TorusGeometry halo shards.
    const rock = new THREE.Mesh(createRockGeometry(211.3, 2), stone);
    rock.scale.set(14, 18, 14);
    this.group.add(rock);

    const coreLight = new THREE.PointLight(0x9fe8ff, 1.8, 180, 1.8);
    this.group.add(coreLight);
    this.addFloater(rock, 3.2, 0.22, 0.03);

    this.addCoreLight(0x86d8ff, 1.4, 150);
  }

  private buildAntennaField(): void {
    const worn = materialLibrary.wornMetal.clone();

    // Fallen human relay dish, half torn from its truss.
    const dish = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 10, 0, Math.PI * 2, 0, 0.8), worn);
    dish.rotation.x = Math.PI * 0.72;
    dish.position.set(0, 4, 0);
    this.group.add(dish);

    // Debris rocks instead of vertical primitive cylinder masts.
    for (let i = 0; i < 6; i += 1) {
      const rock = new THREE.Mesh(createRockGeometry(24 + i * 11, 1), worn);
      rock.scale.set(4 + Math.random() * 3, 3 + Math.random() * 2, 4 + Math.random() * 3);
      rock.position.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 44);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(rock);
    }

    for (let i = 0; i < 8; i += 1) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(5 + Math.random() * 6, 0.5, 3.5 + Math.random() * 4), worn);
      plate.position.set((Math.random() - 0.5) * 52, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 52);
      plate.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(plate);
      this.addFloater(plate, 1.5, 0.4 + Math.random() * 0.3, 0.2);
    }

    this.addCoreLight(0xff8a4a, 1.4, 130);
  }

  private buildCrystalVault(): void {
    const rock = new THREE.Mesh(createRockGeometry(313.7, 3), this.stoneMaterial());
    rock.scale.setScalar(24);
    this.group.add(rock);
    this.addFloater(rock, 1.4, 0.18, 0.015);

    const crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x7fc4ff,
      emissive: 0x2f7fd8,
      emissiveIntensity: 0.9,
      metalness: 0.1,
      roughness: 0.12,
      transparent: true,
      opacity: 0.82
    });

    for (let i = 0; i < 8; i += 1) {
      const shard = new THREE.Mesh(createRockGeometry(12 + i * 5, 1), crystalMaterial);
      shard.scale.set(3 + Math.random() * 2, 6 + Math.random() * 4, 3 + Math.random() * 2);
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      shard.position.copy(direction).multiplyScalar(21 + Math.random() * 4);
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(shard);
    }

    const glow = new THREE.MeshStandardMaterial({
      color: 0x9fd4ff,
      emissive: 0x64b4ff,
      emissiveIntensity: 1.1,
      roughness: 0.3
    });
    this.pulseMaterials.push(glow);
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 1), glow);
    this.group.add(heart);

    this.addOrbitingFragments(46, 10, 1.6);
    this.addCoreLight(0x6fb9ff, 2.6, 240);
  }
}
