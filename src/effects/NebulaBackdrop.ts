import * as THREE from 'three';

type CloudSprite = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  basePosition: THREE.Vector3;
  baseOpacity: number;
  rotationSpeed: number;
  driftPhase: number;
};

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy);
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amplitude = 0.55;
  let frequency = 1;
  let total = 0;
  let max = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + i * 13.7) * amplitude;
    max += amplitude;
    amplitude *= 0.52;
    frequency *= 2.1;
  }
  return total / max;
}

/**
 * Bakes one soft fractal-noise cloud into a canvas texture. Bright interior
 * detail with darker filaments and a radial falloff so sprite edges vanish.
 */
export function createNebulaCloudTexture(size: number, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create nebula cloud texture.');
  }

  const image = context.createImageData(size, size);
  const scale = 3.6;

  // Every variant gets its own falloff geometry. A circular mask is the single
  // most recognisable "sprite blob" tell, so instead each cloud fades along an
  // ellipse that is rotated, stretched and pushed off-centre by its seed, and
  // the mask edge itself is chewed up by noise. No two variants share a
  // silhouette, and none of them reads as a disc.
  const axis = seed * 0.7;
  const ellipseAngle = fract(Math.sin(seed * 12.9898) * 43758.5453) * Math.PI;
  const stretch = 1.35 + fract(Math.sin(seed * 78.233) * 43758.5453) * 1.5;
  const offsetX = (fract(Math.sin(seed * 41.7) * 43758.5453) - 0.5) * 0.22;
  const offsetY = (fract(Math.sin(seed * 93.1) * 43758.5453) - 0.5) * 0.22;
  const cosA = Math.cos(ellipseAngle);
  const sinA = Math.sin(ellipseAngle);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / size) * scale;
      const ny = (y / size) * scale;

      // Two chained domain warps: the second one at a different frequency
      // breaks the tell-tale single-octave swirl of a plain warped fbm.
      const warpX = fbm(nx + 5.2, ny + 1.3, seed + 31) * 1.6;
      const warpY = fbm(nx - 3.8, ny + 7.7, seed + 57) * 1.6;
      const warp2X = fbm((nx + warpX) * 2.3 - 2.1, (ny + warpY) * 2.3 + 4.4, seed + 91) * 0.55;
      const warp2Y = fbm((nx + warpX) * 2.3 + 6.8, (ny + warpY) * 2.3 - 1.9, seed + 113) * 0.55;
      let density = fbm(nx + warpX + warp2X, ny + warpY + warp2Y, seed);
      density = Math.pow(Math.max(0, density - 0.18) / 0.82, 1.55);

      // Ridged filaments layered over the body: bright threads through the
      // denser regions, which is what real emission nebulae actually show.
      const ridge = 1 - Math.abs(fbm(nx * 1.7 + axis, ny * 1.7 - axis, seed + 200, 4) * 2 - 1);
      density = Math.min(1, density + Math.pow(Math.max(0, ridge), 4) * 0.5 * density);

      // Rotated, stretched, off-centre elliptical falloff with a noisy edge.
      const dx = x / size - 0.5 - offsetX;
      const dy = y / size - 0.5 - offsetY;
      const ex = (dx * cosA + dy * sinA) / stretch;
      const ey = (-dx * sinA + dy * cosA) * (0.6 + stretch * 0.32);
      const edgeNoise = fbm(nx * 1.1 + 17, ny * 1.1 - 23, seed + 301, 3) * 0.42;
      const radial = Math.max(0, 1 - (Math.sqrt(ex * ex + ey * ey) * 2.15 - edgeNoise * 0.5));
      const alpha = density * radial * radial;

      // Slight blue-shift in the thin outskirts, warmer in the dense core:
      // a cheap stand-in for the colour gradient depth gives real nebulae.
      const core = Math.min(1, density * 1.4);
      const offset = (y * size + x) * 4;
      image.data[offset] = 178 + core * 74;
      image.data[offset + 1] = 184 + core * 62;
      image.data[offset + 2] = 200 + core * 42;
      image.data[offset + 3] = Math.min(255, alpha * 255);
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Layered volumetric-feel nebula built from tinted cloud sprites: a warm
 * distant bank, a cold band, dark occluding smoke and rare far lightning.
 */
export class NebulaBackdrop {
  readonly group = new THREE.Group();

  private readonly clouds: CloudSprite[] = [];

  private lightningTimer = 6;

  private lightningTarget?: CloudSprite;

  private lightningLife = 0;

  constructor() {
    this.group.name = 'Nebula Backdrop';

    // Seven variants instead of three: with 27 sprites drawing from three
    // textures the repeats were findable, and a repeated cloud is the fastest
    // way to make a sky look generated.
    const textures = [
      createNebulaCloudTexture(320, 11.3),
      createNebulaCloudTexture(320, 47.9),
      createNebulaCloudTexture(320, 83.1),
      createNebulaCloudTexture(320, 129.7),
      createNebulaCloudTexture(320, 173.4),
      createNebulaCloudTexture(320, 211.8),
      createNebulaCloudTexture(320, 257.2)
    ];

    // Each bank now runs along its own axis with its own bow, so the sky has
    // composition: a long cold sweep, a compact warm wound at an angle to it,
    // a high violet remnant, and dark smoke cutting across the whole thing.

    // Cold teal bank sweeping behind the deep sectors, running mostly across
    // the view and bowing upward.
    this.addBank(textures, new THREE.Vector3(420, 60, -2400), {
      count: 10,
      spread: 2600,
      scale: [900, 1750],
      colors: [0x1d4a66, 0x2a6a86, 0x173a55],
      opacity: [0.16, 0.3],
      additive: true,
      axis: new THREE.Vector3(1, 0.18, 0.35),
      arc: 320,
      seed: 3.7
    });

    // Warm amber wound near the dead star: shorter, steeper, cutting down.
    this.addBank(textures, new THREE.Vector3(1400, -260, -1500), {
      count: 7,
      spread: 1500,
      scale: [700, 1250],
      colors: [0x6b2b1c, 0x8a3a22, 0x4a1c18],
      opacity: [0.12, 0.24],
      additive: true,
      axis: new THREE.Vector3(0.35, -0.55, 0.75),
      arc: -240,
      seed: 19.3
    });

    // Violet remnant high above the plane, drifting the other way.
    this.addBank(textures, new THREE.Vector3(-1500, 700, -1900), {
      count: 6,
      spread: 1400,
      scale: [650, 1150],
      colors: [0x3d2557, 0x53307a, 0x2a1a40],
      opacity: [0.11, 0.2],
      additive: true,
      axis: new THREE.Vector3(-0.8, 0.25, 0.55),
      arc: 200,
      seed: 41.1
    });

    // Dark smoke that occludes stars: this is what sells depth. Laid across
    // the bright banks rather than parallel to them.
    this.addBank(textures, new THREE.Vector3(300, -80, -2100), {
      count: 8,
      spread: 2900,
      scale: [850, 1600],
      colors: [0x05070c, 0x070a12, 0x04060a],
      opacity: [0.5, 0.78],
      additive: false,
      axis: new THREE.Vector3(0.9, -0.12, -0.4),
      arc: -300,
      seed: 67.9
    });
  }

  update(delta: number, elapsed: number): void {
    for (const cloud of this.clouds) {
      cloud.material.rotation += delta * cloud.rotationSpeed;
      // Immense clouds drift over minutes: barely perceptible, never still.
      cloud.sprite.position.y = cloud.basePosition.y + Math.sin(elapsed * 0.026 + cloud.driftPhase) * 42;
      cloud.sprite.position.x = cloud.basePosition.x + Math.cos(elapsed * 0.019 + cloud.driftPhase * 1.7) * 30;
    }

    // Occasional silent lightning deep inside a bright cloud.
    this.lightningTimer -= delta;
    if (this.lightningTimer <= 0) {
      const bright = this.clouds.filter((cloud) => cloud.material.blending === THREE.AdditiveBlending);
      this.lightningTarget = bright[Math.floor(Math.random() * bright.length)];
      this.lightningLife = 0.55;
      this.lightningTimer = 7 + Math.random() * 14;
    }

    if (this.lightningTarget && this.lightningLife > 0) {
      this.lightningLife -= delta;
      const flash = Math.max(0, Math.sin((this.lightningLife / 0.55) * Math.PI)) * 0.5;
      this.lightningTarget.material.opacity = this.lightningTarget.baseOpacity * (1 + flash * 2.4);
      if (this.lightningLife <= 0) {
        this.lightningTarget.material.opacity = this.lightningTarget.baseOpacity;
        this.lightningTarget = undefined;
      }
    }
  }

  get spriteCount(): number {
    return this.clouds.length;
  }

  /**
   * Lay a bank along a curved spine rather than scattering it through a box.
   *
   * Uniform random placement in a volume is what makes a nebula read as
   * generated: no direction, no density gradient, no composition. Here each
   * bank has an axis and a gentle arc, sprites cluster toward the middle of
   * that spine and thin out at both ends, and every sprite is stretched along
   * its own angle so the bank reads as sheets and filaments instead of a pile
   * of discs. Placement is seeded, so the sky is authored and identical on
   * every load rather than re-rolled each session.
   */
  private addBank(
    textures: THREE.CanvasTexture[],
    center: THREE.Vector3,
    options: {
      count: number;
      spread: number;
      scale: [number, number];
      colors: number[];
      opacity: [number, number];
      additive: boolean;
      /** Direction the bank runs along; normalised internally. */
      axis: THREE.Vector3;
      /** How far the spine bows away from a straight line. */
      arc: number;
      seed: number;
    }
  ): void {
    const along = options.axis.clone().normalize();
    // Any vector not parallel to the axis gives us the bow plane.
    const bow = new THREE.Vector3(0, 1, 0).cross(along).normalize();
    if (bow.lengthSq() < 0.01) bow.set(1, 0, 0);
    const across = along.clone().cross(bow).normalize();

    for (let i = 0; i < options.count; i += 1) {
      const s = options.seed + i * 7.31;
      const r1 = hash2(i * 3.1, options.seed, 11);
      const r2 = hash2(i * 5.7, options.seed, 27);
      const r3 = hash2(i * 9.3, options.seed, 43);
      const r4 = hash2(i * 13.9, options.seed, 61);
      const r5 = hash2(i * 17.5, options.seed, 79);

      // Position along the spine, biased toward the middle so the bank has
      // a dense heart and thin tails instead of even coverage.
      const t = (i + r1 * 0.6) / Math.max(1, options.count - 1);
      const centred = (t - 0.5) * 2; // -1..1
      const density = 1 - centred * centred; // 0 at the tips, 1 mid-spine

      const distance = centred * options.spread * 0.5;
      const bowOffset = (1 - centred * centred) * options.arc;
      const jitterAcross = (r2 - 0.5) * options.spread * 0.26;
      const jitterBow = (r3 - 0.5) * options.spread * 0.18;

      const texture = textures[Math.floor(r4 * textures.length) % textures.length];
      // Thin tails are fainter: the density gradient carries into opacity.
      const baseOpacity =
        THREE.MathUtils.lerp(options.opacity[0], options.opacity[1], r5) * (0.45 + density * 0.55);
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: options.colors[Math.floor(hash2(i * 2.3, s, 97) * options.colors.length) % options.colors.length],
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        rotation: hash2(i * 4.9, s, 113) * Math.PI * 2,
        blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false
      });

      const sprite = new THREE.Sprite(material);
      sprite.position
        .copy(center)
        .addScaledVector(along, distance)
        .addScaledVector(bow, bowOffset + jitterBow)
        .addScaledVector(across, jitterAcross);

      // Anisotropic scale: each cloud is a stretched sheet at its own angle,
      // and the biggest ones sit mid-spine where the bank is densest.
      const baseScale = THREE.MathUtils.lerp(options.scale[0], options.scale[1], hash2(i * 6.1, s, 131)) *
        (0.62 + density * 0.55);
      const elongation = 1.25 + hash2(i * 8.7, s, 149) * 1.35;
      sprite.scale.set(baseScale * elongation, baseScale / Math.sqrt(elongation), 1);
      sprite.renderOrder = options.additive ? -14 : -16;

      this.group.add(sprite);
      this.clouds.push({
        sprite,
        material,
        basePosition: sprite.position.clone(),
        baseOpacity,
        rotationSpeed: (hash2(i * 11.3, s, 167) - 0.5) * 0.008,
        driftPhase: hash2(i * 15.1, s, 181) * Math.PI * 2
      });
    }
  }
}
