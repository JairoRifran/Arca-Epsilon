import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from './load-env-local.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'public', 'audio', 'generated');
const musicDirectory = join(projectRoot, 'public', 'audio', 'music');
const backupDirectory = join(projectRoot, 'public', 'audio', 'backups');
const manifestPath = join(projectRoot, 'public', 'audio', 'audio-manifest.json');
const warScorePath = join(projectRoot, 'src', 'audio', 'musicWarScore.json');
const reportPath = join(projectRoot, '.audio-generation-report.json');
const negativeSoundDirection = 'No 8-bit, no chiptune, no retro arcade, no cartoon, no cheap synth, no EDM drop, no laser gun, no explosion, no fantasy magic, no over-compressed trailer hit.';
/**
 * ElevenLabs Music caps a single request at five minutes. Anything longer in
 * the catalogue is clamped here rather than being rejected by the API.
 */
const MAX_MUSIC_SECONDS = 300;
/** Pause between sequential requests, so a long run cannot trip the rate limit. */
const REQUEST_SPACING_MS = 1200;

class GenerationError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const listOnly = args.includes('--list');
const failedOnly = args.includes('--failed-only');
const manifestOnly = args.includes('--manifest-only');

// The key is only needed when we are actually going to call the API. `--list`,
// `--dry-run` and `--manifest-only` deliberately work without one, so the
// catalogue can be inspected — and the manifest repaired — on a machine that
// has no credentials at all.
await loadEnvLocal(projectRoot, ['ELEVENLABS_API_KEY']);
const apiKey = process.env.ELEVENLABS_API_KEY;
const hasApiKey = Boolean(apiKey && apiKey.trim() !== '' && apiKey.trim() !== 'PASTE_KEY_HERE');
if (!hasApiKey && !dryRun && !listOnly && !manifestOnly) {
  // Never echo the value itself — only whether it is usable.
  process.stderr.write('Missing ELEVENLABS_API_KEY in .env.local\n');
  process.exit(1);
}

const catalog = [
  music('music-main-theme', 'music_main_theme', 55, 'Cinematic orchestral science-fiction main theme for humanity surviving after Earth. Lonely deep space, deep strings, restrained brass and percussion, subtle hybrid synthesis, serious emotional hope, symphonic realistic film score, instrumental, no EDM, no pop, no cartoon, seamless ending.'),
  music('music-space-exploration', 'music_space_exploration', 55, 'Cinematic orchestral deep-space exploration score. Vast cold distance, slow evolving strings, subtle drones, sparse restrained percussion, professional realistic science-fiction film music, lonely but purposeful, instrumental, no EDM, seamless ending.'),
  music('music-orbit-atlas', 'music_orbit_atlas', 48, 'Cinematic orbital approach to an ancient alien Atlas structure. Deep resonant strings, restrained low choir-like pads without voices, subtle technological pulses, mysterious and serious, realistic science-fiction film score, not magical, instrumental, seamless ending.'),
  music('music-atmospheric-entry', 'music_atmospheric_entry', 45, 'Cinematic atmospheric entry score with heat, turbulence and rising tension. Pulsing low strings, restrained percussion, plasma textures, professional realistic film mix, intense but not battle music, instrumental, no EDM, seamless ending.'),
  music('music-surface-nereida', 'music_surface_nereida', 55, 'Cinematic exploration score for the alien surface of Nereida. Fragile hope, light strings, subtle dusty pads, organic wind-like texture, serious realistic science-fiction atmosphere, instrumental, no pop, seamless ending.'),
  music('music-first-contact', 'music_pleyadan_contact', 48, 'Cinematic first contact with a benevolent advanced Pleyadan civilization. Warm strings, intelligent harmonic pulses, emotional technological wonder, serious realistic film score, not fantasy magic, instrumental, seamless ending.'),
  music('music-defense-network', 'music_defense_protocol', 48, 'Strategic cinematic military science-fiction preparation score. Low pulses, disciplined strings, restrained percussion, vigilance without battle, professional realistic film mix, instrumental, no trailer excess, seamless ending.'),
  music('music-shadow-orbit', 'music_silent_probe', 48, 'Dark cinematic suspense for a distant hostile Silent Probe. Subtle dissonance, cold low pulses, electromagnetic textures, surveillance and dread without combat, realistic science-fiction film score, instrumental, seamless ending.'),
  music('music-layer-tension', 'music_danger_rising', 40, 'Additive cinematic danger-rising layer. Pulsing low strings, restrained orchestral tension, subtle threat and controlled dissonance, no melody, no battle climax, instrumental, seamless loop.'),
  music('music-layer-interference', 'music_interference_layer', 36, 'Quiet additive electromagnetic interference music layer. Filtered static swells, fractured radio harmonics, distant detuned string texture, stealth alien presence, no melody, no harsh noise, seamless loop.'),
  music('music-sting-discovery', 'music_sting_discovery', 6, 'Short realistic science-fiction discovery sting. Warm rising strings and a subtle crystalline technological shimmer, quiet awe, gentle resolution, no trailer hit, instrumental.'),
  music('music-sting-complete', 'music_sting_complete', 8, 'Short dignified mission-complete orchestral science-fiction sting. Low brass and strings resolving upward with calm confidence, subtle professional film score, no fanfare, instrumental.'),
  music('music-resolution-pad', 'music_relief_resolution', 30, 'Cinematic relief and resolution after a threat retreats. Warm sustained strings, soft airy synthesis, hopeful but cautious mission aftermath, serious and sincere, instrumental, gentle ending.'),
  music('music-calm-exploration', 'music_calm_exploration', 55, 'Calm cinematic exploration on a fragile alien world. Gentle strings, subtle pads, sparse acoustic texture and cautious human hope, realistic professional science-fiction film score, instrumental, seamless ending.'),
  music('music-deep-space', 'music_deep_space', 55, 'Vast deep-space cinematic score. Very slow evolving orchestral texture, cold distant strings, subtle sub drone, loneliness and scale, realistic serious science-fiction film music, instrumental, seamless ending.'),
  music('music-atlas-mystery', 'music_atlas_mystery', 48, 'Ancient Atlas mystery score. Deep geometric resonance, restrained strings, subtle choir-like synthesizer pads, advanced alien technology, serious and scientific rather than magical, instrumental, seamless ending.'),

  // --- Aurora expedition score (Mission 09 travel director) ---
  music('music-aurora-departure', 'music_aurora_departure', 60, 'Cinematic sci-fi exploration music, hopeful but restrained, deep pads, subtle pulse, sense of leaving a safe base for an unknown planetary expedition, 60 seconds, loopable.'),
  music('music-aurora-ash-plains', 'music_aurora_ash_plains', 60, 'Dark cinematic ambient sci-fi music for crossing ash plains, wind-like textures, low percussion, tense but not combat, 60 seconds, loopable.'),
  music('music-aurora-atlas-canyons', 'music_aurora_atlas_canyons', 60, 'Mysterious ancient alien canyon music, distant synthetic choir, subtle rhythmic pulses, sacred sci-fi atmosphere, cinematic and serious, 60 seconds, loopable.'),
  music('music-aurora-storm-plateau', 'music_aurora_storm_plateau', 60, 'Cinematic action tension music for flying through a storm plateau, growing percussion, low drones, dramatic but not battle music, 60 seconds, loopable.'),
  music('music-aurora-pre-reveal', 'music_aurora_pre_reveal', 45, 'Emotional suspense sci-fi music before a major discovery, long notes, partial silence, expectation, mist clearing slowly, 45 seconds, loopable.'),
  music('music-aurora-reveal', 'music_aurora_reveal', 60, 'Epic hopeful cinematic sci-fi discovery music, wide emotional theme, sense of finding a habitable valley and future home for humanity, 60 seconds.'),
  music('music-aurora-completion', 'music_aurora_completion', 45, 'Warm cinematic resolution music, hopeful restrained grandeur, human colony beginning on a new world, 45 seconds.'),

  sfx('sfx-ship-idle', 'sfx_ship_idle', 8, true, soundPrompt('Realistic cinematic sci-fi spacecraft engine idle loop, deep low-frequency reactor hum, subtle turbine movement, heavy mass, clean modern film sound design, no melody, seamless loop, restrained and believable.')),
  sfx('sfx-ship-accelerate', 'sfx_ship_accelerate', 6, true, soundPrompt('Realistic cinematic spacecraft acceleration thrust loop, layered ion propulsion building in power, turbine spool-up, deep engine resonance, physical pressure, modern sci-fi film sound, powerful but controlled, seamless and loop-friendly.')),
  sfx('sfx-hover-wash', 'sfx_hover_wash', 8, true, soundPrompt('Ground wash from a hovering sci-fi spacecraft, low rumble, dust and air pressure, particulate turbulent wash, restrained cinematic realism, physical atmosphere, no harsh noise, seamless loop.')),
  sfx('sfx-vertical-thrust', 'sfx_vertical_thrust', 8, true, soundPrompt('Heavy vertical lift spacecraft thrusters, downward ion exhaust, turbine pressure rising, controlled hover power, deep rumble and air displacement, realistic cinematic sci-fi, physical and massive, seamless loop.')),
  sfx('sfx-boost-intensity', 'sfx_boost_intensity', 8, true, soundPrompt('Powerful spacecraft boost layer, deep engine roar opening up, ion turbine surge, cinematic acceleration, heavy but clean, modern realistic sci-fi, seamless loop, no exaggerated impact.')),
  sfx('sfx-brake-release', 'sfx_brake_release', 3, false, 'Realistic cinematic sci-fi spacecraft deceleration sound, engine thrust easing down, turbine spin-down, soft hydraulic pressure release, ion propulsion damping, low-frequency mechanical sigh, controlled and natural, modern film sound design, no arcade, no retro, no beep, no laser, no explosion, no cartoon, no 8-bit, not harsh.'),
  sfx('sfx-space-cruise', 'sfx_space_cruise', 8, true, soundPrompt('Clean deep-space spacecraft cruise engine bed, wide subtle ion resonance, low reactor hum, minimal vibration, cinematic sci-fi ambience, smooth seamless loop, clean and restrained.')),
  sfx('sfx-atmospheric-flight', 'sfx_atmospheric_flight', 8, true, soundPrompt('Atmospheric sci-fi spacecraft flight engine layer, aerodynamic pressure, low rumble, subtle wind resistance, heavy hull vibration, cinematic realistic sound design, seamless loop.')),
  sfx('sfx-lift-motor', 'sfx_lift_motor', 5, true, 'Heavy spacecraft access lift motor loop, industrial electric servo, hydraulic strain and restrained metal vibration, realistic mechanism, seamless loop.'),
  sfx('sfx-hatch-open', 'sfx_hatch_open', 2.5, false, 'Pressurized spacecraft hatch opening, seal release, pneumatic servo and dense metal movement, realistic cinematic machinery, clean tail.'),
  sfx('sfx-hatch-close', 'sfx_hatch_close', 2.5, false, 'Pressurized spacecraft hatch closing, heavy servo movement, seal compression and secure latch, realistic cinematic machinery, clean tail.'),
  sfx('sfx-platform-lock', 'sfx_platform_lock', 1.5, false, 'Heavy spacecraft lift platform reaches stop and magnetic clamps lock, short metal contact, servo latch and low impact, realistic controlled sound.'),
  sfx('sfx-scanner-pulse', 'sfx_scanner_pulse', 2, false, 'Advanced science-fiction scanner pulse, focused electromagnetic sweep with spatial return, subtle telemetry detail, professional clean cinematic mix.'),
  sfx('sfx-atlas-signal', 'sfx_atlas_signal', 4, false, 'Ancient Atlas resonator signal activation, huge stone-metal harmonic resonance and geometric technological energy rise, mysterious but scientific, clean tail.'),
  sfx('sfx-relay-pulse', 'sfx_relay_pulse', 3, false, 'Futuristic relay beacon deployment pulse, mechanical anchor, energy core ignition and short linked signal response, realistic cinematic science-fiction.'),
  sfx('sfx-defense-sync', 'sfx_defense_sync', 4, false, 'Planetary defense network synchronization, three linked energy pulses converging into a stable harmonic lock, powerful but restrained clean resolution.'),
  sfx('sfx-pleyadan-transmission', 'sfx_pleyadan_transmission', 5, false, 'Benevolent alien Pleyadan transmission opening, layered intelligent harmonics and delicate data rhythm, warm technological resonance, no speech.'),
  sfx('sfx-interference-glitch', 'sfx_interference_glitch', 8, true, 'Subtle alien signal interference loop, low radio pressure, fractured telemetry ticks and controlled electromagnetic static, unsettling not harsh, seamless loop.'),
  sfx('sfx-probe-detected', 'sfx_probe_detected', 3, false, 'Stealth alien probe detection alert, cold sensor lock, subtle digital anomaly and restrained warning impact, cinematic, no voice.'),
  sfx('sfx-echo-resolved', 'sfx_echo_resolved', 2.5, false, 'Alien interference echo resolved by Atlas sensors, fragmented data coheres into a clear harmonic lock, restrained cinematic telemetry.'),
  sfx('sfx-counter-signal', 'sfx_counter_signal', 4, false, 'Science-fiction counter-signal transmission charges and disrupts an alien link, coherent energy sweep and interference collapse, decisive clean finish.'),
  sfx('sfx-probe-retreat', 'sfx_probe_retreat', 4, false, 'Stealth alien probe retreats and loses signal lock, dark electronic pressure recedes, telemetry clears and distant ion trace fades, no explosion.'),
  sfx('sfx-mission-complete', 'sfx_mission_complete', 3, false, 'Restrained premium spacecraft mission-complete cue, tactile telemetry confirmation and dignified short harmonic resolve, no arcade jingle.'),
  sfx('sfx-anomaly-detected', 'sfx_anomaly_detected', 3, false, 'Distant orbital anomaly detection, low sensor pulse, subtle dissonant return and controlled warning texture, realistic cinematic interface.'),
  sfx('sfx-comm-start', 'sfx_comm_start', 1.2, false, 'Premium spacecraft communication channel opens, soft radio gate, short secure-link telemetry chirp, subtle clean mix.'),
  sfx('sfx-comm-end', 'sfx_comm_end', 1.2, false, 'Premium spacecraft communication channel closes, soft data release, short descending secure-link tone, subtle clean mix.'),
  sfx('sfx-footstep-walk-01', 'sfx_footstep_walk_01', 1.2, false, 'Realistic sci-fi spacesuit boot single footstep walking on dry dusty alien ground, subtle gravel and compact soil, controlled weight, cinematic natural sound, close perspective, first grounded variation, not cartoon, not arcade, not metallic floor, not wet mud, not exaggerated.'),
  sfx('sfx-footstep-walk-02', 'sfx_footstep_walk_02', 1.2, false, 'Realistic sci-fi spacesuit boot single footstep walking on dry dusty alien ground, subtle gravel and compact soil, controlled weight, cinematic natural sound, close perspective, second slightly softer variation, not cartoon, not arcade, not metallic floor, not wet mud, not exaggerated.'),
  sfx('sfx-footstep-walk-03', 'sfx_footstep_walk_03', 1.2, false, 'Realistic sci-fi spacesuit boot single footstep walking on dry dusty alien ground, subtle gravel and compact soil, controlled weight, cinematic natural sound, close perspective, third small-rock variation, not cartoon, not arcade, not metallic floor, not wet mud, not exaggerated.'),
  sfx('sfx-footstep-run-01', 'sfx_footstep_run_01', 1.1, false, 'Realistic sci-fi spacesuit boot single footstep running on dry dusty alien ground, heavier impact, compact soil and small gravel, cinematic natural sound, physical but not exaggerated, first grounded variation, not cartoon, not arcade, not metallic floor, not wet mud.'),
  sfx('sfx-footstep-run-02', 'sfx_footstep_run_02', 1.1, false, 'Realistic sci-fi spacesuit boot single footstep running on dry dusty alien ground, heavier impact, compact soil and small gravel, cinematic natural sound, physical but not exaggerated, second dense-soil variation, not cartoon, not arcade, not metallic floor, not wet mud.'),
  sfx('sfx-footstep-run-03', 'sfx_footstep_run_03', 1.1, false, 'Realistic sci-fi spacesuit boot single footstep running on dry dusty alien ground, heavier impact, compact soil and small gravel, cinematic natural sound, physical but not exaggerated, third loose-gravel variation, not cartoon, not arcade, not metallic floor, not wet mud.'),

  // --- Aurora expedition ambience/one-shots (Mission 09 travel director) ---
  sfx('sfx-aurora-wind-gust', 'sfx_aurora_wind_gust', 4, false, 'Soft alien valley wind gust, cinematic, natural, dusty, 4 seconds.'),
  sfx('sfx-aurora-dust-sweep', 'sfx_aurora_dust_sweep', 4, false, 'Fine dust sweeping across rocky alien ground, wind driven, subtle, realistic, 4 seconds.'),
  sfx('sfx-ship-turbulence-light', 'sfx_ship_turbulence_light', 3, false, 'Light spacecraft turbulence rumble and hull vibration, cinematic but controlled, 3 seconds.'),
  sfx('sfx-atlas-route-lock', 'sfx_atlas_route_lock', 2, false, 'Ancient alien navigation beacon lock-on, soft resonant sci-fi pulse, not arcade, 2 seconds.'),
  sfx('sfx-base-signal-drop', 'sfx_base_signal_drop', 2, false, 'Radio telemetry signal weakening and dropping, soft static, sci-fi comms, 2 seconds.'),
  sfx('sfx-far-thunder', 'sfx_far_thunder', 5, false, 'Distant muffled thunder over alien plateau, cinematic, low and wide, 5 seconds.'),
  sfx('sfx-aurora-fog-open', 'sfx_aurora_fog_open', 4, false, 'Thick mist slowly opening with airy shimmer, cinematic reveal sound, 4 seconds.'),
  sfx('sfx-aurora-reveal-swell', 'sfx_aurora_reveal_swell', 5, false, 'Short emotional sci-fi reveal swell, hopeful, wide, not too loud, 5 seconds.'),
  sfx('sfx-route-beacon-scan', 'sfx_route_beacon_scan', 2, false, 'Soft scanner pulse hitting an ancient route beacon, sci-fi, 2 seconds.'),
  sfx('sfx-route-beacon-confirm', 'sfx_route_beacon_confirm', 2, false, 'Route beacon confirmation tone, warm sci-fi chime, subtle, 2 seconds.'),

  // --- War score (M18 onward). Loaded from the shared catalogue so the game's
  // typed definitions and this generator can never disagree about a prompt,
  // a duration or a file name. See src/audio/musicGenerationDefinitions.ts.
  ...await loadWarScoreTracks()
];

const requestedIds = getRequestedIds(args);
const category = getCategory(args);
const force = args.includes('--force');
const filteredByCategory = category ? catalog.filter((asset) => asset.category === category) : catalog;
let selected = requestedIds.size > 0
  ? filteredByCategory.filter(
      (asset) =>
        requestedIds.has(asset.id) ||
        requestedIds.has(asset.fileName) ||
        (asset.manifestId ? requestedIds.has(asset.manifestId) : false)
    )
  : filteredByCategory;

if (requestedIds.size > 0 && selected.length !== requestedIds.size) {
  const known = new Set(catalog.flatMap((asset) => [asset.id, asset.fileName, asset.manifestId].filter(Boolean)));
  const unknown = [...requestedIds].filter((id) => !known.has(id));
  process.stderr.write(`Unknown audio asset id: ${unknown.join(', ')}\n`);
  process.exit(1);
}

// `--failed-only` replays exactly what the previous run could not produce.
if (failedOnly) {
  const previousFailures = await readPreviousFailures();
  if (previousFailures.size === 0) {
    process.stdout.write('No recorded failures from a previous run: nothing to retry.\n');
    process.exit(0);
  }
  selected = selected.filter((asset) => previousFailures.has(asset.id));
}

// Generation order: explicit priority first (war score), catalogue order after.
selected = [...selected].sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500));

if (listOnly) {
  await printCatalogue(selected);
  process.exit(0);
}

// Rebuild audio-manifest.json from the files already on disk. No network, no
// credits: used after a cue is renamed or registered so the game can reach an
// MP3 that was already generated.
if (manifestOnly) {
  const rebuilt = await rebuildManifest();
  process.stdout.write(`Manifest rebuilt from existing files: ${rebuilt.assets.length} asset(s).\n`);
  process.exit(0);
}

if (!dryRun) {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(musicDirectory, { recursive: true });
  await rebuildManifest();
}

const generated = [];
const skipped = [];
const failures = [];

if (dryRun) {
  process.stdout.write(`DRY RUN — no network requests will be made. API key present: ${hasApiKey ? 'yes' : 'no'}\n\n`);
}

let requestIndex = 0;
for (const asset of selected) {
  const targetPath = getTargetPath(asset);
  const existingAsset = await resolveExistingAsset(asset);
  if (!force && existingAsset) {
    skipped.push({ id: asset.id, file: `${asset.fileName}${existingAsset.extension}` });
    process.stdout.write(`Skipped existing audio: ${asset.fileName}${existingAsset.extension}\n`);
    continue;
  }

  if (dryRun) {
    const reason = existingAsset ? 'would REGENERATE (--force)' : 'would generate';
    process.stdout.write(
      `${reason}: ${asset.id}\n` +
      `    endpoint : ${describeEndpoint(asset)}\n` +
      `    output   : ${relativeToRoot(targetPath)}\n` +
      `    duration : ${clampDuration(asset)}s${asset.loop ? ' (loop)' : ''}\n` +
      `    prompt   : ${asset.prompt.slice(0, 96)}...\n`
    );
    generated.push({ id: asset.id, file: `${asset.fileName}.mp3`, dryRun: true });
    continue;
  }

  process.stdout.write(`Generating audio: ${asset.fileName}.mp3\n`);
  // Sequential on purpose, with a small gap: concurrent music requests are the
  // fastest way to a 429 and to burning credits on retries.
  if (requestIndex > 0) await sleep(REQUEST_SPACING_MS);
  requestIndex += 1;
  try {
    const response = await requestAudioWithRetry(asset);
    if (!response.ok) throw new GenerationError(response.status);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
      throw new Error('ElevenLabs response was not audio');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isMp3(bytes)) throw new Error('ElevenLabs response was not a valid MP3');
    const temporaryPath = `${targetPath}.tmp`;
    await writeFile(temporaryPath, bytes);
    if (!await isValidMp3File(temporaryPath)) throw new Error('Generated MP3 failed local validation');
    await replaceWithBackup(temporaryPath, targetPath, asset.fileName);
    await rebuildManifest();
    generated.push({ id: asset.id, file: `${asset.fileName}.mp3`, bytes: bytes.length });
    process.stdout.write(`  ok: ${relativeToRoot(targetPath)} (${Math.round(bytes.length / 1024)} KB)\n`);
  } catch (error) {
    await unlink(`${targetPath}.tmp`).catch(() => undefined);
    const httpStatus = error instanceof GenerationError ? error.status : null;
    const status = httpStatus ? `HTTP ${httpStatus}` : (error?.message ?? 'invalid audio response');
    failures.push({ id: asset.id, file: `${asset.fileName}.mp3`, httpStatus, status });
    process.stderr.write(`Audio generation failed: ${asset.fileName}.mp3 (${status})\n`);
  }
}

const manifest = dryRun ? { assets: [] } : await rebuildManifest();
printSummary({ generated, skipped, failures, manifestCount: manifest.assets.length });
if (!dryRun) await writeReport({ generated, skipped, failures });
if (failures.length > 0) process.exitCode = 1;

function music(id, fileName, durationSeconds, prompt) {
  return { id, fileName, category: 'music', durationSeconds, loop: durationSeconds > 20, prompt };
}

/**
 * Read the shared war-score catalogue. Same file the game's typed definitions
 * import, so a prompt or file name can only ever be changed in one place.
 */
async function loadWarScoreTracks() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(warScorePath, 'utf8'));
  } catch (error) {
    process.stderr.write(`Could not read war score catalogue at ${relativeToRoot(warScorePath)}: ${error?.message}\n`);
    return [];
  }
  return (parsed.tracks ?? []).map((track) => ({
    id: track.id,
    // The game addresses tracks by cue, so that is the id written to the
    // runtime manifest. The short generation id stays selectable on the CLI.
    manifestId: track.cue,
    fileName: track.outputFile,
    category: 'music',
    durationSeconds: track.durationSeconds,
    loop: Boolean(track.loop),
    prompt: track.prompt,
    priority: track.priority,
    cue: track.cue,
    title: track.title,
    intensity: track.intensity
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function relativeToRoot(path) {
  return path.startsWith(projectRoot) ? path.slice(projectRoot.length + 1).replace(/\\/g, '/') : path;
}

/** Clamp to the API's own per-request ceiling. */
function clampDuration(asset) {
  return asset.category === 'music'
    ? Math.min(asset.durationSeconds, MAX_MUSIC_SECONDS)
    : asset.durationSeconds;
}

function describeEndpoint(asset) {
  return asset.category === 'music'
    ? 'POST /v1/music (model music_v1, force_instrumental)'
    : 'POST /v1/sound-generation (model eleven_text_to_sound_v2)';
}

async function printCatalogue(assets) {
  let pending = 0;
  process.stdout.write(`Catalogue: ${assets.length} asset(s)\n\n`);
  for (const asset of assets) {
    const existing = await resolveExistingAsset(asset);
    if (!existing) pending += 1;
    const state = existing ? 'READY  ' : 'PENDING';
    const cue = asset.cue ? ` cue=${asset.cue}` : '';
    process.stdout.write(
      `${state} ${asset.id.padEnd(30)} ${String(clampDuration(asset)).padStart(4)}s` +
      `${asset.loop ? ' loop' : '     '}${cue}\n` +
      `        -> ${relativeToRoot(getTargetPath(asset))}\n`
    );
  }
  process.stdout.write(`\nPending: ${pending} / ${assets.length}\n`);
}

function printSummary({ generated, skipped, failures, manifestCount }) {
  process.stdout.write('\n--- Summary ---\n');
  process.stdout.write(`Generated : ${generated.length}\n`);
  for (const item of generated) process.stdout.write(`  + ${item.id} -> ${item.file}\n`);
  process.stdout.write(`Skipped   : ${skipped.length} (already present)\n`);
  process.stdout.write(`Failed    : ${failures.length}\n`);
  for (const item of failures) {
    process.stdout.write(`  ! ${item.id} -> ${item.file} [${item.httpStatus ? `HTTP ${item.httpStatus}` : item.status}]\n`);
  }
  if (!dryRun) process.stdout.write(`Manifest  : ${manifestCount} real asset(s)\n`);
  if (failures.length > 0) {
    process.stdout.write('Retry just these with: npm.cmd run audio:generate:music:failed\n');
  }
}

/** Persist the run so `--failed-only` can replay exactly what broke. */
async function writeReport({ generated, skipped, failures }) {
  const report = {
    finishedAt: new Date().toISOString(),
    generated: generated.map((item) => item.id),
    skipped: skipped.map((item) => item.id),
    failed: failures.map((item) => ({ id: item.id, httpStatus: item.httpStatus, status: item.status }))
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8').catch(() => undefined);
}

async function readPreviousFailures() {
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    return new Set((report.failed ?? []).map((entry) => entry.id));
  } catch {
    return new Set();
  }
}

function sfx(id, fileName, durationSeconds, loop, prompt) {
  return { id, fileName, category: 'sfx', durationSeconds, loop, prompt };
}

function soundPrompt(description) {
  return `${description} ${negativeSoundDirection}`;
}

/**
 * Accepts `--only=a,b` (original form), `--id=a` and `--id a` (the form the
 * war-score workflow uses). All three fill the same selection set.
 */
function getRequestedIds(args) {
  const ids = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith('--only=')) ids.push(...argument.slice('--only='.length).split(','));
    else if (argument.startsWith('--id=')) ids.push(...argument.slice('--id='.length).split(','));
    else if (argument === '--id' && args[index + 1] && !args[index + 1].startsWith('--')) {
      ids.push(...args[index + 1].split(','));
      index += 1;
    }
  }
  return new Set(ids.map((id) => id.trim()).filter(Boolean));
}

function getCategory(args) {
  const option = args.find((argument) => argument.startsWith('--category='));
  const value = option?.slice('--category='.length);
  if (!value) return null;
  if (value !== 'music' && value !== 'sfx') {
    process.stderr.write('Audio category must be music or sfx\n');
    process.exit(1);
  }
  return value;
}

async function requestAudioWithRetry(asset) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await requestAudio(asset);
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(30000, retryAfter * 1000)
      : 1500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return response;
}

async function requestAudio(asset) {
  const isMusic = asset.category === 'music';
  const endpoint = isMusic
    ? 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128'
    : 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
  const body = isMusic
    ? {
        prompt: asset.prompt,
        music_length_ms: clampDuration(asset) * 1000,
        model_id: 'music_v1',
        force_instrumental: true
      }
    : {
        text: asset.prompt,
        duration_seconds: asset.durationSeconds,
        loop: asset.loop,
        prompt_influence: 0.55,
        model_id: 'eleven_text_to_sound_v2'
      };

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify(body)
  });
}

async function rebuildManifest() {
  let previousGeneratedAt = null;
  try {
    previousGeneratedAt = JSON.parse(await readFile(manifestPath, 'utf8')).generatedAt ?? null;
  } catch {
    previousGeneratedAt = null;
  }

  const assets = [];
  for (const asset of catalog) {
    const resolvedAsset = await resolveExistingAsset(asset);
    if (!resolvedAsset) continue;
    assets.push({
      id: asset.manifestId ?? asset.id,
      path: asset.category === 'music'
        ? `/audio/music/${asset.fileName}${resolvedAsset.extension}`
        : `/audio/generated/${asset.fileName}.mp3`,
      category: asset.category,
      loop: asset.loop,
      available: true,
      durationSeconds: asset.durationSeconds,
      tags: buildTags(asset)
    });
  }
  const manifest = {
    version: 2,
    generatedAt: assets.length > 0 ? new Date().toISOString() : previousGeneratedAt,
    assets
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function buildTags(asset) {
  const tags = asset.fileName.split('_').slice(1);
  return [...new Set([asset.category, ...tags])];
}

function getTargetPath(asset) {
  const directory = asset.category === 'music' ? musicDirectory : outputDirectory;
  return join(directory, `${asset.fileName}.mp3`);
}

async function resolveExistingAsset(asset) {
  const extensions = asset.category === 'music' ? ['.mp3', '.ogg', '.wav'] : ['.mp3'];
  const directory = asset.category === 'music' ? musicDirectory : outputDirectory;
  for (const extension of extensions) {
    const path = join(directory, `${asset.fileName}${extension}`);
    if (await isValidAudioFile(path, extension)) return { path, extension };
  }
  return null;
}

async function replaceWithBackup(temporaryPath, targetPath, fileName) {
  if (await isValidMp3File(targetPath)) {
    await mkdir(backupDirectory, { recursive: true });
    await copyFile(targetPath, join(backupDirectory, `${fileName}.previous.mp3`));
  }
  await unlink(targetPath).catch(() => undefined);
  await rename(temporaryPath, targetPath);
}

async function isValidMp3File(path) {
  return isValidAudioFile(path, '.mp3');
}

async function isValidAudioFile(path, extension) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size < 1024) return false;
    const handle = await readFile(path);
    if (extension === '.mp3') return isMp3(handle);
    if (extension === '.ogg') return isOgg(handle);
    if (extension === '.wav') return isWav(handle);
    return false;
  } catch {
    return false;
  }
}

function isMp3(bytes) {
  if (bytes.length < 1024) return false;
  const hasId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}

function isOgg(bytes) {
  return bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS';
}

function isWav(bytes) {
  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WAVE';
}
