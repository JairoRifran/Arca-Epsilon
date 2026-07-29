import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * The signal fracture itself: a jagged scorched crack across the ground with
 * amber emissive seams that breathe while the fracture is torn open, plus a
 * faint vertical heat shimmer. Once the Signal Purge contains it, the seams
 * dim to a low residual glow and the shimmer fades — a scar that still points
 * somewhere, but no longer bleeds signal. Deterministic and cheap: a handful
 * of shared-material meshes, no per-frame allocations.
 */
export class SignalFractureEffect {
  readonly group = new THREE.Group();

  private readonly seamMaterial: THREE.MeshStandardMaterial;
  private readonly shimmerMaterial: THREE.SpriteMaterial;
  private readonly shimmer: THREE.Sprite;
  private readonly interferenceMaterial: THREE.LineBasicMaterial;
  private readonly interferenceLines: THREE.LineSegments;
  private readonly interferenceBase: Float32Array;
  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.PointsMaterial;
  private readonly moteSeeds: Float32Array;
  private readonly sparkMaterial: THREE.PointsMaterial;
  private readonly sparks: THREE.Points;
  private readonly sparkSeeds: Float32Array;
  private purgeProgress = 0;
  private contained = false;

  constructor() {
    this.group.name = 'Grieta de Señal';
    this.group.visible = false;

    // Scorched ground scar.
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(9, 26),
      new THREE.MeshStandardMaterial({ color: 0x1a1310, roughness: 0.98, metalness: 0 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.scale.set(1.7, 1, 0.7);
    scorch.position.y = 0.03;
    this.group.add(scorch);

    // Amber emissive seams: a jagged line of thin plates along the crack.
    this.seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a1408,
      emissive: 0xd97a3a,
      emissiveIntensity: 0.6,
      roughness: 0.55,
      metalness: 0.1
    });
    const seamOffsets: [number, number, number][] = [
      [-6.4, 0.06, 0.5],
      [-3.6, 0.07, -0.7],
      [-1.1, 0.08, 0.3],
      [1.4, 0.07, -0.4],
      [3.9, 0.06, 0.6],
      [6.2, 0.05, -0.3]
    ];
    for (const [x, y, z] of seamOffsets) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.42), this.seamMaterial);
      seam.position.set(x, y, z);
      seam.rotation.y = 0.18 + z * 0.12;
      this.group.add(seam);
    }

    // Two low rock lips flanking the crack.
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0x30281f, roughness: 0.95, metalness: 0.05 });
    for (const side of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(15, 0.7, 1.1), lipMaterial);
      lip.position.set(0, 0.3, side * 2.1);
      lip.rotation.y = 0.05 * side;
      this.group.add(lip);
    }

    // Faint vertical heat shimmer over the crack line.
    this.shimmerMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(96),
      color: 0xe0a06a,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.shimmer = new THREE.Sprite(this.shimmerMaterial);
    this.shimmer.position.y = 2.2;
    this.shimmer.scale.set(14, 3.6, 1);
    this.group.add(this.shimmer);

    // Fragmented interference lines: short broken strokes hanging in the air
    // above the crack, jittering on incommensurate cycles — a technological
    // anomaly partially resolving into visibility, never a magic portal.
    const lineCount = 12;
    this.interferenceBase = new Float32Array(lineCount * 6);
    for (let i = 0; i < lineCount; i += 1) {
      const x = -6.5 + (i / (lineCount - 1)) * 13 + Math.sin(i * 3.7) * 0.6;
      const y = 0.8 + ((i * 37) % 23) / 23 * 2.6;
      const z = Math.sin(i * 2.1) * 0.9;
      const length = 0.5 + ((i * 13) % 7) / 7 * 0.9;
      this.interferenceBase.set([x - length / 2, y, z, x + length / 2, y, z], i * 6);
    }
    const interferenceGeometry = new THREE.BufferGeometry();
    interferenceGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.interferenceBase.slice(), 3)
    );
    interferenceGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 12);
    this.interferenceMaterial = new THREE.LineBasicMaterial({
      color: 0xd9915a,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.interferenceLines = new THREE.LineSegments(interferenceGeometry, this.interferenceMaterial);
    this.group.add(this.interferenceLines);

    // Dark-amber motes drifting up out of the crack, pushed by the wind.
    const moteCount = 14;
    const motePositions = new Float32Array(moteCount * 3);
    this.moteSeeds = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i += 1) {
      this.moteSeeds[i * 3] = -6 + (i / (moteCount - 1)) * 12;
      this.moteSeeds[i * 3 + 1] = (i * 0.61803) % 1;
      this.moteSeeds[i * 3 + 2] = Math.sin(i * 1.9) * 0.8;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    moteGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 14);
    this.moteMaterial = new THREE.PointsMaterial({
      color: 0xb8703c,
      size: 0.34,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.motes = new THREE.Points(moteGeometry, this.moteMaterial);
    this.group.add(this.motes);

    // Contained discharges: three bright points that snap on for a fraction
    // of their staggered cycles — small, dangerous, never explosive.
    const sparkCount = 3;
    const sparkPositions = new Float32Array(sparkCount * 3);
    this.sparkSeeds = new Float32Array(sparkCount * 2);
    for (let i = 0; i < sparkCount; i += 1) {
      this.sparkSeeds[i * 2] = -4 + i * 4;
      this.sparkSeeds[i * 2 + 1] = i * 0.37;
      sparkPositions[i * 3 + 1] = -6;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 10);
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffc27d,
      size: 0.5,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.group.add(this.sparks);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  /** Purge feedback: interference dies down as the purge advances (0..1). */
  setPurgeProgress(fraction: number): void {
    this.purgeProgress = Math.min(1, Math.max(0, fraction));
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  restore(visible: boolean, contained: boolean): void {
    this.group.visible = visible;
    this.contained = contained;
    if (contained) this.purgeProgress = 1;
  }

  setContained(contained: boolean): void {
    this.contained = contained;
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;
    // Active fracture: restless amber breathing. Contained: a low, steady
    // residual glow with the shimmer nearly gone. The live purge scales the
    // whole disturbance down as it advances.
    const breathe = 0.5 + Math.abs(Math.sin(elapsed * 1.7) * Math.sin(elapsed * 0.9)) * 0.5;
    const activity = this.contained ? 0.12 : 1 - this.purgeProgress * 0.75;
    if (this.contained) {
      this.seamMaterial.emissiveIntensity = 0.12 + breathe * 0.05;
      this.shimmerMaterial.opacity = 0.03 + breathe * 0.015;
    } else {
      this.seamMaterial.emissiveIntensity = (0.5 + breathe * 0.35) * activity + 0.1;
      this.shimmerMaterial.opacity = (0.1 + breathe * 0.08) * activity;
      this.shimmer.scale.set(14 + breathe * 1.2, 3.6 + breathe * 0.5, 1);
    }

    // Fragmented interference: each stroke jitters vertically and flickers
    // as a group on an irregular beat; short random-looking dropouts come
    // from incommensurate sines, not RNG.
    const linePositions = this.interferenceLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineArray = linePositions.array as Float32Array;
    for (let i = 0; i < lineArray.length; i += 6) {
      const jitter = Math.sin(elapsed * 7.3 + i * 1.31) * Math.sin(elapsed * 2.9 + i) * 0.14 * activity;
      const drift = Math.sin(elapsed * 0.9 + i * 0.7) * 0.1;
      lineArray[i + 1] = this.interferenceBase[i + 1] + jitter + drift;
      lineArray[i + 4] = this.interferenceBase[i + 4] + jitter + drift;
    }
    linePositions.needsUpdate = true;
    const lineFlicker = 0.55 + Math.abs(Math.sin(elapsed * 5.7) * Math.sin(elapsed * 1.13)) * 0.45;
    this.interferenceMaterial.opacity = this.contained ? 0.03 : 0.16 * lineFlicker * activity;

    // Amber motes: rise out of the crack and lean with the wind gusts.
    const wind = Math.sin(elapsed * 0.5) * 0.6 + 0.9;
    const motePositions = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < motePositions.count; i += 1) {
      const cycle = (elapsed * 0.22 + this.moteSeeds[i * 3 + 1]) % 1;
      motePositions.setXYZ(
        i,
        this.moteSeeds[i * 3] + cycle * wind * 1.8,
        0.3 + cycle * 3.4,
        this.moteSeeds[i * 3 + 2] + Math.sin(elapsed * 1.3 + i) * 0.2
      );
    }
    motePositions.needsUpdate = true;
    this.moteMaterial.opacity = this.contained ? 0.05 : 0.28 * activity;

    // Discharges: brief bright snaps along the crack line.
    const sparkPositions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    let sparkVisible = false;
    for (let i = 0; i < sparkPositions.count; i += 1) {
      const cycle = (elapsed * 0.41 + this.sparkSeeds[i * 2 + 1]) % 1;
      if (cycle < 0.06 && !this.contained) {
        sparkVisible = true;
        sparkPositions.setXYZ(
          i,
          this.sparkSeeds[i * 2] + Math.sin(elapsed * 11 + i * 5) * 0.5,
          0.35 + (cycle / 0.06) * 0.8,
          Math.sin(i * 2.7) * 0.6
        );
      } else {
        sparkPositions.setY(i, -6);
      }
    }
    sparkPositions.needsUpdate = true;
    this.sparkMaterial.opacity = sparkVisible ? 0.65 * activity : 0;
  }
}
