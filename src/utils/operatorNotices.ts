import type { BusLine, NoticeSection, ServiceAlert } from '../types';

/**
 * The language the notices are written in, whatever the reader's is: buslugo.com writes in
 * Spanish, and the council's feed is read from its Spanish edition (/es/, alertSyncService).
 * Quoted on screen inside a Galician or English page, they carry it as `lang`, or a screen
 * reader reads Spanish with a Galician or English voice (WCAG 3.1.2).
 */
export const NOTICE_LANG = 'es';

/** The sites a notice may link to, over HTTPS: the operator's and the council's, subdomains included. */
const NOTICE_HOSTS = ['buslugo.com', 'concellodelugo.gal'];

/** A notice's link if it goes to one of those sites, else none: a scraped or relayed href is otherwise somebody else's link in our page. */
export function noticeLink(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined;
  try {
    const { protocol, hostname } = new URL(href);
    return protocol === 'https:' && NOTICE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ? href : undefined;
  } catch {
    return undefined;
  }
}

/** Bounds on the notices and on each, whatever the page or the answer holds: San Froilán 2026 ran to six lines and the rest, none over five paragraphs. */
export const MAX_NOTICES = 40;
export const MAX_SECTIONS = 40;
const MAX_LINES = 40;
export const MAX_PARAGRAPHS = 30;
export const MAX_PARAGRAPH = 600;

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

const text = (value: unknown): string => (typeof value === 'string' ? clip(value, MAX_PARAGRAPH) : '');
const texts = (value: unknown, max: number): string[] => (Array.isArray(value) ? value.slice(0, max).filter((v) => typeof v === 'string').map(text) : []);

/**
 * One notice as the app will render it, whatever the API or the snapshot sent: text where
 * text is expected, lists that are lists, none of them without end, and a link only to a notice
 * site. The live answer reached the screen unread, so a malformed or hostile one broke it or
 * linked anywhere; and at any length, so 64 KB of one bell item stopped the page for two seconds.
 */
export function readNotice(raw: unknown, index: number): ServiceAlert | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  const sections = Array.isArray(n.sections)
    ? n.sections
        .slice(0, MAX_SECTIONS)
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ heading: text(s.heading), lines: texts(s.lines, MAX_LINES), paragraphs: texts(s.paragraphs, MAX_PARAGRAPHS) }))
    : undefined;
  return {
    id: text(n.id) || `notice-${index + 1}`,
    title: text(n.title),
    severity: n.severity === 'urgent' || n.severity === 'warning' ? n.severity : 'info',
    linesAffected: texts(n.linesAffected, MAX_LINES),
    date: text(n.date),
    description: text(n.description),
    active: n.active !== false,
    source: n.source === 'operator' || n.source === 'concello' ? n.source : undefined,
    link: noticeLink(n.link),
    sections,
  };
}

/** How long a press release of the council's is news: a closure or a diversion lasts about as long. */
export const COUNCIL_NEWS_MS = 7 * 24 * 60 * 60 * 1000;

/** The council's, as long as it is news. */
export const councilNews = (alerts: ServiceAlert[], now: number): ServiceAlert[] => alerts.filter((alert) => alert.source === 'concello' && now - Date.parse(alert.date) <= COUNCIL_NEWS_MS);

/** The operator's notices that came written out line by line, as San Froilán 2026 did; never the council's press feed. */
export const sectionedNotices = (alerts: ServiceAlert[] = []): ServiceAlert[] =>
  alerts.filter((alert) => alert.source !== 'concello' && (alert.sections?.length ?? 0) > 0);

/** Whether a section names this line: by the number the operator prints, so "11" names both 11s. */
export const namesLine = (section: NoticeSection, line: Pick<BusLine, 'id' | 'number'>): boolean =>
  section.lines.some((named) => named === line.number || named === line.id);
