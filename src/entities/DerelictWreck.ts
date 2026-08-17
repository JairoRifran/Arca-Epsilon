import * as THREE from 'three';
import { materialLibrary } from '../assets/materials';
import { createSoftParticleTexture } from '../assets/materials';

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(Math.abs(seed) * 1_000_003) ^ 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createTornPanelGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(3.2, 0.32, 2.2, 1, 1, 1);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    position.setXYZ(
      index,
      x * (z > 0 ? 0.72 : 1.08) + (y > 0 ? 0.16 : -0.08),
      y,
      z + (x > 0 ? 0.22 : -0.12)
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createWreckHullGeometry(
  stations: ReadonlyArray<readonly [radius: number, axial: number]>
): THREE.LatheGeometry {
  const profile = stations.map(([radius, axial]) => new THREE.Vector2(radius, axial));
  const geometry = new THREE.LatheGeometry(profile, 18);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Broken human cargo freighter: hull torn in two, drifting plates, cargo
 * pods, one surviving nav beacon and intermittent electrical sparks near
 * the tear so the wreck still feels recently alive.
 */
export class DerelictWreck {
  readonly group = new THREE.Group();

  private readonly beaconMaterial: THREE.MeshStandardMaterial;

  private readonly beaconLight: THREE.PointLight;

  private readonly sparkMaterial: THREE.PointsMaterial;

  private readonly sparks: THREE.Points;

  private sparkTimer = 0;

  private sparkLife = 0;

  private highlightEnergy = 0;

  private readonly plates: THREE.InstancedMesh;

  private readonly random: () => number;

  constructor(position: THREE.Vector3, scale = 1) {
    this.random = createSeededRandom(position.x * 0.17 + position.y * 0.31 + position.z * 0.73 + 41.9);
    this.group.name = 'Derelict Wreck';
    this.group.position.copy(position);
    this.group.scale.setScalar(scale);

    const hullMaterial = materialLibrary.wornMetal.clone();
    hullMaterial.color.setHex(0x59636b);
    const burntMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d1b19,
      metalness: 0.62,
      roughness: 0.88,
      emissive: 0x2b0e04,
      emissiveIntensity: 0.16
    });
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const plateScale = new THREE.Vector3();

    // Two halves of the freighter, torn and offset.
    const bow = new THREE.Mesh(createWreckHullGeometry([
      [0.35, -17], [4.8, -15.2], [7.2, -10], [8.25, -2], [8.6, 12], [7.9, 17]
    ]), hullMaterial);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.y = 0.2;
    bow.position.set(-16, 0, 0);
    this.group.add(bow);

    const stern = new THREE.Mesh(createWreckHullGeometry([
      [8.4, -13], [8.8, -8], [7.7, 3], [6.2, 9], [3.8, 12.5], [1.2, 13]
    ]), burntMaterial);
    stern.rotation.z = Math.PI / 2;
    stern.rotation.y = -0.3;
    stern.position.set(22, 4, 3);
    stern.rotation.x = 0.24;
    this.group.add(stern);

    // Exposed interior ribs at the tear.
    const ribMaterial = materialLibrary.darkMetal.clone();
    const ribs = new THREE.InstancedMesh(
      new THREE.TorusGeometry(7.6, 0.45, 6, 18, Math.PI * 1.3),
      ribMaterial,
      5
    );
    ribs.name = 'Wreck Exposed Structural Ribs';
    for (let i = 0; i < 5; i += 1) {
      euler.set(0, Math.PI / 2, this.random() * Math.PI);
      quaternion.setFromEuler(euler);
      matrix.compose(
        new THREE.Vector3(-2 + i * 2.2, 1 + (this.random() - 0.5) * 2, 1),
        quaternion,
        plateScale.setScalar(1)
      );
      ribs.setMatrixAt(i, matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.computeBoundingSphere();
    this.group.add(ribs);

    // Instanced field of torn hull plates and cargo fragments.
    const plateGeometry = createTornPanelGeometry();
    this.plates = new THREE.InstancedMesh(plateGeometry, materialLibrary.damagedPanel.clone(), 26);
    this.plates.name = 'Wreck Torn Hull Panels';
    for (let i = 0; i < 26; i += 1) {
      euler.set(this.random() * Math.PI, this.random() * Math.PI, this.random() * Math.PI);
      quaternion.setFromEuler(euler);
      const s = 0.42 + Math.pow(this.random(), 1.8) * 1.9;
      plateScale.set(s * (0.72 + this.random() * 0.75), s * (0.7 + this.random() * 0.5), s);
      matrix.compose(
        new THREE.Vector3((this.random() - 0.5) * 84, (this.random() - 0.5) * 38, (this.random() - 0.5) * 58),
        quaternion,
        plateScale
      );
      this.plates.setMatrixAt(i, matrix);
    }
    this.plates.instanceMatrix.needsUpdate = true;
    this.group.add(this.plates);

    const beamCount = 10;
    const beams = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6, 1),
      ribMaterial,
      beamCount
    );
    beams.name = 'Wreck Structural Beam Debris';
    for (let index = 0; index < beamCount; index += 1) {
      euler.set(this.random() * Math.PI, this.random() * Math.PI, this.random() * Math.PI);
      quaternion.setFromEuler(euler);
      const length = 0.55 + this.random() * 1.5;
      plateScale.set(0.7 + this.random() * 0.5, length, 0.7 + this.random() * 0.5);
      matrix.compose(
        new THREE.Vector3(2 + (this.random() - 0.5) * 62, (this.random() - 0.5) * 30, (this.random() - 0.5) * 44),
        quaternion,
        plateScale
      );
      beams.setMatrixAt(index, matrix);
    }
    beams.instanceMatrix.needsUpdate = true;
    beams.computeBoundingSphere();
    this.group.add(beams);

    // Cargo pods spilled from the hold.
    const cargoMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a5c30,
      metalness: 0.4,
      roughness: 0.7
    });
    const cargoPods = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1.75, 1.75, 5.2, 8, 1, false),
      cargoMaterial,
      6
    );
    cargoPods.name = 'Wreck Cargo Canister Debris';
    for (let i = 0; i < 6; i += 1) {
      euler.set(this.random() * Math.PI, this.random() * Math.PI, this.random() * Math.PI);
      quaternion.setFromEuler(euler);
      plateScale.setScalar(0.72 + this.random() * 0.55);
      matrix.compose(
        new THREE.Vector3(10 + (this.random() - 0.5) * 30, -6 + (this.random() - 0.5) * 18, (this.random() - 0.5) * 26),
        quaternion,
        plateScale
      );
      cargoPods.setMatrixAt(i, matrix);
    }
    cargoPods.instanceMatrix.needsUpdate = true;
    cargoPods.computeBoundingSphere();
    this.group.add(cargoPods);

    // Surviving nav beacon.
    this.beaconMaterial = materialLibrary.warningRed.clone();
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.beaconMaterial);
    beacon.position.set(-33, 8, 0);
    this.group.add(beacon);
    this.beaconLight = new THREE.PointLight(0xff3344, 0, 130, 1.8);
    this.beaconLight.position.copy(beacon.position);
    this.group.add(this.beaconLight);

    // Spark burst points near the tear, mostly dormant.
    const sparkCount = 26;
    const sparkPositions = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i += 1) {
      sparkPositions[i * 3] = (this.random() - 0.5) * 10;
      sparkPositions[i * 3 + 1] = (this.random() - 0.5) * 9;
      sparkPositions[i * 3 + 2] = (this.random() - 0.5) * 9;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffd9a0,
      size: 1.6,
      map: createSoftParticleTexture(48),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.sparks.position.set(2, 1, 1);
    this.group.add(this.sparks);

    this.group.rotation.set(0.12, 0.6, -0.08);
  }

  flashHighlight(): void {
    this.highlightEnergy = 1;
  }

  update(delta: number, elapsed: number): void {
    this.highlightEnergy = Math.max(0, this.highlightEnergy - delta * 0.6);

    // Slow double-blink beacon: blink, blink, long pause.
    const cycle = elapsed % 3.4;
    const blink = (cycle < 0.12 || (cycle > 0.36 && cycle < 0.48)) ? 1 : 0;
    this.beaconMaterial.emissiveIntensity = 0.25 + blink * 2.6 + this.highlightEnergy * 2;
    this.beaconLight.intensity = blink * 2.2;

    // Occasional spark burst.
    this.sparkTimer -= delta;
    if (this.sparkTimer <= 0) {
      this.sparkLife = 0.35;
      this.sparkTimer = 3.5 + this.random() * 7;
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= delta;
      const electricalFlicker = 0.48 + Math.sin(elapsed * 67.3 + this.sparkTimer * 5.1) * 0.22;
      this.sparkMaterial.opacity = Math.max(0, this.sparkLife / 0.35) * electricalFlicker;
      this.sparks.rotation.y += delta * 3;
    } else {
      this.sparkMaterial.opacity = 0;
    }

    this.group.rotation.y += delta * 0.008;
  }
}
