import './editor.css';
import { GarageView } from '../garage/GarageView';
import { ShipCatalog } from '../ships/ShipCatalog';
import { ENGINE_OFFSET } from '../game/PlayerShipHardpoints';

/**
 * Ship editor.
 *
 * An authoring workbench: load a hull, light it, place the hardpoints the game
 * builds at runtime, and read the numbers back out as code.
 *
 * The GLB is the source of detail on purpose. Measured in this project, the
 * shipped hull is 2 meshes while the procedural parts bolted onto it are 109 --
 * so a modelled hull costs 2 draw calls where reproducing the same detail with
 * primitives would cost hundreds, and its panel work lives in textures rather
 * than geometry. Procedural is kept for what must animate: plumes, glow, lights.
 *
 * No sign-in. The tool reads no data and writes nothing: it moves numbers in
 * memory and prints them for pasting. It carries `noindex` and is linked from
 * nowhere.
 */

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
};

/** Factory defaults, so "Restaurar" does not depend on load order. */
const DEFAULT_ENGINE_OFFSET = { x: 0.135, y: 0.075, z: 0.49 };

const DEFAULT_PRESENTATION = {
  exposure: 1.08,
  environmentIntensity: 0.42,
  keyIntensity: 3.4,
  rimIntensity: 2.6,
  fillIntensity: 0.55,
  shadowSoftness: 3
};

type PresentationKey = keyof typeof DEFAULT_PRESENTATION;

type Slider<K extends string> = {
  key: K;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
};

const ENGINE_CONTROLS: Slider<'x' | 'y' | 'z'>[] = [
  { key: 'x', label: 'Separación', hint: 'Fracción del ancho. Sube para abrir los motores.', min: 0, max: 0.5, step: 0.005 },
  { key: 'y', label: 'Altura', hint: 'Caída bajo la línea central, fracción del alto.', min: -0.4, max: 0.4, step: 0.005 },
  { key: 'z', label: 'Posición a popa', hint: 'Fracción de la profundidad. La cola está en 0.50.', min: 0.2, max: 0.6, step: 0.005 }
];

/** Lighting knobs, with ranges that stay inside a believable look. */
const PRESENTATION_CONTROLS: Slider<PresentationKey>[] = [
  { key: 'exposure', label: 'Exposición', hint: 'Brillo general. De más, quema los paneles claros.', min: 0.5, max: 2, step: 0.02 },
  { key: 'environmentIntensity', label: 'Reflejo', hint: 'Cuánto entorno refleja el metal. Es lo que le da volumen.', min: 0, max: 2, step: 0.02 },
  { key: 'keyIntensity', label: 'Luz principal', hint: 'Define la forma y proyecta la sombra.', min: 0, max: 8, step: 0.1 },
  { key: 'rimIntensity', label: 'Contraluz', hint: 'Recorta la silueta contra el fondo.', min: 0, max: 8, step: 0.1 },
  { key: 'fillIntensity', label: 'Relleno', hint: 'Levanta las sombras. De más, aplana la nave.', min: 0, max: 3, step: 0.05 },
  { key: 'shadowSoftness', label: 'Suavidad de sombra', hint: 'Bordes difusos. 0 da sombra dura de plantilla.', min: 0, max: 10, step: 0.5 }
];

/**
 * The one and only scene.
 *
 * A browser allows a page a limited number of WebGL contexts and then refuses
 * more with "Web page caused context loss and was blocked". An earlier version
 * built a fresh `GarageView` per attempt, so a few retries exhausted the budget
 * and every later attempt failed at context creation -- surfacing as a
 * null-`precision` error deep inside Three.js. Built once, never rebuilt.
 */
let garage: GarageView | undefined;

function showStatus(message: string): void {
  const loading = el('editor-loading');
  loading.hidden = false;
  loading.textContent = message;
}

function ensureGarage(): GarageView {
  if (!garage) {
    garage = new GarageView(el('garage-screen'));
    // A lost context cannot be recovered on this page: say so plainly rather
    // than letting the next draw fail with a Three.js internal.
    el<HTMLCanvasElement>('garage-canvas').addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      showStatus('El navegador cerró el contexto 3D. Recargá la pestaña para continuar.');
    });
  }
  return garage;
}

const NEWLINE = String.fromCharCode(10);

/**
 * Writes the model's render cost once it has actually been drawn.
 *
 * `renderer.info` is populated by rendering, so reading it straight after
 * `show()` returns zeros: the first frame has not run yet. Two frames is enough
 * and keeps the reading honest.
 */
function reportModelCost(view: GarageView, prefix = ''): void {
  let attempts = 0;
  const write = (): void => {
    const state = view.state;
    attempts += 1;
    // Poll rather than hang off requestAnimationFrame: a backgrounded or
    // non-compositing tab never runs a frame, and the note would stay blank.
    if (state.drawCalls === 0 && attempts < 12) {
      window.setTimeout(write, 120);
      return;
    }
    el('model-note').textContent =
      `${prefix}${state.drawCalls} draws · ${state.triangles.toLocaleString('es-UY')} triángulos`;
  };
  window.setTimeout(write, 120);
}

function renderValues(): void {
  const light = garage?.presentation() ?? DEFAULT_PRESENTATION;
  // Emitted in the shape of the real source, so applying a result is a paste
  // rather than a transcription.
  el('values-code').textContent = [
    '// src/game/PlayerShipHardpoints.ts',
    'export const ENGINE_OFFSET = {',
    `  x: ${ENGINE_OFFSET.x.toFixed(3)},`,
    `  y: ${ENGINE_OFFSET.y.toFixed(3)},`,
    `  z: ${ENGINE_OFFSET.z.toFixed(3)}`,
    '};',
    '',
    '// src/garage/GarageView.ts',
    `toneMappingExposure   ${light.exposure}`,
    `environmentIntensity  ${light.environmentIntensity}`,
    `key.intensity         ${light.keyIntensity}`,
    `rim.intensity         ${light.rimIntensity}`,
    `fill.intensity        ${light.fillIntensity}`,
    `key.shadow.radius     ${light.shadowSoftness}`
  ].join(NEWLINE);

  const inspected = garage?.inspect() as { rawBounds?: { size?: number[] } } | undefined;
  const size = inspected?.rawBounds?.size ?? [0, 0, 0];
  // Resolved metres beside the fractions: the fractions are what ship, but
  // metres are what can be compared against the model by eye.
  const rows: [string, string][] = [
    ['Casco', `${size[0]} × ${size[1]} × ${size[2]}`],
    ['Motor babor', `${(-size[0] * ENGINE_OFFSET.x).toFixed(2)}, ${(-size[1] * ENGINE_OFFSET.y).toFixed(2)}, ${(size[2] * ENGINE_OFFSET.z).toFixed(2)}`],
    ['Motor estribor', `${(size[0] * ENGINE_OFFSET.x).toFixed(2)}, ${(-size[1] * ENGINE_OFFSET.y).toFixed(2)}, ${(size[2] * ENGINE_OFFSET.z).toFixed(2)}`]
  ];
  el('resolved').innerHTML = rows
    .map(([label, value]) => `<div class="readout__row"><b>${label}</b><span>${value}</span></div>`)
    .join('');
}

/** Renders one slider group and wires it to a live setter. */
function renderSliders<K extends string>(
  hostId: string,
  controls: Slider<K>[],
  read: (key: K) => number,
  apply: (key: K, value: number) => number
): void {
  const host = el(hostId);
  host.innerHTML = controls.map((control) => `
    <div class="control">
      <div class="control__head">
        <span class="control__label">${control.label}</span>
        <span class="control__value" data-value="${control.key}">${read(control.key)}</span>
      </div>
      <input type="range" min="${control.min}" max="${control.max}" step="${control.step}"
        value="${read(control.key)}" data-input="${control.key}" aria-label="${control.label}" />
      <small class="control__hint">${control.hint}</small>
    </div>`).join('');

  host.querySelectorAll<HTMLInputElement>('input[data-input]').forEach((input) => {
    // `input`, not `change`: the point is watching the model react while the
    // slider is dragged, which is the only way to judge an alignment or a light.
    input.addEventListener('input', () => {
      const key = input.dataset.input as K;
      const applied = apply(key, Number(input.value));
      const readout = host.querySelector(`[data-value="${key}"]`);
      if (readout) readout.textContent = String(applied);
      renderValues();
    });
  });
}

function buildEngineControls(): void {
  renderSliders(
    'engine-controls',
    ENGINE_CONTROLS,
    (key) => Number(ENGINE_OFFSET[key].toFixed(3)),
    (key, value) => {
      garage?.applyEngineOffset({ [key]: value });
      return Number(value.toFixed(3));
    }
  );
}

function buildPresentationControls(): void {
  const current = garage?.presentation() ?? DEFAULT_PRESENTATION;
  renderSliders(
    'presentation-controls',
    PRESENTATION_CONTROLS,
    (key) => current[key] ?? DEFAULT_PRESENTATION[key],
    (key, value) => {
      const applied = garage?.setPresentation({ [key]: value });
      return applied?.[key] ?? value;
    }
  );
}

/**
 * Loads a dropped GLB.
 *
 * Read as an object URL, so the file never leaves the machine and the ship
 * catalog is untouched: this is authoring, not installing a ship.
 */
async function loadModelFile(file: File): Promise<void> {
  const note = el('model-note');
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    note.textContent = `"${file.name}" no es un .glb o .gltf.`;
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    showStatus(`Cargando ${file.name}…`);
    const view = ensureGarage();
    await view.loadExternalModel(url, file.name.replace(/\.(glb|gltf)$/i, ''));
    el('editor-loading').hidden = true;
    el('editor-ship').textContent = file.name;
    reportModelCost(view, `${(file.size / 1048576).toFixed(2)} MB · `);
    buildEngineControls();
    renderValues();
  } catch (error) {
    note.textContent = `No se pudo cargar: ${error instanceof Error ? error.message : String(error)}`;
    el('editor-loading').hidden = true;
  } finally {
    // The GPU holds the geometry now; keeping the blob only leaks memory.
    URL.revokeObjectURL(url);
  }
}

function wireControls(): void {
  const dropzone = el('dropzone');
  const fileInput = el<HTMLInputElement>('model-file');
  const stage = el('editor-stage-host');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadModelFile(file);
  });

  // Dropping onto the stage is the gesture people try first, so both accept it.
  for (const target of [dropzone, stage]) {
    const marker = target === dropzone ? 'is-over' : 'is-dropping';
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      target.classList.add(marker);
    });
    target.addEventListener('dragleave', () => target.classList.remove(marker));
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      target.classList.remove(marker);
      const file = (event as DragEvent).dataTransfer?.files?.[0];
      if (file) void loadModelFile(file);
    });
  }

  el('restore-ship').addEventListener('click', () => { void loadCatalogShip(); });

  el('toggle-gizmos').addEventListener('change', (event) => {
    garage?.setHardpointGizmos((event.target as HTMLInputElement).checked);
  });

  el('toggle-rotate').addEventListener('change', (event) => {
    garage?.setAutoRotate((event.target as HTMLInputElement).checked);
  });

  el('view-buttons').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-yaw]');
    if (!button) return;
    garage?.setView(Number(button.dataset.yaw), Number(button.dataset.pitch));
  });

  el('reset-engines').addEventListener('click', () => {
    garage?.applyEngineOffset({ ...DEFAULT_ENGINE_OFFSET });
    buildEngineControls();
    renderValues();
  });

  el('reset-presentation').addEventListener('click', () => {
    garage?.setPresentation({ ...DEFAULT_PRESENTATION });
    buildPresentationControls();
    renderValues();
  });

  el('copy-values').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('values-code').textContent ?? '');
      el('copy-note').textContent = 'Copiado.';
    } catch {
      // The clipboard needs a secure context and permission; saying so beats
      // failing silently.
      el('copy-note').textContent = 'El navegador bloqueó el portapapeles: copiá el bloque a mano.';
    }
  });
}

async function loadCatalogShip(): Promise<void> {
  const catalog = new ShipCatalog();
  const definition = catalog.get('epsilon-scout') ?? catalog.getStarter();
  el('editor-ship').textContent = definition.id;
  showStatus('Cargando modelo…');
  const view = ensureGarage();
  await view.show(definition);
  el('editor-loading').hidden = true;
  view.setHardpointGizmos(true);
  reportModelCost(view);
  buildEngineControls();
  buildPresentationControls();
  renderValues();
}

async function boot(): Promise<void> {
  // Controls are wired before the model loads, so the toggles and the drop zone
  // respond even while the ship is still arriving.
  wireControls();
  try {
    await loadCatalogShip();
  } catch (error) {
    // Reported in the stage with its stack: the failure this replaced showed a
    // Three.js internal with no hint of which step produced it.
    console.error('[editor] boot failed', error);
    const detail = error instanceof Error
      ? `${error.message} | ${(error.stack ?? '').split(NEWLINE)[1] ?? ''}`
      : String(error);
    showStatus(`No se pudo abrir la escena: ${detail}`);
  }
}

void boot();
