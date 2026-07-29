# Arca Epsilon audio pipeline

Runtime audio is always local. The browser reads `public/audio/audio-manifest.json` and never contacts ElevenLabs.

## Generation

```powershell
node scripts/generate-elevenlabs-audio.mjs --only=sfx-ship-idle,sfx-ship-accelerate,sfx-hover-wash,sfx-vertical-thrust,sfx-boost-intensity,sfx-brake-release,sfx-space-cruise,sfx-atmospheric-flight --force
node scripts/generate-elevenlabs-audio.mjs --category=music --force
```

The key is read from `ELEVENLABS_API_KEY` in `.env.local`. Existing generated audio is copied to `public/audio/backups/` before a valid replacement is installed.

## Local music fallback

When the ElevenLabs Music endpoint is unavailable, place MP3, OGG, or WAV files in `public/audio/music/` using these base names:

- `music_main_theme`
- `music_space_exploration`
- `music_deep_space`
- `music_orbit_atlas`
- `music_atlas_mystery`
- `music_atmospheric_entry`
- `music_surface_nereida`
- `music_calm_exploration`
- `music_pleyadan_contact`
- `music_defense_protocol`
- `music_silent_probe`
- `music_danger_rising`
- `music_interference_layer`
- `music_sting_discovery`
- `music_sting_complete`
- `music_relief_resolution`

Run the generation script without `--force` to rebuild the manifest while preserving local files. Missing tracks stay out of the manifest and `MusicManager` selects the first valid fallback.
