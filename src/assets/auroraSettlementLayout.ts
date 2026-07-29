/**
 * Single source of truth for where the Aurora settlement stands.
 *
 * Every piece of colony hardware from M10 through M15 used to carry its own
 * absolute world coordinate, which meant the settlement could not be moved
 * without hand-editing six definition files and silently desynchronising
 * whatever was missed. They are now expressed as offsets from one origin, so
 * the whole settlement relocates as a rigid body and all relative spacing —
 * the walk from the habitat to the mast, the crew standing outside the second
 * module, M15's door sitting on Aurora-02 — is preserved by construction.
 *
 * The origin was chosen by measuring the terrain rather than by eye. The old
 * origin (120, -4160) sat 2.7 m *below* the average terrain around it: the
 * modules were parked in a natural hollow, which is why they read as "lost"
 * from the normal approach, and four members (the comms mast, both of its
 * guy-anchors and M15's comms parasite) sat at or under the 56.4 water line.
 *
 * The current origin sits on the flat shelf on the south side of the clearing.
 * Measured against the old one:
 *
 *   Aurora-01 prominence   -2.71 m  ->  +0.37 m   (out of the hollow)
 *   Aurora-02 prominence   +0.45 m  ->  +1.13 m
 *   Aurora-01 local slope   1.75 m  ->   0.72 m   (over an 8 m footprint)
 *   Aurora-02 local slope   2.30 m  ->   1.22 m
 *   height gap between them 4.02 m  ->   2.73 m
 *   cluster height spread  17.70 m  ->  11.60 m
 *   members at/below water      4   ->      0
 *
 * Anything genuinely tied to a natural feature is deliberately NOT part of the
 * rigid body — see the shore-anchored exports at the bottom.
 */

/** World XZ the whole settlement is measured from; Aurora-01 stands here. */
export const AURORA_SETTLEMENT_ORIGIN = [112, -4198] as const;

export type AuroraPlacement = readonly [number, number];

/** Offset from the settlement origin, in world units. */
function place(offsetX: number, offsetZ: number): AuroraPlacement {
  return [AURORA_SETTLEMENT_ORIGIN[0] + offsetX, AURORA_SETTLEMENT_ORIGIN[1] + offsetZ] as const;
}

/**
 * The rigid cluster. Offsets are the spacing the settlement was authored with
 * across M10-M15; only the origin above moves.
 */
export const auroraSettlementLayout = {
  /** M10: Aurora-01, the first habitat. The origin itself. */
  habitat: place(0, 0),
  /** M10: the soil sample that marks the chosen clearing. */
  soilSample: place(-2, -2),
  /** M11: Aurora-02 and the link that feeds it. */
  secondModule: place(26, 18),
  energyLink: place(13, 9),
  cultivationBed: place(-24, -18),
  /** M12: where the crew capsule sets down, and where the three of them stand. */
  landingZone: place(68, -38),
  crew: [place(32, -18), place(41, -10), place(27, -28)] as const,
  /** M13: the storm hardware. */
  stormGenerator: place(50, 36),
  stormAntenna: place(-22, 32),
  stormAnchors: [place(-32, 42), place(-11, 24)] as const,
  stormShield: place(6, -8),
  /** M14: the analysis terminal beside Aurora-02. */
  traceTerminal: place(42, 8),
  /** M15: the sealed door on Aurora-02 and the supply cache by the habitat. */
  sealedDoor: place(20, 13),
  supplyCache: place(-10, -12),
  /** M15: the two parasites clamped onto settlement hardware. */
  parasiteEnergy: place(36, 42),
  parasiteComms: place(-34, 54),
  /**
   * M16: three Pleyadian defence nodes ringed around the settlement. They stand
   * on open ground clear of every M10-M15 member so the sync walk is a real
   * triangle around Aurora — north, south-east and west — not a huddle.
   */
  pleyadianNodes: [place(6, 52), place(56, -12), place(-48, 6)] as const,
  /**
   * M17: perimeter defence hardware. Three hostile-signature sensors ring the
   * far edge of the clearing, each watching a different approach (north,
   * east, south-west); three shield emitters sit on a tighter ring; the
   * defensive energy accumulator stands beside the M13 storm generator it
   * borrows its feed from. All offsets, so they move with the settlement.
   */
  defenseSensors: [place(0, 66), place(64, -16), place(-56, -34)] as const,
  shieldEmitters: [place(34, -14), place(-34, -6), place(4, 40)] as const,
  energyReserve: place(44, 24),
  /**
   * M18: three point-defence batteries. They sit inside the shield-emitter
   * ring and cover the same three approach corridors the M17 sensors watch,
   * so the perimeter reads as one system rather than two. Installed as sealed
   * modules during M17 and only opened when M18 authorises weapons.
   */
  defenseTurrets: [place(18, 34), place(46, 4), place(-30, 18)] as const,
  /** M18: where the downed drone's wreckage is recovered, east of the clearing. */
  droneWreckage: place(58, 30)
} as const;

// ---------------------------------------------------------------------------
// Shore-anchored. These follow the water, not the settlement, so they are kept
// out of the rigid body on purpose: moving the settlement must never drag the
// water intake off the lake.
// ---------------------------------------------------------------------------

/**
 * The microfilter, on the real lake shore. The terrain here (~56.9) is just
 * above the sheet (~56.4) and the intake, which runs 11.5 m toward -z, reaches
 * the waterline; the pump body stays dry.
 */
export const AURORA_WATER_FILTER: AuroraPlacement = [78, -4268];

/**
 * M15's life-support parasite rides the microfilter's feed line, so it is
 * placed along that line rather than on the settlement grid.
 */
export const AURORA_PARASITE_LIFE_SUPPORT: AuroraPlacement = [92, -4240];
