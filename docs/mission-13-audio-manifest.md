# Misión 13 — "La Primera Tormenta" · Manifiesto de audio

Estado: **el código ya está preparado para estos archivos, pero ninguno existe todavía.**
Mientras falten, cada cue cae automáticamente en un sonido existente (columna
*Fallback*) y la consola registra **una sola** línea informativa por archivo.

- Formato: **MP3**, 44.1 kHz, mono para SFX puntuales, estéreo para música y ambientes.
- Normalizar a **-16 LUFS** aprox. para música/ambientes y **-12 LUFS** para one-shots.
- Sin voces, sin melodías reconocibles, sin referencias a compositores reales.
- Los volúmenes de la tabla son el nivel **inicial** que aplica el juego; el
  jugador siempre los escala con sus sliders de música/efectos.

---

## 1. Música (4 archivos)

Reproducidas por `MusicManager`, que ya hace **crossfade de 1.8 s** entre pistas.
No requieren fade manual, pero **deben empezar y terminar en silencio o en
material sostenido** para que el crossfade no produzca un salto.

| Archivo | Ruta | Tipo | Evento (paso de M13) | Loop | Duración | Intensidad | Vol. |
|---|---|---|---|---|---|---|---|
| `m13-calm-before-storm.mp3` | `public/audio/mission-13/music/` | Música | `stormAlert` | Sí | 60–75 s | Baja | 0.78 |
| `m13-storm-rising.mp3` | `public/audio/mission-13/music/` | Música | `secureGenerator`, `anchorAntennaFirst`, `anchorAntennaSecond`, `activateAntenna` | Sí | 75–90 s | Media | 0.78 |
| `m13-storm-peak.mp3` | `public/audio/mission-13/music/` | Música | `returnToHabitat`, `chargeShield` | Sí | 75–90 s | Alta | 0.78 |
| `m13-after-the-storm.mp3` | `public/audio/mission-13/music/` | Música | `stormSubsiding`, `completed` | Sí | 55–70 s | Baja | 0.78 |

**Fallbacks actuales** (mientras no existan): `aurora-pre-reveal` → `atlas-mystery`,
`aurora-storm-plateau` → `shadow-orbit`, `aurora-completion` → `calm-exploration`.

### Requisito de loop / crossfade
Terminar con una cola sostenida (pad o ruido tonal) sin resolución melódica, de
modo que el corte a los 1.8 s de fade sea imperceptible. **No** cerrar con
platillo, golpe ni silencio abrupto.

### Prompts de generación

**`m13-calm-before-storm`**
> Cinematic science-fiction ambient score for an isolated human colony on an alien
> valley at night, moments before an electromagnetic storm arrives. Contemplative,
> unsettling, minimal, with barely perceptible tension. Sustained low synthesizer
> pads, distant metallic resonance, a single slow sub-bass pulse, sparse bowed
> string harmonics. No drums, no melody, no recognizable theme, no vocals.
> Very slow evolution, no climax. 70 seconds, ending on a sustained pad that fades
> naturally so it can crossfade seamlessly. Serious and restrained, not fantasy,
> not heroic.

**`m13-storm-rising`**
> Cinematic science-fiction score for a human colonist working outdoors while an
> electromagnetic storm builds overhead. Growing unease and urgency without
> becoming action music. Low pulsing synthesizer bass, filtered noise sweeps
> suggesting wind, restrained low percussion entering gradually, dissonant string
> texture rising slowly. No melody, no theme, no vocals, no drum kit. Continuous
> build across the whole piece but never resolving. 85 seconds, ending on
> sustained tension suitable for crossfade. Realistic, serious, industrial.

**`m13-storm-peak`**
> Cinematic science-fiction score for the worst moment of an electromagnetic storm
> hitting a small human colony. Dense, oppressive and dangerous, but disciplined —
> a natural disaster, not a battle. Heavy low drones, distorted electromagnetic
> textures, tense sustained strings, deep irregular percussive impacts, filtered
> static. No melody, no theme, no vocals, no triumphant brass. Keeps the midrange
> relatively clear so dialogue stays intelligible over it. 85 seconds, loopable,
> ending on sustained noise and drone. Serious and physical.

**`m13-after-the-storm`**
> Cinematic science-fiction score for the quiet moments after a storm passes over a
> small human colony that survived its first hostile night. Hopeful, emotional,
> restrained and human — relief, not triumph. Warm sustained strings, soft
> synthesizer pad, a single distant piano-like resonance, gentle low bass. No
> percussion, no fanfare, no melody that could be hummed, no vocals. Slow, spacious,
> intimate. 60 seconds, resolving into a soft sustained chord suitable for looping
> or crossfading out. Understated and sincere.

---

## 2. Ambientes en loop (5 archivos)

Gestionados por `Mission13AudioDirector`, que recalcula la mezcla a **10 Hz** y
escala cada capa con la intensidad real de la tormenta. Los volúmenes de la tabla
son el **máximo** que alcanza cada capa; nunca suenan las cinco a nivel pleno.

| Archivo | Ruta | Evento / condición | Loop | Duración | Intensidad | Vol. máx |
|---|---|---|---|---|---|---|
| `m13-wind-distant-loop.mp3` | `.../ambience/` | Toda la misión; **baja** al crecer el viento fuerte | Sí | 18–22 s | Baja | 0.30 |
| `m13-wind-heavy-loop.mp3` | `.../ambience/` | Sube con `stormIntensity` (activo > 0.18) | Sí | 18–22 s | Media-alta | 0.42 |
| `m13-electromagnetic-hum-loop.mp3` | `.../ambience/` | Activo > 0.22; máximo en el pico, baja al disiparse | Sí | 15–18 s | Media | 0.34 |
| `m13-habitat-alarm-loop.mp3` | `.../ambience/` | Solo `returnToHabitat` / `chargeShield`, y **solo** con escudo apagado | Sí | 6–8 s | Media | 0.22 |
| `m13-debris-impacts-loop.mp3` | `.../ambience/` | Solo con tormenta > 0.5 | Sí | 12–16 s | Media | 0.30 |

### Requisito de loop
**Loop perfecto obligatorio.** Sin fade-in ni fade-out en el archivo (el motor
aplica 0.6 s de fade al entrar y 0.7 s al salir). Sin eventos reconocibles que
delaten el punto de corte: nada de una ráfaga o un golpe único memorable.
Cruzar el final sobre el principio antes de exportar.

### Prompts de generación

**`m13-wind-distant-loop`**
> Seamless looping ambience of distant wind across a wide open alien valley, heard
> from outside. Steady, low-mid frequency, no gusts strong enough to be memorable,
> no whistling. Natural and continuous, recorded from a mid distance perspective.
> Clean background, no music, no voices, no animals, no rain. 20 seconds, perfectly
> loopable with no fade in or out. Game audio ambience bed.

**`m13-wind-heavy-loop`**
> Seamless looping ambience of strong sustained wind driving dust across rocky
> ground, close perspective, as heard by someone standing outdoors in a storm.
> Dense low-mid rumble with fine grit texture, continuous pressure, no single
> identifiable gust. No whistling, no music, no voices, no thunder. Dry recording,
> minimal reverberation. 20 seconds, perfectly loopable with no fade in or out.

**`m13-electromagnetic-hum-loop`**
> Seamless looping science-fiction ambience of electromagnetic interference in the
> air: low electrical hum, faint crackling static, slow modulating tonal buzz,
> subtle high-frequency shimmer. Unnatural but physical, like charged atmosphere
> near power equipment. No music, no voices, no melody, no rhythm. Clean and
> continuous. 16 seconds, perfectly loopable with no fade in or out.

**`m13-habitat-alarm-loop`**
> Seamless looping interior alarm from a small human habitat module: restrained
> low-frequency warning tone repeating at a calm, non-panicking pace, slightly
> muffled as if heard through a hull, with faint room tone. Serious and functional,
> not shrill, not a klaxon, not arcade. No music, no voices. Short reverberation
> suggesting a small enclosed space. 7 seconds, perfectly loopable, exactly a whole
> number of alarm cycles so the repeat is invisible.

**`m13-debris-impacts-loop`**
> Seamless looping ambience of small light debris — grit, sand and tiny fragments —
> striking metal panels and rocky ground, driven by strong wind. Irregular, scattered,
> never rhythmic, moderate density. Dry close perspective, minimal reverberation.
> No music, no voices, no wind bed (the wind is a separate layer), no large impacts.
> 14 seconds, perfectly loopable with no fade in or out.

---

## 3. Efectos — Generador (4 archivos)

| Archivo | Ruta | Evento | Loop | Duración | Intensidad | Vol. | Fallback |
|---|---|---|---|---|---|---|---|
| `m13-generator-repair-loop.mp3` | `.../sfx/` | Mientras el jugador trabaja el panel (paso `secureGenerator`, en rango) | Sí | 5–7 s | Media | 0.40 | `defenseNetwork` |
| `m13-generator-sparks-01.mp3` | `.../sfx/` | One-shot durante la reparación, **cooldown determinista de 0.9 s**, alternando 01/02 | No | 1.0–1.4 s | Media | 0.45 | `silentProbeInterference` |
| `m13-generator-sparks-02.mp3` | `.../sfx/` | Variante alterna de la anterior | No | 1.0–1.4 s | Media | 0.45 | `echoResolved` |
| `m13-generator-stabilized.mp3` | `.../sfx/` | Al completar la reparación (100 %) | No | 2–3 s | Media | 0.62 | `defenseNetwork` |

> El loop se detiene automáticamente al alejarse o al terminar la fase; no hay
> reproducción aleatoria: las variantes alternan de forma determinista.

**Prompts**

- **`m13-generator-repair-loop`** — *Seamless looping sound of a damaged industrial power unit under repair: unstable electrical hum with irregular fluctuation, faint relay ticking, low transformer buzz, occasional soft internal arcing. Close perspective, dry, minimal reverberation. Metal and electrical materials. No music, no voices, no speech. 6 seconds, perfectly loopable with no fade.*
- **`m13-generator-sparks-01` / `-02`** — *Short electrical spark burst from an open power panel: sharp crackling arc, brief metallic sizzle, quick decay. Close perspective, dry, no reverberation tail. Two distinct variations of the same event, different in contour and brightness. Clean background, no music, no voices, no hum bed. 1.2 seconds each, game audio one-shot.*
- **`m13-generator-stabilized`** — *Industrial power unit stabilising: unstable electrical fluctuation settling into a clean steady hum, followed by a single soft confirmation relay click. Reassuring and technical, not musical, not a chime. Close perspective, dry. No music, no voices. 2.5 seconds with a clean tail.*

---

## 4. Efectos — Antena (4 archivos)

| Archivo | Ruta | Evento | Loop | Duración | Intensidad | Vol. | Fallback |
|---|---|---|---|---|---|---|---|
| `m13-antenna-anchor-lock-01.mp3` | `.../sfx/` | Al asegurar el **primer** anclaje | No | 1.4–1.8 s | Media | 0.60 | `liftLock` |
| `m13-antenna-anchor-lock-02.mp3` | `.../sfx/` | Al asegurar el **segundo** anclaje | No | 1.4–1.8 s | Media | 0.60 | `liftLock` |
| `m13-antenna-servo-loop.mp3` | `.../sfx/` | Mientras se sujeta un anclaje (en rango) y durante `activateAntenna` | Sí | 4–6 s | Baja | 0.38 | `liftServo` |
| `m13-antenna-online.mp3` | `.../sfx/` | Al reactivar la antena | No | 2.5–3.5 s | Media | 0.62 | `atlas` |

> El loop del servo se corta en cuanto el jugador se aleja o se interrumpe la
> interacción.

**Prompts**

- **`m13-antenna-anchor-lock-01` / `-02`** — *Heavy steel guy-anchor being tensioned and locking into place: cable tightening under load, a solid mechanical latch engaging, brief metallic ring. Two distinct variations of the same action. Outdoor perspective, dry with very short natural decay, no room reverberation. Steel and rock materials. No music, no voices. 1.6 seconds each, game audio one-shot.*
- **`m13-antenna-servo-loop`** — *Seamless looping sound of a small electric servo adjusting a communications mast under load: steady geared motor whir with slight strain, faint metallic creak of a mast under wind pressure. Close outdoor perspective, dry. No music, no voices, no wind bed. 5 seconds, perfectly loopable with no fade.*
- **`m13-antenna-online`** — *Communications antenna coming back online: servo settling, a rising electronic carrier tone locking in, a short burst of radio static clearing into a clean signal. Technical and hopeful, restrained, not musical, not a fanfare. Close perspective, dry. No music, no voices, no speech. 3 seconds with a clean tail.*

---

## 5. Efectos — Descargas electromagnéticas (4 archivos)

**Sincronizados con el destello visual real.** `AuroraStormEffect` publica cada
descarga visible mediante `consumeStrike()`; el audio solo responde a esos
eventos, nunca a un temporizador propio. Separación mínima de **1.7 s** entre
descargas y alternancia determinista entre variantes.

| Archivo | Ruta | Evento | Loop | Duración | Intensidad | Vol. | Fallback |
|---|---|---|---|---|---|---|---|
| `m13-em-discharge-near-01.mp3` | `.../sfx/` | Destello **cercano** (sprite bajo) | No | 2.5–3.5 s | Alta | 0.50 × intensidad | `farThunder` |
| `m13-em-discharge-near-02.mp3` | `.../sfx/` | Variante alterna cercana | No | 2.5–3.5 s | Alta | 0.50 × intensidad | `farThunder` |
| `m13-em-discharge-distant-01.mp3` | `.../sfx/` | Destello **lejano** (sprite alto) | No | 3.5–4.5 s | Media | 0.30 × intensidad | `farThunder` |
| `m13-em-discharge-distant-02.mp3` | `.../sfx/` | Variante alterna lejana | No | 3.5–4.5 s | Media | 0.30 × intensidad | `farThunder` |

**Prompts**

- **`m13-em-discharge-near-01` / `-02`** — *Close electromagnetic discharge in an alien atmosphere: sharp electrical crack with a dry percussive front, followed by a short crackling ionised tail and a low pressure thump. Not a natural thunderclap — more electrical and synthetic, like a massive static arc. Two distinct variations. Close perspective, open outdoor space, short natural decay, no artificial reverberation. Clean background, no music, no voices, no rain. 3 seconds each.*
- **`m13-em-discharge-distant-01` / `-02`** — *Distant electromagnetic discharge rolling across a wide open valley: muffled low-frequency rumble with a faint electrical edge, long slow decay, no sharp transient. Heard from far away, softened by distance. Two distinct variations. Wide open outdoor perspective, natural distance reverberation. No music, no voices, no rain. 4 seconds each.*

---

## 6. Efectos — Campo protector (5 archivos)

| Archivo | Ruta | Evento | Loop | Duración | Intensidad | Vol. | Fallback |
|---|---|---|---|---|---|---|---|
| `m13-shield-charge-loop.mp3` | `.../sfx/` | Mientras el escudo carga **y** el jugador está en rango | Sí | 5–7 s | Media | 0.42 | `defenseNetwork` |
| `m13-shield-charge-warning.mp3` | `.../sfx/` | Al perder carga por alejarse; gap mínimo **3.5 s** | No | 1.5–2 s | Media-alta | 0.55 | `warning` |
| `m13-shield-activated.mp3` | `.../sfx/` | Al llegar al 100 % | No | 3–4 s | Alta | 0.70 | `atlas` |
| `m13-shield-impact-01.mp3` | `.../sfx/` | Descarga **cercana visible** con el domo ya activo; gap mínimo **2.4 s** | No | 1.8–2.2 s | Alta | 0.40–0.60 | `shipTurbulence` |
| `m13-shield-impact-02.mp3` | `.../sfx/` | Variante alterna | No | 1.8–2.2 s | Alta | 0.40–0.60 | `shipTurbulence` |

**Prompts**

- **`m13-shield-charge-loop`** — *Seamless looping sound of an energy shield emitter charging: rising layered electrical hum with a slow pulsing modulation, faint capacitor whine, steady power draw. Continuous and building in texture but not in pitch, so it can loop. Close perspective, dry. No music, no voices. 6 seconds, perfectly loopable with no fade.*
- **`m13-shield-charge-warning`** — *Short warning alert for a failing energy charge: two-tone descending electronic warning with a faint power-down wobble underneath. Urgent but restrained and technical, not shrill, not arcade. Close perspective, dry, clean tail. No music, no voices. 1.8 seconds.*
- **`m13-shield-activated`** — *Energy shield snapping to full strength: a rising electrical surge resolving into a stable low resonant hum with a soft airy shimmer as the field settles. Powerful but controlled and reassuring, not a fanfare, not musical. Close perspective, moderate natural decay. No music, no voices. 3.5 seconds with a clean tail.*
- **`m13-shield-impact-01` / `-02`** — *Electromagnetic discharge striking an energy shield dome: a dull absorbed impact with an electrical crackle spreading outward, followed by a brief resonant shimmer of the field flexing. Two distinct variations. Heard from beneath the dome, moderate reverberation. No music, no voices, no metal clang. 2 seconds each.*

---

## 7. Confirmaciones de objetivo (2 archivos)

| Archivo | Ruta | Evento | Loop | Duración | Intensidad | Vol. | Fallback |
|---|---|---|---|---|---|---|---|
| `m13-objective-complete.mp3` | `.../sfx/` | Al cerrar cada fase (alerta, generador, anclaje 1, anclaje 2, antena, escudo). **Una sola vez por fase** | No | 1.5–2.5 s | Baja | 0.50 | `confirm` |
| `m13-mission-complete.mp3` | `.../sfx/` | Solo al completar M13. **Nunca junto con el anterior** | No | 4–5 s | Media | 0.70 | `missionComplete` |

**Prompts**

- **`m13-objective-complete`** — *Short restrained confirmation cue for a completed field task on a space colony: a soft two-note electronic acknowledgement with a faint data-processing texture. Understated, technical, not celebratory, not an arcade jingle. Dry, clean tail. No music, no voices. 2 seconds.*
- **`m13-mission-complete`** — *Mission accomplished cue for a small human colony that survived a dangerous night: a warm sustained resolving tone with soft harmonic layers and a gentle sense of relief. Dignified and human, restrained rather than triumphant, no brass fanfare, no drums, no melody that could be hummed. Clean decay to silence. No voices. 4.5 seconds.*

---

## 8. Voces — 14 diálogos (pendientes, no generar todavía)

Canal `aurora-crew` **ya habilitado** en `VoiceManager` (`VOICED_SPEAKERS`) y en
`AudioManager.playVoice`, que ahora acepta también `/audio/mission-13/voices/`.
Los 14 diálogos pueden recibir archivo de voz sin ningún cambio adicional: basta
con añadir su entrada al `voice-manifest.json`.

Directorio: `public/audio/mission-13/voices/`

| # | ID de diálogo | Personaje | Fase | Texto | Archivo recomendado | Dur. aprox. |
|---|---|---|---|---|---|---|
| 1 | `m13_alert` | Cmdte. Valeria Soren | Alerta inicial | "Piloto, tenemos un frente electromagnético formándose sobre el valle. No estábamos preparados para esto tan pronto." | `m13_alert.mp3` | ~7 s |
| 2 | `m13_pressure_drop` | Cmdte. Valeria Soren | Alerta inicial | "Caída de presión y fluctuaciones eléctricas en toda la red exterior. Salga y confirme el estado." | `m13_pressure_drop.mp3` | ~6 s |
| 3 | `m13_crew_worried` | Tripulación Aurora | Alerta inicial | "Las luces del módulo están parpadeando. Estamos los tres adentro." | `m13_crew_worried.mp3` | ~4 s |
| 4 | `m13_inspect_grid` | Cmdte. Valeria Soren | Tras confirmar alerta | "El nodo energético es lo primero. Sin energía estable, el soporte vital no aguanta la noche." | `m13_inspect_grid.mp3` | ~6 s |
| 5 | `m13_generator_stable` | Cmdte. Valeria Soren | Generador completado | "Energía parcialmente estable. Ahora la antena: si perdemos el enlace, quedan aislados ahí adentro." | `m13_generator_stable.mp3` | ~7 s |
| 6 | `m13_anchor_first` | Cmdte. Valeria Soren | Anclaje 1 | "Primer tensor sujeto. El mástil todavía se mueve: falta el opuesto." | `m13_anchor_first.mp3` | ~5 s |
| 7 | `m13_anchor_second` | Cmdte. Valeria Soren | Anclaje 2 | "Segundo tensor sujeto. La carga del viento ya está repartida. Active la antena." | `m13_anchor_second.mp3` | ~6 s |
| 8 | `m13_comms_back` | Cmdte. Valeria Soren | Antena online | "Enlace parcial recuperado. Vuelva al módulo: el frente todavía no llegó a su punto máximo." | `m13_comms_back.mp3` | ~7 s |
| 9 | `m13_crew_relief` | Tripulación Aurora | Antena online | "Volvemos a escucharlos. No corten el enlace otra vez, por favor." | `m13_crew_relief.mp3` | ~5 s |
| 10 | `m13_shield_prompt` | Cmdte. Valeria Soren | Regreso al hábitat | "Panel de emergencia listo. No se aleje mientras carga: si se corta, hay que empezar de nuevo." | `m13_shield_prompt.mp3` | ~7 s |
| 11 | `m13_shield_online` | Cmdte. Valeria Soren | Escudo al 100 % | "Campo protector en línea. El pico del frente nos pasa por encima ahora mismo." | `m13_shield_online.mp3` | ~6 s |
| 12 | `m13_crew_safe` | Tripulación Aurora | Disipación | "Presión estable. Los tres enteros. Gracias, piloto." | `m13_crew_safe.mp3` | ~4 s |
| 13 | `m13_pleyadan_night` | Transmisión Pleyadana | Disipación | "Un mundo no prueba a quienes llegan. Solo sigue siendo lo que es." | `m13_pleyadan_night.mp3` | ~6 s |
| 14 | `m13_complete` | Cmdte. Valeria Soren | Misión completada | "La colonia sobrevivió a su primera noche hostil. Con gente adentro. Que eso también quede en el registro." | `m13_complete.mp3` | ~8 s |

> **Nota:** el pipeline actual (`scripts/generate-elevenlabs-voices.mjs`) solo
> procesa los hablantes listados en su propio `speakerConfigs`. Para que las 3
> líneas de `aurora-crew` se generen hay que añadir una voz para ese canal en ese
> script; las 11 restantes (Soren y Pleyadano) ya funcionan con la configuración
> existente.

---

## 9. Resumen de rutas a crear

```
public/audio/mission-13/
├── music/      (4 archivos)
├── ambience/   (5 archivos)
├── sfx/        (19 archivos)
└── voices/     (14 archivos, ya generadas)
```

**Total inmediato: 28 archivos** de música/ambiente/efectos.

Se generan con `npm run audio:generate:m13`, cuyo catálogo en
`scripts/generate-m13-audio.mjs` replica exactamente los 28 nombres, duraciones
y flags de loop de `MISSION13_STATIC_ASSETS`. Para revisar qué falta sin gastar
créditos: `npm run audio:check:m13`.
