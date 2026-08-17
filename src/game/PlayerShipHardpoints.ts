import * as THREE from 'three';

/**
 * Single source of ship-local attachment points.
 *
 * Everything added to the hull at runtime — engines, cannons, torpedo tubes,
 * the shield shell — derives its position from here, and every value is a
 * proportion of the hull's own bounds. That matters because the ship was
 * scaled x1.7: any hardpoint written as an absolute metre offset silently kept
 * its pre-scale geometry while the hull around it grew.
 *
 * All coordinates are LOCAL to the ship. Nothing here stores a world position,
 * and nothing here applies the scale factor a second time — `bounds` is already
 * measured on the scaled hull.
 *
 * The GLB carries no nodes named for engines, nozzles, cannons or tubes (probed
 * directly: the only matching objects in the hierarchy are the procedural ones
 * this module feeds), so every hardpoint below is bounds-derived by necessity
 * rather than by preference.
 */

export type EngineHardpoint = {
  readonly id: string;
  /** Centre of the nozzle mouth, ship-local. */
  readonly position: THREE.Vector3;
  /** Exhaust axis, ship-local and normalised. */
  readonly direction: THREE.Vector3;
  /** Nozzle mouth radius; plume scale derives from this. */
  readonly radius: number;
};

export type MuzzleHardpoint = {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;
};

export type TorpedoTubeHardpoint = {
  readonly index: number;
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;
};

/**
 * The shared weapon/propulsion axis, as a fraction of hull height.
 *
 * Engines and cannons must sit on one line: thrust and gunfire that disagree
 * about where the ship's spine is read as a modelling error from any angle
 * behind the hull. This was measured at 0.706 m apart -- engines on
 * `-height * 0.16`, cannons on a flat `-0.08` left over from before the x1.7
 * rescale, exactly the absolute-offset failure this module exists to prevent.
 *
 * The engine value is the one kept because it is the one already validated
 * against the visible hull: the plumes sit inside the model's nacelle bells.
 */
const HARDPOINT_AXIS_Y = 0.16;

/** Lateral spacing of the main hardpoints, as a fraction of hull width. */
const HARDPOINT_AXIS_X = 0.18;

/** Hull proportions every hardpoint is expressed against. */
function safeBounds(bounds: THREE.Vector3): { width: number; height: number; depth: number } {
  return {
    width: Math.max(bounds.x, 4),
    height: Math.max(bounds.y, 1.8),
    depth: Math.max(bounds.z, 6)
  };
}

/**
 * Main engines.
 *
 * Two nozzles, mouths at the tail plane. The plume starts a hair behind the
 * mouth rather than inside it, which is what `direction` is for — each engine
 * carries its own axis so a future canted nozzle does not need a special case.
 */
export function mainEngineHardpoints(bounds: THREE.Vector3): EngineHardpoint[] {
  const { width, height, depth } = safeBounds(bounds);
  const radius = width * 0.085;
  return [
    {
      id: 'portMain',
      position: new THREE.Vector3(-width * HARDPOINT_AXIS_X, -height * HARDPOINT_AXIS_Y, depth * 0.48),
      direction: new THREE.Vector3(0, 0, 1),
      radius
    },
    {
      id: 'starboardMain',
      position: new THREE.Vector3(width * HARDPOINT_AXIS_X, -height * HARDPOINT_AXIS_Y, depth * 0.48),
      direction: new THREE.Vector3(0, 0, 1),
      radius
    }
  ];
}

/**
 * Cannon muzzles.
 *
 * The firing origin sits just forward of the barrel tip. The barrels are built
 * at `socket.z + 0.62` and are 1.34 long, so their tips land at about
 * `socket.z - 0.05`; firing from the socket itself started the shot marginally
 * inside the barrel.
 */
export function cannonMuzzleHardpoints(bounds: THREE.Vector3): MuzzleHardpoint[] {
  const { width, height, depth } = safeBounds(bounds);
  const z = -depth * 0.4 - 0.75;
  // Same axis as the engines, in both height and lateral spacing. Previously
  // `-0.08` absolute and `0.19` across, which put the guns 0.706 m above and
  // 0.109 m outboard of the thrust line.
  const y = -height * HARDPOINT_AXIS_Y;
  const x = width * HARDPOINT_AXIS_X;
  return [
    {
      id: 'portCannon',
      position: new THREE.Vector3(-x, y, z),
      direction: new THREE.Vector3(0, 0, -1)
    },
    {
      id: 'starboardCannon',
      position: new THREE.Vector3(x, y, z),
      direction: new THREE.Vector3(0, 0, -1)
    }
  ];
}

/** Ventral pod mount, which the tubes hang off. */
export function ventralPodHardpoint(bounds: THREE.Vector3): THREE.Vector3 {
  const { height, depth } = safeBounds(bounds);
  return new THREE.Vector3(0, -height * 0.3, depth * 0.06);
}

/**
 * The four ventral torpedo tubes.
 *
 * Previously written as flat metre offsets from the pod (+/-0.38 across,
 * +/-0.16 down, 1.18 forward). Those were authored before the hull was scaled
 * x1.7, so while the pod moved with the bounds the tube pattern stayed at its
 * old size and all four openings ended up bunched within 0.8 m of each other,
 * near the ship's centreline rather than at the pod's face. Now proportional,
 * so the spread grows with the hull.
 */
export function torpedoTubeHardpoints(bounds: THREE.Vector3): TorpedoTubeHardpoint[] {
  const { width, height, depth } = safeBounds(bounds);
  const pod = ventralPodHardpoint(bounds);
  const spreadX = width * 0.062;
  const spreadY = height * 0.075;
  // Muzzle plane at the front face of the pod, clear of the fuselage.
  const z = pod.z - depth * 0.14;
  return [
    { index: 0, position: new THREE.Vector3(pod.x - spreadX, pod.y + spreadY, z), direction: new THREE.Vector3(0, 0, -1) },
    { index: 1, position: new THREE.Vector3(pod.x + spreadX, pod.y + spreadY, z), direction: new THREE.Vector3(0, 0, -1) },
    { index: 2, position: new THREE.Vector3(pod.x - spreadX, pod.y - spreadY, z), direction: new THREE.Vector3(0, 0, -1) },
    { index: 3, position: new THREE.Vector3(pod.x + spreadX, pod.y - spreadY, z), direction: new THREE.Vector3(0, 0, -1) }
  ];
}

/**
 * Radius the shield shell needs to contain the hull.
 *
 * The shell was a hardcoded 7.4 sphere scaled (1, 0.62, 1.05), giving a 7.77
 * half-extent along Z against a hull half-depth of about 7.80 — after the x1.7
 * scale-up the nose and tail poked through. Derived from the bounds now, with a
 * small margin so it reads as a shell around the ship rather than a skin on it.
 */
export function shieldRadius(bounds: THREE.Vector3): number {
  const { width, depth } = safeBounds(bounds);
  // The shell's Z scale is 1.05, so the radius only needs depth/2 / 1.05.
  return Math.max(width * 0.5, (depth * 0.5) / 1.05) * 1.06;
}

/** Ship-local centre the shield and the camera both aim at. */
export function shieldCenter(bounds: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(0, Math.max(bounds.y, 1.8) * 0.02, 0);
}
