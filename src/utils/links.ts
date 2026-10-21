import { BUS_LINES } from '../data/transitData';
import { findStop } from './places';
import type { Screen } from '../hooks/useTabRoute';

/**
 * What a link opens: `?linea=` or `?line=` a line's page, by its id or its number;
 * `?parada=`, `?stop=`, `?qr=` or `?ps=` a stop's board as its pole's sticker opens it,
 * resolved the way the scanner resolves a code. Null when it names nothing.
 */
export function screenFromLink(search: string): Screen | null {
  const params = new URLSearchParams(search);
  const lineParam = params.get('linea') || params.get('line');
  const line = lineParam && BUS_LINES.find((l) => l.id.toLowerCase() === lineParam.toLowerCase() || l.number.toLowerCase() === lineParam.toLowerCase());
  if (line) return { tab: 'lines', line: line.id };
  const stopParam = params.get('parada') || params.get('stop') || params.get('qr') || params.get('ps');
  const stop = stopParam && findStop(stopParam);
  return stop ? { tab: 'stops', stop: stop.id, qr: true } : null;
}
