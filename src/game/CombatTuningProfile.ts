export type CombatUnitClass = 'light' | 'medium' | 'heavy' | 'structure';

export type CombatManeuverProfile = {
  detectionDistance: number;
  interceptDistance: number;
  preferredAttackDistance: number;
  minimumSeparation: number;
  breakDistance: number;
  alignmentSeconds: number;
  maximumAttackRunSeconds: number;
  extensionSeconds: number;
  repositionSeconds: number;
  reacquisitionSeconds: number;
  maximumSpeed: number;
  linearAcceleration: number;
  brakingAcceleration: number;
  maximumAngularSpeed: number;
  angularAcceleration: number;
  firingArcCosine: number;
  solutionToleranceRadians: number;
  accuracy: number;
  burstSeconds: number;
  burstPauseSeconds: number;
};

export const combatTuningProfile = {
  aiUpdateSeconds: 0.1,
  maximumSimultaneousAttackers: 2,
  closeRangeThreshold: 100,
  circleBreakSeconds: 2.2,
  obstacleClearance: 28,
  hud: {
    updateSeconds: 0.04,
    edgePadding: 0.075,
    targetBracketMinimumPx: 34,
    targetBracketMaximumPx: 82,
    nearSolutionRadians: 0.072,
    validSolutionRadians: 0.026,
    targetArcCosine: 0.72
  },
  weapons: {
    laserRange: 680,
    /**
     * Damage per pulse, set so the machine-gun cadence keeps the old lethality.
     *
     * 24 at 0.28 s was 85.7 DPS. 8 at 0.09 s is 88.9 -- and against a 96 HP
     * scout the kill takes 12 pulses in 1.08 s, where it used to take 4 in
     * 1.12 s. Time to kill is unchanged; only the feel is different, which is
     * the point. Raising the rate without this would have tripled DPS and
     * undone the enemy tuning around it.
     */
    laserDamage: 8,
    // Machine-gun cadence: ~11 shots a second instead of ~3.6. This is a real
    // balance change -- damage per shot is untouched, so sustained DPS roughly
    // triples and the 32-round magazine now lasts about 2.9 s of held fire
    // rather than 9 s.
    laserCooldownSeconds: 0.09,
    laserProjectileSpeed: Number.POSITIVE_INFINITY,
    torpedoLockRange: 780,
    torpedoDamage: 90,
    torpedoLaunchSpeed: 165,
    torpedoAccelerationPerSecond: 0.25,
    torpedoTurnResponse: 2.4,
    torpedoCooldownSeconds: 5.5,
    /** Immediate rounds before a manual reload: one per physical tube. */
    torpedoCapacity: 4,
    torpedoMaximumFlightSeconds: 4.2
  },
  units: {
    light: {
      // Engagement envelope pulled in.
      //
      // Measured: a kill was scored with the drone entirely off-camera. At a
      // 330 m orbit a 9 m-radius drone is a few pixels, so the whole fight —
      // impacts, the death visual, the smoke — happened where the player could
      // not see any of it. Polishing explosions would not have helped; the
      // combat simply was not on screen. These distances keep the same
      // structure (intercept -> orbit -> attack run -> break) at a range where
      // the model reads. Speeds, health, damage and accuracy are untouched.
      detectionDistance: 980,
      interceptDistance: 200,
      preferredAttackDistance: 90,
      minimumSeparation: 34,
      breakDistance: 60,
      alignmentSeconds: 1.35,
      maximumAttackRunSeconds: 4.6,
      extensionSeconds: 3.6,
      repositionSeconds: 3.1,
      reacquisitionSeconds: 1.15,
      maximumSpeed: 72,
      linearAcceleration: 30,
      brakingAcceleration: 24,
      maximumAngularSpeed: 0.72,
      angularAcceleration: 1.15,
      firingArcCosine: 0.965,
      solutionToleranceRadians: 0.12,
      accuracy: 0.78,
      burstSeconds: 0.48,
      burstPauseSeconds: 2.4
    },
    medium: {
      detectionDistance: 1120,
      interceptDistance: 720,
      preferredAttackDistance: 430,
      minimumSeparation: 180,
      breakDistance: 260,
      alignmentSeconds: 2.1,
      maximumAttackRunSeconds: 5.8,
      extensionSeconds: 4.4,
      repositionSeconds: 4.2,
      reacquisitionSeconds: 1.8,
      maximumSpeed: 48,
      linearAcceleration: 16,
      brakingAcceleration: 14,
      maximumAngularSpeed: 0.42,
      angularAcceleration: 0.62,
      firingArcCosine: 0.972,
      solutionToleranceRadians: 0.09,
      accuracy: 0.84,
      burstSeconds: 0.72,
      burstPauseSeconds: 3.1
    },
    heavy: {
      detectionDistance: 1450,
      interceptDistance: 920,
      preferredAttackDistance: 620,
      minimumSeparation: 290,
      breakDistance: 400,
      alignmentSeconds: 3.4,
      maximumAttackRunSeconds: 7.5,
      extensionSeconds: 5.8,
      repositionSeconds: 6,
      reacquisitionSeconds: 2.8,
      maximumSpeed: 28,
      linearAcceleration: 7.5,
      brakingAcceleration: 6.5,
      maximumAngularSpeed: 0.2,
      angularAcceleration: 0.28,
      firingArcCosine: 0.98,
      solutionToleranceRadians: 0.065,
      accuracy: 0.9,
      burstSeconds: 1.1,
      burstPauseSeconds: 4.6
    },
    structure: {
      detectionDistance: 1800,
      interceptDistance: 1200,
      preferredAttackDistance: 850,
      minimumSeparation: 0,
      breakDistance: 0,
      alignmentSeconds: 4.2,
      maximumAttackRunSeconds: 0,
      extensionSeconds: 0,
      repositionSeconds: 0,
      reacquisitionSeconds: 3.2,
      maximumSpeed: 0,
      linearAcceleration: 0,
      brakingAcceleration: 0,
      maximumAngularSpeed: 0.11,
      angularAcceleration: 0.16,
      firingArcCosine: 0.985,
      solutionToleranceRadians: 0.045,
      accuracy: 0.92,
      burstSeconds: 1.3,
      burstPauseSeconds: 5.2
    }
  } satisfies Record<CombatUnitClass, CombatManeuverProfile>
} as const;

export const combatBaseline = {
  scoutOrbitRadius: 150,
  scoutAttackRadius: 82,
  scoutAttackRunSeconds: 2.6,
  scoutExtensionSeconds: 2.2,
  scoutOrbitRadiansPerSecond: 0.16,
  lightLaserShotsToKill: 4,
  minimumLightLaserTtkSeconds: 0.84,
  simultaneousAttackers: 6,
  closeRangeDutyCyclePercent: 54
} as const;

/**
 * Primary cannon magazine.
 *
 * The cannon stays an energy weapon: the capacitor holds pulses that are
 * charged and ready to fire, and the reserve is dedicated weapon cells. It
 * deliberately does NOT draw on `resources.energy` per shot any more — pairing
 * a magazine with a shared-pool debit would gate the same trigger twice. Flight,
 * boost and shields keep using `resources.energy` untouched.
 *
 * 90 pulses at the 0.09 s cooldown is ~8.1 s of continuous fire: a real burst
 * that still forces the player to manage reloads.
 */
export const PLAYER_PRIMARY_WEAPON_MAGAZINE = {
  /*
   * Scaled with the cadence, not enlarged.
   *
   * 32 rounds lasted 9 s at the old rate and only 2.9 s at the new one, which
   * would have meant reloading almost as often as firing. 90 restores 8.1 s of
   * held fire, and the reserve keeps the same five-magazine ratio it had -- the
   * ammunition economy is the same shape, just counted in faster rounds.
   */
  magazineCapacity: 90,
  initialMagazine: 90,
  reserveCapacity: 450,
  initialReserve: 450,
  reloadDuration: 1.65,
  manualReload: true,
  autoReload: false
} as const;

/**
 * Ventral torpedo tubes.
 *
 * Four physical tubes hold ready rounds. The onboard fabricator reloads empty
 * tubes sequentially, so capacity and reload time are the gameplay limits.
 */
export const PLAYER_TORPEDO_TUBES = {
  tubeCount: 4,
  initialLoadedTubes: 4,
  /** Legacy save bounds; no longer consumed or consulted by gameplay. */
  reserveCapacity: 8,
  initialReserve: 8,
  /** Seconds to fabricate and load one round into a tube. */
  reloadSecondsPerTube: 0.7
} as const;
