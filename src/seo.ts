/**
 * What search engines are told about this site, generated at build time from one URL:
 * the same build is deployed under `/<repo>/` and could be deployed to a bare domain, and
 * a canonical or a sitemap with the wrong origin points crawlers at pages that do not
 * exist. Without `SITE_URL` the tags are omitted rather than guessed.
 */
import type { Tab } from './components/navSections';
import rawLines from './data/lines.json';
import { LANG_PREFIX, PATHS, lineSlug, pathFor, type PathLang } from './routes';

/** A line's page: its id and slug, the number on the bus, and the name the operator forms from its two ends. */
export interface LinePage {
  id: string;
  slug: string;
  number: string;
  name: string;
  /** What tells it apart from the other lines with its number: only the 11's three variants have one. */
  variant: string;
}

/**
 * One page per line, from the dataset, so a search for "horario bus 1.4 lugo" can land on
 * the 1.4 rather than on one page for all 24. Four lines are an "11" on the bus, and the
 * variant is the part of the id after the number («Igrexa de Bóveda», «Calde», «Santa
 * Comba»): four pages with one title would read as one.
 */
export const LINE_PAGES: LinePage[] = rawLines.map((line) => ({
  id: line.id,
  slug: lineSlug(line.id),
  number: line.number,
  name: line.name,
  variant: line.id.startsWith(`${line.number}-`) ? line.id.slice(line.number.length + 1) : '',
}));

/** The site's own address, with a trailing slash, or null when nothing was configured. */
export function siteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return null;
  }
}

/**
 * What the build writes into the home page's head once it knows the real address: the
 * canonical link, the preview image (absolute, because the apps that unfurl a pasted link do
 * not resolve a relative one) and the structured data. Here and not in vite.config.ts so the
 * suite reads the same tags: CI builds without SITE_URL, and its build carries none of them.
 */
export function siteHeadTags(site: string): string[] {
  return [
    `<link rel="canonical" href="${site}" />`,
    `<meta property="og:image" content="${site}icon-512.png" />`,
    `<meta property="og:image:width" content="512" />`,
    `<meta property="og:image:height" content="512" />`,
    `<script type="application/ld+json">${websiteData(site)}</script>`,
    `<script type="application/ld+json">${structuredData(site)}</script>`,
  ];
}

/** `WebSite` with the name, on the home page: what Google takes a result's site name from (NOTAS, Pendente 5). */
export function websiteData(site: string): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: JSON.parse(structuredData(site)).name, url: site });
}

/** `WebApplication`, and `disambiguatingDescription` says whose service it is not. */
export function structuredData(site: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Urbanos de Lugo',
    url: site,
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript.',
    inLanguage: ['gl', 'es', 'en'],
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    description:
      'Liñas, paradas e tempos de paso do autobús urbano de Lugo, cos horarios que publica o operador e as estimacións sempre etiquetadas como tales.',
    disambiguatingDescription:
      'Proxecto non oficial. Non está feito nin avalado por AULUSA, Grupo Monbus nin o Concello de Lugo: le o cadro horario que o operador publica en buslugo.com.',
    about: {
      '@type': 'Service',
      name: 'Autobús urbano de Lugo',
      areaServed: { '@type': 'City', name: 'Lugo', address: { '@type': 'PostalAddress', addressCountry: 'ES' } },
    },
  });
}

/** Crawlers are welcome everywhere; there is nothing here that is not public already. */
export function robotsTxt(site: string): string {
  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${site}sitemap.xml`, ''].join('\n');
}

/** The root and one path per tab, from the router's own record so the two cannot drift. */
export const SITE_PATHS = ['', ...Object.values(PATHS)];

/** The three languages with addresses of their own, Galician first: it is the bare one and the x-default. */
export const SITE_LANGS = Object.keys(LANG_PREFIX) as PathLang[];

/** With the trailing slash: each tab and each line's page is a directory with an index.html, and Pages 301s `/linhas` to `/linhas/`. */
export function routeUrl(site: string, route: string, lang: PathLang = 'gl', line?: string): string {
  return `${site}${pathFor(lang, route, line && lineSlug(line))}`;
}

/**
 * The one address a screen is indexed under, in each language. The root *is* the stops
 * tab: `/` and `/paradas/` draw the same screen, and Search Console read two canonicals as
 * "Duplicate, Google chose a different canonical", rightly. So the stops tab points at its
 * language's root and stays out of the sitemap; the page still answers 200 with its own title.
 * A line's page is its own address.
 */
export function canonicalUrl(site: string, route: string, lang: PathLang = 'gl', line?: string): string {
  return line ? routeUrl(site, PATHS.lines, lang, line) : routeUrl(site, route === PATHS.stops ? '' : route, lang);
}

/**
 * Ninety entries: in each language, the root, the five tabs that are not the root by another
 * name, and the 24 lines' pages.
 */
export function sitemapXml(site: string, paths: string[] = SITE_PATHS, langs: PathLang[] = SITE_LANGS, lines: string[] = LINE_PAGES.map((l) => l.id)): string {
  const urls = langs
    .flatMap((lang) => [
      ...paths.filter((p) => canonicalUrl(site, p, lang) === routeUrl(site, p, lang)).map((p) => routeUrl(site, p, lang)),
      ...lines.map((line) => routeUrl(site, PATHS.lines, lang, line)),
    ])
    .map((url) => `  <url><loc>${url}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export interface PageHead {
  title: string;
  description: string;
}

/**
 * What each page says about itself, in each language. The opener says the app is not
 * official on purpose, "bus" is in every title because it is the word people search, and
 * nothing promises live positions: this network publishes none. Place names stay as the
 * operator writes them; only the words around them change.
 */
const HEADS: Record<PathLang, { root: PageHead; tabs: Record<Tab, PageHead> }> = {
  gl: {
    root: {
      title: 'Urbanos de Lugo | Bus urbano: liñas, horarios e paradas',
      description:
        'Non oficial. Liñas, horarios e paradas do autobús urbano de Lugo, cos horarios de buslugo.com e estimacións sempre etiquetadas. Esta rede non publica GPS.',
    },
    tabs: {
      stops: {
        title: 'Paradas do bus urbano de Lugo | Urbanos de Lugo',
        description:
          'Non oficial. Busca unha parada do bus urbano de Lugo e mira que liñas pasan por ela e os seguintes pasos, calculados do cadro horario de buslugo.com.',
      },
      lines: {
        title: 'Liñas e horarios do bus urbano de Lugo | Urbanos de Lugo',
        description:
          'Non oficial. As liñas do bus urbano de Lugo, co percorrido, as paradas de ida e de volta e o horario que publica o operador en buslugo.com.',
      },
      map: {
        title: 'Mapa do bus urbano de Lugo | Urbanos de Lugo',
        description:
          'Non oficial. Mapa das paradas e percorridos do bus urbano de Lugo, coa posición estimada dos autobuses segundo o horario: esta rede non publica GPS.',
      },
      plan: {
        title: 'Planificador de ruta en bus por Lugo | Urbanos de Lugo',
        description:
          'Non oficial. Calcula como ir dun punto a outro de Lugo en bus urbano: que liña coller, onde subir e baixar e canto se tarda, cos horarios de buslugo.com.',
      },
      info: {
        title: 'Avisos do bus urbano de Lugo | Urbanos de Lugo',
        description:
          'Non oficial. Avisos do servizo do bus urbano de Lugo tal como os publica o operador: desvíos, cortes e cambios de horario, coa hora da última lectura.',
      },
      fares: {
        title: 'Canto custa o bus urbano de Lugo: tarifas | Urbanos de Lugo',
        description:
          'Non oficial. Tarifas do bus urbano de Lugo tal como as publica buslugo.com: billete ordinario, bono ordinario, bono social e tarxeta TMG.',
      },
    },
  },
  es: {
    root: {
      title: 'Urbanos de Lugo | Bus urbano: líneas, horarios y paradas',
      description:
        'No oficial. Líneas, horarios y paradas del autobús urbano de Lugo, con horarios de buslugo.com y estimaciones siempre marcadas. Esta red no publica GPS.',
    },
    tabs: {
      stops: {
        title: 'Paradas del bus urbano de Lugo | Urbanos de Lugo',
        description:
          'No oficial. Busca una parada del bus urbano de Lugo y mira qué líneas pasan por ella y los próximos pasos, calculados del horario de buslugo.com.',
      },
      lines: {
        title: 'Líneas y horarios del bus urbano de Lugo | Urbanos de Lugo',
        description:
          'No oficial. Las líneas del bus urbano de Lugo, con el recorrido, las paradas de ida y de vuelta y el horario que publica el operador en buslugo.com.',
      },
      map: {
        title: 'Mapa del bus urbano de Lugo | Urbanos de Lugo',
        description:
          'No oficial. Mapa de las paradas y recorridos del bus urbano de Lugo, con la posición estimada de los autobuses según el horario: esta red no publica GPS.',
      },
      plan: {
        title: 'Planificador de rutas en bus por Lugo | Urbanos de Lugo',
        description:
          'No oficial. Calcula cómo ir de un punto a otro de Lugo en bus urbano: qué línea coger, dónde subir y bajar y cuánto se tarda, con horarios de buslugo.com.',
      },
      info: {
        title: 'Avisos del bus urbano de Lugo | Urbanos de Lugo',
        description:
          'No oficial. Avisos del bus urbano de Lugo tal como los publica el operador: desvíos, cortes y cambios de horario, con la hora de la última lectura.',
      },
      fares: {
        title: 'Tarifas del bus urbano de Lugo | Urbanos de Lugo',
        description:
          'No oficial. Tarifas del bus urbano de Lugo tal como las publica buslugo.com: billete ordinario, bono ordinario, bono social y tarjeta TMG.',
      },
    },
  },
  en: {
    root: {
      title: 'Urbanos de Lugo | Lugo city bus: lines, timetables and stops',
      description:
        'Unofficial. Lines, timetables and stops of the Lugo city bus, with the buslugo.com timetables and estimates always labelled. This network publishes no GPS.',
    },
    tabs: {
      stops: {
        title: 'Lugo city bus stops | Urbanos de Lugo',
        description:
          'Unofficial. Find a Lugo city bus stop and see which lines call there and the next departures, worked out from the buslugo.com timetable.',
      },
      lines: {
        title: 'Lugo city bus lines and timetables | Urbanos de Lugo',
        description:
          'Unofficial. The Lugo city bus lines, with the route, the stops each way and the timetable the operator publishes on buslugo.com.',
      },
      map: {
        title: 'Lugo city bus map | Urbanos de Lugo',
        description:
          'Unofficial. Map of the Lugo city bus stops and routes, with buses placed by the timetable: this network publishes no GPS.',
      },
      plan: {
        title: 'Lugo city bus journey planner | Urbanos de Lugo',
        description:
          'Unofficial. Work out how to cross Lugo by city bus: which line to take, where to get on and off and how long it takes, from the buslugo.com timetables.',
      },
      info: {
        title: 'Lugo city bus service notices | Urbanos de Lugo',
        description:
          'Unofficial. Lugo city bus service notices as the operator publishes them: diversions, closures and timetable changes, with the time they were last read.',
      },
      fares: {
        title: 'Lugo city bus fares | Urbanos de Lugo',
        description:
          'Unofficial. Lugo city bus fares as buslugo.com publishes them: single ticket, ordinary pass, social pass and the TMG card.',
      },
    },
  },
};

/**
 * A line's page: the number in the title, as it is searched ("horario bus 1.4 lugo", "línea
 * 2"), with the 11's variant after it; the line's name, its two ends as the operator writes
 * them, in the description. The title has no room for the name and the site: 60 is the cut.
 */
const LINE_HEADS: Record<PathLang, (label: string, line: LinePage) => PageHead> = {
  gl: (label, line) => ({
    title: `Liña ${label} do bus de Lugo: horario e paradas`,
    description: `Non oficial. Liña ${line.number} do bus urbano de Lugo, ${line.name}: percorrido, paradas e horario de buslugo.com.`,
  }),
  es: (label, line) => ({
    title: `Línea ${label} del bus de Lugo: horario y paradas`,
    description: `No oficial. Línea ${line.number} del bus urbano de Lugo, ${line.name}: recorrido, paradas y horario de buslugo.com.`,
  }),
  en: (label, line) => ({
    title: `Lugo city bus line ${label}: timetable and stops`,
    description: `Unofficial. Lugo city bus line ${line.number}, ${line.name}: route, stops and timetable from buslugo.com.`,
  }),
};

/** The root's head in Galician: index.html carries exactly this, and the build re-heads every copy from it. */
export const ROOT_HEAD: PageHead = HEADS.gl.root;

/** A route's head in a language; with a line's id, that line's page. */
export function pageHead(route: string, lang: PathLang = 'gl', line?: string): PageHead {
  const page = line ? LINE_PAGES.find((l) => l.id === line) : undefined;
  if (page) return LINE_HEADS[lang](page.variant ? `${page.number} ${page.variant}` : page.number, page);
  const tab = (Object.keys(PATHS) as Tab[]).find((t) => PATHS[t] === route);
  return tab ? HEADS[lang].tabs[tab] : HEADS[lang].root;
}

/** For an attribute or a title: a line's name comes from the dataset, not from this file. */
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Open Graph's names for the three, which want a region. */
const OG_LOCALE: Record<PathLang, string> = { gl: 'gl_ES', es: 'es_ES', en: 'en_GB' };

/**
 * The built index.html, re-headed for one route in one language: its `lang`, title,
 * description, Open Graph locale, canonical and static <h1>, and the alternates that tell a
 * search engine which page is the same screen in the other two languages, so it can show
 * each searcher theirs. With a line's id, that line's page, whose alternates are the same
 * line in the other two. The root's Galician tags are the anchors, so index.html has to
 * carry exactly `ROOT_HEAD`; tools/test.ts holds the two together. Replaced by functions, so
 * a `$` in a line's name is not read as a pattern.
 */
export function pageHtml(html: string, route: string, site: string | null, lang: PathLang = 'gl', line?: string): string {
  const head = pageHead(route, lang, line);
  const title = escapeHtml(head.title);
  const description = escapeHtml(head.description);
  const locales = [OG_LOCALE[lang], ...SITE_LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l])];
  const out = html
    .replace(/<html lang="[^"]*"/, () => `<html lang="${lang}"`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, (_, open: string) => open + description)
    .replace(/(<meta property="og:title" content=")[^"]*/, (_, open: string) => open + title)
    .replace(/(<meta property="og:description" content=")[^"]*/, (_, open: string) => open + description)
    .replace(/<meta property="og:locale" content="[^"]*" \/>(\s*<meta property="og:locale:alternate" content="[^"]*" \/>)*/, () =>
      locales.map((l, i) => `<meta property="og:locale${i ? ':alternate' : ''}" content="${l}" />`).join('\n    '),
    )
    .replace(/(<h1[^>]*>)[^<]*(<\/h1>)/, (_, open: string, close: string) => open + title + close);
  if (!site) return out;
  const links = [
    `<link rel="canonical" href="${canonicalUrl(site, route, lang, line)}" />`,
    ...SITE_LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${canonicalUrl(site, route, l, line)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl(site, route, 'gl', line)}" />`,
  ];
  return out.replace(`<link rel="canonical" href="${site}" />`, () => links.join('\n    '));
}
