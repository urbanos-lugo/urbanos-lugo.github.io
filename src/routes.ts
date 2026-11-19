/** The tabs the shell can show. `info` and `fares` are reached from the menu, not the bar. */
export type Tab = 'stops' | 'lines' | 'map' | 'plan' | 'info' | 'fares';

/**
 * One slug per tab, and the only list of them: the router reads them out of the address
 * bar, sitemap.xml advertises them, and the build writes a page at each one. No other
 * import, because vite.config.ts reads this in Node. Galician, like the app.
 */
export const PATHS: Record<Tab, string> = {
  stops: 'paradas',
  lines: 'linhas',
  map: 'mapa',
  plan: 'ruta',
  info: 'avisos',
  fares: 'tarifas',
};

/**
 * One address per language, so a search result can be in the language it was searched in:
 * Galician keeps the bare paths, Spanish and English take a first segment. The same three
 * as LANGS in src/i18n, written out here for the reason above; the suite holds the two
 * together.
 */
export const LANG_PREFIX = { gl: '', es: 'es', en: 'en' } as const;
export type PathLang = keyof typeof LANG_PREFIX;

/** Each language's words for the tabs, so an address reads in the language it is in. Galician's are PATHS. */
export const SLUGS: Record<PathLang, Record<Tab, string>> = {
  gl: PATHS,
  es: { stops: 'paradas', lines: 'lineas', map: 'mapa', plan: 'ruta', info: 'avisos', fares: 'tarifas' },
  en: { stops: 'stops', lines: 'lines', map: 'map', plan: 'route', info: 'notices', fares: 'fares' },
};

const TABS = Object.keys(PATHS) as Tab[];
const isPathLang = (value: string | null): value is PathLang => value !== null && Object.hasOwn(LANG_PREFIX, value);
const PREFIXED = (Object.keys(LANG_PREFIX) as PathLang[]).filter((lang) => LANG_PREFIX[lang]);

/**
 * A line's segment in the address of its page, after the lines word: /es/lineas/1.4/. Its
 * id folded to plain ASCII, the same in every language because a place name is not
 * translated: 5DS is 5ds, and 11-Igrexa de Bóveda, one of the four lines numbered 11,
 * 11-igrexa-de-boveda. The suite holds every line's slug unique.
 */
export function lineSlug(id: string): string {
  return id
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The language and the tab an address names, read from the part after the site's base
 * path, and on the lines tab the segment after it, a line's slug, when there is one. A
 * tab's word in any language is understood under any prefix, so /en/linhas/ still opens the
 * lines; the router then writes the address in the language's own words.
 */
export function parsePath(rest: string): { lang: PathLang | null; tab: Tab | null; line?: string } {
  const segments = rest.split('/').filter(Boolean).map((s) => s.toLowerCase());
  const lang = PREFIXED.find((l) => LANG_PREFIX[l] === segments[0]) ?? null;
  const slug = segments[lang ? 1 : 0];
  const tab = slug ? (TABS.find((t) => SLUGS[lang ?? 'gl'][t] === slug) ?? TABS.find((t) => Object.values(SLUGS).some((words) => words[t] === slug)) ?? null) : null;
  const line = tab === 'lines' ? segments[lang ? 2 : 1] : undefined;
  return line ? { lang, tab, line } : { lang, tab };
}

/**
 * Where a route lives in a language under the base path, with the slash Pages wants: '',
 * 'linhas/', 'es/lineas/', 'en/lines/', and with a line's slug 'es/lineas/1.4/'. Routes are
 * named by their Galician slug, as in PATHS and the sitemap's list, and come out in the
 * language's word.
 */
export function pathFor(lang: PathLang, route: string, line?: string): string {
  const tab = TABS.find((t) => PATHS[t] === route);
  return [LANG_PREFIX[lang], tab ? SLUGS[lang][tab] : route, line]
    .filter(Boolean)
    .map((segment) => `${segment}/`)
    .join('');
}

/**
 * The language a visit opens in. An address that names one decides it, so a shared link
 * and a search result open as they were found. A bare address is Galician to a crawler,
 * which has no choice on record and whose browser says English: that put an English title
 * on the Galician result. Otherwise the reader's last choice, then their browser's
 * language, then Galician.
 */
export function pickLang(visit: { address: PathLang | null; crawler: boolean; stored: string | null; browser: string }): PathLang {
  if (visit.address) return visit.address;
  if (visit.crawler) return 'gl';
  if (isPathLang(visit.stored)) return visit.stored;
  const browser = visit.browser.slice(0, 2).toLowerCase();
  return isPathLang(browser) ? browser : 'gl';
}

/**
 * Search engines, by the names they give themselves in the User-Agent. Search Console's live
 * test is Google-InspectionTool, with no "Googlebot" in it: unlisted, it drew a bare address
 * in its own browser's language.
 */
export const isCrawler = (userAgent: string): boolean =>
  /googlebot|google-inspectiontool|bingbot|duckduckbot|applebot|yandexbot|baiduspider|slurp|crawler|spider/i.test(userAgent);
