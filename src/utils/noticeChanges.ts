import type { BusStop, ServiceAlert } from '../types';
import { BUS_LINES, BUS_STOPS, lineById } from '../data/transitData';
import { buildRuns, callsAt, dayKind, isoDay, lineRunsOn } from './schedule';

/**
 * What an operator notice changes, read out of its words so the app can use it and not
 * only show it. San Froilán 2026 came as prose: lines running to 03:07, one stop closed for
 * two lines and one moved for another, on seven named days. Every time here comes from
 * that text and is shown as the notice's, never as a departure: the operator published no
 * departures for the extra hours, and nothing here invents one. What cannot be read
 * reliably (a route that skips a hospital) stays prose, in the notice itself.
 */

/** One line's changes while the notice holds. */
export interface LineChange {
  /** As the operator prints it: "1.2". */
  line: string;
  /** "Prolongación del recorrido hasta las 03:07 (Sindicatos)": its service runs until then. */
  until?: { time: string; to?: string };
  /** "Los días 5 y 12 de octubre el final del servicio tendrá lugar a la 1:00": those days, it ends then. */
  endsEarly?: { days: string[]; time: string };
  /** Stops it does not call at, matched to the dataset, and where it calls instead, as written. */
  closed: { stopId: string; instead?: string }[];
  /** Stops it calls at somewhere else, as written. */
  moved: { stopId: string; to: string }[];
}

export interface NoticeChanges {
  /** The days the notice is for, `YYYY-MM-DD`; empty when it names none. */
  days: string[];
  lines: LineChange[];
  /** The part for every other line ("Resto de líneas"): traffic cuts and provisional stops, as written. */
  general: string[];
}

/** Lowercase, no accents, so «Bretaña» and «Bretana», «Femenino» and «Feminino» can meet. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const MONTHS: Record<string, number> = {
  enero: 1, xaneiro: 1, febrero: 2, febreiro: 2, marzo: 3, abril: 4, mayo: 5, maio: 5, junio: 6, xuno: 6, julio: 7, xullo: 7,
  agosto: 8, septiembre: 9, setiembre: 9, setembro: 9, octubre: 10, outubro: 10, noviembre: 11, novembro: 11, diciembre: 12, decembro: 12,
};

/** "los días 3, 4, 5, 9, 10, 11 y 12 de octubre", "os días 3, 4 e 5 de outubro", and a list that goes on: "los días 31 de diciembre y 1 de enero". */
const DAYS = /\b(?:los|os)\s+dias\s+/g;
// Each space has one place to go, or a long list that names no month takes a second and doubles with each day more.
const OF_A_MONTH = /((?:\d{1,2}(?:\s*,\s*(?:[ye]\s+)?|\s+[ye]\s+))*\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+\d{4})?/y;
const AND_OF_ANOTHER = /\s*(?:,\s*(?:[ye]\s+)?|[ye]\s+)(?:(?:los|os)\s+dias\s+)?/y;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The days a text is for: the first list of them it gives, whatever months it runs to, each day in
 * the year nearest `near` (one in January read in December is next year's, and the other way
 * round). Read as far as the first month, "los días 31 de diciembre y 1 de enero" was over, and
 * off every screen, at noon on the second of its two days. None when it names none.
 */
function daysIn(text: string, near: Date): string[] {
  const said = fold(text);
  for (const { index, 0: opening } of said.matchAll(DAYS)) {
    const days: string[] = [];
    AND_OF_ANOTHER.lastIndex = index + opening.length;
    do {
      OF_A_MONTH.lastIndex = AND_OF_ANOTHER.lastIndex;
      const named = OF_A_MONTH.exec(said);
      const month = named && MONTHS[named[2]];
      if (!named || !month) break;
      const gap = month - (near.getMonth() + 1);
      const year = near.getFullYear() + (gap > 6 ? -1 : gap < -6 ? 1 : 0);
      for (const day of named[1].match(/\d+/g)!.map(Number)) if (day >= 1 && day <= 31) days.push(`${year}-${pad(month)}-${pad(day)}`);
      AND_OF_ANOTHER.lastIndex = OF_A_MONTH.lastIndex;
    } while (AND_OF_ANOTHER.test(said));
    if (days.length) return days;
  }
  return [];
}

const UNTIL = /\b(?:hasta|ata)\s+(?:las|as)\s+(\d{1,2}:\d{2})(?:\s*\(([^)]+)\))?/i;
const ENDS = /(?:final del servicio|final do servizo)[^.]*?\b(?:a la|a las|á|ás)\s+(\d{1,2}:\d{2})/i;
const CLOSED = /\b(?:se suprime la parada de|suprímese a parada de)\s+([^.;]+?)(?:\s+(?:y se habilitará una en|e habilitarase unha en)\s+([^.;]+))?\s*(?:[.;]|$)/i;
const MOVED = /\bmodificaci[óo]n de la parada\s+(.+?)\s+pasará a ubicarse provisionalmente en\s+([^.;]+)/i;
/** «(quedan suprimidas las paradas de Rda. Muralla, Obras públicas y R/Montevideo)», the works of November 2026: a list, in brackets. */
const CLOSED_LIST = /\bquedan?\s+suprimidas?\s+(?:las?|as?)\s+paradas?\s+de\s+([^.;)]+)/i;
const LIST_SEP = /\s*,\s*|\s+(?:y|e)\s+/;
/** «(queda suprimido el tramo Bolaño Rivadeneira – Ronda Muralla)», the same works on the 7, the 8 and the 9: a stretch, by its two ends. */
const STRETCH = /\bqueda\s+suprimido\s+(?:el|o)\s+tramo\s+(?:de\s+)?(.+?)\s+[–—-]\s+([^.;)]+)/i;

/**
 * The period of a street abbreviation is not the end of a sentence: «esquina Avda. Ramón
 * Ferreiro» was cut at «Avda». Swapped for a one-dot leader of the same length while the
 * patterns run, and put back in what they capture, so the words shown are the operator's.
 */
const LEADER = '․';
const mask = (text: string) => text.replace(/\b(Avda|Avd|Av|Rda|Pza|Sta|Sto|Dr|Ctra|Estda|Esq|Sr|Sra)\./gi, `$1${LEADER}`);
const unmask = (text: string | undefined) => text?.replaceAll(LEADER, '.').trim();

/** Words that carry a stop's name, without the street kinds that are written one way here and another there. */
const SKIP = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'la', 'el', 'a', 'o', 'os', 'as', 'los', 'las', 'y', 'e', 'en', 'avda', 'av', 'avenida', 'rua', 'r', 'praza', 'plaza', 'pza', 'rda', 'ronda', 'esq', 'esquina']);
const words = (name: string): string[] =>
  fold(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !SKIP.has(w));

function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const sameWord = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && oneEditApart(a, b));

/**
 * The stop a notice names, among the ones the line serves: the best match of its words,
 * only when it is clear and unique. «Praza de Bretaña» is «Praza Bretaña»; «Avda. Ramón
 * Ferreiro (Femenino)» is «Ramón Ferreiro (Feminino)» and not «(Anexa)». No match is no
 * change: the notice still says it in words.
 */
export function matchStop(name: string, candidates: BusStop[]): string | undefined {
  const want = words(name);
  if (!want.length) return undefined;
  let best: { id: string; score: number } | undefined;
  let tied = false;
  for (const stop of candidates) {
    const have = words(stop.name);
    const score = want.filter((w) => have.some((h) => sameWord(w, h))).length / Math.max(want.length, have.length);
    if (!best || score > best.score) {
      best = { id: stop.id, score };
      tied = false;
    } else if (score === best.score) tied = true;
  }
  if (best && best.score >= 0.75 && !tied) return best.id;
  // A short name for a long one: every word the notice gives is in one stop of the line and in
  // no other. «Obras públicas» is «Rda. Muralla (Obras Públicas)» (2 of its 3 words, under the
  // bar above) and «R/Montevideo» «Rúa Montevideo 7 (Sanatorio NSOG)»; «Rda. Muralla», in
  // three of the 12's stops, is none of them.
  const covering = candidates.filter((stop) => {
    const have = words(stop.name);
    return want.every((w) => have.some((h) => sameWord(w, h)));
  });
  return covering.length === 1 ? covering[0].id : undefined;
}

const stopsOfLine = (number: string): BusStop[] => {
  const ids = new Set(BUS_LINES.filter((l) => l.number === number || l.id === number).map((l) => l.id));
  return BUS_STOPS.filter((s) => s.lines.some((id) => ids.has(id)));
};

/**
 * The stops a dropped stretch takes off a line: the stop at its first end, and every one after
 * it on the way to the first stop of the other end, where the route goes on. The other end only
 * needs every word it gives, because it is a road: «Ronda Muralla» is several of the 7's stops,
 * and the first one along the route is where the stretch stops. With no such stop after the
 * first end, as on the 9, which leaves by Avda. Coruña, only the first end is closed.
 * Bolaño Ribadeneira 1, where the 7, the 8 and the 9 start, kept their departures through the
 * works of November 2026: a stretch was read as nothing.
 */
function stretchStops(line: string, from: string, to: string, candidates: BusStop[]): string[] {
  const start = matchStop(from, candidates);
  const want = words(to);
  if (!start || !want.length) return [];
  const names = new Map(candidates.map((s) => [s.id, words(s.name)]));
  const reaches = (id: string) => want.every((w) => (names.get(id) ?? []).some((h) => sameWord(w, h)));
  const closed = new Set<string>();
  for (const direction of BUS_LINES.filter((l) => l.number === line || l.id === line).flatMap((l) => l.directions)) {
    const at = direction.stops.indexOf(start);
    if (at < 0) continue;
    const resume = direction.stops.findIndex((id, i) => i > at && reaches(id));
    for (const id of direction.stops.slice(at, resume < 0 ? at + 1 : resume)) closed.add(id);
  }
  return [...closed];
}

/** Everything the operator's sectioned notices change, read at `near`, or null when none says anything this can use. */
export function readNoticeChanges(alerts: ServiceAlert[], near: Date): NoticeChanges | null {
  const notices = alerts.filter((a) => a.source !== 'concello' && (a.sections?.length ?? 0) > 0);
  if (!notices.length) return null;
  const days = [...new Set(notices.flatMap((n) => daysIn(`${n.description} ${n.title}`, near)))];
  const lines: LineChange[] = [];
  const general: string[] = [];
  for (const section of notices.flatMap((n) => n.sections ?? [])) {
    if (!section.lines.length) {
      general.push(...section.paragraphs);
      continue;
    }
    for (const line of section.lines) {
      const change: LineChange = { line, closed: [], moved: [] };
      const candidates = stopsOfLine(line);
      for (const paragraph of section.paragraphs.map(mask)) {
        const until = UNTIL.exec(paragraph);
        if (until && !ENDS.test(paragraph)) change.until = { time: until[1].padStart(5, '0'), to: unmask(until[2]) };
        const ends = ENDS.exec(paragraph);
        if (ends) change.endsEarly = { days: daysIn(paragraph, near), time: ends[1].padStart(5, '0') };
        const closed = CLOSED.exec(paragraph);
        const closedId = closed && matchStop(unmask(closed[1])!, candidates);
        if (closedId) change.closed.push({ stopId: closedId, instead: unmask(closed[2]) });
        const listed = CLOSED_LIST.exec(paragraph);
        for (const name of listed ? listed[1].split(LIST_SEP) : []) {
          const id = matchStop(unmask(name)!, candidates);
          if (id && !change.closed.some((c) => c.stopId === id)) change.closed.push({ stopId: id });
        }
        const stretch = STRETCH.exec(paragraph);
        for (const id of stretch ? stretchStops(line, unmask(stretch[1])!, unmask(stretch[2])!, candidates) : []) {
          if (!change.closed.some((c) => c.stopId === id)) change.closed.push({ stopId: id });
        }
        const moved = MOVED.exec(paragraph);
        const movedId = moved && matchStop(unmask(moved[1])!, candidates);
        if (movedId) change.moved.push({ stopId: movedId, to: unmask(moved[2])! });
      }
      if (change.until || change.endsEarly || change.closed.length || change.moved.length) lines.push(change);
    }
  }
  if (!lines.length && !general.length) return null;
  // In number order, as every list of lines here is: the notice put the 10 after the 12.
  lines.sort((a, b) => a.line.localeCompare(b.line, 'es', { numeric: true }));
  return { days, lines, general };
}

/** The service night a moment belongs to: before five in the morning it is still the night before. */
export function serviceDay(now: Date): string {
  const day = new Date(now);
  if (day.getHours() < 5) day.setDate(day.getDate() - 1);
  return isoDay(day);
}

/** "desde el día 19/10/26 se verán afectadas … (previsión 2 semanas)": from when, and for how long the operator expected it. */
const FORECAST = /\bdesde\s+(?:el|o)\s+dia\s+(\d{1,2})\/(\d{1,2})\/(?:20)?(\d{2})\b.{0,300}?\bprevision\s+(?:de\s+)?(\d{1,2})\s+(dia|semana)/;

/** When a notice was to be over, by its own words; null when it does not say. */
export function forecastEnd(alert: ServiceAlert, times = 1): Date | null {
  const said = FORECAST.exec(fold(alert.description));
  if (!said) return null;
  const [day, month, year, length] = said.slice(1, 5).map(Number);
  return new Date(2000 + year, month - 1, day + times * length * (said[5] === 'semana' ? 7 : 1));
}

/**
 * Whether a notice has been up for twice what it was to last. The works of 19 October 2026 were to
 * take two weeks; five later the notice was still on the operator's page, and the 7, the 8 and the
 * 9 still struck out of their first stop. Works run late, and so it goes on applying as long
 * again; from there it is told in Avisos, with its forecast, and changes nothing else.
 */
export function outlivedForecast(alert: ServiceAlert, now: Date): boolean {
  const end = forecastEnd(alert, 2);
  return end !== null && now >= end;
}

/**
 * Whether a notice's own days are all behind: one for «los días 3, 4, 5, 9, 10, 11 y 12 de
 * octubre» says nothing of the 13th, however long the operator's page keeps it. A notice
 * that names no day never ends by this.
 */
export function noticeOver(alert: ServiceAlert, now: Date): boolean {
  const days = daysIn(`${alert.description} ${alert.title}`, now);
  const today = serviceDay(now);
  return days.length > 0 && days.every((day) => day < today);
}

/** The changes that hold at this moment, or null on a day the notice does not name. */
export function changesNow(changes: NoticeChanges | null, now: Date): NoticeChanges | null {
  if (!changes) return null;
  return changes.days.length && !changes.days.includes(serviceDay(now)) ? null : changes;
}

/** Minutes into the service night, so 23:50 and 01:10 compare the way the night runs. */
const nightMinutes = (hours: number, minutes: number) => (hours < 5 ? hours + 24 : hours) * 60 + minutes;
const nightOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return nightMinutes(h, m);
};
const minutesOf = (now: Date) => nightMinutes(now.getHours(), now.getMinutes());

/**
 * Until when a line runs tonight by the notice, with where to when it says so; undefined if
 * it does not say, or once that time has gone: at 04:00 "until 03:15" is last night's news.
 * The place goes with the time it was written beside: «hasta las 03:00 (Cementerio)» says
 * nothing of where the 01:00 end of the 5th and the 12th is.
 */
export function runsUntil(change: LineChange, now: Date): { time: string; to?: string } | undefined {
  const end = change.endsEarly?.days.includes(serviceDay(now)) ? { time: change.endsEarly.time } : change.until;
  return end && minutesOf(now) <= nightOf(end.time) ? end : undefined;
}

/** Noon: the festival night is the evening and the small hours. At 05:30, before the first bus, the last one is over. */
const NIGHT_FROM = 12 * 60;

/** Whether a line is running past its timetable at this moment, by the notice's own end time. */
export function runsAt(change: LineChange, now: Date): boolean {
  return minutesOf(now) >= NIGHT_FROM && runsUntil(change, now) !== undefined;
}

/**
 * Whether a line's extra hours have begun at this stop: its last printed call of the night is
 * behind and the notice still has it running. From then on the timetable has nothing to show
 * for it, only the notice's end time, and the screen says whose word that is unasked.
 */
export function pastTimetable(change: LineChange, stopId: string, now: Date): boolean {
  if (!runsAt(change, now)) return false;
  const night = new Date(now);
  if (night.getHours() < 5) night.setDate(night.getDate() - 1);
  const kind = dayKind(night);
  let boardable = false;
  let last = -1;
  for (const line of BUS_LINES.filter((l) => l.number === change.line || l.id === change.line)) {
    line.directions.forEach((direction, d) => {
      // Where a run ends is not a call anybody can board, as on the board itself.
      const at = direction.stops.indexOf(stopId);
      if (at < 0 || at === direction.stops.length - 1) return;
      boardable = true;
      if (lineRunsOn(line, kind)) for (const run of buildRuns(line, d, BUS_STOPS, kind)) last = Math.max(last, ...callsAt(direction, stopId, run).map((call) => call.minutes));
    });
  }
  // A line that only ends its run here has no call to be past: the 7 at Rúa Montevideo was said
  // to run on the notice's word there from midday. One that does not run today has none either,
  // and there the notice is all there is.
  return boardable && minutesOf(now) > last;
}

/** The latest of these lines' end times tonight, the way the night runs: "03:15" after "01:00". */
export function latestRun(lines: LineChange[], now: Date): string | undefined {
  return lines
    .map((c) => runsUntil(c, now)?.time)
    .filter((time): time is string => time !== undefined)
    .sort((a, b) => nightOf(a) - nightOf(b))
    .at(-1);
}

/** The lines by number that the notice says do not call at this stop, with where to go instead. */
export function closedAt(changes: NoticeChanges | null, stopId: string): { lines: string[]; instead?: string } {
  const here = (changes?.lines ?? []).flatMap((c) => c.closed.filter((s) => s.stopId === stopId).map((s) => ({ line: c.line, instead: s.instead })));
  return { lines: here.map((h) => h.line), instead: here.find((h) => h.instead)?.instead };
}

/**
 * What the notice holding at a moment does at one stop: the lines that skip it, the lines that
 * call somewhere else instead, and the lines running past their timetable, with whether the
 * timetable has nothing more for them here. One reading for the board, the map's sheet and the
 * saved stops: the sheet and the saved stops once showed a bus the notice had stopped calling.
 */
export function atStop(changes: NoticeChanges | null, stop: Pick<BusStop, 'id' | 'lines'>, at: Date) {
  const holding = changesNow(changes, at);
  const closed = closedAt(holding, stop.id);
  const lines = holding?.lines ?? [];
  const moved = lines.flatMap((c) => c.moved.filter((m) => m.stopId === stop.id).map((m) => ({ line: c.line, to: m.to })));
  const numbers = new Set(stop.lines.map((id) => lineById(id)?.number));
  const late = lines.flatMap((c) => {
    const end = numbers.has(c.line) && !closed.lines.includes(c.line) ? runsUntil(c, at) : undefined;
    return end ? [{ line: c.line, ...end, now: pastTimetable(c, stop.id, at) }] : [];
  });
  // Whether there is a sentence to say here and now; a line running late after its timetable's
  // last call is not one yet, while the timetable still answers for it.
  const speaks = closed.lines.length + moved.length > 0 || late.some((l) => l.now);
  return { holding, closed, moved, late, speaks, skips: (lineNumber: string) => closed.lines.includes(lineNumber) };
}
export type StopNotice = ReturnType<typeof atStop>;

/** Whether a line, by id or number, skips a stop under the notice. */
export function isClosed(changes: NoticeChanges | null, line: { id: string; number: string }, stopId: string): boolean {
  return (changes?.lines ?? []).some((c) => (c.line === line.number || c.line === line.id) && c.closed.some((s) => s.stopId === stopId));
}

/** When a plan sets off, as a date: its clock, on its day counted from the moment it was planned from. */
export function setsOff(plan: { departureTime: string; daysAhead?: number }, from: Date): Date {
  const [h, m] = plan.departureTime.split(':').map(Number);
  const at = new Date(from);
  at.setDate(at.getDate() + (plan.daysAhead ?? 0));
  at.setHours(h, m, 0, 0);
  // A clock well before the moment planned from, on the same day, is past midnight.
  if (at.getTime() < from.getTime() - 60 * 60_000) at.setDate(at.getDate() + 1);
  return at;
}

/**
 * Plans under the notice of the night the trip is on, not of the moment it is asked: at
 * 01:00 on the 13th the night is still the 12th's, but the first bus of the morning calls at
 * Praza Bretaña again; at 23:50 on the 8th the first bus of the 9th already does not. Asked
 * with the moment planned from, and once more when the answer sets off on another night.
 */
export function underNotice<P extends { departureTime: string; daysAhead?: number }>(
  changes: NoticeChanges | null,
  from: Date,
  plan: (skipsStop: ((lineId: string, stopId: string) => boolean) | undefined) => P[],
): P[] {
  const plans = plan(stopSkipper(changes, from));
  const leaves = plans[0] && setsOff(plans[0], from);
  return !changes || !leaves || serviceDay(leaves) === serviceDay(from) ? plans : plan(stopSkipper(changes, leaves));
}

/** What the planner asks, by line id, at this moment; undefined when the notice closes nothing then. */
export function stopSkipper(changes: NoticeChanges | null, at: Date): ((lineId: string, stopId: string) => boolean) | undefined {
  const holding = changesNow(changes, at);
  if (!holding?.lines.some((c) => c.closed.length)) return undefined;
  return (lineId, stopId) => {
    const line = lineById(lineId);
    return !!line && isClosed(holding, line, stopId);
  };
}
