import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from './load-env-local.mjs';

class GenerationError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const voicesDirectory = join(projectRoot, 'public', 'audio', 'voices');
const manifestPath = join(projectRoot, 'public', 'audio', 'voice-manifest.json');
const definitionsPath = join(projectRoot, 'src', 'assets', 'dialogueDefinitions.ts');
const speakerConfigs = {
  'commander-soren': {
    envKey: 'ELEVENLABS_COMMANDER_VOICE_ID',
    placeholder: 'your_commander_voice_id_here',
    folder: 'commander',
    label: 'Commander',
    voiceSettings: { stability: 0.68, similarity_boost: 0.76, style: 0.24, use_speaker_boost: true }
  },
  pleyadan: {
    envKey: 'ELEVENLABS_PLEYADAN_VOICE_ID',
    placeholder: 'your_pleyadan_voice_id_here',
    folder: 'pleyadan',
    label: 'Pleyadan',
    voiceSettings: { stability: 0.78, similarity_boost: 0.72, style: 0.34, use_speaker_boost: true }
  }
};

await loadEnvLocal(projectRoot, [
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_COMMANDER_VOICE_ID',
  'ELEVENLABS_PLEYADAN_VOICE_ID'
]);
await Promise.all(
  Object.values(speakerConfigs).map((config) => mkdir(join(voicesDirectory, config.folder), { recursive: true }))
);

const definitions = extractVoiceDialogues(await readFile(definitionsPath, 'utf8'));
const requestedSpeaker = getRequestedSpeaker(process.argv.slice(2));
const selectedSpeakers = requestedSpeaker ? [requestedSpeaker] : Object.keys(speakerConfigs);
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');

const configuredSpeakers = selectedSpeakers.filter((speakerId) => {
  const config = speakerConfigs[speakerId];
  const voiceId = process.env[config.envKey]?.trim();
  const configured = voiceId && voiceId !== config.placeholder && voiceId !== 'PASTE_VOICE_ID_HERE';
  if (!configured) {
    process.stdout.write(`${config.label} voice generation skipped: ${config.envKey} is not configured.\n`);
  }
  return configured;
});

if (configuredSpeakers.length > 0 && (!apiKey || apiKey === 'PASTE_KEY_HERE' || apiKey === 'your_elevenlabs_api_key_here')) {
  process.stderr.write('Missing ELEVENLABS_API_KEY in .env.local\n');
  process.exit(1);
}

const failures = [];
for (const speakerId of configuredSpeakers) {
  const config = speakerConfigs[speakerId];
  const voiceId = process.env[config.envKey].trim();
  const speakerDefinitions = definitions.filter((definition) => definition.speakerId === speakerId);
  const outputDirectory = join(voicesDirectory, config.folder);

  for (const dialogue of speakerDefinitions) {
    const targetPath = join(outputDirectory, `${dialogue.id}.mp3`);
    if (!force && await isValidMp3File(targetPath)) continue;

    process.stdout.write(`Generating ${config.label} voice: ${dialogue.id}.mp3\n`);
    try {
      const response = await requestVoiceWithRetry(dialogue.text, voiceId, apiKey, config.voiceSettings);
      if (!response.ok) throw new GenerationError(response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!isMp3(bytes)) throw new Error('ElevenLabs response was not a valid MP3');
      const temporaryPath = `${targetPath}.tmp`;
      await writeFile(temporaryPath, bytes);
      if (!await isValidMp3File(temporaryPath)) throw new Error('Generated MP3 failed local validation');
      await rename(temporaryPath, targetPath);
    } catch (error) {
      await unlink(`${targetPath}.tmp`).catch(() => undefined);
      const status = error instanceof GenerationError ? `HTTP ${error.status}` : 'invalid audio response';
      failures.push(`${speakerId}:${dialogue.id}`);
      process.stderr.write(`${config.label} voice generation failed: ${dialogue.id}.mp3 (${status})\n`);
    }
  }
}

const manifest = await rebuildManifest(definitions);
process.stdout.write(`Voice generation complete: ${manifest.assets.length} real asset(s) in manifest.\n`);
if (failures.length > 0) process.exitCode = 1;

function getRequestedSpeaker(args) {
  const option = args.find((argument) => argument.startsWith('--speaker='));
  const value = option?.slice('--speaker='.length);
  if (!value) return null;
  if (!(value in speakerConfigs)) {
    process.stderr.write(`Unknown voice speaker: ${value}\n`);
    process.exit(1);
  }
  return value;
}

function extractVoiceDialogues(source) {
  return [...source.matchAll(/\{([\s\S]*?)\}/g)]
    .map((match) => match[1])
    .map((block) => {
      const speakerMatch = block.match(/\bspeakerId:\s*(?:'([^']+)'|([A-Za-z0-9_-]+))/);
      const token = speakerMatch?.[1] ?? speakerMatch?.[2] ?? '';
      const speakerId = token === 'commander' ? 'commander-soren' : token;
      return {
        id: block.match(/\bid:\s*'([^']+)'/)?.[1] ?? '',
        speakerId,
        text: block.match(/\btext:\s*'((?:\\'|[^'])*)'/)?.[1].replaceAll("\\'", "'") ?? ''
      };
    })
    .filter((entry) => entry.id && entry.text && entry.speakerId in speakerConfigs);
}

async function requestVoiceWithRetry(text, selectedVoiceId, selectedApiKey, voiceSettings) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(selectedVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': selectedApiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          language_code: 'es',
          voice_settings: voiceSettings
        })
      }
    );
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return response;
}

async function rebuildManifest(definitions) {
  const assets = [];
  for (const dialogue of definitions) {
    const config = speakerConfigs[dialogue.speakerId];
    const filePath = join(voicesDirectory, config.folder, `${dialogue.id}.mp3`);
    if (!await isValidMp3File(filePath)) continue;
    assets.push({
      id: dialogue.id,
      speakerId: dialogue.speakerId,
      path: `/audio/voices/${config.folder}/${dialogue.id}.mp3`
    });
  }
  const manifest = {
    version: 2,
    generatedAt: assets.length > 0 ? new Date().toISOString() : null,
    assets
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function isValidMp3File(path) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size < 1024) return false;
    return isMp3(await readFile(path));
  } catch {
    return false;
  }
}

function isMp3(bytes) {
  if (bytes.length < 1024) return false;
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}
