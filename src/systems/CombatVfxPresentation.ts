export type CombatVfxPresentationConfig = {
  muzzle: boolean;
  projectiles: boolean;
  trails: boolean;
  engineTrails: boolean;
  shield: boolean;
  impacts: boolean;
  impactParticles: boolean;
  explosionFlash: boolean;
  explosionPlasma: boolean;
  explosionRing: boolean;
  fragments: boolean;
  damageMarks: boolean;
  damageSmoke: boolean;
  temporaryLights: boolean;
};

export type CombatVfxQualityTier = 'performance' | 'high' | 'ultra';

/** Central presentation budgets. None of these values owns combat authority. */
export const COMBAT_VFX_QUALITY: Readonly<Record<CombatVfxQualityTier, Readonly<{
  impactParticles: number;
  torpedoParticleBonus: number;
  fragments: number;
  marks: number;
  lights: number;
  trailSamples: number;
  muzzleParticles: number;
  enemyProjectiles: number;
  damageRigs: number;
  leakParticles: number;
  damageRigDuration: number;
  coalitionSmokeParticles: number;
  engineTrailParticles: number;
}>>> = Object.freeze({
  performance: Object.freeze({
    impactParticles: 3, torpedoParticleBonus: 2, fragments: 3, marks: 3, lights: 0,
    trailSamples: 10, muzzleParticles: 1, enemyProjectiles: 7, damageRigs: 4,
    leakParticles: 3, damageRigDuration: 8, coalitionSmokeParticles: 3, engineTrailParticles: 40
  }),
  high: Object.freeze({
    impactParticles: 3, torpedoParticleBonus: 3, fragments: 5, marks: 5, lights: 0,
    trailSamples: 14, muzzleParticles: 3, enemyProjectiles: 10, damageRigs: 6,
    leakParticles: 3, damageRigDuration: 10, coalitionSmokeParticles: 6, engineTrailParticles: 60
  }),
  ultra: Object.freeze({
    impactParticles: 7, torpedoParticleBonus: 4, fragments: 8, marks: 8, lights: 1,
    trailSamples: 20, muzzleParticles: 4, enemyProjectiles: 12, damageRigs: 12,
    leakParticles: 8, damageRigDuration: 18, coalitionSmokeParticles: 8, engineTrailParticles: 80
  })
});

export const COMBAT_VFX_DISTANCE = Object.freeze({ close: 280, far: 520 });

export const FULL_COMBAT_VFX: Readonly<CombatVfxPresentationConfig> = Object.freeze({
  muzzle: true,
  projectiles: true,
  trails: true,
  engineTrails: true,
  shield: true,
  impacts: true,
  impactParticles: true,
  explosionFlash: true,
  explosionPlasma: true,
  explosionRing: true,
  fragments: true,
  damageMarks: true,
  damageSmoke: true,
  temporaryLights: true
});

export type CombatVfxDiagnosticPreset =
  | 'full'
  | 'no-explosions'
  | 'no-shield'
  | 'no-impacts'
  | 'no-trails'
  | 'no-debris'
  | 'no-temp-lights'
  | 'no-particles'
  | 'no-impact-particles'
  | 'no-damage-smoke'
  | 'minimal'
  | 'destruction-no-plasma'
  | 'destruction-no-ring';

const PRESET_PATCHES: Record<CombatVfxDiagnosticPreset, Partial<CombatVfxPresentationConfig>> = {
  full: {},
  'no-explosions': { explosionFlash: false, explosionPlasma: false, explosionRing: false },
  'no-shield': { shield: false },
  'no-impacts': { impacts: false, impactParticles: false },
  'no-trails': { trails: false, engineTrails: false },
  'no-debris': { fragments: false },
  'no-temp-lights': { temporaryLights: false },
  'no-particles': { impactParticles: false, explosionPlasma: false, damageSmoke: false },
  'no-impact-particles': { impactParticles: false },
  'no-damage-smoke': { damageSmoke: false },
  minimal: {
    trails: false,
    engineTrails: false,
    impactParticles: false,
    explosionPlasma: false,
    explosionRing: false,
    fragments: false,
    damageMarks: false,
    damageSmoke: false,
    temporaryLights: false
  },
  'destruction-no-plasma': { explosionPlasma: false },
  'destruction-no-ring': { explosionRing: false }
};

export function createCombatVfxConfig(
  patch: Partial<CombatVfxPresentationConfig> = {}
): CombatVfxPresentationConfig {
  return { ...FULL_COMBAT_VFX, ...patch };
}

export function combatVfxPreset(preset: CombatVfxDiagnosticPreset): CombatVfxPresentationConfig {
  return createCombatVfxConfig(PRESET_PATCHES[preset]);
}
