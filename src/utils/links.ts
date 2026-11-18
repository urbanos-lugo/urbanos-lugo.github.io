import { BUS_LINES } from '../data/transitData';
import { findStop } from './places';
import { MAX_QUERY_LENGTH } from './searchUtils';
import type { Screen } from '../hooks/useTabRoute';

type Trip = NonNullable<Screen['trip']>;

/** A clock a person can ask for, 00:00 to 23:59. */
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * What a link opens: `?linea=` or `?line=` a line's page, by its id or its number;
 * `?parada=`, `?stop=`, `?qr=` or `?ps=` a stop's board as its pole's sticker opens it,
 * resolved the way the scanner resolves a code; `?de=` and `?a=` Ruta's answer to that
 * question, asked again on arrival, leaving at `saida=` or there by `chegada=` when either is
 * a clock. Null when it names nothing.
 */
export function screenFromLink(search: string): Screen | null {
  const params = new URLSearchParams(search);
  const lineParam = params.get('linea') || params.get('line');
  const line = lineParam && BUS_LINES.find((l) => l.id.toLowerCase() === lineParam.toLowerCase() || l.number.toLowerCase() === lineParam.toLowerCase());
  if (line) return { tab: 'lines', line: line.id };
  const stopParam = params.get('parada') || params.get('stop') || params.get('qr') || params.get('ps');
  const stop = stopParam && findStop(stopParam);
  if (stop) return { tab: 'stops', stop: stop.id, qr: true };
  // As typed into the fields, and held to what a field takes: the planner reads them as it reads those.
  const from = params.get('de')?.trim().slice(0, MAX_QUERY_LENGTH);
  const to = params.get('a')?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!from || !to) return null;
  const depart = params.get('saida') ?? '';
  const arrive = params.get('chegada') ?? '';
  const trip: Trip = CLOCK.test(depart) ? { from, to, mode: 'depart', at: depart } : CLOCK.test(arrive) ? { from, to, mode: 'arrive', at: arrive } : { from, to, mode: 'now', at: '' };
  return { tab: 'plan', trip };
}

/**
 * A planned trip as a link's search string, the question rather than the answer: whoever opens
 * it is answered from their own clock. None from "my location", which is a position on this
 * phone and would be nothing on another.
 */
export function tripSearch(trip: Trip): string | null {
  if (trip.from === 'my_location' || trip.to === 'my_location') return null;
  const params = new URLSearchParams({ de: trip.from, a: trip.to });
  if (trip.mode !== 'now') params.set(trip.mode === 'depart' ? 'saida' : 'chegada', trip.at);
  return `?${params}`;
}
