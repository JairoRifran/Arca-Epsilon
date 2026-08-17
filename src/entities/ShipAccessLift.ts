import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export type ShipAccessState = 'retracted' | 'deploying' | 'deployed' | 'boarding';

/**
 * How far the egress foot may follow the terrain away from the bay's datum.
 * Sized to absorb the slope of a valid parking spot (Aurora's valley floor
 * diverged by ~0.81 m) without letting the access stretch over a ledge.
 */
export const SHIP_ACCESS_MAX_GROUND_DROP = 1.35;

/**
 * Ladder geometry, sized against the 1.78 m pilot rather than the hull.
 *
 * 0.68 m of clear width is a real crew ladder — wide enough to climb with a
 * pack, narrow enough to stow inside the bay. Four treads per 1.22 m section
 * puts the pitch at ~0.30 m, the spacing a person actually climbs.
 */
export const SHIP_ACCESS_LADDER_WIDTH = 0.68;
export const SHIP_ACCESS_LADDER_SECTION_LENGTH = 1.22;
/**
 * How far the ground step may travel to meet the terrain.
 *
 * Measured per surface with the ship parked on its landing gear, recording the
 * peak pre-clamp correction the step asks for (`tests/footTravelBudget.spec.ts`):
 *
 *   Base Nereida  0.546 m   <- the demanding case, rougher ground under the bay
 *   Aurora soil   0.209 m
 *
 * 0.42 m would clamp Nereida short, so the budget stays above it — but at the
 * measured maximum plus ~0.08 m of margin, not the 0.75 m that was previously
 * set by trial. An earlier note here claimed a 0.67 m shortfall; that reading
 * predated both the world-to-local step correction and the landing gear, and
 * did not survive re-measurement.
 */
export const SHIP_ACCESS_FOOT_TRAVEL = 0.63;

/**
 * How far the hatch frame sits below the hull skin: just enough to seat the
 * collar on the surface without z-fighting against the GLB.
 */
export const SHIP_ACCESS_HATCH_SURFACE_OFFSET = 0.06;
/** Floor for the hatch height, so a belly landing cannot invert the bay. */
export const SHIP_ACCESS_MIN_DECK_HEIGHT = 0.35;

/** Where the ground step should rest above the terrain it stands on. */
export const SHIP_ACCESS_FOOT_CLEARANCE = 0.03;

/**
 * Outboard offset from the bottom step to where the pilot actually stands.
 *
 * Deliberate and centralised: the interaction point is beside the ladder, not
 * on top of it, so the character is never placed inside the structure. Any
 * difference between step and anchor should come from here and nowhere else.
 */
export const SHIP_ACCESS_BOARDING_APPROACH_OFFSET = 0.35;

/** Access geometry measured from the live scene at capture time. */
export type ShipAccessMeasurement = {
  hatchOpeningWidth: number;
  hatchOpeningHeight: number;
  leafGapClosed: number;
  ladderTopWorld: [number, number, number];
  ladderMidWorld: [number, number, number];
  ladderBottomWorld: [number, number, number];
  ladderTotalLength: number;
  ladderUsefulWidth: number;
  stepSpacing: number;
  terrainHeightAtLadderBottom: number;
  footClearance: number;
  footSafe: boolean;
  boardingAnchorWorld: [number, number, number];
  anchorToFootDistance: number;
};

/**
 * Hatch leaf swing, and the folded/deployed angles of each ladder section.
 *
 * The deployed angles are not styling — they are solved from the geometry the
 * access has to span. Measured on a parked hull, the ladder root sits 2.55 m
 * above the terrain and the egress foot sits 2.60 m outboard of it, so the run
 * is a 3.64 m hypotenuse at ~45° from vertical. Three 1.22 m sections give
 * 3.66 m, which is why the deployed pose is a near-straight inclined ladder
 * with the fold living in the *stowed* pose instead.
 *
 * The first calibration pass used 0.52/-0.16/-0.20, which put the chain only
 * ~9° off vertical: the foot buried itself 0.88 m into the ground and still
 * landed 1.79 m short of the boarding anchor.
 */
export const SHIP_ACCESS_HATCH_SWING = 1.42;
export const SHIP_ACCESS_LADDER_STOWED_ANGLE = 2.62;
export const SHIP_ACCESS_LADDER_UPPER_ANGLE = 1.2;
export const SHIP_ACCESS_LADDER_MID_ANGLE = 0;
export const SHIP_ACCESS_LADDER_LOWER_ANGLE = 0;

/**
 * Ventral access bay of the scout: a hatch collar seated against the hull,
 * a telescopic column that physically connects the belly to the platform at
 * every moment of the ride, and an egress ramp with directional chevrons.
 * Designed as one retractable system — no floating housings, no loose masts.
 */
export class ShipAccessLift {
  readonly group = new THREE.Group();

  readonly boardingAnchor = new THREE.Object3D();

  state: ShipAccessState = 'retracted';

  /**
   * Terrain height at an arbitrary world X/Z, injected by the game.
   *
   * The bay group is planted at the ship's own ground height, so every child
   * inherits that one sample. The egress point sits 6.25 m off the centreline,
   * and on sloped ground — Aurora's valley floor being the case that actually
   * broke — the surface under the pilot's feet is not the surface under the
   * ship. Sampling at the foot's own position is what keeps the exit on the
   * ground instead of floating above or sinking into it.
   */
  private groundSampler?: (x: number, z: number) => number;

  /** Live foot metrics, for diagnostics and the boarding gate. */
  private footTerrainHeight = 0;
  private footGroundDifference = 0;
  private footSafe = true;

  /** Reused every frame: the access update must not allocate. */
  private readonly footWorldScratch = new THREE.Vector3();
  private readonly footTargetScratch = new THREE.Vector3();

  /**
   * Y of the hull's underside relative to the ship origin, injected once from
   * PlayerShip. Keeps the hatch on the real skin across any rescale.
   */
  private hullBottomOffset = -2.6;

  private readonly bayCollar: THREE.Group;

  private readonly bayThroat: THREE.Mesh;

  private readonly doorLeft: THREE.Mesh;

  private readonly doorRight: THREE.Mesh;

  /** Pivot groups for the two hatch leaves; rotating them swings the panel. */
  private readonly hatchHinges: THREE.Group[] = [];

  /**
   * Folding ladder, outboard from the hatch. Three hinged sections: an upper
   * stringer pair that swings out of the bay, a mid section that unfolds from
   * it, and a lower section carrying the ground step. Each is a pivot group so
   * the fold is rotation, never scaling — nothing stretches.
   */
  private readonly ladderRoot = new THREE.Group();
  private readonly ladderUpper = new THREE.Group();
  private readonly ladderMid = new THREE.Group();
  private readonly ladderLower = new THREE.Group();
  private readonly ladderFoot = new THREE.Group();
  /** Largest fully-deployed step correction requested, before clamping. */
  private peakFootTravelRequested = 0;
  /** Live 0..1 progress per section, for diagnostics. */
  private hatchProgressValue = 0;
  private ladderPrimaryProgressValue = 0;
  private ladderSecondaryProgressValue = 0;
  private footAdjustmentProgressValue = 0;

  private readonly bayGlow: THREE.Mesh;

  private readonly bayGlowMaterial: THREE.MeshBasicMaterial;

  private readonly throatMaterial: THREE.MeshStandardMaterial;

  private readonly edgeLightMaterial: THREE.MeshStandardMaterial;

  private lensMaterial!: THREE.MeshStandardMaterial;

  private readonly touchdownPuffs: THREE.Sprite[] = [];

  private readonly touchdownPuffMaterials: THREE.SpriteMaterial[] = [];

  private readonly contactShadow: THREE.Mesh;

  private readonly contactShadowMaterial: THREE.MeshBasicMaterial;

  private touchdownPuffAge = 99;

  private puffStrength = 0.26;

  private lockPulse = 0;

  private prevLiftDown = 0;

  private lastElapsed = 0;

  private deckHeight = 3.8;

  private readonly hatchLocal = new THREE.Vector3(3.65, 3.8, 1.05);

  private readonly liftBaseLocal = new THREE.Vector3(3.65, 0.18, 1.05);

  private readonly groundExitLocal = new THREE.Vector3(6.25, 0.05, 1.05);

  constructor() {
    this.group.name = 'Scout Ship Ventral Access Lift';
    this.group.visible = false;
    this.boardingAnchor.name = 'shipBoardingAnchor';
    this.boardingAnchor.position.copy(this.groundExitLocal);
    this.group.add(this.boardingAnchor);

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x232b31, roughness: 0.52, metalness: 0.84 });
    const hull = new THREE.MeshStandardMaterial({ color: 0x7f8a91, roughness: 0.46, metalness: 0.74 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x11171b, roughness: 0.92, metalness: 0.3 });

    // Warm interior of the bay: reads as a lit compartment when the doors
    // part, exactly like an aircraft wheel well at night. Desaturated so the
    // spill feels like tungsten service light, not orange neon.
    this.throatMaterial = new THREE.MeshStandardMaterial({
      color: 0x261f19,
      emissive: 0xe0a873,
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.2,
      side: THREE.BackSide
    });

    // Muted amber service lighting shared by platform edge and ramp chevrons.
    this.edgeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c3a28,
      emissive: 0xdda368,
      emissiveIntensity: 0,
      roughness: 0.34,
      metalness: 0.22
    });

    // --- Bay collar: hatch frame seated flush against the hull belly ---
    this.bayCollar = new THREE.Group();
    this.bayCollar.name = 'Access Bay Collar';

    const collarPlate = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.0), hull);
    collarPlate.position.y = 0.42;
    this.bayCollar.add(collarPlate);

    // Recessed panel seams across the collar plate: fine machined relief.
    const seamMetal = new THREE.MeshStandardMaterial({ color: 0x171d22, roughness: 0.6, metalness: 0.7 });
    for (const z of [-0.62, 0, 0.62]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.015, 0.035), seamMetal);
      seam.position.set(0, 0.325, z);
      this.bayCollar.add(seam);
    }

    // Frame moldings around the opening, each capped with a thin worn lip.
    for (const [width, depth, x, z] of [
      [2.5, 0.24, 0, -0.95],
      [2.5, 0.24, 0, 0.95],
      [0.26, 1.7, -1.15, 0],
      [0.26, 1.7, 1.15, 0]
    ] as [number, number, number, number][]) {
      const molding = new THREE.Mesh(new THREE.BoxGeometry(width, 0.34, depth), darkMetal);
      molding.position.set(x, 0.28, z);
      this.bayCollar.add(molding);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.03, depth * 0.9), hull);
      lip.position.set(x, 0.1, z);
      this.bayCollar.add(lip);
    }

    // Translucent service-light lenses along both long moldings: soft warm
    // strips that read as diffused fixtures, not bare emissive blocks.
    this.lensMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8b58c,
      emissive: 0xdba876,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55
    });
    for (const z of [-0.95, 0.95]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.07), this.lensMaterial);
      lens.position.set(0, 0.13, z * 1.04);
      this.bayCollar.add(lens);
    }

    // Lit throat of the bay, visible through the parted doors.
    this.bayThroat = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.62, 1.5), this.throatMaterial);
    this.bayThroat.position.y = 0.28;
    this.bayCollar.add(this.bayThroat);

    // --- Hatch panel: a clamshell pair hinged at the frame's long edges ---
    // Each leaf is a real machined panel — outer skin, dark inner face, a
    // compressible seal bead and a hinge boss — pivoting about its own edge
    // rather than sliding, so the opening reads as hull hardware.
    this.doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.11, 1.52), hull);
    this.doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.11, 1.52), hull);
    for (const [leaf, side] of [[this.doorLeft, -1], [this.doorRight, 1]] as [THREE.Mesh, number][]) {
      leaf.name = `Access Hatch Leaf ${side < 0 ? 'Port' : 'Starboard'}`;
      // Dark inner face: what you see once the leaf swings down.
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.44), darkMetal);
      inner.position.y = -0.062;
      leaf.add(inner);
      // Seal bead around the mating edge.
      const seal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.46), grip);
      seal.position.set(side * 0.46, -0.045, 0);
      leaf.add(seal);
      // Stiffening ribs across the outer skin.
      for (const z of [-0.44, 0.44]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.07), darkMetal);
        rib.position.set(0, 0.07, z);
        leaf.add(rib);
      }
      // Hinge bosses at the outboard edge, where the leaf pivots.
      for (const z of [-0.58, 0.58]) {
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 8), darkMetal);
        boss.rotation.z = Math.PI / 2;
        boss.position.set(side * 0.94, 0.0, z);
        leaf.add(boss);
      }
      // The pivot lives at the outboard edge: offset the geometry inside a
      // hinge group so rotating the group swings the leaf about that edge.
      const hinge = new THREE.Group();
      hinge.name = `Access Hatch Hinge ${side < 0 ? 'Port' : 'Starboard'}`;
      hinge.position.set(side * 0.98, 0.02, 0);
      leaf.position.set(-side * 0.49, 0, 0);
      hinge.add(leaf);
      this.hatchHinges.push(hinge);
      this.bayCollar.add(hinge);
    }

    // Door servo housings and the guide rails the platform locks into —
    // small, purposeful mechanics visible through the parted doors.
    for (const side of [-1, 1]) {
      const servo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.42), darkMetal);
      servo.position.set(side * 1.02, 0.14, side * 0.5);
      this.bayCollar.add(servo);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.09), darkMetal);
      rail.position.set(side * 0.78, 0.36, 0);
      this.bayCollar.add(rail);
    }

    this.group.add(this.bayCollar);

    this.buildFoldingLadder(hull, darkMetal, grip);


    // --- Soft bay light spilling to the ground while the lift is open ---
    // A cone of open-ended geometry was tried first and read as a hard-edged
    // tan slab hanging under the belly: untextured additive faces have a
    // silhouette, and a silhouette is the one thing spill light must not have.
    // A soft-textured pool on the ground has no edge to give itself away.
    this.bayGlowMaterial = new THREE.MeshBasicMaterial({
      map: createSoftParticleTexture(64),
      color: 0xe3bc93,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.bayGlow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), this.bayGlowMaterial);
    this.bayGlow.rotation.x = -Math.PI / 2;
    this.bayGlow.name = 'Access Bay Light Spill';
    this.group.add(this.bayGlow);

    // --- Contact shadow: soft dark blob on the ground under the platform.
    // It deepens as the deck approaches, selling the platform's weight ---
    this.contactShadowMaterial = new THREE.MeshBasicMaterial({
      map: createSoftParticleTexture(64),
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.contactShadow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), this.contactShadowMaterial);
    this.contactShadow.name = 'Access Lift Contact Shadow';
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.group.add(this.contactShadow);

    // --- Touchdown dust: three soft puffs kicked out when the platform
    // settles on the ground, then faded within a second ---
    const puffTexture = createSoftParticleTexture(64);
    for (let i = 0; i < 3; i += 1) {
      const puffMaterial = new THREE.SpriteMaterial({
        map: puffTexture,
        color: 0xb9a893,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const puff = new THREE.Sprite(puffMaterial);
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      puff.position.set(
        this.liftBaseLocal.x + Math.cos(angle) * 0.9,
        0.32,
        this.liftBaseLocal.z + Math.sin(angle) * 0.9
      );
      puff.visible = false;
      this.touchdownPuffs.push(puff);
      this.touchdownPuffMaterials.push(puffMaterial);
      this.group.add(puff);
    }

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });
  }

  /**
   * Builds the folding ladder once, as three nested pivot groups.
   *
   * Nesting is what makes the fold mechanical: `mid` hangs off the end of
   * `upper`, `lower` off the end of `mid`, and the foot off the end of
   * `lower`. Deployment is therefore three rotations — no scaling, no
   * stretching, no geometry rebuilt per frame. Sized for a 1.78 m pilot:
   * 0.68 m clear width and 0.30 m tread pitch.
   */
  private buildFoldingLadder(
    hull: THREE.MeshStandardMaterial,
    darkMetal: THREE.MeshStandardMaterial,
    grip: THREE.MeshStandardMaterial
  ): void {
    const SECTION = SHIP_ACCESS_LADDER_SECTION_LENGTH;
    const HALF_WIDTH = SHIP_ACCESS_LADDER_WIDTH * 0.5;
    const TREADS_PER_SECTION = 4;

    // One geometry set shared by every section.
    const stringerGeometry = new THREE.BoxGeometry(0.07, SECTION, 0.055);
    const treadGeometry = new THREE.BoxGeometry(0.055, 0.03, SHIP_ACCESS_LADDER_WIDTH - 0.06);
    const gripGeometry = new THREE.BoxGeometry(0.045, 0.012, SHIP_ACCESS_LADDER_WIDTH - 0.12);
    const hingeGeometry = new THREE.CylinderGeometry(0.05, 0.05, SHIP_ACCESS_LADDER_WIDTH + 0.04, 8);

    const buildSection = (group: THREE.Group, name: string): void => {
      group.name = name;
      // Two stringers, pivoting from their top end: shift the geometry down
      // by half a section so the group's origin is the hinge line.
      for (const side of [-1, 1]) {
        const stringer = new THREE.Mesh(stringerGeometry, darkMetal);
        stringer.position.set(0, -SECTION * 0.5, side * HALF_WIDTH);
        stringer.castShadow = true;
        group.add(stringer);
      }
      // Hinge barrel across the top of the section.
      const barrel = new THREE.Mesh(hingeGeometry, hull);
      barrel.rotation.x = Math.PI / 2;
      group.add(barrel);
      // Treads with real thickness plus an anti-slip strip on each.
      for (let i = 0; i < TREADS_PER_SECTION; i += 1) {
        const y = -SECTION * ((i + 0.6) / TREADS_PER_SECTION);
        const tread = new THREE.Mesh(treadGeometry, hull);
        tread.position.set(0, y, 0);
        tread.castShadow = true;
        group.add(tread);
        const strip = new THREE.Mesh(gripGeometry, grip);
        strip.position.set(0, y + 0.021, 0);
        group.add(strip);
      }
    };

    buildSection(this.ladderUpper, 'Access Ladder Upper Section');
    buildSection(this.ladderMid, 'Access Ladder Mid Section');
    buildSection(this.ladderLower, 'Access Ladder Lower Section');

    // Ground step at the bottom of the lower section: a wider foot plate with
    // a shallow lip, so the last step reads as something you stand on.
    this.ladderFoot.name = 'Access Ladder Ground Step';
    const footPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.045, SHIP_ACCESS_LADDER_WIDTH + 0.1),
      darkMetal
    );
    footPlate.castShadow = true;
    this.ladderFoot.add(footPlate);
    const footGrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.012, SHIP_ACCESS_LADDER_WIDTH),
      grip
    );
    footGrip.position.y = 0.028;
    this.ladderFoot.add(footGrip);
    for (const side of [-1, 1]) {
      const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), darkMetal);
      gusset.position.set(0, 0.09, side * HALF_WIDTH);
      this.ladderFoot.add(gusset);
    }

    // Nest the sections so folding is pure rotation.
    this.ladderFoot.position.y = -SECTION;
    this.ladderLower.add(this.ladderFoot);
    this.ladderMid.position.y = -SECTION;
    this.ladderMid.add(this.ladderLower);
    this.ladderUpper.position.y = -SECTION;
    this.ladderUpper.add(this.ladderMid);

    this.ladderRoot.name = 'Access Folding Ladder';
    this.ladderRoot.add(this.ladderUpper);
    this.ladderRoot.visible = false;
    this.group.add(this.ladderRoot);
  }

  updateAnchor(
    shipPosition: THREE.Vector3,
    shipYaw: number,
    groundHeight: number,
    openProgress: number,
    liftDownProgress: number,
    elapsed = 0
  ): void {
    const open = THREE.MathUtils.clamp(openProgress, 0, 1);
    const liftDown = THREE.MathUtils.clamp(liftDownProgress, 0, 1);
    this.group.visible = open > 0.01;
    this.group.position.set(shipPosition.x, groundHeight, shipPosition.z);
    this.group.rotation.y = shipYaw;

    // Hatch height derives from the hull's real underside, not a constant.
    //
    // This used to be `Math.max(2.75, shipPosition.y - groundHeight - 1.18)`.
    // The 2.75 floor was tuned for the pre-rescale hull; after the ×1.7 the
    // frame ended up ~2.5 m above the belly, i.e. buried inside the fuselage,
    // which is why the under-hull captures showed no hatch at all. Now the
    // frame sits on the skin: ship origin + hull bottom offset, minus a small
    // surface gap to avoid z-fighting against the GLB.
    const hullBottomWorldY = shipPosition.y + this.hullBottomOffset;
    this.deckHeight = Math.max(
      SHIP_ACCESS_MIN_DECK_HEIGHT,
      hullBottomWorldY - groundHeight - SHIP_ACCESS_HATCH_SURFACE_OFFSET
    );
    this.hatchLocal.y = this.deckHeight;
    this.liftBaseLocal.y = 0.18;

    // Collar rides flush under the hull belly; no vertical group scaling —
    // the deployment reads through doors, column and platform instead.
    this.bayCollar.position.copy(this.hatchLocal);

    // --- Hatch: unlock, crack the seal, then swing the leaves down -------
    // Reuses the existing open progress; no timers of its own.
    this.hatchProgressValue = open;
    const sealCrack = THREE.MathUtils.smoothstep(open, 0.02, 0.16) * 0.05;
    const leafSwing = THREE.MathUtils.smoothstep(open, 0.16, 0.72) * SHIP_ACCESS_HATCH_SWING;
    for (const [index, hinge] of this.hatchHinges.entries()) {
      // Port leaf swings one way, starboard the other: a clamshell.
      hinge.rotation.z = (index === 0 ? 1 : -1) * leafSwing;
      hinge.position.y = 0.02 - sealCrack;
    }
    // Unlock flicker while the latches release, then a steady service glow.
    const wake = open > 0.03 && open < 0.35 ? 0.84 + Math.sin(elapsed * 26) * 0.16 : 1;
    const serviceGlow = THREE.MathUtils.smoothstep(open, 0.2, 0.9);
    this.throatMaterial.emissiveIntensity = serviceGlow * 0.85 * wake;
    this.lensMaterial.emissiveIntensity = serviceGlow * 0.6 * wake;
    this.lensMaterial.opacity = 0.35 + serviceGlow * 0.2;

    // --- Ladder: three sections unfolding in order ------------------------
    // Gated behind the hatch so the ladder can never deploy through a closed
    // panel, and staged so each section finishes before the next begins.
    const hatchOpenEnough = THREE.MathUtils.smoothstep(open, 0.55, 0.85);
    const deploy = liftDown * hatchOpenEnough;
    this.ladderPrimaryProgressValue = THREE.MathUtils.smoothstep(deploy, 0.0, 0.45);
    this.ladderSecondaryProgressValue = THREE.MathUtils.smoothstep(deploy, 0.35, 0.8);
    const lowerProgress = THREE.MathUtils.smoothstep(deploy, 0.7, 1.0);

    this.ladderRoot.visible = deploy > 0.01;
    this.ladderRoot.position.set(this.hatchLocal.x, this.hatchLocal.y - 0.18, this.hatchLocal.z);

    // Stowed, the sections are folded back up inside the bay; deploying
    // rotates each one down and outboard. Pure rotation — nothing stretches.
    this.ladderUpper.rotation.z = THREE.MathUtils.lerp(
      SHIP_ACCESS_LADDER_STOWED_ANGLE, SHIP_ACCESS_LADDER_UPPER_ANGLE, this.ladderPrimaryProgressValue
    );
    this.ladderMid.rotation.z = THREE.MathUtils.lerp(
      -SHIP_ACCESS_LADDER_STOWED_ANGLE, SHIP_ACCESS_LADDER_MID_ANGLE, this.ladderSecondaryProgressValue
    );
    this.ladderLower.rotation.z = THREE.MathUtils.lerp(
      -SHIP_ACCESS_LADDER_STOWED_ANGLE, SHIP_ACCESS_LADDER_LOWER_ANGLE, lowerProgress
    );

    // Re-seat the egress foot on its own terrain, not the ship's. This is the
    // existing terrain-aware correction — not a second ground calculation.
    this.reseatEgressFoot();

    // --- Foot: meet the ground the ladder actually stands on --------------
    // Only the last section adapts, and only within a bounded travel: the
    // ship never moves and the 0.12 m parked clearance is untouched. An
    // unsafe surface holds the deployment short instead of stretching to it.
    // Settle the ground step onto the terrain beneath it.
    //
    // The step hangs off the lower ladder section, which is rotated ~68° from
    // vertical when deployed. Local Y is therefore NOT world up: measured,
    // one unit of local Y buys only 0.362 of world Y (and −0.92 of world X).
    // An earlier version added the world gap straight onto `position.y`, so
    // roughly a third of the correction landed and the step settled at a fixed
    // residual — which is why widening the travel limit changed nothing: the
    // limit was never the binding constraint.
    //
    // The fix is to build the target in world space and convert it into the
    // parent's local space, so the correction is expressed on the axis it is
    // actually applied to.
    this.ladderFoot.position.set(0, -SHIP_ACCESS_LADDER_SECTION_LENGTH, 0);
    this.ladderFoot.updateWorldMatrix(true, false);
    this.footWorldScratch.setFromMatrixPosition(this.ladderFoot.matrixWorld);
    const groundUnderStep = this.groundSampler
      ? this.groundSampler(this.footWorldScratch.x, this.footWorldScratch.z)
      : this.group.position.y;
    this.footAdjustmentProgressValue = this.footSafe ? lowerProgress : 0;

    // Desired world point: same ground position, resting just above terrain.
    const desiredWorldY = groundUnderStep + SHIP_ACCESS_FOOT_CLEARANCE;
    const requestedCorrection = desiredWorldY - this.footWorldScratch.y;
    // The step is rebuilt from its rest pose every frame, so this request is
    // absolute rather than incremental: its peak is exactly the travel the
    // clamp has to allow. Tracked so the budget can be measured per surface
    // instead of guessed.
    if (this.footAdjustmentProgressValue > 0.99) {
      this.peakFootTravelRequested = Math.max(
        this.peakFootTravelRequested,
        Math.abs(requestedCorrection)
      );
    }
    const worldCorrection = THREE.MathUtils.clamp(
      requestedCorrection,
      -SHIP_ACCESS_FOOT_TRAVEL,
      SHIP_ACCESS_FOOT_TRAVEL
    ) * this.footAdjustmentProgressValue;
    this.footTargetScratch.set(
      this.footWorldScratch.x,
      this.footWorldScratch.y + worldCorrection,
      this.footWorldScratch.z
    );
    const stepParent = this.ladderFoot.parent;
    if (stepParent) {
      // `worldToLocal` reuses a shared internal matrix — no allocation here.
      stepParent.updateWorldMatrix(true, false);
      stepParent.worldToLocal(this.footTargetScratch);
      this.ladderFoot.position.copy(this.footTargetScratch);
    }

    // Once the ladder is down, the boarding anchor is derived from where the
    // step actually settled plus a deliberate outboard offset, so the pilot
    // stands beside the bottom step rather than inside it. Before that it
    // keeps the stowed egress point that `reseatEgressFoot` maintains — the
    // two must never disagree by accident.
    if (this.footSafe && lowerProgress > 0.9) {
      this.ladderFoot.updateWorldMatrix(true, false);
      this.footTargetScratch.setFromMatrixPosition(this.ladderFoot.matrixWorld);
      this.group.worldToLocal(this.footTargetScratch);
      this.footTargetScratch.x += SHIP_ACCESS_BOARDING_APPROACH_OFFSET;
      this.boardingAnchor.position.copy(this.footTargetScratch);
    }
    this.ladderFoot.rotation.z = -this.ladderLower.rotation.z * 0.6;
    this.ladderFoot.visible = this.footSafe;

    // Contact shadow sits under the deployed foot rather than a platform.
    const contactStrength = lowerProgress * (this.footSafe ? 1 : 0);
    this.contactShadow.visible = contactStrength > 0.02;
    this.contactShadow.position.set(this.groundExitLocal.x, 0.06, this.groundExitLocal.z);
    this.contactShadow.scale.setScalar(0.85 + contactStrength * 0.25);
    this.contactShadowMaterial.opacity = contactStrength * contactStrength * 0.3;

    // Bay light reaches the ground as a pool under the hatch. Local y = 0 is
    // the terrain, as the contact shadow above uses; sit just under it so the
    // two never fight for the same depth.
    this.bayGlow.position.set(this.hatchLocal.x, 0.045, this.hatchLocal.z);
    this.bayGlow.scale.setScalar(1);
    // Only lit while the hatch is genuinely open; fully off when sealed.
    this.bayGlowMaterial.opacity = THREE.MathUtils.smoothstep(open, 0.5, 1) * 0.16;
    this.bayGlow.visible = open > 0.5;
    // Frame lighting breathes slowly instead of strobing. The safety band and
    // ramp chevrons belonged to the platform and ramp that the hatch and
    // ladder replaced, so only the frame fixtures are driven now.
    const breathe = Math.sin(elapsed * 2.4) * 0.5 + 0.5;
    this.edgeLightMaterial.emissiveIntensity = open * (0.5 + breathe * 0.34);

    // Ground dust: a firm puff when the platform settles (liftDown crossing
    // 0.97 downward) and a fainter stir when it lifts off the ground again.
    const dt = this.lastElapsed > 0 ? THREE.MathUtils.clamp(elapsed - this.lastElapsed, 0, 0.1) : 0;
    this.lastElapsed = elapsed;
    if (open > 0.5 && this.prevLiftDown < 0.97 && liftDown >= 0.97) {
      this.touchdownPuffAge = 0;
      this.puffStrength = 0.26;
    } else if (open > 0.5 && this.prevLiftDown >= 0.97 && liftDown < 0.97) {
      this.touchdownPuffAge = 0;
      this.puffStrength = 0.13;
    }
    // Lock pulse: the mechanism seats into the bay at the top of the ride —
    // one short mechanical shudder through the collar, then stillness.
    if (open > 0.5 && this.prevLiftDown > 0.03 && liftDown <= 0.03) {
      this.lockPulse = 1;
    }
    this.lockPulse = Math.max(0, this.lockPulse - dt * 3.2);
    this.bayCollar.position.y = this.hatchLocal.y + Math.sin(elapsed * 68) * 0.014 * this.lockPulse;
    this.prevLiftDown = liftDown;
    this.touchdownPuffAge += dt;
    const puffT = this.touchdownPuffAge / 0.9;
    for (const [index, puff] of this.touchdownPuffs.entries()) {
      if (puffT >= 1) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      const spread = 0.7 + puffT * (1.6 + index * 0.25);
      puff.scale.setScalar(spread);
      puff.position.y = 0.32 + puffT * 0.42;
      this.touchdownPuffMaterials[index].opacity = (1 - puffT) * (1 - puffT) * this.puffStrength;
    }
  }

  /** 1→0 impulse emitted when the platform seats into the bay; used for a
   *  subtle camera tremor during boarding. */
  get lockImpulse(): number {
    return this.lockPulse;
  }

  getTransitPoint(exitProgress: number): THREE.Vector3 {
    const progress = THREE.MathUtils.clamp(exitProgress, 0, 1);
    let local: THREE.Vector3;
    if (progress < 0.76) {
      // The pilot's feet use the live platform transform. This keeps them
      // mechanically locked to the deck throughout the vertical ride.
      local = new THREE.Vector3(this.hatchLocal.x, this.hatchLocal.y - 0.32, this.hatchLocal.z);
    } else {
      const t = THREE.MathUtils.smoothstep(progress, 0.76, 1);
      local = new THREE.Vector3(this.hatchLocal.x, this.hatchLocal.y - 0.32, this.hatchLocal.z)
        .lerp(this.groundExitLocal, t);
    }
    return this.group.localToWorld(local);
  }

  getPlatformStandPosition(): THREE.Vector3 {
    return this.group.localToWorld(
      new THREE.Vector3(this.hatchLocal.x, this.hatchLocal.y - 0.32, this.hatchLocal.z)
    );
  }

  /**
   * World centre of the hatch aperture itself. The inspection camera framed the
   * boarding anchor, which sits on the ground: the hatch was never actually in
   * shot, which is why it kept being reported as "not visually confirmed".
   */
  getHatchWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.group.localToWorld(this.hatchLocal.clone()));
  }

  getBoardingCameraPosition(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(10.4, 4.9, 8.2));
  }

  getBoardingLookTarget(): THREE.Vector3 {
    const local = this.hatchLocal.clone().lerp(this.liftBaseLocal, 0.46);
    local.x += 0.45;
    return this.group.localToWorld(local);
  }

  /**
   * Installs the terrain probe. Called once at start-up; the sampler is the
   * same source `parkShipOnTerrain` uses, so the egress foot and the hull
   * agree about where the ground is.
   */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundSampler = sampler;
  }

  /** Hull underside offset from the ship origin, in ship-local units. */
  setHullBottomOffset(offset: number): void {
    this.hullBottomOffset = offset;
  }

  /** Distance from the hatch frame to the hull skin. Diagnostics. */
  get hatchSurfaceDistance(): number {
    return SHIP_ACCESS_HATCH_SURFACE_OFFSET;
  }

  /** Deck height above terrain, i.e. where the threshold sits. */
  get hatchDeckHeight(): number {
    return this.deckHeight;
  }

  /**
   * Re-seats the egress foot on the terrain beneath it.
   *
   * Called from `updateAnchor`, i.e. only while the bay is being driven —
   * never as a standalone per-frame pass. Costs one terrain sample and no
   * allocation. The correction is clamped: past the limit the surface is too
   * broken to step onto and the foot is reported unsafe rather than stretched
   * to reach, so the pilot is never dropped into a hole.
   */
  private reseatEgressFoot(): void {
    if (!this.groundSampler) {
      this.footTerrainHeight = this.group.position.y;
      this.footGroundDifference = 0;
      this.footSafe = true;
      return;
    }
    // World position of the foot with its current local Y, then ask the
    // terrain what it is standing over.
    this.footWorldScratch.copy(this.groundExitLocal);
    this.group.localToWorld(this.footWorldScratch);
    this.footTerrainHeight = this.groundSampler(this.footWorldScratch.x, this.footWorldScratch.z);

    // How far the terrain under the foot sits from the bay's own datum.
    const datum = this.group.position.y;
    const rawDifference = this.footTerrainHeight - datum;
    this.footGroundDifference = rawDifference;
    this.footSafe = Math.abs(rawDifference) <= SHIP_ACCESS_MAX_GROUND_DROP;

    // Only the foot moves — the bay, the ship and the 0.12 m parked clearance
    // are untouched. Clamped so a cliff edge cannot stretch the access.
    const correction = THREE.MathUtils.clamp(
      rawDifference,
      -SHIP_ACCESS_MAX_GROUND_DROP,
      SHIP_ACCESS_MAX_GROUND_DROP
    );
    this.boardingAnchor.position.set(
      this.groundExitLocal.x,
      this.groundExitLocal.y + correction,
      this.groundExitLocal.z
    );
  }

  /** 0..1 hatch opening, mirroring the state machine's own progress. */
  get hatchProgress(): number {
    return this.hatchProgressValue;
  }

  /** 0..1 of the upper ladder section swinging clear of the bay. */
  get ladderPrimaryProgress(): number {
    return this.ladderPrimaryProgressValue;
  }

  /** 0..1 of the mid section unfolding. Always trails the primary. */
  get ladderSecondaryProgress(): number {
    return this.ladderSecondaryProgressValue;
  }

  /** 0..1 of the ground step settling onto the terrain. */
  get footAdjustmentProgress(): number {
    return this.footAdjustmentProgressValue;
  }

  /** World position of the ladder's top hinge. Diagnostics only. */
  getLadderTopWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.ladderRoot.getWorldPosition(target);
  }

  /** World position of the ground step. Diagnostics only. */
  getLadderBottomWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.ladderFoot.getWorldPosition(target);
  }

  /**
   * Measures the access from the live scene graph.
   *
   * Walks the hatch and ladder subtrees and builds world bounds, so it is
   * genuinely what is on screen rather than the authored numbers. Allocates,
   * and is therefore called only from the capture/diagnostic path — never
   * from `updateAnchor`.
   */
  measureGeometry(sampleGround: (x: number, z: number) => number): ShipAccessMeasurement {
    const top = this.ladderRoot.getWorldPosition(new THREE.Vector3());
    const mid = this.ladderMid.getWorldPosition(new THREE.Vector3());
    const bottom = this.ladderFoot.getWorldPosition(new THREE.Vector3());
    const anchor = this.boardingAnchor.getWorldPosition(new THREE.Vector3());

    const frameBox = new THREE.Box3().setFromObject(this.bayCollar);
    const frameSize = frameBox.getSize(new THREE.Vector3());
    // Aperture between the two leaves, measured from their world bounds.
    const leftBox = new THREE.Box3().setFromObject(this.doorLeft);
    const rightBox = new THREE.Box3().setFromObject(this.doorRight);
    const leafGap = Math.max(0, rightBox.min.x - leftBox.max.x);

    const groundUnderFoot = sampleGround(bottom.x, bottom.z);

    return {
      // With the leaves swung down the clear opening is the frame's own
      // aperture; the gap between leaves reports how far they have parted.
      hatchOpeningWidth: Number(Math.max(leafGap, frameSize.z * 0.75).toFixed(3)),
      hatchOpeningHeight: Number(frameSize.z.toFixed(3)),
      leafGapClosed: Number(leafGap.toFixed(3)),
      ladderTopWorld: top.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
      ladderMidWorld: mid.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
      ladderBottomWorld: bottom.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
      ladderTotalLength: Number(top.distanceTo(bottom).toFixed(3)),
      ladderUsefulWidth: SHIP_ACCESS_LADDER_WIDTH,
      stepSpacing: Number((SHIP_ACCESS_LADDER_SECTION_LENGTH / 4).toFixed(3)),
      terrainHeightAtLadderBottom: Number(groundUnderFoot.toFixed(3)),
      footClearance: Number((bottom.y - groundUnderFoot).toFixed(3)),
      footSafe: this.footSafe,
      boardingAnchorWorld: anchor.toArray().map((v) => Number(v.toFixed(3))) as [number, number, number],
      anchorToFootDistance: Number(anchor.distanceTo(bottom).toFixed(3))
    };
  }

  /**
   * One-shot trace of the ground-step transform chain.
   *
   * Diagnostic only: it re-runs the same arithmetic `updateAnchor` performs and
   * reports every intermediate value, so the reason a correction does or does
   * not reach world space can be read off directly instead of guessed at.
   */
  /** Peak step travel actually requested since the last reset, in metres. */
  get peakFootTravel(): number {
    return Number(this.peakFootTravelRequested.toFixed(4));
  }

  /** Clears the travel high-water mark so a surface can be measured alone. */
  resetPeakFootTravel(): void {
    this.peakFootTravelRequested = 0;
  }

  debugFootChain(sampleGround: (x: number, z: number) => number): Record<string, unknown> {
    const localBefore = this.ladderFoot.position.clone();
    this.ladderFoot.updateWorldMatrix(true, false);
    const worldBefore = new THREE.Vector3().setFromMatrixPosition(this.ladderFoot.matrixWorld);
    const terrain = sampleGround(worldBefore.x, worldBefore.z);
    const gap = worldBefore.y - terrain;
    const requested = gap;
    const clamped = THREE.MathUtils.clamp(gap, -SHIP_ACCESS_FOOT_TRAVEL, SHIP_ACCESS_FOOT_TRAVEL);

    // What one unit of local Y actually does in world space: if the parent
    // chain is rotated, local Y and world up are not the same direction.
    const parent = this.ladderFoot.parent;
    const localUpInWorld = new THREE.Vector3(0, 1, 0);
    if (parent) {
      parent.updateWorldMatrix(true, false);
      localUpInWorld.transformDirection(parent.matrixWorld);
    }

    return {
      localBefore: localBefore.toArray().map((v) => Number(v.toFixed(4))),
      worldBefore: worldBefore.toArray().map((v) => Number(v.toFixed(4))),
      terrainHeight: Number(terrain.toFixed(4)),
      verticalGap: Number(gap.toFixed(4)),
      requestedCorrection: Number(requested.toFixed(4)),
      clampedCorrection: Number(clamped.toFixed(4)),
      footTravelLimit: SHIP_ACCESS_FOOT_TRAVEL,
      footAdjustmentProgress: Number(this.footAdjustmentProgressValue.toFixed(4)),
      footSafe: this.footSafe,
      parentName: parent?.name ?? 'none',
      // The decisive number: how much world Y one unit of local Y buys.
      localUpInWorld: localUpInWorld.toArray().map((v) => Number(v.toFixed(4))),
      worldYPerLocalY: Number(localUpInWorld.y.toFixed(4)),
      lowerRotationZ: Number(this.ladderLower.rotation.z.toFixed(4)),
      footRotationZ: Number(this.ladderFoot.rotation.z.toFixed(4)),
      measuredObject: this.ladderFoot.name,
      adjustedObject: this.ladderFoot.name
    };
  }

  /** Visible meshes in the new hatch and ladder, for the replacement check. */
  countAccessVisuals(): { hatch: number; ladder: number } {
    let hatch = 0;
    let ladder = 0;
    this.bayCollar.traverse((o) => { if ((o as THREE.Mesh).isMesh) hatch += 1; });
    this.ladderRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh) ladder += 1; });
    return { hatch, ladder };
  }

  /** Terrain height sampled under the egress foot itself. */
  get egressTerrainHeight(): number {
    return this.footTerrainHeight;
  }

  /** Signed gap between the foot's datum and the terrain beneath it. */
  get egressGroundDifference(): number {
    return this.footGroundDifference;
  }

  /** False when the surface under the foot is too broken to step onto. */
  get egressFootSafe(): boolean {
    return this.footSafe;
  }

  getGroundExitPosition(): THREE.Vector3 {
    return this.boardingAnchor.getWorldPosition(new THREE.Vector3());
  }

  getBoardingAnchorWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.boardingAnchor.getWorldPosition(target);
  }

  getLiftProgressForExitPath(exitProgress: number): number {
    return THREE.MathUtils.smoothstep(exitProgress, 0.18, 0.76);
  }

  get liftContactShadowActive(): boolean {
    return this.group.visible && this.contactShadow.visible && this.contactShadowMaterial.opacity > 0.01;
  }
}
