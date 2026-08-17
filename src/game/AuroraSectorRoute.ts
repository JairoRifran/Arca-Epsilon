import * as THREE from 'three';
import { createRockGeometry } from '../entities/AsteroidField';
import { fbm2 } from '../entities/Planets';
import { AURORA_CHANNEL_DEPTH, auroraDrainage, auroraFineRelief } from '../assets/auroraTerrain';
import { createNoiseCanvasTexture, createSoftParticleTexture } from '../assets/materials';
import { auroraSectorDefinitions, mission09Tuning, type AuroraSectorDefinition } from '../assets/mission09Definitions';
import { freezeStaticTransforms } from '../assets/materialCache';

type SectorRuntime = {
  definition: AuroraSectorDefinition;
  group: THREE.Group;
  center: THREE.Vector3;
  dust?: THREE.Points;
  dustSeeds?: Float32Array;
  dustBaseOpacity?: number;
  clouds?: THREE.Sprite[];
  lightningMaterial?: THREE.SpriteMaterial;
  glyphMaterial?: THREE.MeshStandardMaterial;
};

/**
 * Lightweight sector streaming for the Aurora route. Each sector owns a
 * self-contained ground patch (sampled from the same infinite fbm terrain so
 * patches and the base map join seamlessly) plus a little scattered rock and
 * a colour tint. Only sectors near the player are made visible; the rest are
 * hidden. No real streaming, no heavy GLBs, no per-frame allocation — just
 * distance-gated group visibility, with fog hiding the far patch edges.
 */
export class AuroraSectorRoute {
  readonly group = new THREE.Group();

  private readonly sectors: SectorRuntime[] = [];
  private currentIndex = 0;
  private activeCount = 0;
  private missionActive = false;
  private windIntensity = 0;
  private stormIntensity = 0;

  constructor(getGroundHeight: (x: number, z: number) => number) {
    this.group.name = 'Aurora Sector Route';
    this.group.visible = false;

    // Shared fine grain for every ground patch and rock on the route: one
    // texture, reused by all five sectors, so no surface is a flat colour.
    const grain = createNoiseCanvasTexture(64, 0.4);
    grain.repeat.set(8, 8);
    // Deterministic scatter — varied placement, identical every run.
    const rand = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const instanceMatrix = new THREE.Matrix4();
    const instanceQuat = new THREE.Quaternion();
    const instanceEuler = new THREE.Euler();
    const instancePos = new THREE.Vector3();
    const instanceScale = new THREE.Vector3();

    for (const definition of auroraSectorDefinitions) {
      const sector = new THREE.Group();
      sector.name = `Aurora Sector (${definition.id})`;
      sector.visible = false;
      const [cx, cz] = definition.center;

      // --- Ground patch: eroded grid sampled from the shared height function.
      // The patch is decorative only — the ship reads its altitude from
      // planetaryWorld.getHeightAt, never from this mesh — so carving
      // drainage into it cannot affect navigation or beacon placement.
      const segments = 44;
      const geometry = new THREE.PlaneGeometry(definition.half * 2, definition.half * 2, segments, segments);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colors = new Float32Array(positions.count * 3);
      const tint = new THREE.Color(definition.tint);
      const low = tint.clone().multiplyScalar(0.72);
      const high = tint.clone().multiplyScalar(1.16);
      // Per-sector accent: the tone that gives each leg its own identity.
      const accent = new THREE.Color(
        [0x6a6252, 0x9a9086, 0x8a6a4a, 0x59636e, 0x7f9a63][this.sectors.length] ?? 0x6a6252
      );
      // Neighbouring sector tints, so each patch can bleed into the next one
      // near its edges. Patches only overlap by 250 units, so fading their
      // alpha would open holes in the ground — blending colour instead keeps
      // them opaque and still kills the hard tonal cut at the seam.
      const slot = this.sectors.length;
      const northTint = new THREE.Color(
        auroraSectorDefinitions[slot - 1]?.tint ?? definition.tint
      );
      const southTint = new THREE.Color(
        auroraSectorDefinitions[slot + 1]?.tint ?? definition.tint
      );
      const scratch = new THREE.Color();
      const sectorSlot = this.sectors.length;
      for (let i = 0; i < positions.count; i += 1) {
        const worldX = positions.getX(i) + cx;
        const worldZ = positions.getZ(i) + cz;
        let height = getGroundHeight(worldX, worldZ);

        // Ridged drainage from the shared Aurora erosion field, so the run-off
        // lines continue unbroken into the valley patch at the seam.
        const channel = auroraDrainage(worldX, worldZ);
        height -= channel * AURORA_CHANNEL_DEPTH;
        // Fine unevenness on top so no facet is perfectly flat.
        height += auroraFineRelief(worldX, worldZ) * 0.3;
        // Wind furrows: long shallow corrugations running across the ash
        // plains and the storm plateau, aligned with the prevailing wind.
        let furrow = 0;
        if (sectorSlot === 1 || sectorSlot === 3) {
          furrow = Math.sin(worldX * 0.055 + worldZ * 0.014) * 0.5 + Math.sin(worldX * 0.021 - 1.3) * 0.28;
          height += furrow * (sectorSlot === 1 ? 0.5 : 0.32);
        }
        positions.setY(i, height);

        const shade = THREE.MathUtils.clamp((height + 6) / 18, 0, 1);
        scratch.copy(low).lerp(high, shade);
        // Sediment gathers in the low lines; the accent tone rides the
        // channels so each sector's mineral character shows where water or
        // wind actually collected.
        scratch.lerp(accent, channel * 0.55);
        if (furrow !== 0) scratch.lerp(accent, THREE.MathUtils.clamp(-furrow, 0, 1) * 0.3);
        // Broad tonal banding, then per-vertex speckle: kills the flat wash.
        const band = fbm2(worldX * 0.006 + 41, worldZ * 0.006 - 13, 33.1, 2);
        scratch.multiplyScalar(0.9 + band * 0.22);
        const speck = 0.95 + fbm2(worldX * 0.17 - 7, worldZ * 0.17 + 11, 61.1, 2) * 0.1;
        scratch.multiplyScalar(speck);
        // Seam bleed: over the outer 30% of the patch, drift toward the
        // neighbouring sector's tone so consecutive legs hand off instead of
        // butting against each other. The noisy edge keeps the transition
        // from reading as a straight line.
        const edge = positions.getZ(i) / definition.half; // -1 south .. +1 north
        const jitter = fbm2(worldX * 0.012 + 71, worldZ * 0.012 - 37, 55.7, 2) * 0.18;
        const northBleed = THREE.MathUtils.clamp((edge - 0.7 + jitter) / 0.3, 0, 1);
        const southBleed = THREE.MathUtils.clamp((-edge - 0.7 + jitter) / 0.3, 0, 1);
        if (northBleed > 0) scratch.lerp(northTint, northBleed * 0.55);
        if (southBleed > 0) scratch.lerp(southTint, southBleed * 0.55);
        colors[i * 3] = scratch.r;
        colors[i * 3 + 1] = scratch.g;
        colors[i * 3 + 2] = scratch.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const patch = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: sectorSlot === 4 ? 0.9 : 0.96,
          metalness: 0.03,
          bumpMap: grain,
          bumpScale: 0.28
        })
      );
      patch.position.set(cx, 0, cz);
      patch.receiveShadow = false;
      sector.add(patch);

      // --- Scattered rocks: cheap detail, deterministic placement ---
      const rockMaterial = new THREE.MeshStandardMaterial({
        color: tint.clone().multiplyScalar(0.85),
        roughness: 0.94,
        metalness: 0.05,
        bumpMap: grain,
        bumpScale: 0.2
      });
      // Rock fields, not a golden-angle spiral of uniformly scaled copies.
      // Four drifts per sector, each seeding a cluster whose stones vary
      // independently on all three axes and tilt on all three, so no two
      // share a silhouette and the scatter reads as deposited debris.
      const driftCount = 4;
      const rocksPerDrift = 7;
      const rocks = new THREE.InstancedMesh(
        createRockGeometry(101 + definition.center[1] * 0.37, 1),
        rockMaterial,
        driftCount * rocksPerDrift
      );
      for (let d = 0; d < driftCount; d += 1) {
        const driftSeed = d * 13.7 + definition.center[1] * 0.011;
        const driftAngle = rand(driftSeed) * Math.PI * 2;
        const driftRadius = definition.half * (0.25 + rand(driftSeed + 1) * 0.6);
        const dx = cx + Math.cos(driftAngle) * driftRadius;
        const dz = cz + Math.sin(driftAngle) * driftRadius;
        for (let r = 0; r < rocksPerDrift; r += 1) {
          const index = d * rocksPerDrift + r;
          const seed = driftSeed + r * 3.31 + 0.7;
          // Clusters elongate along the wind rather than forming discs.
          const spread = Math.sqrt(rand(seed)) * 90;
          const along = rand(seed + 0.3) * Math.PI * 2;
          const rx = dx + Math.cos(along) * spread * 1.7;
          const rz = dz + Math.sin(along) * spread * 0.7;
          const bulk = 1.1 + rand(seed + 1.1) * 2.6;
          instancePos.set(rx, getGroundHeight(rx, rz) + 0.2 - rand(seed + 4.2) * 0.5, rz);
          instanceEuler.set(
            (rand(seed + 2.1) - 0.5) * 0.7,
            rand(seed + 2.6) * Math.PI * 2,
            (rand(seed + 3.1) - 0.5) * 0.7
          );
          instanceQuat.setFromEuler(instanceEuler);
          instanceScale.set(
            bulk * (0.6 + rand(seed + 5.1) * 1.1),
            bulk * (0.4 + rand(seed + 5.6) * 0.7),
            bulk * (0.6 + rand(seed + 6.1) * 1.1)
          );
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          rocks.setMatrixAt(index, instanceMatrix);
        }
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.frustumCulled = false;
      sector.add(rocks);

      const runtime: SectorRuntime = { definition, group: sector, center: new THREE.Vector3(cx, 0, cz) };
      const sectorIndex = this.sectors.length;

      // --- Wind-blown dust: one low particle sheet per sector, tinted ---
      const dustCount = 24;
      const dustPositions = new Float32Array(dustCount * 3);
      runtime.dustSeeds = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i += 1) {
        runtime.dustSeeds[i * 3] = ((i * 127) % (definition.half * 2)) - definition.half;
        runtime.dustSeeds[i * 3 + 1] = 0.6 + ((i * 31) % 11) / 11 * 5;
        runtime.dustSeeds[i * 3 + 2] = ((i * 211) % (definition.half * 2)) - definition.half;
      }
      const dustGeometry = new THREE.BufferGeometry();
      dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
      dustGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 4, cz), definition.half * 1.5);
      const dust = new THREE.Points(
        dustGeometry,
        new THREE.PointsMaterial({
          color: definition.dust,
          size: sectorIndex === 1 ? 2.2 : 1.4,
          map: createSoftParticleTexture(32),
          transparent: true,
          opacity: sectorIndex === 1 ? 0.2 : sectorIndex === 4 ? 0.08 : 0.13,
          depthWrite: false
        })
      );
      dust.frustumCulled = false;
      runtime.dust = dust;
      runtime.dustBaseOpacity = (dust.material as THREE.PointsMaterial).opacity;
      sector.add(dust);

      // --- Sector character ---
      if (sectorIndex === 2) {
        // Atlas canyons: tall stone pillars with a faint carved seam.
        const pillarMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(definition.tint).multiplyScalar(0.92),
          roughness: 0.93,
          metalness: 0.05
        });
        const seamMaterial = new THREE.MeshStandardMaterial({
          color: 0x223a38,
          emissive: 0x3f8f7c,
          emissiveIntensity: 0.12,
          roughness: 0.5,
          metalness: 0.3
        });
        // Atlas glyph panels carved into the canyon walls: barely lit, they
        // pulse as the pilot passes — an echo of signals far older than us.
        runtime.glyphMaterial = new THREE.MeshStandardMaterial({
          color: 0x1c2a2c,
          emissive: 0x58c4a8,
          emissiveIntensity: 0.05,
          roughness: 0.6,
          metalness: 0.2,
          transparent: true,
          opacity: 0.85
        });
        // Two walls flanking the route corridor so the pilot flies *between*
        // them: the canyon is a passage, not scenery off to one side. The
        // corridor narrows toward the far end for a sense of scale.
        // Real placements are recorded so the strata bands, the fractures and
        // the talus below land on the pillars rather than where the old
        // regular formula used to put them.
        const pillarSpots: {
          x: number; z: number; y: number; yaw: number; width: number; height: number; pinch: number;
        }[] = [];
        for (let p = 0; p < 10; p += 1) {
          const side = p % 2 === 0 ? -1 : 1;
          const along = Math.floor(p / 2); // 0..4 down the sector
          const pSeed = p * 11.3 + 2.7;
          // Irregular corridor: each wall segment steps in or out on its own
          // instead of following a clean taper.
          const px = cx + side * (200 - along * 22 + (rand(pSeed) - 0.5) * 44) + Math.sin(p * 2.3) * 18;
          const pz = cz + definition.half * 0.72 - along * (definition.half * 0.36) + (rand(pSeed + 1) - 0.5) * 70;
          const groundY = getGroundHeight(px, pz);
          // Per-pillar geometry: its own seed, then a vertical shear and a
          // twist baked into the vertices so it is not the shared rock with
          // a different scale. Ten cheap low-detail clones, built once.
          const pillarGeometry = createRockGeometry(401 + p * 23.1, 2);
          const pv = pillarGeometry.getAttribute('position') as THREE.BufferAttribute;
          const lean = (rand(pSeed + 2) - 0.5) * 0.5;
          const twist = (rand(pSeed + 3) - 0.5) * 1.1;
          const pinch = 0.55 + rand(pSeed + 4) * 0.5;
          for (let v = 0; v < pv.count; v += 1) {
            const vy = pv.getY(v);
            const h = vy + 0.5; // 0 at base, 1 at top
            const ang = twist * h;
            const cos = Math.cos(ang);
            const sin = Math.sin(ang);
            const vx = pv.getX(v);
            const vz = pv.getZ(v);
            // Taper toward the top and twist around the vertical axis.
            const taper = 1 - h * (1 - pinch);
            pv.setX(v, (vx * cos - vz * sin) * taper + lean * h);
            pv.setZ(v, (vx * sin + vz * cos) * taper);
          }
          pillarGeometry.computeVertexNormals();
          const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
          pillar.scale.set(
            22 + along * 5 + rand(pSeed + 5) * 14,
            54 + along * 14 + rand(pSeed + 6) * 26,
            20 + rand(pSeed + 7) * 16
          );
          pillar.position.set(px, groundY + 10, pz);
          pillar.rotation.set((rand(pSeed + 8) - 0.5) * 0.12, p * 0.7, (rand(pSeed + 9) - 0.5) * 0.14);
          pillar.frustumCulled = false;
          sector.add(pillar);
          pillarSpots.push({
            x: px, z: pz, y: groundY, yaw: p * 0.7,
            width: pillar.scale.x, height: pillar.scale.y, pinch
          });
          if (p % 3 === 0) {
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 38, 0.5), seamMaterial);
            seam.position.set(px - side * 12, groundY + 26, pz);
            seam.rotation.z = 0.08;
            seam.frustumCulled = false;
            sector.add(seam);
          }
          // Glyph bars recessed into the corridor-facing wall. They now sit
          // flush against the pillar (and tilt with it) instead of hovering
          // a metre off the rock like decals in mid-air.
          if (p % 2 === 0 || p === 3) {
            for (let g = 0; g < 3; g += 1) {
              const glyph = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.4), runtime.glyphMaterial);
              const inset = 11.4 + g * 0.35;
              glyph.position.set(px - side * inset, groundY + 18 + g * 8, pz + 2 + (g - 1) * 1.6);
              glyph.rotation.y = p * 0.7;
              glyph.rotation.z = side * 0.04;
              glyph.frustumCulled = false;
              sector.add(glyph);
            }
          }
        }

        // Horizontal strata bands wrapping the pillars: the single strongest
        // cue that these walls are sedimentary rock and not extruded shapes.
        const strataMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(definition.tint).multiplyScalar(0.74),
          roughness: 0.95,
          metalness: 0.04,
          bumpMap: grain,
          bumpScale: 0.25
        });
        const strataCount = 34;
        const strata = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), strataMaterial, strataCount);
        for (let s = 0; s < strataCount; s += 1) {
          const spot = pillarSpots[s % pillarSpots.length];
          const seed = s * 4.7 + 2.1;
          // Bands sit at irregular heights and thicknesses per pillar, so no
          // two walls show the same bedding rhythm.
          const level = rand(seed + 8);
          instancePos.set(spot.x, spot.y + 6 + level * spot.height * 0.78, spot.z);
          instanceEuler.set(0, spot.yaw + (rand(seed + 5) - 0.5) * 0.2, (rand(seed + 1) - 0.5) * 0.09);
          instanceQuat.setFromEuler(instanceEuler);
          // Follow the pillar's own taper at this height, then sit only
          // slightly proud of it. Without the taper term the bands stuck out
          // of the narrowing top like shelves instead of reading as bedding.
          const taper = 1 - level * (1 - spot.pinch);
          instanceScale.set(
            spot.width * taper * (1.01 + rand(seed + 2) * 0.08),
            1.6 + rand(seed + 3) * 4.2,
            spot.width * taper * (0.94 + rand(seed + 4) * 0.12)
          );
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          strata.setMatrixAt(s, instanceMatrix);
        }
        strata.instanceMatrix.needsUpdate = true;
        strata.frustumCulled = false;
        sector.add(strata);

        // Vertical fracture slots: narrow dark clefts running down the wall
        // faces. Cheap, and they do more for "this rock split over ages" than
        // any amount of extra silhouette variation.
        const fractureMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(definition.tint).multiplyScalar(0.34),
          roughness: 0.98,
          metalness: 0.02
        });
        const fractureCount = 14;
        const fractures = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fractureMaterial, fractureCount);
        for (let f = 0; f < fractureCount; f += 1) {
          const spot = pillarSpots[f % pillarSpots.length];
          const seed = f * 7.9 + 6.3;
          const yaw = spot.yaw + (rand(seed) - 0.5) * 1.4;
          const level = rand(seed + 1);
          const reach = spot.width * 0.52 * (1 - level * (1 - spot.pinch));
          instancePos.set(
            spot.x + Math.sin(yaw) * reach,
            spot.y + 12 + level * spot.height * 0.5,
            spot.z + Math.cos(yaw) * reach
          );
          instanceEuler.set(0, yaw, (rand(seed + 2) - 0.5) * 0.25);
          instanceQuat.setFromEuler(instanceEuler);
          instanceScale.set(1.4 + rand(seed + 3) * 2.2, 22 + rand(seed + 4) * 34, 2.6 + rand(seed + 5) * 2);
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          fractures.setMatrixAt(f, instanceMatrix);
        }
        fractures.instanceMatrix.needsUpdate = true;
        fractures.frustumCulled = false;
        sector.add(fractures);

        // Talus: fallen fragments piled at the foot of each wall, which is
        // what makes a canyon read as eroded rather than carved yesterday.
        const talusCount = 34;
        const talus = new THREE.InstancedMesh(createRockGeometry(577.3, 1), pillarMaterial, talusCount);
        for (let t = 0; t < talusCount; t += 1) {
          const spot = pillarSpots[t % pillarSpots.length];
          const seed = t * 6.13 + 5.5;
          // Debris fans out from the foot of its own pillar, thinning with
          // distance, so each wall gets a talus of its own shape.
          const fanAngle = rand(seed + 8) * Math.PI * 2;
          const fanDistance = spot.width * (0.5 + Math.sqrt(rand(seed)) * 0.9);
          const px = spot.x + Math.cos(fanAngle) * fanDistance;
          const pz = spot.z + Math.sin(fanAngle) * fanDistance * 1.4;
          const bulk = 1.4 + rand(seed + 2) * 4.4;
          instancePos.set(px, getGroundHeight(px, pz) + bulk * 0.3, pz);
          instanceEuler.set(rand(seed + 3) * 1.2, rand(seed + 4) * Math.PI * 2, rand(seed + 5) * 1.2);
          instanceQuat.setFromEuler(instanceEuler);
          instanceScale.set(bulk * (0.7 + rand(seed + 6) * 0.8), bulk * (0.5 + rand(seed + 7) * 0.6), bulk);
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          talus.setMatrixAt(t, instanceMatrix);
        }
        talus.instanceMatrix.needsUpdate = true;
        talus.frustumCulled = false;
        sector.add(talus);
      }
      if (sectorIndex === 3) {
        // Storm plateau: low drifting cloud sprites + a rare distant flash.
        runtime.clouds = [];
        const cloudTexture = createSoftParticleTexture(96);
        // Three depth layers rather than one row: a high thin veil, the main
        // deck the pilot flies under, and low torn shreds at ground level.
        // Different sizes, heights and opacities give the storm real volume.
        for (let c = 0; c < 7; c += 1) {
          const layer = c < 2 ? 0 : c < 5 ? 1 : 2;
          const seed = c * 9.1 + 4.4;
          const cloud = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: cloudTexture,
              color: layer === 0 ? 0x6b727c : layer === 1 ? 0x545a62 : 0x484d54,
              transparent: true,
              // The high veil is deliberately faint: two of them overlap from
              // most angles, and at the old 0.16 they stacked into a flat
              // grey wash that swallowed the whole frame from above.
              opacity: layer === 0 ? 0.08 : layer === 1 ? 0.24 : 0.2,
              depthWrite: false
            })
          );
          const height = layer === 0 ? 96 + rand(seed) * 20 : layer === 1 ? 40 + rand(seed) * 16 : 16 + rand(seed) * 8;
          cloud.position.set(
            cx + (rand(seed + 1) - 0.5) * 520,
            height,
            cz + definition.half * 0.55 - rand(seed + 2) * definition.half * 1.3
          );
          const width = layer === 0 ? 520 : layer === 1 ? 330 : 210;
          cloud.scale.set(width + rand(seed + 3) * 120, (layer === 0 ? 60 : layer === 1 ? 84 : 44) + rand(seed + 4) * 24, 1);
          cloud.userData.baseX = cloud.position.x;
          cloud.userData.layer = layer;
          // Drifts every frame in `setEnvironment`; must stay auto-updating.
          cloud.userData.dynamic = true;
          runtime.clouds.push(cloud);
          sector.add(cloud);
        }
        runtime.lightningMaterial = new THREE.SpriteMaterial({
          map: cloudTexture,
          color: 0xcfd8ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const lightning = new THREE.Sprite(runtime.lightningMaterial);
        lightning.position.set(cx - 320, 70, cz - 260);
        lightning.scale.set(160, 110, 1);
        sector.add(lightning);
      }
      if (sectorIndex === 4) {
        // Aurora threshold: first low vegetation patches, warmer ground.
        const vegMaterial = new THREE.MeshStandardMaterial({
          color: 0x4d7050,
          emissive: 0x18301f,
          emissiveIntensity: 0.1,
          roughness: 0.85,
          metalness: 0.03
        });
        // Life arrives in colonies, and it arrives from the south: density
        // is weighted toward the far edge of the sector, so the closer the
        // pilot gets to the valley the more the ground is already living.
        // Same clustering rule the valley itself uses, so the two read as
        // one continuous ecology rather than two separate art passes.
        const vegColonies: [number, number, number][] = [
          [-150, 250, 60],
          [110, 330, 76],
          [-40, 400, 92],
          [230, 180, 44],
          [-260, 360, 54]
        ];
        const vegCount = 34;
        const veg = new THREE.InstancedMesh(
          new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
          vegMaterial,
          vegCount
        );
        for (let v = 0; v < vegCount; v += 1) {
          const colony = vegColonies[v % vegColonies.length];
          const seed = v * 4.19 + 3.3;
          const spread = Math.sqrt(rand(seed)) * colony[2];
          const angle = rand(seed + 0.5) * Math.PI * 2;
          const vx = cx + colony[0] + Math.cos(angle) * spread;
          const vz = cz + colony[1] + Math.sin(angle) * spread;
          const size = 2.4 + rand(seed + 1.5) * 5.2;
          instancePos.set(vx, getGroundHeight(vx, vz) + 0.05, vz);
          instanceEuler.set(0, rand(seed + 2.5) * Math.PI * 2, 0);
          instanceQuat.setFromEuler(instanceEuler);
          instanceScale.set(size, size * (0.22 + rand(seed + 3.5) * 0.22), size);
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          veg.setMatrixAt(v, instanceMatrix);
        }
        veg.instanceMatrix.needsUpdate = true;
        veg.frustumCulled = false;
        sector.add(veg);

        // Damp hollows: the first standing moisture on the route, pooled in
        // the drainage lines. Flat, dark, barely reflective — a promise of
        // the water sheet waiting one sector further south.
        const dampMaterial = new THREE.MeshStandardMaterial({
          color: 0x3d4a44,
          roughness: 0.45,
          metalness: 0.05,
          transparent: true,
          opacity: 0.55,
          depthWrite: false
        });
        const dampCount = 7;
        const damp = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12), dampMaterial, dampCount);
        for (let d = 0; d < dampCount; d += 1) {
          const seed = d * 8.7 + 12.1;
          const dx = cx + (rand(seed) - 0.5) * definition.half * 1.3;
          const dz = cz + 120 + rand(seed + 1) * (definition.half * 0.8);
          const size = 7 + rand(seed + 2) * 16;
          instancePos.set(dx, getGroundHeight(dx, dz) + 0.08, dz);
          instanceEuler.set(-Math.PI / 2, 0, rand(seed + 3) * Math.PI);
          instanceQuat.setFromEuler(instanceEuler);
          instanceScale.set(size, size * (0.6 + rand(seed + 4) * 0.6), 1);
          instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
          damp.setMatrixAt(d, instanceMatrix);
        }
        damp.instanceMatrix.needsUpdate = true;
        damp.frustumCulled = false;
        sector.add(damp);
      }

      // A sector is dressed once and never moves again; only its drifting
      // clouds and the lightning flash are excluded above.
      freezeStaticTransforms(sector);
      this.group.add(sector);
      this.sectors.push(runtime);
    }
  }

  setMissionActive(active: boolean): void {
    this.missionActive = active;
    this.group.visible = active;
    if (!active) {
      for (const sector of this.sectors) sector.group.visible = false;
      this.activeCount = 0;
    }
  }

  /**
   * Weather driven by the travel director: lateral wind thickens and speeds
   * up the dust sheets, storm intensity darkens the cloud deck and makes the
   * distant lightning more frequent. Materials only — no new objects.
   */
  setEnvironment(windIntensity: number, stormIntensity: number): void {
    this.windIntensity = THREE.MathUtils.clamp(windIntensity, 0, 1);
    this.stormIntensity = THREE.MathUtils.clamp(stormIntensity, 0, 1);
  }

  /** Distance-gate sector visibility, track the current sector and animate
   *  the visible sectors' wind, clouds and distant lightning. */
  update(playerPosition: THREE.Vector3, elapsed = 0): void {
    if (!this.missionActive) return;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let active = 0;
    for (let i = 0; i < this.sectors.length; i += 1) {
      const sector = this.sectors[i];
      const dx = playerPosition.x - sector.center.x;
      const dz = playerPosition.z - sector.center.z;
      const distance = Math.hypot(dx, dz);
      const visible = distance < mission09Tuning.sectorActivateRange;
      sector.group.visible = visible;
      if (visible) active += 1;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
      if (!visible) continue;

      // Wind-blown dust drifts across the sector on a wrapped cycle.
      if (sector.dust && sector.dustSeeds) {
        const positions = sector.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
        const span = sector.definition.half * 2;
        // Lateral drift accelerates with the wind so gusts read as motion,
        // not just as a density change.
        const lateralSpeed = 11 + this.windIntensity * 26;
        for (let p = 0; p < positions.count; p += 1) {
          const wx = ((sector.dustSeeds[p * 3] + elapsed * lateralSpeed + span / 2) % span) - span / 2;
          const wz = ((sector.dustSeeds[p * 3 + 2] + elapsed * 4 + span / 2) % span) - span / 2;
          positions.setXYZ(
            p,
            sector.center.x + wx,
            sector.dustSeeds[p * 3 + 1] + Math.sin(elapsed * 1.2 + p) * (0.7 + this.windIntensity),
            sector.center.z + wz
          );
        }
        positions.needsUpdate = true;
        if (sector.dustBaseOpacity !== undefined) {
          (sector.dust.material as THREE.PointsMaterial).opacity =
            sector.dustBaseOpacity * (1 + this.windIntensity * 1.6);
        }
      }

      // Canyon glyphs breathe as the pilot moves through the walls.
      if (sector.glyphMaterial) {
        sector.glyphMaterial.emissiveIntensity = 0.05 + (0.5 + Math.sin(elapsed * 0.42) * 0.5) * 0.22;
      }

      // Storm clouds drift slowly; lightning snaps for a frame-scale window
      // on a long irregular cycle.
      if (sector.clouds) {
        const drift = 0.06 + this.stormIntensity * 0.1;
        for (let c = 0; c < sector.clouds.length; c += 1) {
          const cloud = sector.clouds[c];
          const layer = (cloud.userData.layer as number) ?? 1;
          // Parallax: the low shreds tear past, the high veil barely moves.
          const speed = layer === 0 ? 0.45 : layer === 1 ? 1 : 1.8;
          const travel = layer === 0 ? 40 : layer === 1 ? 70 : 110;
          cloud.position.x =
            (cloud.userData.baseX as number) + Math.sin(elapsed * drift * speed + c * 1.4) * travel;
          const base = layer === 0 ? 0.08 : layer === 1 ? 0.24 : 0.2;
          // The storm builds in the deck and the low shreds, not in the veil,
          // so intensity reads as weather rather than as a grey filter.
          const response = layer === 0 ? 0.1 : layer === 1 ? 0.26 : 0.34;
          (cloud.material as THREE.SpriteMaterial).opacity = base + this.stormIntensity * response;
        }
      }
      if (sector.lightningMaterial) {
        // More frequent, brighter flashes as the storm closes in.
        const rate = 0.08 + this.stormIntensity * 0.16;
        const cycle = (elapsed * rate) % 1;
        const peak = 0.28 + this.stormIntensity * 0.35;
        sector.lightningMaterial.opacity =
          cycle < 0.012 ? peak : cycle > 0.5 && cycle < 0.508 ? peak * 0.6 : 0;
      }
    }
    this.currentIndex = nearest;
    this.activeCount = active;
  }

  getSectorCenter(index: number): THREE.Vector3 | undefined {
    return this.sectors[index]?.center.clone();
  }

  get currentSectorIndex(): number {
    return this.currentIndex;
  }

  get currentSectorName(): string {
    return this.sectors[this.currentIndex]?.definition.name ?? '';
  }

  get activeSectorCount(): number {
    return this.activeCount;
  }

  get streamingActive(): boolean {
    return this.missionActive && this.activeCount > 0;
  }
}
