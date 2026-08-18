import './admin.css';
import { createSupabaseAuthGateway } from '../auth/SupabaseAuthGateway';
import {
  NotAnAdminError,
  OwnerDataService,
  type OwnerDailyPoint,
  type OwnerOverview,
  type OwnerPlayerRow,
  type OwnerProgressionRow
} from './OwnerDataService';

/**
 * Owner console entry point.
 *
 * A separate Vite page rather than a panel inside the game: it has nothing to
 * do with play, must never ship inside the game bundle, and wants a document
 * layout the HUD cannot give it. It reuses the game's Supabase client factory
 * so there is exactly one place where the publishable key is read.
 */

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
};

const gate = el('gate');
const gateMessage = el('gate-message');
const gateForm = el<HTMLFormElement>('gate-form');
const gateHint = el('gate-hint');
const consoleRoot = el('console');
const consoleError = el('console-error');
const consoleWho = el('console-who');

const dateFmt = new Intl.DateTimeFormat('es-UY', { dateStyle: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' });
const numberFmt = new Intl.NumberFormat('es-UY');

function formatDate(value: string | null, withTime = false): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return (withTime ? dateTimeFmt : dateFmt).format(parsed);
}

/** Minutes into something a person reads at a glance. */
function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function showGate(message: string, options: { form?: boolean; hint?: string } = {}): void {
  gate.hidden = false;
  consoleRoot.hidden = true;
  gateMessage.textContent = message;
  gateForm.hidden = options.form !== true;
  gateHint.hidden = !options.hint;
  if (options.hint) gateHint.textContent = options.hint;
}

function reportError(error: unknown): void {
  consoleError.hidden = false;
  consoleError.textContent = error instanceof Error ? error.message : String(error);
}

// --- Rendering --------------------------------------------------------------

function renderKpis(overview: OwnerOverview): void {
  const cards: { label: string; value: string; note?: string; accent?: boolean }[] = [
    { label: 'Jugadores', value: numberFmt.format(overview.players),
      note: `${numberFmt.format(overview.verifiedPlayers)} verificados`, accent: true },
    { label: 'Altas hoy', value: numberFmt.format(overview.newToday),
      note: `${numberFmt.format(overview.new7d)} en 7 d · ${numberFmt.format(overview.new30d)} en 30 d` },
    { label: 'Activos hoy', value: numberFmt.format(overview.activeToday),
      note: `${numberFmt.format(overview.active7d)} en 7 d`, accent: true },
    { label: 'Sesiones 7 d', value: numberFmt.format(overview.sessions7d) },
    { label: 'Sesión mediana', value: formatMinutes(overview.medianSessionMinutes),
      note: 'últimos 30 días' },
    { label: 'Horas jugadas', value: numberFmt.format(overview.totalPlayHours),
      note: 'acumulado histórico' },
    { label: 'Con partida', value: numberFmt.format(overview.savedPlayers),
      note: 'guardaron al menos una vez' }
  ];
  el('kpis').innerHTML = cards.map((card) => `
    <article class="kpi${card.accent ? ' kpi--accent' : ''}">
      <p class="kpi__label">${card.label}</p>
      <p class="kpi__value">${card.value}</p>
      ${card.note ? `<p class="kpi__note">${card.note}</p>` : ''}
    </article>`).join('');
}

/**
 * Grouped bar chart, drawn as inline SVG.
 *
 * A charting library would be the single largest dependency in the project for
 * one screen, so the three series are laid out by hand. Everything is a plain
 * rect: no animation, no interaction, no layout thrash.
 */
function renderChart(points: OwnerDailyPoint[]): void {
  const host = el('chart');
  if (points.length === 0) {
    host.innerHTML = '<p class="empty">Sin datos en este rango.</p>';
    return;
  }
  const width = Math.max(points.length * 22, 640);
  const height = 220;
  const padLeft = 34;
  const padBottom = 26;
  const padTop = 10;
  const peak = Math.max(1, ...points.flatMap((p) => [p.signups, p.activePlayers, p.sessions]));
  const plotHeight = height - padBottom - padTop;
  const slot = (width - padLeft) / points.length;
  const barWidth = Math.max(2, (slot - 4) / 3);

  const bar = (index: number, series: number, value: number, colour: string): string => {
    const h = (value / peak) * plotHeight;
    const x = padLeft + index * slot + 2 + series * barWidth;
    return `<rect x="${x.toFixed(1)}" y="${(padTop + plotHeight - h).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(h, value > 0 ? 1 : 0).toFixed(1)}" fill="${colour}"><title>${points[index].day}: ${value}</title></rect>`;
  };

  // Four gridlines is enough to read magnitude without becoming a table.
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const y = padTop + plotHeight - fraction * plotHeight;
    const label = Math.round(peak * fraction);
    return `<line x1="${padLeft}" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(148,186,205,0.14)" />
      <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#74909c">${label}</text>`;
  }).join('');

  // Only a handful of date labels, or they collide at 90 days.
  const labelEvery = Math.ceil(points.length / 8);
  const labels = points.map((point, index) => {
    if (index % labelEvery !== 0) return '';
    const x = padLeft + index * slot + slot / 2;
    const day = point.day.slice(5);
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#74909c">${day}</text>`;
  }).join('');

  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="Registros, jugadores activos y sesiones por día">
      ${gridlines}
      ${points.map((point, index) => [
        bar(index, 0, point.signups, '#7de8b8'),
        bar(index, 1, point.activePlayers, '#8fc8e8'),
        bar(index, 2, point.sessions, '#ffc37a')
      ].join('')).join('')}
      ${labels}
    </svg>`;

  const totals = points.reduce(
    (acc, point) => ({
      signups: acc.signups + point.signups,
      sessions: acc.sessions + point.sessions
    }),
    { signups: 0, sessions: 0 }
  );
  el('chart-note').textContent =
    `${numberFmt.format(totals.signups)} altas y ${numberFmt.format(totals.sessions)} sesiones en el rango`;
}

function renderProgression(rows: OwnerProgressionRow[]): void {
  const host = el('progression');
  if (rows.length === 0) {
    host.innerHTML = '<p class="empty">Todavía no hay progreso registrado.</p>';
    return;
  }
  const peak = Math.max(...rows.map((row) => row.players), 1);
  host.innerHTML = rows.map((row) => `
    <div class="progression__row">
      <span class="progression__name" title="${row.missionStep}">${row.missionStep}</span>
      <span class="progression__bar"><i style="width:${((row.players / peak) * 100).toFixed(1)}%"></i></span>
      <span class="progression__count">${numberFmt.format(row.players)}</span>
    </div>`).join('');
}

function renderPlayers(rows: OwnerPlayerRow[]): void {
  const body = el('players-body');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="7"><p class="empty">Sin jugadores para este filtro.</p></td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.displayName}${row.emailConfirmed ? '' : '<span class="tag tag--unverified">sin verificar</span>'}</td>
      <td>${row.email}<span class="tag">${row.provider}</span></td>
      <td>${formatDate(row.createdAt)}</td>
      <td>${formatDate(row.lastSeenAt, true)}</td>
      <td class="is-num">${numberFmt.format(row.sessions)}</td>
      <td class="is-num">${formatMinutes(row.playMinutes)}</td>
      <td>${row.missionStep ?? '—'}</td>
    </tr>`).join('');
}

// --- Wiring -----------------------------------------------------------------

const PAGE_SIZE = 25;

async function boot(): Promise<void> {
  const authGateway = createSupabaseAuthGateway();
  if (!authGateway) {
    showGate('Supabase no está configurado en este despliegue.', {
      hint: 'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.'
    });
    return;
  }

  // Bound after the guard: `resolveAccess` and friends are hoisted function
  // declarations, so TypeScript will not carry the narrowing into them.
  const auth = authGateway;
  const owner = new OwnerDataService(auth.client);
  let search = '';
  let page = 0;

  async function loadAll(): Promise<void> {
    consoleError.hidden = true;
    const days = Number(el<HTMLSelectElement>('range-select').value) || 30;
    try {
      const [overview, series, progression, players] = await Promise.all([
        owner.overview(),
        owner.dailySeries(days),
        owner.progression(),
        owner.players(search, PAGE_SIZE, page * PAGE_SIZE)
      ]);
      renderKpis(overview);
      renderChart(series);
      renderProgression(progression);
      renderPlayers(players.rows);
      const pages = Math.max(1, Math.ceil(players.total / PAGE_SIZE));
      el('page-label').textContent = `Página ${page + 1} de ${pages} · ${numberFmt.format(players.total)} jugadores`;
      el<HTMLButtonElement>('prev-page').disabled = page === 0;
      el<HTMLButtonElement>('next-page').disabled = page + 1 >= pages;
    } catch (error) {
      if (error instanceof NotAnAdminError) { void resolveAccess(); return; }
      reportError(error);
    }
  }

  /** Decides between the sign-in form, the not-an-admin notice and the console. */
  async function resolveAccess(): Promise<void> {
    const session = await auth.getSession();
    if (!session) {
      showGate('Ingresá con tu cuenta de owner para ver las estadísticas.', { form: true });
      return;
    }
    if (!(await owner.isAdmin())) {
      showGate(`Sesión activa como ${session.email}, pero esta cuenta no es owner.`, {
        hint: 'Otorgá acceso desde el editor SQL de Supabase: insert into public.app_admins (user_id, role) select id, \'owner\' from auth.users where email = \'tu-email\';'
      });
      return;
    }
    gate.hidden = true;
    consoleRoot.hidden = false;
    consoleWho.textContent = session.email;
    await loadAll();
  }

  gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = el<HTMLButtonElement>('gate-submit');
    submit.disabled = true;
    gateHint.hidden = true;
    try {
      await auth.signIn(
        el<HTMLInputElement>('gate-email').value.trim(),
        el<HTMLInputElement>('gate-password').value
      );
      await resolveAccess();
    } catch (error) {
      gateHint.hidden = false;
      gateHint.textContent = error instanceof Error ? error.message : 'No se pudo ingresar.';
    } finally {
      submit.disabled = false;
    }
  });

  el('refresh-button').addEventListener('click', () => { void loadAll(); });
  el('range-select').addEventListener('change', () => { void loadAll(); });
  el('signout-button').addEventListener('click', async () => {
    await auth.signOut();
    page = 0;
    await resolveAccess();
  });

  el('prev-page').addEventListener('click', () => { page = Math.max(0, page - 1); void loadAll(); });
  el('next-page').addEventListener('click', () => { page += 1; void loadAll(); });

  // Debounced so typing does not fire a query per keystroke.
  let searchTimer: number | undefined;
  el('player-search').addEventListener('input', (event) => {
    window.clearTimeout(searchTimer);
    const value = (event.target as HTMLInputElement).value;
    searchTimer = window.setTimeout(() => {
      search = value.trim();
      page = 0;
      void loadAll();
    }, 300);
  });

  await resolveAccess();
}

void boot();
