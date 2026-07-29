import { fbm2 } from '../entities/Planets';

/**
 * The erosion field shared by the Aurora route and the Aurora valley.
 *
 * Both used to carve their ground with their own noise seeds, so the drainage
 * lines stopped dead at the seam where the last route sector meets the valley
 * patch. Sampling one function in world space means a channel that starts on
 * the Umbral approach keeps running into the valley floor.
 *
 * World-space only and side-effect free: purely decorative meshes call it, and
 * ship altitude still comes from planetaryWorld.getHeightAt, so nothing here
 * can affect navigation, beacons or objectives.
 */

/** Ridged drainage mask, 0..1. High values are the bottoms of run-off lines. */
export function auroraDrainage(worldX: number, worldZ: number): number {
  const ridged = 1 - Math.abs(fbm2(worldX * 0.02 - 8, worldZ * 0.0085 + 5, 84.3, 3) * 2 - 1);
  const clamped = ridged < 0 ? 0 : ridged > 1 ? 1 : ridged;
  return clamped * clamped * clamped;
}

/** Small high-frequency unevenness so no facet is perfectly flat. */
export function auroraFineRelief(worldX: number, worldZ: number): number {
  return fbm2(worldX * 0.072 + 24, worldZ * 0.072 - 21, 12.9, 2);
}

/** Depth of the carved channels, shared so both sides match at the seam. */
export const AURORA_CHANNEL_DEPTH = 1.2;
