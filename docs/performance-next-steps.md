# Arca Epsilon - Performance and GLB LOD Audit

Audit date: 2026-07-14. This pass preserves Mission 01, Mission 02, SaveSystem v2, controls, cockpit, ship access and on-foot gameplay. Mission 03 was not started.

## Tools detected

- No `gltf-transform`, `gltfpack`, Blender, Draco CLI or standalone meshoptimizer executable was available on `PATH`.
- The existing pnpm dependency graph already contained `meshoptimizer@1.1.1`, including its WASM decoder, simplifier and encoder. No dependency was installed.
- The source GLBs use `EXT_meshopt_compression` and embedded KTX2 images through `KHR_texture_basisu`.
- `scripts/optimize-glb-lod.mjs` uses the existing Meshopt WASM implementation to decode, simplify and re-encode rigid single-primitive models while preserving materials, KTX2 images, normals and UVs.
- The pipeline refuses skinned, animated, multi-mesh or unsupported accessor layouts instead of producing unsafe output.

Regenerate all variants without overwriting originals:

```powershell
npm run optimize:models
```

Generate one explicit variant:

```powershell
node scripts/optimize-glb-lod.mjs public/models/wayfinder-monument.glb public/models/optimized/atlas-marker.medium.glb 200000
```

The machine-readable result is written to `docs/model-optimization-report.json`.

## Before and after

All listed assets contain one mesh, one material and one embedded KTX2 texture. Those counts remain unchanged.

| Asset | Original size | Original tris | Variant | Output size | Output tris | Meshopt error |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Atlas | 22,564,208 B | 1,636,831 | medium | 4,186,732 B | 200,000 | 0.001794 |
| Atlas | 22,564,208 B | 1,636,831 | low | 2,094,880 B | 60,000 | 0.003962 |
| Scout | 7,611,040 B | 463,774 | medium | 3,150,096 B | 129,986 | 0.000897 |
| Scout | 7,611,040 B | 463,774 | low | 1,862,032 B | 44,984 | 0.002184 |
| Arca | 9,740,680 B | 611,066 | medium | 4,572,540 B | 219,982 | 0.000712 |
| Arca | 9,740,680 B | 611,066 | low | 2,500,676 B | 79,978 | 0.001544 |

The three original runtime models total 39,915,928 bytes and 2,711,671 triangles. Both optimized levels together total 18,366,956 bytes, 54.0% less transfer than the three originals. The normal opening view activates about 409,968 authored triangles across Arca, Scout and distant Atlas, about 84.9% below the previous active geometry.

## Runtime LOD

- Atlas loads medium plus low. It uses 200k triangles within 850 world units and 60k beyond that distance.
- Arca loads medium plus low. It uses 219,982 triangles within 900 world units and 79,978 beyond that distance.
- Scout loads medium plus low. It uses 129,986 triangles near the camera and 44,984 beyond 80 world units. Gameplay anchors, engine sockets, lift access and collision remain independent of the imported mesh.
- Every medium request falls back to the untouched original. Atlas and Arca retain their procedural emergency fallback if both optimized and original files fail.
- A missing optional low level leaves the medium/original level active.
- The current level is the only authored mesh rendered for each entity; inactive LOD roots remain hidden.

Diagnostics expose `atlasLodLevel`, `arcaLodLevel`, `shipLodLevel`, `cockpitLodLevel`, `pilotLodLevel`, `activeTriangleEstimate`, `assetPreloadQueue`, `assetLoadState`, `lazyLoadedAssets` and `preloadCompleted`.

## Visual tradeoffs

- Simplification retains original vertex normals and UV coordinates for retained vertices and weights normal/UV deviation during edge selection.
- Medium variants preserve the silhouette for normal gameplay distance. Low variants can lose very small panel grooves and are restricted to distances where those details are sub-pixel.
- Textures and material topology are untouched. No texture downscaling was applied.
- No automatic normal regeneration was used; this avoids changing the authored hard-surface shading but means a source normal defect would remain present.

## Assets deliberately not replaced

- Cockpit: 16,177,896 bytes and 293,348 triangles. It is a close-up asset with four dynamic display openings and tested screen anchors. It remains original and is rendered only in cockpit mode.
- Pilot: 4,339,384 bytes and 219,612 triangles. It is skinned and must preserve joints, weights, skeleton indices, mixer compatibility and height normalization. The rigid pipeline rejects it. The run animation remains the 13,668-byte animation-only GLB, avoiding a second duplicate pilot mesh.

Lazy loading was deliberately not added in this pass. Cockpit and pilot readiness is coupled to save restoration, immediate test/debug entry and boarding transitions. Preloading the much smaller medium/low space assets keeps scene changes deterministic and avoids mission-visible pop-in. The diagnostics now make a later staged loader observable without changing behavior today.

## External workflow for cockpit and pilot

For a cockpit candidate, test gltfpack outside this repository and compare all four screen anchors before replacing runtime paths:

```powershell
gltfpack -i public/models/cockpit-interior.glb -o public/models/optimized/cockpit-interior.medium.glb -si 0.55 -se 0.002 -c
```

For the pilot, use Blender or Meshy with the original armature preserved. Decimate only the skinned mesh to 40k-80k triangles, keep vertex groups and joint order, export GLB, then validate both walk and run clips against the exact existing skeleton. Do not use the rigid Arca script for this asset.

## Bundle state

The production game chunk is about 347.41 kB minified (104.46 kB gzip). Three.js remains a separate 703.97 kB vendor chunk (189.44 kB gzip), and `lil-gui` remains a 31.42 kB debug-only dynamic chunk. The expected Vite warning is limited to the required Three.js vendor bundle.

## Recommendation before Mission 03

Profile these LOD thresholds on target hardware, capture close/medium/far visual baselines for all three optimized models, then create a rig-safe pilot candidate and a screen-safe cockpit candidate in an external DCC workflow. Keep Mission 03 blocked until those two sensitive assets pass animation, boarding, cockpit and save/load tests.
