import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

const COLOR_POWER_OFF = new THREE.Color(0x171d1f);
const COLOR_POWER_AMBER = new THREE.Color(0xf0a65a);
const COLOR_POWER_CYAN = new THREE.Color(0x64cbe8);
const COLOR_POWER_GREEN = new THREE.Color(0x74d9b0);
const COLOR_HEAT_DARK = new THREE.Color(0x2d3033);
const COLOR_HEAT_HOT = new THREE.Color(0xc56b3d);
const COLOR_HEAT_WARM = new THREE.Color(0x55413a);

// PBR/material animation does not need to run at the renderer frame rate.
const POWER_VISUAL_UPDATE_INTERVAL = 1 / 20;

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash(value: number, seed: number): number {
  return fract(Math.sin(value * 127.1 + seed * 311.7) * 43758.5453123);
}

function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  };
}

function createCanvas(size: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Aurora-02 canvas texture.');
  return { canvas, context };
}

type TextureSet = {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
};

function createIndustrialTextureSet(seed: number, size = 128): TextureSet {
  const random = createSeededRandom(seed);
  const colorCanvas = createCanvas(size);
  const bumpCanvas = createCanvas(size);
  const roughCanvas = createCanvas(size);

  const color = colorCanvas.context;
  const bump = bumpCanvas.context;
  const rough = roughCanvas.context;

  color.fillStyle = '#a6a79f';
  color.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);
  rough.fillStyle = '#b9b9b9';
  rough.fillRect(0, 0, size, size);

  // Large manufactured panels.
  const panelCount = 4;
  for (let py = 0; py < panelCount; py += 1) {
    for (let px = 0; px < panelCount; px += 1) {
      const x = px * (size / panelCount);
      const y = py * (size / panelCount);
      const w = size / panelCount;
      const h = size / panelCount;
      const tone = Math.floor(148 + random() * 22);
      color.fillStyle = `rgb(${tone},${tone + 1},${Math.max(0, tone - 6)})`;
      color.fillRect(x + 3, y + 3, w - 6, h - 6);

      bump.strokeStyle = '#676767';
      bump.lineWidth = 3;
      bump.strokeRect(x + 3, y + 3, w - 6, h - 6);

      rough.fillStyle = `rgb(${170 + Math.floor(random() * 42)},${170 + Math.floor(random() * 42)},${170 + Math.floor(random() * 42)})`;
      rough.fillRect(x + 4, y + 4, w - 8, h - 8);

      for (const [cx, cy] of [
        [x + 8, y + 8],
        [x + w - 8, y + 8],
        [x + 8, y + h - 8],
        [x + w - 8, y + h - 8]
      ]) {
        color.fillStyle = '#555d5d';
        color.beginPath();
        color.arc(cx, cy, 2.2, 0, Math.PI * 2);
        color.fill();
        bump.fillStyle = '#4b4b4b';
        bump.beginPath();
        bump.arc(cx, cy, 2.5, 0, Math.PI * 2);
        bump.fill();
      }
    }
  }

  // Fine abrasion, vertical grime and dust accumulation.
  for (let i = 0; i < 320; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = 0.015 + random() * 0.055;
    const dark = 30 + Math.floor(random() * 42);
    color.fillStyle = `rgba(${dark},${dark + 5},${dark + 4},${alpha})`;
    color.fillRect(x, y, 0.5 + random() * 2.2, 0.5 + random() * 2.2);

    rough.fillStyle = `rgba(70,70,70,${0.04 + random() * 0.08})`;
    rough.fillRect(x, y, 1 + random() * 3, 1 + random() * 3);
  }

  for (let i = 0; i < 12; i += 1) {
    const x = random() * size;
    const y = random() * size * 0.78;
    const length = 12 + random() * 52;
    const gradient = color.createLinearGradient(x, y, x, y + length);
    gradient.addColorStop(0, 'rgba(45,52,51,0.15)');
    gradient.addColorStop(1, 'rgba(45,52,51,0)');
    color.fillStyle = gradient;
    color.fillRect(x, y, 1 + random() * 4, length);
  }

  const map = new THREE.CanvasTexture(colorCanvas.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1.4);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas.canvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.copy(map.repeat);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas.canvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, bumpMap, roughnessMap };
}

function createSolarTextureSet(seed: number, size = 128): TextureSet {
  const random = createSeededRandom(seed);
  const colorCanvas = createCanvas(size);
  const bumpCanvas = createCanvas(size);
  const roughCanvas = createCanvas(size);
  const color = colorCanvas.context;
  const bump = bumpCanvas.context;
  const rough = roughCanvas.context;

  const gradient = color.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#091d31');
  gradient.addColorStop(0.45, '#123c62');
  gradient.addColorStop(1, '#081725');
  color.fillStyle = gradient;
  color.fillRect(0, 0, size, size);

  bump.fillStyle = '#727272';
  bump.fillRect(0, 0, size, size);
  rough.fillStyle = '#565656';
  rough.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW;
      const y = row * cellH;
      const light = 24 + Math.floor(random() * 20);
      color.fillStyle = `rgb(${8 + Math.floor(random() * 5)},${light + 16},${light + 38})`;
      color.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

      color.strokeStyle = 'rgba(120,190,220,0.48)';
      color.lineWidth = 1;
      color.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

      bump.strokeStyle = '#484848';
      bump.lineWidth = 2;
      bump.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

      for (let bus = 1; bus < 3; bus += 1) {
        const bx = x + (cellW * bus) / 3;
        color.strokeStyle = 'rgba(170,215,225,0.32)';
        color.beginPath();
        color.moveTo(bx, y + 4);
        color.lineTo(bx, y + cellH - 4);
        color.stroke();
      }
    }
  }

  // Dust and minor cell wear.
  for (let i = 0; i < 72; i += 1) {
    const x = random() * size;
    const y = random() * size;
    color.fillStyle = `rgba(170,150,108,${0.015 + random() * 0.035})`;
    color.beginPath();
    color.arc(x, y, 0.5 + random() * 2.3, 0, Math.PI * 2);
    color.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas.canvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas.canvas);
  return { map, bumpMap, roughnessMap };
}

function createGroundImprintTexture(seed: number, size = 128): THREE.CanvasTexture {
  const random = createSeededRandom(seed);
  const { canvas, context } = createCanvas(size);
  context.clearRect(0, 0, size, size);

  const center = size * 0.5;
  const radial = context.createRadialGradient(center, center, size * 0.08, center, center, size * 0.49);
  radial.addColorStop(0, 'rgba(40,32,22,0.64)');
  radial.addColorStop(0.42, 'rgba(77,61,42,0.40)');
  radial.addColorStop(0.78, 'rgba(125,104,72,0.16)');
  radial.addColorStop(1, 'rgba(125,104,72,0)');
  context.fillStyle = radial;
  context.fillRect(0, 0, size, size);

  context.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 32; i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = size * (0.2 + random() * 0.29);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    context.fillStyle = `rgba(0,0,0,${0.15 + random() * 0.38})`;
    context.beginPath();
    context.ellipse(x, y, 4 + random() * 18, 2 + random() * 8, angle, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';

  // Displaced soil streaks radiating from the anchors.
  for (let i = 0; i < 24; i += 1) {
    const angle = random() * Math.PI * 2;
    const start = size * (0.18 + random() * 0.18);
    const length = size * (0.08 + random() * 0.16);
    context.strokeStyle = `rgba(158,136,96,${0.06 + random() * 0.12})`;
    context.lineWidth = 1 + random() * 4;
    context.beginPath();
    context.moveTo(center + Math.cos(angle) * start, center + Math.sin(angle) * start);
    context.lineTo(center + Math.cos(angle) * (start + length), center + Math.sin(angle) * (start + length));
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelTexture(): THREE.CanvasTexture {
  const { canvas, context } = createCanvas(512);
  context.clearRect(0, 0, 512, 512);
  context.fillStyle = 'rgba(15,20,21,0.92)';
  context.fillRect(34, 176, 444, 160);
  context.strokeStyle = '#85908b';
  context.lineWidth = 8;
  context.strokeRect(34, 176, 444, 160);
  context.fillStyle = '#c9d2cb';
  context.font = '700 58px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('AURORA-02', 256, 236);
  context.font = '500 27px sans-serif';
  context.fillStyle = '#78c8d9';
  context.fillText('ENERGY · ENVIRONMENT', 256, 294);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTube(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
  const geometry = new THREE.TubeGeometry(curve, 12, radius, 5, false);
  return new THREE.Mesh(geometry, material);
}

function createChamferedChassisGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  // A low-cost authored hard-surface silhouette: central box plus sloped side
  // profile generated as an extruded octagonal shape.
  const bevel = Math.min(width, depth) * 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5 + bevel, -height * 0.5);
  shape.lineTo(width * 0.5 - bevel, -height * 0.5);
  shape.lineTo(width * 0.5, -height * 0.5 + bevel);
  shape.lineTo(width * 0.5, height * 0.5 - bevel);
  shape.lineTo(width * 0.5 - bevel, height * 0.5);
  shape.lineTo(-width * 0.5 + bevel, height * 0.5);
  shape.lineTo(-width * 0.5, height * 0.5 - bevel);
  shape.lineTo(-width * 0.5, -height * 0.5 + bevel);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    curveSegments: 1
  });
  geometry.center();
  return geometry;
}

type SolarAssembly = {
  root: THREE.Group;
  outerPivot: THREE.Group;
  innerPivot: THREE.Group;
  latchMaterial: THREE.MeshStandardMaterial;
  side: number;
};

type LandingLeg = {
  root: THREE.Group;
  upper: THREE.Mesh;
  piston: THREE.Mesh;
  foot: THREE.Group;
  angle: number;
};

/**
 * Módulo Aurora-02 — premium visual pass, optimized for runtime.
 *
 * The public API remains compatible with the existing mission code. The module
 * is still a compact energy/environment plant, but its structure now deploys
 * as a connected machine: articulated landing anchors, a manufactured chassis,
 * detailed battery and thermal banks, hinged photovoltaic wings, animated
 * intake, service hoses, antenna, terrain imprint and staged power feedback.
 *
 * Optimization pass: selective shadows, cheaper solar/dust materials, reduced
 * procedural texture resolution, fewer transparent particles, hidden inactive
 * VFX, 20 Hz material animation and frozen static local transforms.
 */
export class AuroraSecondModule {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly body = new THREE.Group();
  private readonly panels: SolarAssembly[] = [];
  private readonly legs: LandingLeg[] = [];
  private readonly chassis: THREE.Mesh;

  private readonly batteryHousingMaterial: THREE.MeshStandardMaterial;
  private readonly batteryIndicatorMaterial: THREE.MeshStandardMaterial;
  private readonly sinkMaterial: THREE.MeshStandardMaterial;
  private readonly heatCoreMaterial: THREE.MeshStandardMaterial;
  private readonly statusMaterial: THREE.MeshStandardMaterial;
  private readonly accessLightMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly dustSkirtMaterial: THREE.MeshBasicMaterial;
  private readonly dustSkirt: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly intakeFan: THREE.Group;
  private readonly antennaMast: THREE.Group;
  private readonly antennaLightMaterial: THREE.MeshStandardMaterial;

  private readonly coarseDust: THREE.Points;
  private readonly fineDust: THREE.Points;
  private readonly coarseDustMaterial: THREE.PointsMaterial;
  private readonly fineDustMaterial: THREE.PointsMaterial;
  private readonly coarseDustVelocities: Float32Array;
  private readonly fineDustVelocities: Float32Array;

  private deployProgress = 0;
  private powerLevel = 0;
  private thermalLevel = 0;
  private dustLife = 0;
  private dustTriggered = false;
  private visualUpdateAccumulator = 0;
  private readonly seed: number;

  constructor(seed = 620.4) {
    this.seed = seed;
    const random = createSeededRandom(seed);
    this.group.name = 'Módulo Aurora-02';
    this.group.visible = false;
    this.body.name = 'Aurora-02 Articulated Body';
    this.group.add(this.body);

    const industrial = createIndustrialTextureSet(seed + 1.3);
    const solar = createSolarTextureSet(seed + 10.7);
    const shadowTexture = createSoftParticleTexture(64);
    const groundTexture = createGroundImprintTexture(seed + 22.6);
    const labelTexture = createLabelTexture();

    const shell = new THREE.MeshStandardMaterial({
      color: 0xb5b7af,
      map: industrial.map,
      bumpMap: industrial.bumpMap,
      bumpScale: 0.035,
      roughnessMap: industrial.roughnessMap,
      roughness: 0.72,
      metalness: 0.26,
      envMapIntensity: 0.72
    });
    const shellDark = new THREE.MeshStandardMaterial({
      color: 0x4a5052,
      map: industrial.map,
      bumpMap: industrial.bumpMap,
      bumpScale: 0.025,
      roughnessMap: industrial.roughnessMap,
      roughness: 0.67,
      metalness: 0.48,
      envMapIntensity: 0.68
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x292f32,
      roughness: 0.48,
      metalness: 0.78,
      envMapIntensity: 0.78
    });
    const blackMetal = new THREE.MeshStandardMaterial({
      color: 0x101416,
      roughness: 0.58,
      metalness: 0.68
    });
    const ceramic = new THREE.MeshStandardMaterial({
      color: 0x777c78,
      roughness: 0.86,
      metalness: 0.08
    });
    const hoseMaterial = new THREE.MeshStandardMaterial({
      color: 0x20282b,
      roughness: 0.78,
      metalness: 0.22
    });
    const copperMaterial = new THREE.MeshStandardMaterial({
      color: 0x8f583a,
      roughness: 0.46,
      metalness: 0.76
    });
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: 0x776b53,
      roughness: 1,
      metalness: 0
    });

    this.batteryHousingMaterial = new THREE.MeshStandardMaterial({
      color: 0x252b2e,
      roughness: 0.48,
      metalness: 0.58,
      envMapIntensity: 0.58
    });
    this.batteryIndicatorMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_POWER_OFF,
      emissive: COLOR_POWER_CYAN,
      emissiveIntensity: 0,
      roughness: 0.28,
      metalness: 0.22
    });
    this.sinkMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_HEAT_DARK,
      roughness: 0.54,
      metalness: 0.7,
      envMapIntensity: 0.67
    });
    this.heatCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x292827,
      emissive: COLOR_HEAT_HOT,
      emissiveIntensity: 0,
      roughness: 0.46,
      metalness: 0.72
    });
    this.statusMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_POWER_OFF,
      emissive: COLOR_POWER_GREEN,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.25
    });
    this.accessLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1f20,
      emissive: COLOR_POWER_AMBER,
      emissiveIntensity: 0,
      roughness: 0.24,
      metalness: 0.2
    });
    this.antennaLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x172023,
      emissive: 0x7fd7ed,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.2
    });

    // --- Terrain integration stays planted while the machine deploys.
    const groundImprint = new THREE.Mesh(
      new THREE.PlaneGeometry(7.7, 7.7),
      new THREE.MeshBasicMaterial({
        map: groundTexture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    groundImprint.rotation.x = -Math.PI / 2;
    groundImprint.position.y = 0.018;
    groundImprint.name = 'Aurora-02 Irregular Ground Imprint';
    this.group.add(groundImprint);

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 3.8),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        color: 0x000000,
        transparent: true,
        opacity: 0.36,
        depthWrite: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.025;
    contactShadow.scale.set(1, 0.74, 1);
    this.group.add(contactShadow);

    this.dustSkirtMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b7f63,
      transparent: true,
      opacity: 0.22,
      alphaMap: groundTexture,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 3.55, 32),
      this.dustSkirtMaterial
    );
    this.dustSkirt.rotation.x = -Math.PI / 2;
    this.dustSkirt.position.y = 0.035;
    this.group.add(this.dustSkirt);

    // Small displaced stones around the installation, instanced.
    const stoneGeometry = new THREE.DodecahedronGeometry(0.13, 0);
    const stones = new THREE.InstancedMesh(stoneGeometry, soilMaterial, 12);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let i = 0; i < 12; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 2.0 + random() * 1.65;
      euler.set(random() * 0.4, random() * Math.PI, random() * 0.4);
      quaternion.setFromEuler(euler);
      const s = 0.45 + random() * 0.9;
      scale.set(s * (0.8 + random() * 0.5), s * (0.45 + random() * 0.38), s);
      matrix.compose(
        new THREE.Vector3(Math.cos(angle) * radius, 0.075, Math.sin(angle) * radius),
        quaternion,
        scale
      );
      stones.setMatrixAt(i, matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    stones.castShadow = false;
    stones.receiveShadow = false;
    this.group.add(stones);

    // --- Articulated landing anchors.
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      const root = new THREE.Group();
      root.name = `Aurora Landing Anchor ${i + 1}`;
      root.rotation.y = -angle;
      this.group.add(root);

      const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 12), darkMetal);
      joint.rotation.z = Math.PI / 2;
      root.add(joint);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 0.28), darkMetal);
      upper.position.y = -0.48;
      upper.rotation.z = -0.24;
      root.add(upper);

      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.82, 10), ceramic);
      piston.position.set(0.15, -0.92, 0);
      piston.rotation.z = -0.24;
      root.add(piston);

      const foot = new THREE.Group();
      const footPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.14, 12), darkMetal);
      footPlate.position.y = 0.07;
      foot.add(footPlate);
      const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.06, 12), ceramic);
      footPad.position.y = -0.02;
      foot.add(footPad);
      for (let spike = 0; spike < 3; spike += 1) {
        const spikeAngle = (spike / 3) * Math.PI * 2;
        const anchorSpike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.25, 7), blackMetal);
        anchorSpike.position.set(Math.cos(spikeAngle) * 0.31, -0.16, Math.sin(spikeAngle) * 0.31);
        anchorSpike.rotation.z = Math.PI;
        foot.add(anchorSpike);
      }
      root.add(foot);

      this.legs.push({ root, upper, piston, foot, angle });
    }

    // Small compressed soil pads under each anchor.
    const moundGeometry = new THREE.CylinderGeometry(0.42, 0.58, 0.09, 12);
    const mounds = new THREE.InstancedMesh(moundGeometry, soilMaterial, 4);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      matrix.identity();
      matrix.setPosition(Math.cos(angle) * 1.85, 0.04, Math.sin(angle) * 1.85);
      mounds.setMatrixAt(i, matrix);
    }
    mounds.instanceMatrix.needsUpdate = true;
    mounds.receiveShadow = false;
    this.group.add(mounds);

    // --- Main body / manufactured chassis.
    this.chassis = new THREE.Mesh(createChamferedChassisGeometry(3.6, 1.28, 2.35), shell);
    this.chassis.name = 'Aurora-02 Pressure And Power Chassis';
    this.chassis.position.y = 1.28;
    this.body.add(this.chassis);

    const lowerFrame = new THREE.Mesh(createChamferedChassisGeometry(3.76, 0.24, 2.48), darkMetal);
    lowerFrame.position.y = 0.72;
    this.body.add(lowerFrame);

    const upperFrame = new THREE.Mesh(createChamferedChassisGeometry(3.78, 0.2, 2.48), shellDark);
    upperFrame.position.y = 1.88;
    this.body.add(upperFrame);

    // Corner structural blocks break the perfect box silhouette.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.02, 0.36), darkMetal);
        corner.position.set(sx * 1.68, 1.28, sz * 1.05);
        corner.rotation.y = sx * sz * 0.06;
        this.body.add(corner);
      }
    }

    // Top deck panels and central service spine.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 2.15), shellDark);
    deck.position.y = 2.02;
    this.body.add(deck);
    const serviceSpine = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 2.06), darkMetal);
    serviceSpine.position.set(0, 2.12, 0);
    this.body.add(serviceSpine);

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x72766f,
      roughness: 0.82,
      metalness: 0.28
    });
    for (let i = -1; i <= 1; i += 1) {
      const deckSeam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 2.12), seamMaterial);
      deckSeam.position.set(i * 0.82, 2.064, 0);
      this.body.add(deckSeam);
    }

    // --- Battery bank: structural rack, individual cassettes, bus bars and diagnostics.
    const batteryRack = new THREE.Group();
    batteryRack.name = 'Aurora-02 Battery Bank';
    batteryRack.position.set(-1.95, 1.24, 0);
    this.body.add(batteryRack);

    const batteryBackplate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.28, 1.9), darkMetal);
    batteryRack.add(batteryBackplate);

    for (let i = 0; i < 4; i += 1) {
      const cassette = new THREE.Mesh(
        createChamferedChassisGeometry(0.38, 0.94, 0.42),
        this.batteryHousingMaterial
      );
      cassette.position.set(-0.1, 0, -0.66 + i * 0.44);
      batteryRack.add(cassette);

      const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.52, 0.24), this.batteryIndicatorMaterial);
      indicator.position.set(-0.32, 0.02, -0.66 + i * 0.44);
      batteryRack.add(indicator);

      const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.4), blackMetal);
      topCap.position.set(-0.1, 0.5, -0.66 + i * 0.44);
      batteryRack.add(topCap);

      const bottomCap = topCap.clone();
      bottomCap.position.y = -0.5;
      batteryRack.add(bottomCap);
    }

    const positiveBus = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 1.72), copperMaterial);
    positiveBus.position.set(-0.22, 0.61, 0);
    batteryRack.add(positiveBus);
    const negativeBus = positiveBus.clone();
    negativeBus.position.x = 0.05;
    negativeBus.material = darkMetal;
    batteryRack.add(negativeBus);

    for (let i = 0; i < 8; i += 1) {
      const terminal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 8), i % 2 === 0 ? copperMaterial : darkMetal);
      terminal.position.set(i % 2 === 0 ? -0.22 : 0.05, 0.7, -0.66 + Math.floor(i / 2) * 0.44);
      batteryRack.add(terminal);
    }

    const batteryGuardTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 2.02), darkMetal);
    batteryGuardTop.position.set(-0.42, 0.66, 0);
    batteryRack.add(batteryGuardTop);
    const batteryGuardBottom = batteryGuardTop.clone();
    batteryGuardBottom.position.y = -0.66;
    batteryRack.add(batteryGuardBottom);

    // --- Thermal bank: manifold, heat pipes, realistic fin stack and guard.
    const thermalBank = new THREE.Group();
    thermalBank.name = 'Aurora-02 Thermal Bank';
    thermalBank.position.set(1.91, 1.28, 0);
    this.body.add(thermalBank);

    const sinkBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.92, 1.92), this.heatCoreMaterial);
    thermalBank.add(sinkBase);

    for (let i = 0; i < 8; i += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.78, 0.06), this.sinkMaterial);
      fin.position.set(0.26, 0, -0.78 + i * 0.222);
      thermalBank.add(fin);
    }

    for (const z of [-0.55, 0, 0.55]) {
      const heatPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.95, 8), copperMaterial);
      heatPipe.rotation.z = Math.PI / 2;
      heatPipe.position.set(0.06, 0.27, z);
      thermalBank.add(heatPipe);
    }

    const sinkGuardTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 2.0), darkMetal);
    sinkGuardTop.position.set(0.23, 0.49, 0);
    thermalBank.add(sinkGuardTop);
    const sinkGuardBottom = sinkGuardTop.clone();
    sinkGuardBottom.position.y = -0.49;
    thermalBank.add(sinkGuardBottom);

    const thermalSensor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.3), this.accessLightMaterial);
    thermalSensor.position.set(0.36, 0.28, 0.76);
    thermalBank.add(thermalSensor);

    // --- Front maintenance face: inset door, lock, vents, label and status strips.
    const maintFrame = new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.05, 0.09), darkMetal);
    maintFrame.position.set(0.15, 1.3, -1.23);
    this.body.add(maintFrame);

    const maintPanel = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.88, 0.06), shellDark);
    maintPanel.position.set(0.15, 1.3, -1.29);
    this.body.add(maintPanel);

    const panelInset = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.58, 0.025), blackMetal);
    panelInset.position.set(0.15, 1.31, -1.335);
    this.body.add(panelInset);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 16, Math.PI), darkMetal);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.7, 1.28, -1.38);
    this.body.add(handle);

    for (let i = 0; i < 5; i += 1) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.028, 0.025), blackMetal);
      vent.position.set(-0.22, 1.12 + i * 0.095, -1.365);
      this.body.add(vent);
    }

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.42),
      new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    label.position.set(0.1, 1.62, -1.375);
    label.rotation.y = Math.PI;
    this.body.add(label);

    const statusStripA = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.085, 0.035), this.statusMaterial);
    statusStripA.position.set(-0.46, 0.91, -1.35);
    this.body.add(statusStripA);
    const statusStripB = statusStripA.clone();
    statusStripB.position.x = 0.34;
    this.body.add(statusStripB);

    const accessLight = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 10), this.accessLightMaterial);
    accessLight.rotation.x = Math.PI / 2;
    accessLight.position.set(0.85, 1.67, -1.36);
    this.body.add(accessLight);

    // --- Environmental-control intake with protected animated fan.
    const intakeRoot = new THREE.Group();
    intakeRoot.name = 'Aurora-02 Environmental Intake';
    intakeRoot.position.set(0.72, 2.18, 0.46);
    this.body.add(intakeRoot);

    const intakeHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.5, 16, 1, false), darkMetal);
    intakeHousing.rotation.x = Math.PI / 2;
    intakeRoot.add(intakeHousing);

    const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 8, 22), shellDark);
    intakeLip.position.z = 0.27;
    intakeRoot.add(intakeLip);

    const intakeFilter = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x151b1d, roughness: 0.82, metalness: 0.24, side: THREE.DoubleSide })
    );
    intakeFilter.position.z = 0.275;
    intakeRoot.add(intakeFilter);

    this.intakeFan = new THREE.Group();
    this.intakeFan.position.z = 0.288;
    const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), darkMetal);
    fanHub.rotation.x = Math.PI / 2;
    this.intakeFan.add(fanHub);
    for (let blade = 0; blade < 5; blade += 1) {
      const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.018), shellDark);
      bladeMesh.position.x = 0.16;
      bladeMesh.rotation.z = (blade / 5) * Math.PI * 2 + 0.38;
      this.intakeFan.add(bladeMesh);
    }
    intakeRoot.add(this.intakeFan);

    const filterCanister = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.65, 12), shellDark);
    filterCanister.position.set(-0.55, -0.05, 0);
    filterCanister.rotation.z = Math.PI / 2;
    intakeRoot.add(filterCanister);

    // --- Curved service hoses and coupling hardware.
    const hoseA = createTube(
      [
        new THREE.Vector3(-0.85, 0.95, 1.18),
        new THREE.Vector3(-1.0, 0.65, 1.33),
        new THREE.Vector3(-1.18, 0.28, 1.45),
        new THREE.Vector3(-1.28, 0.08, 1.62)
      ],
      0.06,
      hoseMaterial
    );
    this.body.add(hoseA);

    const hoseB = createTube(
      [
        new THREE.Vector3(-0.5, 0.92, 1.18),
        new THREE.Vector3(-0.62, 0.58, 1.42),
        new THREE.Vector3(-0.72, 0.2, 1.58),
        new THREE.Vector3(-0.62, 0.06, 1.78)
      ],
      0.045,
      hoseMaterial
    );
    this.body.add(hoseB);

    for (const x of [-1.28, -0.62]) {
      const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), darkMetal);
      coupling.rotation.x = Math.PI / 2;
      coupling.position.set(x, 0.08, x < -1 ? 1.62 : 1.78);
      this.body.add(coupling);
    }

    const couplingPlate = new THREE.Mesh(createChamferedChassisGeometry(0.5, 0.46, 0.16), darkMetal);
    couplingPlate.position.set(-1.72, 0.84, 0.82);
    this.body.add(couplingPlate);
    const couplingGlow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.025), this.statusMaterial);
    couplingGlow.position.set(-1.81, 0.84, 0.82);
    couplingGlow.rotation.y = Math.PI / 2;
    this.body.add(couplingGlow);

    // --- Compact two-segment solar wings with hinges, frames and locking lights.
    const solarMaterial = new THREE.MeshStandardMaterial({
      color: 0x173e5c,
      map: solar.map,
      bumpMap: solar.bumpMap,
      bumpScale: 0.025,
      roughnessMap: solar.roughnessMap,
      roughness: 0.24,
      metalness: 0.5,
      envMapIntensity: 1.05
    });

    for (const side of [-1, 1]) {
      const root = new THREE.Group();
      root.name = `Aurora-02 Solar Wing ${side < 0 ? 'Port' : 'Starboard'}`;
      root.position.set(side * 1.5, 2.08, -0.36);
      this.body.add(root);

      const hingeHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.46, 12), darkMetal);
      hingeHousing.rotation.x = Math.PI / 2;
      root.add(hingeHousing);

      const outerPivot = new THREE.Group();
      root.add(outerPivot);

      const supportArm = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.16), darkMetal);
      supportArm.position.x = side * 0.28;
      outerPivot.add(supportArm);

      const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.075, 1.04), shellDark);
      outerFrame.position.x = side * 0.86;
      outerPivot.add(outerFrame);
      const outerCell = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.025, 0.92), solarMaterial);
      outerCell.position.set(side * 0.86, 0.051, 0);
      outerPivot.add(outerCell);

      const innerPivot = new THREE.Group();
      innerPivot.position.x = side * 1.44;
      outerPivot.add(innerPivot);

      const secondaryHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.02, 10), darkMetal);
      secondaryHinge.rotation.x = Math.PI / 2;
      innerPivot.add(secondaryHinge);

      const innerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.075, 1.04), shellDark);
      innerFrame.position.x = side * 0.54;
      innerPivot.add(innerFrame);
      const innerCell = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.025, 0.92), solarMaterial);
      innerCell.position.set(side * 0.54, 0.051, 0);
      innerPivot.add(innerCell);

      const rearRail = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.09, 0.09), darkMetal);
      rearRail.position.set(side * 1.18, -0.065, 0.42);
      outerPivot.add(rearRail);

      const latchMaterial = this.accessLightMaterial.clone();
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.12), latchMaterial);
      latch.position.set(side * 0.2, 0.12, -0.42);
      root.add(latch);

      // Curved power cable from hinge to the deck.
      const cable = createTube(
        [
          new THREE.Vector3(0, -0.02, 0),
          new THREE.Vector3(-side * 0.12, -0.16, 0.12),
          new THREE.Vector3(-side * 0.25, -0.22, 0.18)
        ],
        0.022,
        hoseMaterial
      );
      root.add(cable);

      this.panels.push({ root, outerPivot, innerPivot, latchMaterial, side });
    }

    // --- Telescopic whip antenna with protected base and status light.
    this.antennaMast = new THREE.Group();
    this.antennaMast.name = 'Aurora-02 Communications Whip';
    this.antennaMast.position.set(-1.22, 2.15, -0.75);
    this.body.add(this.antennaMast);

    const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.2, 12), darkMetal);
    this.antennaMast.add(antennaBase);
    const antennaCollar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 16), shellDark);
    antennaCollar.rotation.x = Math.PI / 2;
    antennaCollar.position.y = 0.11;
    this.antennaMast.add(antennaCollar);
    const mastLower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.62, 8), darkMetal);
    mastLower.position.y = 0.4;
    this.antennaMast.add(mastLower);
    const mastUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.82, 8), ceramic);
    mastUpper.position.y = 1.08;
    this.antennaMast.add(mastUpper);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 7), this.antennaLightMaterial);
    antennaTip.position.y = 1.52;
    this.antennaMast.add(antennaTip);

    // --- Small point light only for local power feedback.
    this.light = new THREE.PointLight(0x8fcfe8, 0, 7.5, 2.0);
    this.light.position.set(0, 2.05, -0.55);
    this.light.castShadow = false;
    this.light.visible = false;
    this.body.add(this.light);

    // --- Deployment dust: coarse grains + fine suspended layer.
    const particleTexture = createSoftParticleTexture(32);
    const coarseCount = 22;
    const fineCount = 30;
    const coarsePositions = new Float32Array(coarseCount * 3);
    const finePositions = new Float32Array(fineCount * 3);
    this.coarseDustVelocities = new Float32Array(coarseCount * 3);
    this.fineDustVelocities = new Float32Array(fineCount * 3);

    const coarseGeometry = new THREE.BufferGeometry();
    coarseGeometry.setAttribute('position', new THREE.BufferAttribute(coarsePositions, 3));
    this.coarseDustMaterial = new THREE.PointsMaterial({
      color: 0xa89672,
      size: 0.32,
      map: particleTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.coarseDust = new THREE.Points(coarseGeometry, this.coarseDustMaterial);
    this.coarseDust.frustumCulled = false;
    this.coarseDust.visible = false;
    this.group.add(this.coarseDust);

    const fineGeometry = new THREE.BufferGeometry();
    fineGeometry.setAttribute('position', new THREE.BufferAttribute(finePositions, 3));
    this.fineDustMaterial = new THREE.PointsMaterial({
      color: 0xb5a582,
      size: 0.52,
      map: particleTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.fineDust = new THREE.Points(fineGeometry, this.fineDustMaterial);
    this.fineDust.frustumCulled = false;
    this.fineDust.visible = false;
    this.group.add(this.fineDust);

    // Keep culling enabled and avoid duplicating dozens of tiny parts in the
    // shadow pass. Only the three large chassis pieces cast/receive shadows.
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = true;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    this.chassis.castShadow = true;
    this.chassis.receiveShadow = true;
    lowerFrame.castShadow = true;
    lowerFrame.receiveShadow = true;
    upperFrame.castShadow = true;

    this.applyDeployProgress(0);
    this.applyPower(0);
    this.freezeStaticTransforms();
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 1, z);
  }

  restore(deployed: boolean, powerLevel: number): void {
    this.group.visible = deployed;
    this.deployProgress = deployed ? 1 : 0;
    this.powerLevel = THREE.MathUtils.clamp(powerLevel, 0, 1);
    this.thermalLevel = this.powerLevel;
    this.dustLife = 0;
    this.dustTriggered = deployed;
    this.coarseDust.visible = false;
    this.fineDust.visible = false;
    this.visualUpdateAccumulator = 0;
    this.applyDeployProgress(this.deployProgress);
    this.applyPower(this.powerLevel);
  }

  beginDeploy(): void {
    this.group.visible = true;
    this.deployProgress = 0;
    this.powerLevel = 0;
    this.thermalLevel = 0;
    this.dustLife = 0;
    this.dustTriggered = false;
    this.coarseDust.visible = false;
    this.fineDust.visible = false;
    this.visualUpdateAccumulator = 0;
    this.applyDeployProgress(0);
    this.applyPower(0);
  }

  get deployed(): boolean {
    return this.deployProgress > 0.999;
  }

  update(delta: number, elapsed: number, powerPercent: number): void {
    if (!this.group.visible) return;

    if (this.deployProgress < 1) {
      // Maintains the original ~3.2 second mission timing.
      this.deployProgress = Math.min(1, this.deployProgress + delta / 3.2);
      this.applyDeployProgress(this.deployProgress);

      if (!this.dustTriggered && this.deployProgress >= 0.22) {
        this.dustTriggered = true;
        this.fireDeploymentDust();
      }
    }

    const target = THREE.MathUtils.clamp(powerPercent / 100, 0, 1);
    const powerChanged = Math.abs(target - this.powerLevel) > 0.002;
    this.powerLevel = target;
    this.thermalLevel += (target - this.thermalLevel) * (
      1 - Math.exp(-delta * (target > this.thermalLevel ? 0.85 : 0.34))
    );

    // Mechanical motion and active particles still update every frame.
    const fanSpeed = 9.5 * THREE.MathUtils.smoothstep(target, 0.08, 0.85);
    this.intakeFan.rotation.z -= delta * fanSpeed;
    this.antennaMast.rotation.z = Math.sin(elapsed * 0.62) * 0.006 * target;
    this.updateDust(delta);

    // Expensive PBR/emissive/color changes run at 20 Hz. At 60 FPS this cuts
    // those updates by roughly two thirds without visible stepping.
    this.visualUpdateAccumulator += delta;
    if (!powerChanged && this.visualUpdateAccumulator < POWER_VISUAL_UPDATE_INTERVAL) return;
    this.visualUpdateAccumulator = 0;

    const pulse = 0.5 + Math.sin(elapsed * 1.45) * 0.5;
    const diagnosticPulse = 0.5 + Math.sin(elapsed * 4.7) * 0.5;
    const lowPower = THREE.MathUtils.smoothstep(target, 0.03, 0.22);
    const stablePower = THREE.MathUtils.smoothstep(target, 0.25, 0.68);
    const fullPower = THREE.MathUtils.smoothstep(target, 0.72, 1.0);

    if (target > 0.01) {
      this.statusMaterial.emissiveIntensity = target * (0.34 + pulse * 0.34 + stablePower * 0.16);
      this.batteryIndicatorMaterial.emissiveIntensity = target * (0.42 + diagnosticPulse * 0.2);
      this.accessLightMaterial.emissiveIntensity = 0.16 + lowPower * (0.55 + pulse * 0.18);
      this.antennaLightMaterial.emissiveIntensity = stablePower * (0.45 + pulse * 0.28);

      this.statusMaterial.color.copy(COLOR_POWER_AMBER).lerp(COLOR_POWER_GREEN, stablePower);
      this.statusMaterial.emissive.copy(COLOR_POWER_AMBER).lerp(COLOR_POWER_GREEN, stablePower);
      this.batteryIndicatorMaterial.color.copy(COLOR_POWER_OFF).lerp(COLOR_POWER_CYAN, lowPower * 0.35);

      for (const panel of this.panels) {
        panel.latchMaterial.emissive.copy(COLOR_POWER_AMBER).lerp(COLOR_POWER_GREEN, stablePower);
        panel.latchMaterial.emissiveIntensity = 0.18 + stablePower * (0.5 + pulse * 0.16);
      }
    } else {
      this.statusMaterial.color.copy(COLOR_POWER_OFF);
      this.statusMaterial.emissive.copy(COLOR_POWER_GREEN);
      this.statusMaterial.emissiveIntensity = 0;
      this.batteryIndicatorMaterial.color.copy(COLOR_POWER_OFF);
      this.batteryIndicatorMaterial.emissiveIntensity = 0;
      this.accessLightMaterial.emissiveIntensity = 0;
      this.antennaLightMaterial.emissiveIntensity = 0;
      for (const panel of this.panels) panel.latchMaterial.emissiveIntensity = 0;
    }

    this.sinkMaterial.color.copy(COLOR_HEAT_DARK).lerp(COLOR_HEAT_WARM, this.thermalLevel * 0.55);
    this.heatCoreMaterial.emissiveIntensity = this.thermalLevel * (
      0.08 + Math.sin(elapsed * 0.57) * 0.022
    );
    this.sinkMaterial.emissive.copy(COLOR_HEAT_HOT);
    this.sinkMaterial.emissiveIntensity = this.thermalLevel * (
      0.022 + Math.sin(elapsed * 0.52) * 0.009
    );

    this.light.intensity = stablePower * (0.22 + pulse * 0.18 + fullPower * 0.16);
    this.light.visible = this.light.intensity > 0.025;
    this.dustSkirtMaterial.opacity = 0.22 * (1 - target * 0.42);
  }

  dispose(): void {
    const disposedMaterials = new Set<THREE.Material>();
    const disposedTextures = new Set<THREE.Texture>();
    const disposedGeometries = new Set<THREE.BufferGeometry>();

    this.group.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      if (renderable.geometry && !disposedGeometries.has(renderable.geometry)) {
        disposedGeometries.add(renderable.geometry);
        renderable.geometry.dispose();
      }

      const materials = renderable.material
        ? Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material]
        : [];

      for (const material of materials) {
        if (disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);

        const materialRecord = material as THREE.Material & Record<string, unknown>;
        for (const value of Object.values(materialRecord)) {
          if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
            disposedTextures.add(value);
            value.dispose();
          }
        }
        material.dispose();
      }
    });
  }

  /**
   * Static child meshes do not need to rebuild their local matrices every
   * frame. Animated groups and articulated meshes remain automatic.
   */
  private freezeStaticTransforms(): void {
    const animated = new Set<THREE.Object3D>([
      this.chassis,
      ...this.legs.flatMap((leg) => [leg.upper, leg.piston])
    ]);

    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      if (animated.has(object)) return;
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }

  private applyDeployProgress(progress: number): void {
    const settleT = THREE.MathUtils.smoothstep(progress, 0.0, 0.28);
    const bodyT = THREE.MathUtils.smoothstep(progress, 0.14, 0.48);
    const panelT = THREE.MathUtils.smoothstep(progress, 0.43, 0.84);
    const antennaT = THREE.MathUtils.smoothstep(progress, 0.7, 0.94);

    // Heavy settle with a very small damped rebound, never a light bounce.
    const impact = progress > 0.2 && progress < 0.42
      ? Math.sin((progress - 0.2) * Math.PI * 13) * (1 - (progress - 0.2) / 0.22) * 0.035
      : 0;
    this.body.position.y = 0.05 + bodyT * 0.18 + impact;
    this.body.rotation.x = (1 - settleT) * 0.025;
    this.body.rotation.z = (1 - settleT) * -0.018;

    // The chassis remains rigid; the complete body rises as one machine.
    this.chassis.scale.y = 0.92 + bodyT * 0.08;

    for (const leg of this.legs) {
      const radial = 0.98 + settleT * 0.88;
      leg.root.position.set(Math.cos(leg.angle) * radial, 1.18 + bodyT * 0.18, Math.sin(leg.angle) * radial);
      leg.root.rotation.z = -0.5 + settleT * 0.28;
      leg.upper.scale.y = 0.72 + settleT * 0.28;
      leg.piston.scale.y = 0.48 + settleT * 0.52;
      leg.piston.position.y = -0.67 - settleT * 0.25;
      leg.foot.position.set(0.22 + settleT * 0.16, -1.18 - bodyT * 0.18, 0);
      leg.foot.rotation.z = 0.5 - settleT * 0.28;
    }

    for (const panel of this.panels) {
      const delayedInner = THREE.MathUtils.smoothstep(panelT, 0.26, 0.92);
      const lockOscillation = panelT > 0.78
        ? Math.sin((panelT - 0.78) * Math.PI * 5.5) * (1 - panelT) * 0.055
        : 0;
      panel.outerPivot.rotation.z = panel.side * (1.46 * (1 - panelT) + lockOscillation);
      panel.innerPivot.rotation.z = panel.side * (1.58 * (1 - delayedInner));
      panel.root.position.y = 0.02 + panelT * 0.04;
    }

    this.antennaMast.scale.y = 0.18 + antennaT * 0.82;
    this.antennaMast.position.y = 2.15 - (1 - antennaT) * 0.18;
  }

  private applyPower(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    this.statusMaterial.emissiveIntensity = clamped * 0.5;
    this.batteryIndicatorMaterial.emissiveIntensity = clamped * 0.4;
    this.heatCoreMaterial.emissiveIntensity = this.thermalLevel * 0.08;
    this.sinkMaterial.emissiveIntensity = this.thermalLevel * 0.025;
    this.light.intensity = clamped * 0.28;
    this.light.visible = this.light.intensity > 0.025;
    this.accessLightMaterial.emissiveIntensity = clamped * 0.35;
    this.antennaLightMaterial.emissiveIntensity = clamped * 0.35;
  }

  private fireDeploymentDust(): void {
    this.dustLife = 1;
    this.coarseDust.visible = true;
    this.fineDust.visible = true;
    const coarse = this.coarseDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fine = this.fineDust.geometry.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < coarse.count; i += 1) {
      const angle = hash(i * 1.7, this.seed) * Math.PI * 2;
      const radius = 1.0 + hash(i * 2.3, this.seed + 9) * 1.15;
      const speed = 1.8 + hash(i * 3.1, this.seed + 14) * 3.4;
      coarse.setXYZ(i, Math.cos(angle) * radius, 0.12, Math.sin(angle) * radius);
      this.coarseDustVelocities[i * 3] = Math.cos(angle) * speed;
      this.coarseDustVelocities[i * 3 + 1] = 0.4 + hash(i * 4.3, this.seed + 21) * 0.75;
      this.coarseDustVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    coarse.needsUpdate = true;

    for (let i = 0; i < fine.count; i += 1) {
      const angle = hash(i * 2.9, this.seed + 31) * Math.PI * 2;
      const radius = 0.75 + hash(i * 1.9, this.seed + 38) * 1.6;
      const speed = 0.55 + hash(i * 4.7, this.seed + 42) * 1.2;
      fine.setXYZ(i, Math.cos(angle) * radius, 0.08 + hash(i * 5.1, this.seed + 48) * 0.24, Math.sin(angle) * radius);
      this.fineDustVelocities[i * 3] = Math.cos(angle) * speed + 0.18;
      this.fineDustVelocities[i * 3 + 1] = 0.12 + hash(i * 3.7, this.seed + 55) * 0.34;
      this.fineDustVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    fine.needsUpdate = true;
  }

  private updateDust(delta: number): void {
    if (this.dustLife <= 0) {
      this.coarseDustMaterial.opacity = 0;
      this.fineDustMaterial.opacity = 0;
      this.coarseDust.visible = false;
      this.fineDust.visible = false;
      return;
    }

    this.dustLife = Math.max(0, this.dustLife - delta / 1.8);
    const coarse = this.coarseDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const coarseArray = coarse.array as Float32Array;
    for (let i = 0; i < coarseArray.length; i += 3) {
      this.coarseDustVelocities[i + 1] -= delta * 1.65;
      const coarseDrag = Math.max(0, 1 - delta * 0.9);
      this.coarseDustVelocities[i] *= coarseDrag;
      this.coarseDustVelocities[i + 2] *= coarseDrag;
      coarseArray[i] += this.coarseDustVelocities[i] * delta;
      coarseArray[i + 1] = Math.max(0.03, coarseArray[i + 1] + this.coarseDustVelocities[i + 1] * delta);
      coarseArray[i + 2] += this.coarseDustVelocities[i + 2] * delta;
    }
    coarse.needsUpdate = true;

    const fine = this.fineDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fineArray = fine.array as Float32Array;
    for (let i = 0; i < fineArray.length; i += 3) {
      const fineDrag = Math.max(0, 1 - delta * 0.34);
      this.fineDustVelocities[i] *= fineDrag;
      this.fineDustVelocities[i + 2] *= fineDrag;
      fineArray[i] += this.fineDustVelocities[i] * delta;
      fineArray[i + 1] += this.fineDustVelocities[i + 1] * delta * this.dustLife;
      fineArray[i + 2] += this.fineDustVelocities[i + 2] * delta;
    }
    fine.needsUpdate = true;

    this.coarseDustMaterial.opacity = this.dustLife * 0.34;
    this.fineDustMaterial.opacity = Math.min(0.28, this.dustLife * 0.24);
  }
}