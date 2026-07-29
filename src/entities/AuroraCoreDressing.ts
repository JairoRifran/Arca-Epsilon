import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

type GroundSampler = (x: number, z: number) => number;

/**
 * Blobs per path; three paths share one instanced mesh. Kept low on purpose:
 * these are large transparent decals and the clearing is the most fill-bound
 * view in the game, so coverage matters more here than instance count.
 */
const PATH_BLOBS = 6;
const PATH_COUNT = 3;
const MARKER_COUNT = 8;
const CRATE_COUNT = 5;
const STONE_COUNT = 14;
const MOTE_COUNT = 22;

/**
 * The lived-in layer of the Aurora core: the things that make the clearing
 * read as a place people work in rather than a patch of ground with hardware
 * dropped on it.
 *
 * Trodden paths between the stations, a compacted working apron, low
 * perimeter markers defining the safe zone, a few technical crates and a
 * supply rack, small stones pushed aside during installation, and a thin
 * band of fine dust hanging in the air over the clearing.
 *
 * Everything repeated is an InstancedMesh on a shared material and every
 * decal draws without depth writes, so the whole dressing costs about eight
 * draw calls. The group lives in world space (never offset) and stays hidden
 * until the first module is deployed.
 */
export class AuroraCoreDressing {
  readonly group = new THREE.Group();

  private readonly paths: THREE.InstancedMesh;
  private readonly apron: THREE.Mesh;
  private readonly apronGeometry: THREE.BufferGeometry;
  /** Flat local XZ template of the apron rim vertices, for terrain conforming. */
  private readonly apronTemplate: Float32Array;
  private readonly markerPosts: THREE.InstancedMesh;
  private readonly markerCaps: THREE.InstancedMesh;
  private readonly markerCapMaterial: THREE.MeshStandardMaterial;
  private readonly crates: THREE.InstancedMesh;
  private readonly rackBars: THREE.InstancedMesh;
  private readonly stones: THREE.InstancedMesh;
  private readonly motes: THREE.Points;
  private readonly moteSeeds: Float32Array;
  private readonly moteMaterial: THREE.PointsMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly scratch = new THREE.Vector3();
  /** Core anchor, so the airborne dust tracks the settlement. */
  private readonly center = new THREE.Vector3();
  private expansionActive = false;

  constructor() {
    this.group.name = 'Núcleo Aurora // asentamiento';
    this.group.visible = false;

    const softTexture = createSoftParticleTexture(64);

    // --- Ground work: compacted apron plus trodden paths ---
    // Sized to the hardware footprint rather than the whole clearing: a
    // wider disc buys almost no read and costs a lot of fill.
    // A flat 16 m disc seated at the core's centre height floats several metres
    // over sloped ground at its rim. Built instead as a ring-tessellated disc
    // whose vertices are pushed to the terrain in setLayout, so the apron hugs
    // the ground across its whole footprint. Local XZ, no rotation: the mesh
    // sits at the core and each vertex carries its own height.
    this.apronGeometry = createConformingDisc(16, 5, 20);
    this.apron = new THREE.Mesh(
      this.apronGeometry,
      new THREE.MeshBasicMaterial({
        map: softTexture,
        color: 0x968b6f,
        transparent: true,
        opacity: 0.26,
        depthWrite: false
      })
    );
    this.apron.frustumCulled = false;
    this.group.add(this.apron);
    // Cache each vertex's flat XZ so setLayout can sample terrain per vertex.
    const apronPos0 = this.apronGeometry.getAttribute('position') as THREE.BufferAttribute;
    this.apronTemplate = new Float32Array(apronPos0.count * 2);
    for (let i = 0; i < apronPos0.count; i += 1) {
      this.apronTemplate[i * 2] = apronPos0.getX(i);
      this.apronTemplate[i * 2 + 1] = apronPos0.getZ(i);
    }

    // Paths are chains of soft blobs so they follow the ground and curve,
    // instead of reading as a straight painted stripe.
    this.paths = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 8),
      new THREE.MeshBasicMaterial({
        map: softTexture,
        color: 0xa2977a,
        transparent: true,
        opacity: 0.36,
        depthWrite: false
      }),
      PATH_BLOBS * PATH_COUNT
    );
    this.group.add(this.paths);

    // --- Perimeter markers: low posts with a small warm cap ---
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5359, roughness: 0.66, metalness: 0.5 });
    this.markerCapMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f31,
      emissive: 0xffb877,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.3
    });
    this.markerPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.62, 5), postMaterial, MARKER_COUNT);
    this.markerCaps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), this.markerCapMaterial, MARKER_COUNT);
    this.group.add(this.markerPosts);
    this.group.add(this.markerCaps);

    // --- Technical crates and a low supply rack ---
    const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x7f7a6c, roughness: 0.78, metalness: 0.22 });
    this.crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.44, 0.5), crateMaterial, CRATE_COUNT);
    this.group.add(this.crates);
    this.rackBars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), postMaterial, 6);
    this.group.add(this.rackBars);

    // --- Small stones pushed aside during installation ---
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x6d6659, roughness: 0.95, metalness: 0.03 });
    this.stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), stoneMaterial, STONE_COUNT);
    this.group.add(this.stones);

    // --- Fine dust suspended over the working area ---
    const motePositions = new Float32Array(MOTE_COUNT * 3);
    this.moteSeeds = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      this.moteSeeds[i * 3] = ((i * 71) % 46) - 23;
      this.moteSeeds[i * 3 + 1] = (i * 0.618) % 1;
      this.moteSeeds[i * 3 + 2] = ((i * 113) % 46) - 23;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    moteGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.moteMaterial = new THREE.PointsMaterial({
      color: 0xe8dcc0,
      size: 0.28,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    });
    this.motes = new THREE.Points(moteGeometry, this.moteMaterial);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  /**
   * Lay the dressing out around the stations that currently exist. Called
   * whenever the mission visuals resync; positions are world-space and the
   * group itself is never moved.
   */
  setLayout(
    core: THREE.Vector3,
    secondModule: THREE.Vector3,
    waterFilter: THREE.Vector3,
    cultivationBed: THREE.Vector3,
    getGroundHeight: GroundSampler
  ): void {
    // Push every apron vertex to the terrain under it, so the disc hugs the
    // ground across its whole 16 m footprint rather than floating at the rim.
    this.apron.position.set(core.x, 0, core.z);
    const apronPos = this.apronGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < apronPos.count; i += 1) {
      const lx = this.apronTemplate[i * 2];
      const lz = this.apronTemplate[i * 2 + 1];
      apronPos.setY(i, getGroundHeight(core.x + lx, core.z + lz) + 0.06);
    }
    apronPos.needsUpdate = true;
    this.apronGeometry.computeBoundingSphere();

    // Three routes: core→second module, core→bed, core→water (the long walk
    // to the shore only appears once the filter is in).
    const routes: [THREE.Vector3, THREE.Vector3, boolean][] = [
      [core, secondModule, this.expansionActive],
      [core, cultivationBed, this.expansionActive],
      [core, waterFilter, this.expansionActive]
    ];
    let index = 0;
    for (let r = 0; r < PATH_COUNT; r += 1) {
      const [from, to, active] = routes[r];
      for (let b = 0; b < PATH_BLOBS; b += 1) {
        const t = (b + 0.5) / PATH_BLOBS;
        // A gentle lateral bow so the path is walked, not surveyed.
        const bow = Math.sin(t * Math.PI) * 2.2 * (r === 1 ? -1 : 1);
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz) || 1;
        const nx = -dz / length;
        const nz = dx / length;
        const x = from.x + dx * t + nx * bow;
        const z = from.z + dz * t + nz * bow;
        // Wider near the core where traffic converges, narrower further out.
        const width = active ? 1.8 - t * 0.7 : 0;
        this.matrix.makeRotationX(-Math.PI / 2);
        this.matrix.scale(this.scratch.set(width, width, 1));
        this.matrix.setPosition(x, getGroundHeight(x, z) + 0.04, z);
        this.paths.setMatrixAt(index, this.matrix);
        index += 1;
      }
    }
    this.paths.instanceMatrix.needsUpdate = true;

    // Perimeter markers on a ring around the working area.
    for (let i = 0; i < MARKER_COUNT; i += 1) {
      const angle = (i / MARKER_COUNT) * Math.PI * 2 + 0.35;
      const radius = 21;
      const x = core.x + Math.cos(angle) * radius;
      const z = core.z + Math.sin(angle) * radius;
      const groundY = getGroundHeight(x, z);
      this.matrix.identity();
      this.matrix.setPosition(x, groundY + 0.31, z);
      this.markerPosts.setMatrixAt(i, this.matrix);
      this.matrix.setPosition(x, groundY + 0.66, z);
      this.markerCaps.setMatrixAt(i, this.matrix);
    }
    this.markerPosts.instanceMatrix.needsUpdate = true;
    this.markerCaps.instanceMatrix.needsUpdate = true;

    // Crates stacked just off the core's access side.
    const crateSpots: [number, number, number, number][] = [
      [4.6, 2.4, 0, 0.4],
      [5.4, 3.1, 0, 0.9],
      [5.0, 2.75, 0.46, 0.6],
      [-3.2, 4.4, 0, 1.9],
      [6.2, -1.6, 0, 2.6]
    ];
    for (let i = 0; i < CRATE_COUNT; i += 1) {
      const [ox, oz, stackY, rotation] = crateSpots[i];
      const x = core.x + ox;
      const z = core.z + oz;
      this.matrix.makeRotationY(rotation);
      this.matrix.setPosition(x, getGroundHeight(x, z) + 0.22 + stackY, z);
      this.crates.setMatrixAt(i, this.matrix);
    }
    this.crates.instanceMatrix.needsUpdate = true;

    // Low rack: two uprights' worth of shelf bars beside the crates.
    for (let i = 0; i < 6; i += 1) {
      const shelf = Math.floor(i / 3);
      const x = core.x - 4.4;
      const z = core.z - 2.1 + (i % 3) * 0.34;
      this.matrix.makeRotationY(0.5);
      this.matrix.setPosition(x, getGroundHeight(x, z) + 0.3 + shelf * 0.36, z);
      this.rackBars.setMatrixAt(i, this.matrix);
    }
    this.rackBars.instanceMatrix.needsUpdate = true;

    // Stones cleared off the pads, ringing the working area.
    for (let i = 0; i < STONE_COUNT; i += 1) {
      const angle = i * 2.399963 + 0.7;
      const radius = 8 + ((i * 37) % 13);
      const x = core.x + Math.cos(angle) * radius;
      const z = core.z + Math.sin(angle) * radius;
      const scale = 0.6 + ((i * 17) % 7) / 9;
      this.matrix.makeRotationY(i * 1.1);
      this.matrix.scale(this.scratch.set(scale, scale * 0.55, scale));
      this.matrix.setPosition(x, getGroundHeight(x, z) + 0.05, z);
      this.stones.setMatrixAt(i, this.matrix);
    }
    this.stones.instanceMatrix.needsUpdate = true;

    this.center.set(core.x, getGroundHeight(core.x, core.z), core.z);
  }

  /**
   * `coreVisible` follows Aurora-01 existing; `expansionActive` follows the
   * M11 core, which is when the paths to the outlying stations appear.
   */
  restore(coreVisible: boolean, expansionActive: boolean): void {
    this.group.visible = coreVisible;
    this.expansionActive = expansionActive;
    this.crates.visible = coreVisible;
    this.rackBars.visible = expansionActive;
    this.markerPosts.visible = expansionActive;
    this.markerCaps.visible = expansionActive;
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;
    // Marker caps breathe together on a slow beat: a perimeter, not an alarm.
    this.markerCapMaterial.emissiveIntensity = 0.2 + (0.5 + Math.sin(elapsed * 0.8) * 0.5) * 0.18;

    const positions = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const cycle = (elapsed * 0.035 + this.moteSeeds[i * 3 + 1]) % 1;
      positions.setXYZ(
        i,
        this.center.x + this.moteSeeds[i * 3] + Math.sin(elapsed * 0.19 + i) * 3,
        this.center.y + 0.8 + cycle * 5.5,
        this.center.z + this.moteSeeds[i * 3 + 2] + Math.cos(elapsed * 0.15 + i * 1.3) * 2.6
      );
    }
    positions.needsUpdate = true;
  }
}


/**
 * A flat disc in the XZ plane (y = 0) built from concentric rings, so its
 * vertices can be pushed to the terrain and the disc hugs sloped ground instead
 * of floating at its rim. `rings` radial bands x `segments` around.
 */
function createConformingDisc(radius: number, rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let r = 1; r <= rings; r += 1) {
    const rad = (r / rings) * radius;
    for (let a = 0; a < segments; a += 1) {
      const ang = (a / segments) * Math.PI * 2;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      positions.push(x, 0, z);
      uvs.push(0.5 + (x / radius) * 0.5, 0.5 + (z / radius) * 0.5);
    }
  }
  const ringStart = (r: number) => 1 + (r - 1) * segments;
  // Inner fan: centre to first ring.
  for (let a = 0; a < segments; a += 1) {
    indices.push(0, 1 + a, 1 + ((a + 1) % segments));
  }
  // Between rings.
  for (let r = 1; r < rings; r += 1) {
    const a0 = ringStart(r);
    const a1 = ringStart(r + 1);
    for (let a = 0; a < segments; a += 1) {
      const n = (a + 1) % segments;
      indices.push(a0 + a, a1 + a, a1 + n);
      indices.push(a0 + a, a1 + n, a0 + n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

