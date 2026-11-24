/**
 * The operator's service notices and the council's news of the streets, read by a server:
 * neither site sends a CORS header, so the browser cannot. Web standards only — this runs
 * under Node and in the worker.
 */
import { readCapped } from './readCapped';
import { asciiLower, plainText } from '../utils/html';
import { COUNCIL_NEWS_MS, noticeLink } from '../utils/operatorNotices';
import { NoticeSection, ServiceAlert } from '../types';
import { REPO_URL } from '../project';

export interface AlertSyncResult {
  alerts: ServiceAlert[];
  /** ISO instant of the sync; the view formats it for the reader's locale. */
  lastSyncTime: string;
  sourceUrl: string;
  /**
   * `unreachable` is not a synonym for "nothing wrong": the operator's page could not be
   * read, which must never be rounded down to "all normal".
   */
  status: 'operational_normal' | 'active_incidents' | 'unreachable';
  message: string;
  /** Present only on the snapshot the scheduled job commits, which a static deploy reads. */
  fetchedAt?: string;
}

const USER_AGENT = `UrbanosLugoBot/1.0 (+${REPO_URL}; unofficial timetable reader)`;
const OPERATOR_URL = 'https://buslugo.com';

let cachedAlerts: AlertSyncResult | null = null;
let lastFetchTimestamp = 0;
let inFlight: Promise<AlertSyncResult> | null = null;
export const CACHE_TTL_MS = 30 * 60 * 1000;
/** Minimum between outbound requests to buslugo.com, whatever anybody asks. */
export const MIN_OUTBOUND_INTERVAL_MS = 60 * 1000;

/** An answer is held for half an hour; a failure only for the outbound cooldown — a six-second hiccup is not a fact about the next thirty minutes. */
function cacheHolds(cached: AlertSyncResult, elapsed: number, forceRefresh: boolean): boolean {
  if (elapsed < MIN_OUTBOUND_INTERVAL_MS) return true;
  return !forceRefresh && cached.status !== 'unreachable' && elapsed < CACHE_TTL_MS;
}

/**
 * The council's whole list of news, its last ten with their headings and leads, in Spanish. Its tags were
 * read for a year, the traffic one alone by the end: of 473 items in the six months to November 2026, what a
 * rider could use went out under six tags, and traffic's headlines had one of them. A detour of nine
 * lines was under «Water». Chosen here by what they say.
 */
const CONCELLO_LIST_URL = 'https://concellodelugo.gal/es/actualidad';
/** A press release runs for pages; a card wants the first thought. */
const CONCELLO_EXCERPT = 220;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** A headline that closes or diverts a street: the event with the traffic or the street, as "tráfico" alone matched a road-safety course, and "corte" a water cut. */
const STREET = String.raw`(?:tr[áa]fico|circulaci[óo]n|calles?|r[úu]as?|avenida|avda|plaza|praza|ronda|puente|ponte)\b`;
const STREET_CLOSED = new RegExp(
  String.raw`\b(?:cortes?|cierres?|peches?|restricci[óo]n(?:es)?|restrici[óo]ns?)\b(?!\s+d[eo]\s+(?:agua|auga|luz|sumin|submin)).{0,30}\b${STREET}|\b${STREET}.{0,40}\b(?:cortad|cerrad|pechad)[oa]s?\b|(?:cortad|cerrad|pechad)[oa]s?\s+[^.]{0,20}${STREET}|\bdesv[íi]os?\b`,
  'i',
);
/** A sentence about the city's own buses, and that something of theirs changes. */
const CITY_BUS = /\b(?:autob[úu]s(?:es)?|bus(?:es)?|transporte)\s+urban[oa]s?\b/i;
const BUS_CHANGES = /desv[íi]|recorridos?\b|percorrido|provisional|suprim|refuer?z|reforz/i;

/** What an item says that a rider can use, or null: its own sentence on the buses, or, under a headline of the streets, its lead. */
function aboutGettingAround(title: string, lead: string): string | null {
  const sentences = `${title}. ${lead}`.split(/(?<=[.!?])\s+/);
  const at = sentences.findIndex((s) => CITY_BUS.test(s) && BUS_CHANGES.test(s));
  if (at > 0) return sentences.slice(at).join(' ');
  return at === 0 || STREET_CLOSED.test(title) ? lead : null;
}

/** Plain prose out of a field that may carry its markup encoded: decode, then strip. Rendered as text by React, never as HTML. */
function decodedText(raw: string): string {
  const decoded = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Last, so an escaped `&amp;lt;` does not become a tag on the way through.
    .replace(/&amp;/g, '&');
  return plainText(decoded);
}

/**
 * Each `<open ... </close>` block, walked with indexOf. A lazy `/<tag[\s\S]*?<\/tag>/`
 * restarts from every opening tag and scans to the end when the closing one never comes,
 * which is quadratic: 13.2 s for a megabyte of unclosed `<item>`s, and a truncated page is
 * enough to cause it. `lower` is the same string through asciiLower, whose indices are the
 * original's, so scanning twice does not lower-case twice.
 */
function* blocks(text: string, lower: string, open: string, close: string): Generator<string> {
  for (let from = 0; ; ) {
    const start = lower.indexOf(open, from);
    if (start === -1) return;
    const end = lower.indexOf(close, start);
    if (end === -1) return;
    yield text.slice(start, end + close.length);
    from = end + close.length;
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

/** What stands in a row after `from` and before `to`, or ''. With indexOf alone: nothing in a page that breaks off is walked twice. */
function after(row: string, from: string, to: string): string {
  const open = row.indexOf(from);
  if (open === -1) return '';
  const end = row.indexOf(to, open + from.length);
  return end === -1 ? '' : row.slice(open + from.length, end);
}

/** The items of the council's list that say something of the streets or the buses, of the last week. */
export function extractConcelloNotices(html: string): ServiceAlert[] {
  const notices: ServiceAlert[] = [];
  const ROW = '<div class="views-row';
  for (let at = html.indexOf(ROW); at !== -1; ) {
    const next = html.indexOf(ROW, at + ROW.length);
    const row = next === -1 ? html.slice(at) : html.slice(at, next);
    at = next;
    const heading = after(row, 'texto-titular"><a href="', '</a>');
    const title = decodedText(heading.slice(heading.indexOf('>') + 1));
    // The day, in words, and no hour: an old one, or one that is none, is dropped rather than shown.
    const day = /(\d{1,2}) de ([a-z]+) de (\d{4})/i.exec(after(row, 'date-display-single">', '<'));
    const published = day ? Date.UTC(Number(day[3]), MONTHS.indexOf(day[2].toLowerCase()), Number(day[1]), 12) : Number.NaN;
    if (!heading.includes('>') || !title || !day || !MONTHS.includes(day[2].toLowerCase()) || Date.now() - published > COUNCIL_NEWS_MS) continue;
    const lead = after(row, 'views-field-field-entradilla', 'views-field-term');
    const says = aboutGettingAround(title, decodedText(after(lead, 'field-content">', '</div>')));
    if (says === null) continue;
    const href = heading.slice(0, Math.max(0, heading.indexOf('"')));
    notices.push({
      id: `concello-${notices.length + 1}`,
      title: clip(title, 110),
      severity: 'info',
      linesAffected: ['Todas'],
      date: new Date(published).toISOString(),
      description: says.length > CONCELLO_EXCERPT ? `${says.slice(0, CONCELLO_EXCERPT - 1)}…` : says,
      active: true,
      source: 'concello',
      link: noticeLink(href.startsWith('/') ? new URL(href, CONCELLO_LIST_URL).href : href),
    });
  }
  return notices;
}

/**
 * Best effort: the operator's notices are the ones that matter, and nothing here may take
 * them down or hold them back. Read after them, the feed held them back for its whole
 * deadline when it would not connect: the worker took 16 s to answer on 6 October 2026,
 * close to the 15 s the feed was then allowed plus the operator's page, and on 5 October a
 * GitHub runner's read had timed out connecting. From a home connection it answers in under a second, so four
 * seconds is room enough. Every read leaves one line saying how it went, so whether a
 * server can reach the feed is something its log says rather than something inferred.
 */
async function fetchConcelloNotices(): Promise<ServiceAlert[]> {
  const started = Date.now();
  try {
    const res = await fetch(CONCELLO_LIST_URL, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notices = extractConcelloNotices(await readCapped(res)).sort((a, b) => b.date.localeCompare(a.date));
    console.log(`council feed read in ${Date.now() - started} ms, ${notices.length} notice(s) kept`);
    return notices;
  } catch (err) {
    const { cause, message } = err as Error & { cause?: { code?: string } };
    console.warn(`council feed not read after ${Date.now() - started} ms (${cause?.code ?? message})`);
    return [];
  }
}

/** Warnings rather than notes: something is being held up, cut or withdrawn. */
const SERIOUS = /retenc|corte|peche|suprim|desv[ií]o|cancel/i;

/**
 * "Liña 1.2", "L5", "L-4.1" — whatever the notice happens to call it, as a word of its own: the l of
 * "del 4 al 12 de octubre" put the lines 4 and 12 on a notice of none. After a plural, the list as the
 * operator writes it ("Cambios líneas 7, 8, 9 y 12 por obras"), when no number follows that could
 * be a day, an hour or one more line; otherwise every line, rather than some and not the reader's.
 */
const ONE_LINE = /(?:^|[^\p{L}\p{N}])(?:liña|l[ií]nea|L-?)\s*([0-9]+(?:\.[0-9]+)?(?:ES|DS)?)/giu;
const N = String.raw`[0-9]+(?:\.[0-9])?(?:ES|DS)?`;
const LINE_LIST = new RegExp(String.raw`(?:liñas|l[ií]neas)\s+(${N}(?:\s*,\s*${N})*,?\s+[ye]\s+${N})\D*$`, 'iu');

function linesNamedIn(text: string): string[] {
  const list = LINE_LIST.exec(text)?.[1].match(new RegExp(N, 'gi'));
  return [...new Set(list ?? [...text.matchAll(ONE_LINE)].map(([, line]) => line))];
}

const noticeFrom = (id: string, text: string, title: string): ServiceAlert => ({
  id,
  title,
  severity: SERIOUS.test(text) ? 'warning' : 'info',
  linesAffected: linesNamedIn(text).length > 0 ? linesNamedIn(text) : ['Todas'],
  // An ISO instant: one scrape serves every language.
  date: new Date().toISOString(),
  description: text,
  active: true,
});

/** The bell's own "nothing to report" item: read as one active incident on 19 September 2026, it put a badge on the navigation for a card saying there were no notices. */
const QUIET = /^no(n)?\s+(existen?|ha[iy])\s+avisos\b/i;

/**
 * What the `<ul class="... msg_list ...">` holds, walked tag by tag with indexOf. The
 * pattern it replaces, `/<ul[^>]*class="[^"]*msg_list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i`, ran
 * `[^>]*` to the end of the page from every `<ul` whose tag never closed: 50 s of a
 * stopped server for the 512 KB readCapped allows, against a page that merely broke off.
 */
function bellList(html: string, lower: string): string | null {
  for (let from = 0; ; ) {
    const open = lower.indexOf('<ul', from);
    if (open === -1) return null;
    const tagEnd = lower.indexOf('>', open);
    if (tagEnd === -1) return null;
    if (/class="[^"]*msg_list[^"]*"/.test(lower.slice(open, tagEnd))) {
      const close = lower.indexOf('</ul>', tagEnd);
      return close === -1 ? null : html.slice(tagEnd + 1, close);
    }
    from = tagEnd + 1;
  }
}

/**
 * The notices in buslugo.com's own navigation bar: a bell with a `msg_list` dropdown, one
 * list item per notice. Nothing in that markup says "alert" to a general scraper, which is
 * how the app once said "running normally" on a day their header read "Retenciones".
 */
function extractNavNotices(html: string, lower: string): ServiceAlert[] {
  const list = bellList(html, lower);
  if (list === null) return [];
  const notices: ServiceAlert[] = [];
  for (const item of blocks(list, asciiLower(list), '<li', '</li>')) {
    const text = plainText(item);
    // A bare "no notices" item, or an empty <li>, is not an incident.
    if (text.length < 6 || QUIET.test(text)) continue;
    notices.push({ ...noticeFrom(`nav-notice-${notices.length + 1}`, text, clip(text, 90)), link: operatorLink(item) });
  }
  return notices;
}

/** Where a bell item points, kept only when it is the operator's own site: a scraped href is otherwise somebody else's link in our page. */
function operatorLink(item: string): string | undefined {
  const at = item.indexOf('href="');
  if (at === -1) return undefined;
  const end = item.indexOf('"', at + 6);
  const href = end === -1 ? '' : item.slice(at + 6, end);
  return href === OPERATOR_URL || href.startsWith(`${OPERATOR_URL}/`) ? href : undefined;
}

/** A heading that belongs to lines: "Línea 1.2 : …", "Líneas 9 y 12: …", "Liña 5ES - …". */
const LINES_HEADING = /^l[ií](?:neas?|ñas?)\b/iu;
/** Bounds on one notice, whatever the page holds: San Froilán 2026 ran to six lines and the rest, none over five paragraphs. */
const MAX_SECTIONS = 40;
const MAX_PARAGRAPHS = 30;
const MAX_PARAGRAPH = 600;

/**
 * Text out of one heading or paragraph: its tags off with nothing in their place, then the
 * entities (`&#8211;`, `&nbsp;`) decoded. Only inline tags live in there, and the operator's
 * editor splits words across them: a space per tag printed "recorrido h abitual".
 */
const textOf = (fragment: string) => decodedText(plainText(fragment, ''));

/** The lines a heading names, read only up to its colon or dash: the route after it has street numbers in it. */
function linesOfHeading(heading: string): string[] {
  if (!LINES_HEADING.test(heading)) return [];
  return [...new Set(heading.split(/[:–—-]/)[0].match(/\b[0-9]+(?:\.[0-9]+)?(?:ES|DS)?\b/g) ?? [])];
}

/**
 * A notice the operator writes into the body of its home page, which its bell then links to:
 * an <h1>, the days in an <h3>, one <h2> per line ("Línea 1.2 : …") with its paragraphs, and
 * an <h2> for every other line. San Froilán 2026 came this way, and the bell alone carried
 * nothing but "Cambios en las líneas por San Froilán". Walked tag by tag with indexOf, and
 * nothing comes out unless a heading names a line, so the page's ordinary text never reads
 * as a notice. The walk ends at the page's own buttons, which follow every notice.
 */
export function noticeOnPage(html: string, lower = asciiLower(html)): { title: string; days: string; sections: NoticeSection[] } | null {
  let title = '';
  let days = '';
  let sections: NoticeSection[] = [];
  const footer = lower.indexOf('<footer');
  const end = footer === -1 ? lower.length : footer;
  for (let at = lower.indexOf('<h1'); at !== -1 && sections.length <= MAX_SECTIONS; ) {
    const open = lower.indexOf('<', at);
    if (open === -1 || open >= end) break;
    const name = (['h1', 'h2', 'h3', 'p'] as const).find((tag) => lower.startsWith(tag, open + 1) && /[\s>/]/.test(lower[open + 1 + tag.length] ?? ''));
    if (!name) {
      at = open + 1;
      continue;
    }
    const tagEnd = lower.indexOf('>', open);
    const close = tagEnd === -1 ? -1 : lower.indexOf(`</${name}>`, tagEnd);
    if (close === -1) break;
    const inner = html.slice(tagEnd + 1, close);
    at = close + name.length + 3;
    if (name === 'p' && lower.slice(tagEnd, close).includes('<button')) break;
    if (name === 'h1') {
      // A second notice, or a title before the real one: what came before it named no line.
      if (sections.some((s) => s.lines.length > 0)) break;
      [title, days, sections] = [textOf(inner), '', []];
    } else if (name === 'h3') {
      if (!days && !sections.length) days = textOf(inner);
    } else if (name === 'h2') {
      const heading = textOf(inner);
      if (heading) sections.push({ heading: clip(heading, 160), lines: linesOfHeading(heading), paragraphs: [] });
    } else {
      // Before the first heading a paragraph is the notice's spacing, and nothing reads it.
      const section = sections[sections.length - 1];
      for (const part of section ? inner.split(/<br\s*\/?>/i) : []) {
        const text = textOf(part);
        if (text && section.paragraphs.length < MAX_PARAGRAPHS) section.paragraphs.push(clip(text, MAX_PARAGRAPH));
      }
    }
  }
  const kept = sections.filter((s) => s.paragraphs.length > 0);
  return kept.some((s) => s.lines.length > 0) ? { title, days, sections: kept } : null;
}

/**
 * The first heading's text in an article, its two tags found one after the other: the pattern
 * this replaces, `/<h[234][^>]*>(.*?)<\/h[234]>/i`, read to the end from every heading that
 * never closed, 17.6 s for the 512 KB readCapped allows.
 */
function headingIn(block: string): string {
  const lower = asciiLower(block);
  const open = lower.search(/<h[234][\s>]/);
  const start = open === -1 ? -1 : lower.indexOf('>', open) + 1;
  const length = start > 0 ? lower.slice(start).search(/<\/h[234]>/) : -1;
  return length === -1 ? '' : plainText(block.slice(start, start + length), '');
}

/** Every notice on the operator's page: the navigation bell, plus any article that reads like one. */
export function extractAlertsFromHtml(html: string): ServiceAlert[] {
  const lower = asciiLower(html);
  const alerts = extractNavNotices(html, lower);
  // The bell item is the headline and the page it links to the detail, when that page is the home page this is.
  const notice = noticeOnPage(html, lower);
  if (notice) {
    const severity = SERIOUS.test(notice.sections.map((s) => s.paragraphs.join(' ')).join(' ')) ? 'warning' : 'info';
    const headline = alerts.find((a) => a.link === OPERATOR_URL || a.link === `${OPERATOR_URL}/`);
    // Its days, or else its own title, which the bell shortens: «Cambios líneas 7, 8, 9 y 12 por obras» left out since when, and for how long.
    if (headline) Object.assign(headline, { description: notice.days || notice.title || headline.description, sections: notice.sections, severity });
    else alerts.push({ ...noticeFrom('page-notice-1', notice.title, clip(notice.title || notice.days, 90)), description: notice.days || notice.title, sections: notice.sections, severity, link: `${OPERATOR_URL}/` });
  }
  [...blocks(html, lower, '<article', '</article>')].forEach((block, i) => {
    const cleanText = plainText(block);
    if (!/desv[ií]o|corte|obras|reforzo|aviso|modificaci[oó]n|parada/i.test(cleanText) || cleanText.length <= 20) return;
    const title = headingIn(block) || 'Aviso de servizo en Lugo';
    alerts.push({ ...noticeFrom(`article-alert-${i + 1}`, cleanText, title), description: clip(cleanText, 250) });
  });
  return alerts;
}

/**
 * Both sources, with one outbound request shared between everyone waiting for it. `council`
 * is false where the feed never connects; one runtime always asks the same way.
 */
export async function syncOfficialAlerts(forceRefresh = false, now = Date.now(), council = true): Promise<AlertSyncResult> {
  if (inFlight) return inFlight;
  if (cachedAlerts && cacheHolds(cachedAlerts, now - lastFetchTimestamp, forceRefresh)) return cachedAlerts;
  inFlight = fetchAlerts(now, council);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function fetchAlerts(now: number, council: boolean): Promise<AlertSyncResult> {
  let result: AlertSyncResult | null = null;
  try {
    const response = await fetch(`${OPERATOR_URL}/`, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      // Every host read here is fixed: a redirect elsewhere is a failed read, not a new destination.
      // 'manual', so the 3xx itself is that failure (not ok), here and for the council's feed:
      // Cloudflare's runtime throws on 'error' before asking anyone, and the worker read
      // every notice as unreachable.
      redirect: 'manual',
    });
    if (response.ok) {
      const operatorAlerts = extractAlertsFromHtml(await readCapped(response)).map((a) => ({ ...a, source: 'operator' as const }));
      // The city's feed second, and only ever after the operator's: a failure there changes none of this.
      const cityNotices = council ? await fetchConcelloNotices() : [];
      // The state of the network is the operator's to declare; a council press release is not an incident.
      result = {
        alerts: [...operatorAlerts, ...cityNotices],
        lastSyncTime: new Date().toISOString(),
        sourceUrl: OPERATOR_URL,
        status: operatorAlerts.length > 0 ? 'active_incidents' : 'operational_normal',
        message: operatorAlerts.length > 0 ? `${operatorAlerts.length} aviso(s) oficial(is) activo(s) detectado(s) en buslugo.com` : 'Rede de transporte operando con total normalidade en todas as liñas e paradas.',
      };
    }
  } catch {
    // Network or timeout: say we know nothing, below.
  }
  cachedAlerts = result ?? {
    alerts: [],
    lastSyncTime: new Date().toISOString(),
    sourceUrl: OPERATOR_URL,
    status: 'unreachable',
    message: 'Non se puido ler a páxina do operador, así que non sabemos se hai avisos.',
  };
  lastFetchTimestamp = now;
  return cachedAlerts;
}
