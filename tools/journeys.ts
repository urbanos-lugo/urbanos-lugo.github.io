/**
 * Every task the app is opened for, through every way in, on a small phone and a large one,
 * done the way a thumb does it: real touch taps, the scrolling it takes to bring the next
 * thing into view, a keyboard that covers the bottom of the screen while a field is typed in.
 *
 *   pnpm build && PORT=3002 pnpm start     # in another terminal
 *   pnpm run audit:journeys                # the table: every journey, both phones
 *
 * and inside `pnpm run audit:browser`, as one of its sequences, where what has to hold fails it.
 *
 * Each journey is counted: taps, keystrokes, scrolls, decisions (a pick among options shown),
 * screens, and the time the app took to answer each step. Each tap is measured where the finger
 * lands: its size, whether something covers it, whether it moved in the quarter second between
 * being seen and being tapped, and how far up the screen it sits. The reach model is the simple
 * one for one hand in portrait: the top quarter of the screen is hard, the next quarter a stretch,
 * the bottom half easy. The keyboard model is a soft keyboard over the bottom 41 % of the screen,
 * with the field brought up just above it, as Chrome and Safari do: the field and the thing the
 * reader needs next (the first suggestion, the button) have to be above it.
 *
 * Then the way back. From the answer, the system's back -- the browser's button, Android's
 * gesture -- has to retrace the journey one screen at a time, closing what is on top before
 * leaving what is under it, with the scroll and the fields as they were left; and one press
 * more leaves the app, never sooner. The installed app has no browser button and an iPhone no
 * gesture, so it is walked back again with the app's own controls only. A reload at the answer
 * has to land on the answer, and a phone locked two hours has to show the time of now when it
 * is woken.
 *
 * What has to hold is a finding of kind `flow` or `back`, and fails `audit:browser`. The thumb
 * and the keyboard are this project's own bar, `thumb`, printed and not gated. The counts are
 * the before-and-after figures of round 42 in design/REXISTRO-probas.md.
 *
 * Nothing leaves the machine: the pages are the audit's (tools/auditBrowser.ts), every other
 * host is refused, the API is answered from fixtures, and the clock is pinned.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROBE_SOURCE, withBrowser, type Browser, type Session } from './cdp';
import { DICT, REACH, press, worker, type Finding, type Lang, type Worker } from './auditBrowser';
import { sleep } from './lib';
import { BUS_LINES, BUS_STOPS } from '../src/data/transitData';

/* ------------------------------------------------------------------------------------- */
/* The phones, the hand and the keyboard                                                 */
/* ------------------------------------------------------------------------------------- */

export type Phone = 'small' | 'large';
/** A small Android, the most common width there is, and the largest iPhone. */
const PHONES: Record<Phone, { width: number; height: number; deviceScaleFactor: number; mobile: true }> = {
  small: { width: 360, height: 640, deviceScaleFactor: 3, mobile: true },
  large: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
};
/** A portrait soft keyboard with its suggestion strip: Gboard on 640 px, the iPhone's on 932. */
const KEYBOARD = 0.41;
// Lugo's 09:12 and 03:00 (CEST, UTC+2) wherever the run is, on phones set to Lugo's zone. The
// runner is on UTC: its phones were told above each board that their clock was two hours off,
// and on the small one the next bus went 29 px below the screen there and nowhere else.
const PHONE_ZONE = 'Europe/Madrid';
const DAY = Date.UTC(2026, 8, 29, 7, 12);
const NIGHT = Date.UTC(2026, 8, 29, 1, 0);
const LOCKED_MS = 2 * 60 * 60_000;

const busiest = [...BUS_STOPS].sort((a, b) => b.lines.length - a.lines.length);
const SCANNED = busiest.find((s) => s.officialToken === 'uilP') ?? busiest[0];
const HOME = busiest[0];
/**
 * Two poles across a street, 15 to 25 m apart: at zoom 16 each lies inside the other's reach
 * for a finger. The first of the dataset's order is drawn first, under its partner.
 */
const ACROSS = (() => {
  const apart = (a: (typeof BUS_STOPS)[number], b: (typeof BUS_STOPS)[number]) => Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 81_400);
  for (const [i, a] of BUS_STOPS.entries()) for (const b of BUS_STOPS.slice(i + 1)) if (apart(a, b) > 15 && apart(a, b) < 25) return a;
  throw new Error('no two poles across a street in the dataset');
})();
/** The last line of the list, which a reader scrolls to. */
const FAR_LINE = BUS_LINES[BUS_LINES.length - 1];
/** The names the steps look for, handed to the page inside T, its argument: code built from data is what CodeQL flags. */
const AT = { home: HOME.name, farLine: FAR_LINE.name, line0: BUS_LINES[0].name, line0Number: BUS_LINES[0].number, across: ACROSS.name };
const REGULAR = {
  urbanos_lugo_fav_stops: JSON.stringify([busiest[0].id, busiest[1].id]),
  urbanos_lugo_fav_lines: JSON.stringify([BUS_LINES[0].id]),
  'urbanos-lugo-recent-stops': JSON.stringify([busiest[2].id]),
  'urbanos-lugo-recent-routes': JSON.stringify([{ from: 'Praza Maior / Concello de Lugo', to: 'HULA (Ent. Principal)' }]),
};

/* ------------------------------------------------------------------------------------- */
/* The journeys                                                                          */
/* ------------------------------------------------------------------------------------- */

/** How a step moves the back stack, when it is not obvious from what changed on screen. */
/** `collapse`: the new screen takes the place of every screen of its tab before it, as the ride does the planner's. */
type Move = 'push' | 'pop' | 'none' | 'collapse';
type Step =
  /** A finder, run in the page with REACH and the helpers below; `options`, the set it was picked from. */
  | { tap: string; options?: string; wait?: string; stack?: Move; optional?: boolean; note?: string }
  /** Tap the field, empty it if asked (each character a key), type, and see what comes next above the keyboard. */
  | { type: string; text: string | { gl: string; es?: string; en?: string }; clear?: boolean; next?: string; wait?: string }
  | { enter: true; wait?: string }
  /** A stop's dot on the map, or the reader's own, the one nearest the middle: found on Leaflet's canvas by its colour, as the eye finds it. */
  | { tapMap: 'stop' | 'me'; wait?: string }
  /** A point this far from the middle of the map, in px: a finger that aims at what the map was opened on and lands a little off it. */
  | { tapAt: [number, number]; wait?: string }
  | { wait: string; note?: string };

interface Start {
  path?: string;
  query?: string;
  stored?: Record<string, string>;
  geo?: 'granted' | 'denied';
  at?: [number, number];
  /** The first fix this long after it is asked for, as a GPS gives it, not in the audit's 60 ms. */
  fixMs?: number;
  /** Motion as most phones have it: every other journey asks for reduced motion, which steadies the pictures and hid a label that took a tap. */
  motion?: true;
  night?: boolean;
}

export interface Journey {
  task: string;
  entry: string;
  start: Start;
  steps: Step[];
  /** The element that answers the task: it has to be on screen when the journey ends. */
  answer: string;
  /** Leave the answer for another tab and come back, and it has to be as it was. */
  away?: { tab: string; still: string; what: string };
  reload?: boolean;
  lock?: { stale: string };
  /** Only the installed app's way back, the app's own controls. */
  installed?: boolean;
  /** The journey changes the language, so the way back is compared by place, not by words. */
  relabels?: boolean;
  /** It needs the operator's notice the fixtures serve, which an offline pass does not have. */
  notice?: boolean;
}

/** A tab of the bar, and what shows that its screen is up: the map arrives as a chunk of its own. */
const tab = (name: string): Step => ({ tap: `tabLink(${name})`, stack: 'push', wait: name === 'T.nav.map' ? `css('.leaflet-container')` : `tabLink(${name}).getAttribute('aria-current') === 'page'` });
const board = `[...document.querySelectorAll('main h2')].find((h) => shown(h) && h.closest('header')) && document.querySelector('main ul li .figure')`;
const firstDeparture = `[...document.querySelectorAll('main ul li .figure')].find(shown)`;
const lineHeading = `[...document.querySelectorAll('main h2')].find((h) => shown(h) && h.classList.contains('text-emph'))`;
const answerFigure = `[...document.querySelectorAll('main .figure')].find(shown)`;
/** Off the pole's sticker, the operator's own minutes come first, on purpose (StopArrivalsView); else the first departure. */
const scannedAnswer = `[...document.querySelectorAll('main section h3')].find((h) => shown(h) && h.textContent.trim() === T.arrivals.operatorSaysTitle) || ${firstDeparture}`;

export const JOURNEYS: Journey[] = [
  /* --- When is my bus, at this stop --- */
  {
    task: 'next bus at a stop',
    entry: 'saved stop',
    start: { stored: REGULAR },
    steps: [{ tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, options: `[...document.querySelectorAll('main ul li button')].filter(shown)`, wait: board }],
    answer: firstDeparture,
    reload: true,
    // The whole first row, with its clock time: two hours on, a frequent line can be "~3" again,
    // and the minutes alone read as a board that had not moved (CPU four times slower, 27 Oct).
    lock: { stale: `(${firstDeparture})?.closest('li')` },
  },
  {
    task: 'next bus at a stop',
    entry: 'installed app',
    installed: true,
    start: { stored: REGULAR },
    steps: [{ tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, options: `[...document.querySelectorAll('main ul li button')].filter(shown)`, wait: board }],
    answer: firstDeparture,
  },
  {
    task: 'next bus at a stop',
    entry: 'search',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: 'sindicatos', next: `css('header .z-results button')`, wait: `css('header .z-results button')` },
      { tap: `[...document.querySelectorAll('header .z-results button')].find((b) => shown(b) && b.textContent.includes(T.at.home))`, options: `[...document.querySelectorAll('header .z-results button')].filter(shown)`, wait: board },
    ],
    answer: firstDeparture,
    reload: true,
  },
  {
    // The keyboard's search key opens the row at the top: the name and the key, nothing to pick.
    task: 'next bus at a stop',
    entry: 'search, the keyboard’s key',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: 'sindicatos', next: `css('header .z-results button')`, wait: `css('header .z-results button')` },
      { enter: true, wait: board },
    ],
    answer: firstDeparture,
  },
  {
    task: 'next bus at a stop',
    entry: 'QR, the bar’s button',
    start: {},
    steps: [
      { tap: `labelled(T.search.qr)`, wait: `css('#qr-manual-input')` },
      { type: `document.getElementById('qr-manual-input')`, text: SCANNED.officialToken ?? SCANNED.code, next: `saying(T.qr.searchBtn)` },
      { enter: true, wait: board },
    ],
    answer: scannedAnswer,
    reload: true,
  },
  {
    task: 'next bus at a stop',
    entry: 'QR, the empty home’s button',
    start: {},
    steps: [
      { tap: `saying(T.stopHome.scan)`, wait: `css('#qr-manual-input')` },
      { type: `document.getElementById('qr-manual-input')`, text: SCANNED.officialToken ?? SCANNED.code, next: `saying(T.qr.searchBtn)` },
      { tap: `saying(T.qr.searchBtn)`, wait: board },
    ],
    answer: scannedAnswer,
  },
  {
    task: 'next bus at a stop',
    entry: 'shared link',
    start: { query: `?parada=${HOME.id}` },
    steps: [{ wait: board }],
    answer: scannedAnswer,
    reload: true,
  },
  {
    task: 'next bus at a stop',
    entry: 'near me',
    start: { geo: 'granted', at: [HOME.lat, HOME.lng] },
    steps: [
      { tap: `saying(T.stopHome.locate)`, wait: `[...document.querySelectorAll('main ul.anim-rise li button')].find(shown)` },
      { tap: `[...document.querySelectorAll('main ul.anim-rise li button')].find(shown)`, options: `[...document.querySelectorAll('main ul.anim-rise li button')].filter(shown)`, wait: board },
    ],
    answer: firstDeparture,
  },
  {
    task: 'next bus at a stop',
    entry: 'map',
    // Standing 70 m south of the stop: the map centres on the reader, and the stop's pin is that far up the screen.
    start: { geo: 'granted', at: [HOME.lat - 70 / 111_320, HOME.lng] },
    steps: [
      tab('T.nav.map'),
      // A reader who has allowed the position once finds the map already on them; anyone else taps the button.
      { tap: `labelled(T.map.stopFollowing) ? null : labelled(T.map.myLocation)`, optional: true, wait: `labelled(T.map.stopFollowing)` },
      { wait: `labelled(T.map.stopFollowing) && new Promise((r) => setTimeout(() => r(true), 900))`, note: 'the map flies to the position' },
      { tapMap: 'stop', wait: `css('[role=dialog][aria-modal=true]')` },
      { tap: `saying(T.map.viewStopDepartures)`, wait: board },
    ],
    answer: firstDeparture,
  },
  {
    task: 'next bus at a stop',
    entry: 'board, then another tab and back',
    start: { stored: REGULAR, geo: 'granted', at: [HOME.lat, HOME.lng] },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `labelled(T.arrivals.alarmCta)`, wait: `labelled(T.arrivals.alarmOn)` },
    ],
    // What the bell just did: it is on. (Standing at the stop, the alarm has also fired.)
    answer: `labelled(T.arrivals.alarmOn)`,
    away: { tab: 'T.nav.map', still: `labelled(T.arrivals.alarmOn)`, what: 'the alarm set on the board' },
  },

  /* --- Back to the saved stops from a board: the app's own link, and the tab again --- */
  {
    task: 'back to the saved stops',
    entry: 'the board’s back link',
    installed: true,
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `labelled(T.arrivals.back) || saying(T.arrivals.back)`, wait: `!(${board})`, stack: 'pop' },
    ],
    answer: `[...document.querySelectorAll('main ul li button')].find(shown)`,
  },
  {
    task: 'back to the saved stops',
    entry: 'the stops tab again',
    installed: true,
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `tabLink(T.nav.stops)`, wait: `!(${board})`, stack: 'pop' },
    ],
    answer: `[...document.querySelectorAll('main ul li button')].find(shown)`,
  },

  /* --- My saved stops at a glance --- */
  {
    task: 'saved stops at a glance',
    entry: 'installed app',
    installed: true,
    start: { stored: REGULAR },
    steps: [],
    answer: `[...document.querySelectorAll('main ul li button .tnum')].find(shown)`,
    lock: { stale: `[...document.querySelectorAll('main ul li button')].find(shown)` },
  },
  {
    task: 'saved stops at a glance',
    entry: 'cold open, nothing saved',
    start: {},
    steps: [],
    answer: `saying(T.stopHome.scan)`,
  },

  /* --- A line: its route, stops and timetable --- */
  {
    task: 'a line',
    entry: 'lines tab, far down the list',
    start: {},
    steps: [tab('T.nav.lines'), { tap: `document.getElementById('line-card-${FAR_LINE.id}')`, options: `[...document.querySelectorAll('main button[id^="line-card-"]')].filter(shown)`, wait: lineHeading }],
    answer: lineHeading,
    reload: true,
  },
  {
    task: 'a line',
    entry: 'search',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: FAR_LINE.number, next: `css('header .z-results button')`, wait: `css('header .z-results button')` },
      { tap: `[...document.querySelectorAll('header .z-results button')].find((b) => shown(b) && b.textContent.includes(T.at.farLine))`, options: `[...document.querySelectorAll('header .z-results button')].filter(shown)`, wait: lineHeading },
    ],
    answer: lineHeading,
  },
  {
    task: 'a line',
    entry: 'from a stop’s board',
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `all().filter(shown).find((e) => (e.getAttribute('aria-label') || '').startsWith(T.arrivals.seeLine))`, wait: lineHeading },
    ],
    answer: lineHeading,
  },
  {
    task: 'a line',
    entry: 'shared link',
    start: { query: `?linea=${FAR_LINE.id}` },
    steps: [{ wait: lineHeading }],
    answer: lineHeading,
    reload: true,
  },
  {
    task: 'a line',
    entry: 'favourites',
    start: { stored: REGULAR },
    steps: [
      { tap: `labelled(T.favourites.title)`, wait: `css('[role=dialog][aria-modal=true]')` },
      { tap: `all().filter(shown).find((e) => e.closest('[role=dialog]') && e.getAttribute('aria-pressed') !== null && e.textContent.includes(T.favourites.tabLines))`, wait: `[...document.querySelectorAll('[role=dialog] .min-w-floor-row')].find(shown)` },
      { tap: `[...document.querySelectorAll('[role=dialog] .min-w-floor-row')].find(shown)`, wait: lineHeading },
    ],
    answer: lineHeading,
  },
  {
    task: 'a line',
    entry: 'map, the controls sheet',
    start: {},
    steps: [
      tab('T.nav.map'),
      { tap: `saying(T.map.controls)`, wait: `css('[role=dialog][aria-modal=true]')` },
      { tap: `labelled(T.map.openLineInfo + ': ' + T.at.line0Number)`, wait: lineHeading },
    ],
    answer: lineHeading,
  },

  /* --- A trip from here to there --- */
  {
    task: 'a trip',
    entry: 'route tab, typing both ends',
    start: {},
    // Both ends typed, the destination after the origin, as a form is filled in. Whatever the
    // origin's pick does in between, the journey goes on to the destination's field.
    steps: [
      tab('T.nav.plan'),
      { type: `document.getElementById('input-origin-query')`, text: 'Praza Maior', clear: true, next: `css('#input-origin-query ~ div button')`, wait: `css('#input-origin-query ~ div button')` },
      { tap: `[...document.querySelectorAll('#input-origin-query ~ div button')].find((b) => shown(b) && b.textContent.includes('Praza Maior'))`, options: `[...document.querySelectorAll('#input-origin-query ~ div button')].filter(shown)`, wait: `!document.querySelector('[aria-busy="true"]')` },
      { tap: `css('#input-dest-query') ? null : all().filter(shown).find((b) => b.getAttribute('aria-expanded') === 'false')`, optional: true, wait: `css('#input-dest-query')`, stack: 'pop', note: 'only if the pick folded the form' },
      { type: `document.getElementById('input-dest-query')`, text: 'Campus', clear: true, next: `css('#input-dest-query ~ div button')`, wait: `css('#input-dest-query ~ div button')` },
      { tap: `[...document.querySelectorAll('#input-dest-query ~ div button')].find((b) => shown(b) && /campus/i.test(b.textContent))`, options: `[...document.querySelectorAll('#input-dest-query ~ div button')].filter(shown)`, wait: answerFigure },
    ],
    answer: answerFigure,
  },
  {
    task: 'a trip',
    entry: 'route tab, typing both ends, the keyboard’s keys',
    start: {},
    steps: [
      tab('T.nav.plan'),
      { type: `document.getElementById('input-origin-query')`, text: 'Praza Maior', clear: true, next: `css('#input-origin-query ~ div button')` },
      { enter: true, wait: `document.activeElement === document.getElementById('input-dest-query')` },
      { type: `document.getElementById('input-dest-query')`, text: 'Campus', clear: true, next: `css('#input-dest-query ~ div button')` },
      { enter: true, wait: answerFigure },
    ],
    answer: answerFigure,
  },
  {
    task: 'a trip',
    entry: 'route tab, a quick destination',
    start: {},
    steps: [tab('T.nav.plan'), { tap: `all().filter(shown).find((b) => b.getAttribute('aria-pressed') !== null && b.textContent.trim() === 'Campus USC')`, options: `[...document.querySelectorAll('main .chip-rail button')].filter(shown)`, wait: answerFigure }],
    answer: answerFigure,
    reload: true,
  },
  {
    task: 'a trip',
    entry: 'route tab, a recent route',
    start: { stored: REGULAR },
    steps: [tab('T.nav.plan'), { tap: `[...document.querySelectorAll('main button')].find((b) => shown(b) && b.textContent.includes('Praza Maior') && b.textContent.includes('HULA'))`, wait: answerFigure }],
    answer: answerFigure,
  },
  {
    task: 'a trip',
    entry: 'route tab, from where I am',
    start: { geo: 'granted', at: [HOME.lat, HOME.lng] },
    steps: [tab('T.nav.plan'), { tap: `labelled(T.planner.useMyLocation)`, wait: answerFigure }],
    answer: answerFigure,
  },
  {
    task: 'a trip',
    entry: 'search, a place',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: 'catedral', next: `css('header .z-results button')`, wait: `css('header .z-results button')` },
      { tap: `[...document.querySelectorAll('header .z-results button')].filter(shown).find((b) => b.querySelector('svg.lucide-landmark'))`, options: `[...document.querySelectorAll('header .z-results button')].filter(shown)`, wait: answerFigure },
    ],
    answer: answerFigure,
  },
  {
    task: 'a trip',
    entry: 'answer, a stop on it, and back',
    start: {},
    steps: [
      tab('T.nav.plan'),
      { tap: `all().filter(shown).find((b) => b.getAttribute('aria-pressed') !== null && b.textContent.trim() === 'Campus USC')`, wait: answerFigure },
    ],
    answer: answerFigure,
    away: { tab: 'T.nav.stops', still: answerFigure, what: 'the planned trip' },
  },

  /* --- On the bus --- */
  {
    task: 'follow the ride',
    entry: 'a planned trip',
    start: { geo: 'granted', at: [HOME.lat, HOME.lng] },
    steps: [
      tab('T.nav.plan'),
      { tap: `all().filter(shown).find((b) => b.getAttribute('aria-pressed') !== null && b.textContent.trim() === 'Campus USC')`, wait: answerFigure },
      { tap: `all().filter(shown).find((b) => b.textContent.trim() === T.companion.start)`, wait: `document.querySelector('main ol')`, stack: 'collapse' },
    ],
    // Where to get on, and when: the first card, which the ride screen opens on.
    answer: `[...document.querySelectorAll('main .card .tnum')].find(shown)`,
    reload: true,
  },

  /* --- The map --- */
  {
    task: 'the map, one line',
    entry: 'map tab',
    start: {},
    steps: [
      tab('T.nav.map'),
      { tap: `saying(T.map.controls)`, wait: `css('[role=dialog][aria-modal=true]')` },
      { tap: `[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].find((b) => shown(b) && b.textContent.includes(T.at.line0))`, options: `[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].filter(shown)`, wait: `!css('[role=dialog][aria-modal=true]')` },
    ],
    answer: `css('.leaflet-container')`,
  },
  {
    task: 'the map, where am I',
    entry: 'map tab, location refused',
    start: { geo: 'denied' },
    steps: [tab('T.nav.map'), { tap: `labelled(T.map.myLocation)`, wait: `!labelled(T.map.locating)` }],
    answer: `[...document.querySelectorAll('[role=alert]')].find((e) => shown(e) && e.textContent.trim())`,
  },
  {
    task: 'the map, where am I',
    entry: 'map tab, location allowed, at the stop',
    // 30 m north of the pole, a fix a phone gives in a street. The dot for the position has to
    // be there, and a tap on it is the stop's, the one thing there to open: the map opened
    // with no dot at all, and the dot, under the stops or over them as they were last redrawn,
    // took a tap for a popup of its own when it was over.
    start: { geo: 'granted', at: [HOME.lat + 30 / 111_320, HOME.lng] },
    steps: [
      tab('T.nav.map'),
      { tap: `labelled(T.map.stopFollowing) ? null : labelled(T.map.myLocation)`, optional: true, wait: `labelled(T.map.stopFollowing)` },
      { wait: `labelled(T.map.stopFollowing) && new Promise((r) => setTimeout(() => r(true), 900))`, note: 'the map flies to the position' },
      { tapMap: 'me', wait: `css('[role=dialog][aria-modal=true]')` },
    ],
    answer: `[...document.querySelectorAll('[role=dialog][aria-modal=true]')].find((d) => d.getAttribute('aria-label') === T.at.home)`,
  },
  {
    task: 'the map, where am I',
    entry: 'map tab during a ride',
    // The ride already reads the position, and a reader joining that watch is handed its last
    // fix at once: before the map had re-rendered with its instance, and that fix, the only
    // one a phone standing still gives, drew nothing.
    start: { geo: 'granted', at: [HOME.lat + 30 / 111_320, HOME.lng] },
    steps: [
      tab('T.nav.plan'),
      { tap: `all().filter(shown).find((b) => b.getAttribute('aria-pressed') !== null && b.textContent.trim() === 'Campus USC')`, wait: answerFigure },
      { tap: `all().filter(shown).find((b) => b.textContent.trim() === T.companion.start)`, wait: `document.querySelector('main ol')`, stack: 'collapse' },
      tab('T.nav.map'),
      { tap: `labelled(T.map.stopFollowing) ? null : labelled(T.map.myLocation)`, optional: true, wait: `labelled(T.map.stopFollowing)` },
      { wait: `labelled(T.map.stopFollowing) && new Promise((r) => setTimeout(() => r(true), 900))`, note: 'the map flies to the position' },
      { tapMap: 'me', wait: `css('[role=dialog][aria-modal=true]')` },
    ],
    answer: `[...document.querySelectorAll('[role=dialog][aria-modal=true]')].find((d) => d.getAttribute('aria-label') === T.at.home)`,
  },
  {
    task: 'the map, where am I',
    entry: 'map tab, location allowed, at one of two poles across a street',
    // Standing at the pole drawn first: the finger lands on it and inside its partner's reach
    // too, and Leaflet hands such a tap to whichever was drawn last, the other side's.
    start: { geo: 'granted', at: [ACROSS.lat, ACROSS.lng] },
    steps: [
      tab('T.nav.map'),
      { tap: `labelled(T.map.stopFollowing) ? null : labelled(T.map.myLocation)`, optional: true, wait: `labelled(T.map.stopFollowing)` },
      { wait: `labelled(T.map.stopFollowing) && new Promise((r) => setTimeout(() => r(true), 900))`, note: 'the map flies to the position' },
      { tapMap: 'me', wait: `css('[role=dialog][aria-modal=true]')` },
    ],
    answer: `[...document.querySelectorAll('[role=dialog][aria-modal=true]')].find((d) => d.getAttribute('aria-label') === T.at.across)`,
  },
  {
    task: 'a stop on the map',
    entry: 'board, location allowed, a kilometre away',
    // The map opens on the stop asked for, and a finger that misses it by 18 px still opens
    // it. Once the position drew, its first fix took the map a kilometre from the stop; the
    // miss opened the lines there; and with a reach, the stop's name, opened above it by the
    // finger, took the tap for those lines.
    start: { stored: REGULAR, geo: 'granted', at: [HOME.lat + 1000 / 111_320, HOME.lng], fixMs: 1500, motion: true },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `labelled(T.arrivals.map)`, stack: 'push', wait: `css('.leaflet-container') && new Promise((r) => setTimeout(() => r(true), 3000))` },
      { tapAt: [0, -18], wait: `css('[role=dialog][aria-modal=true]')` },
    ],
    answer: `[...document.querySelectorAll('[role=dialog][aria-modal=true]')].find((d) => d.getAttribute('aria-label') === T.at.home)`,
  },

  /* --- Be told, keep, share --- */
  {
    task: 'warn me before the bus',
    entry: 'board',
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `[...document.querySelectorAll('main ul li button[aria-pressed="false"]')].find((b) => shown(b) && b.querySelector('svg.lucide-bell'))`, wait: `all().filter(shown).find((b) => b.getAttribute('aria-label') === T.arrivals.watchOn)` },
    ],
    answer: `all().filter(shown).find((b) => b.getAttribute('aria-label') === T.arrivals.watchOn)`,
    away: { tab: 'T.nav.lines', still: `all().filter(shown).find((b) => b.getAttribute('aria-label') === T.arrivals.watchOn)`, what: 'the warning set on a departure' },
  },
  {
    task: 'save a stop',
    entry: 'search, then the star',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: 'sindicatos', wait: `css('header .z-results button')` },
      { tap: `[...document.querySelectorAll('header .z-results button')].find((b) => shown(b) && b.textContent.includes(T.at.home))`, wait: board },
      { tap: `labelled(T.arrivals.fav)`, wait: `labelled(T.arrivals.unfav)` },
    ],
    answer: `labelled(T.arrivals.unfav)`,
  },
  {
    task: 'share a stop',
    entry: 'board',
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      // "Share" where the browser has a share sheet and a finger, "Copy link" where it has not
      // (useShareLink). The system's sheet is no page to look at, so the API is answered at its
      // edge: what reaches it is the link, and the link has to open this stop.
      {
        tap: `((navigator.share && (navigator.share = (data) => { window.__shared = data && data.url; return Promise.resolve(); })), labelled(T.arrivals.shareSheet) || labelled(T.arrivals.share))`,
        wait: `window.__shared || labelled(T.arrivals.copied) || [...document.querySelectorAll('main .select-all')].find(shown)`,
      },
    ],
    answer: `(window.__shared && window.__shared.includes('?parada=') && labelled(T.arrivals.shareSheet)) || labelled(T.arrivals.copied) || [...document.querySelectorAll('main .select-all')].find(shown)`,
  },
  {
    task: 'departures at another time',
    entry: 'board',
    start: { stored: REGULAR },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `saying(T.arrivals.atTimeSummary)`, wait: `css('main input[type=time]')` },
    ],
    answer: `css('main input[type=time]')`,
  },

  /* --- Notices, fares, settings --- */
  {
    task: 'service notices',
    entry: 'menu',
    start: {},
    steps: [tab('T.nav.lines'), { tap: `labelled(T.menu.open)`, wait: `css('[role=dialog][aria-modal=true]')` }, { tap: `all().filter(shown).find((a) => a.closest('[role=dialog]') && (a.getAttribute('aria-label') || a.textContent || '').includes(T.menu.alerts))`, wait: `!css('[role=dialog][aria-modal=true]') && document.getElementById('sync-alerts-btn')` }],
    answer: `document.getElementById('sync-alerts-btn')`,
  },
  {
    task: 'service notices',
    entry: 'a stop’s notice',
    notice: true,
    start: { stored: { ...REGULAR, urbanos_lugo_fav_stops: JSON.stringify([busiest.find((s) => s.lines.includes(BUS_LINES.find((l) => l.number === '1.2')?.id ?? ''))?.id ?? HOME.id]) } },
    steps: [
      { tap: `[...document.querySelectorAll('main ul li button')].find(shown)`, wait: board },
      { tap: `[...document.querySelectorAll('main details.border-warn > summary')].find(shown)`, wait: `saying(T.lines.seeFullNotice)` },
      { tap: `saying(T.lines.seeFullNotice)`, wait: `document.getElementById('sync-alerts-btn')` },
    ],
    answer: `document.getElementById('sync-alerts-btn')`,
  },
  {
    task: 'first bus, at night',
    entry: 'night banner',
    start: { night: true },
    steps: [{ tap: `[...document.querySelectorAll('button')].find((b) => shown(b) && b.querySelector('svg.lucide-moon'))`, wait: `document.getElementById('sync-alerts-btn')` }],
    answer: `document.getElementById('sync-alerts-btn')`,
  },
  {
    task: 'fares',
    entry: 'menu',
    start: {},
    steps: [{ tap: `labelled(T.menu.open)`, wait: `css('[role=dialog][aria-modal=true]')` }, { tap: `all().filter(shown).find((a) => a.closest('[role=dialog]') && (a.getAttribute('aria-label') || a.textContent).includes(T.menu.fares))`, wait: `!css('[role=dialog][aria-modal=true]')` }],
    answer: `[...document.querySelectorAll('main h2, main h3')].find(shown)`,
  },
  {
    task: 'fares',
    entry: 'search',
    start: {},
    steps: [
      { type: `document.getElementById('site-search')`, text: { gl: 'tarifas', es: 'tarifas', en: 'fares' }, wait: `css('header .z-results button')` },
      { tap: `[...document.querySelectorAll('header .z-results button')].find((b) => shown(b) && b.textContent.includes(T.menu.fares))`, wait: `!css('header .z-results')` },
    ],
    answer: `[...document.querySelectorAll('main h2, main h3')].find(shown)`,
  },
  {
    task: 'language',
    entry: 'menu',
    relabels: true,
    start: {},
    steps: [{ tap: `labelled(T.menu.open)`, wait: `css('[role=dialog][aria-modal=true]')` }, { tap: `all().filter(shown).find((b) => b.closest('[role=dialog]') && b.textContent.trim() === 'EN')`, wait: `document.documentElement.lang === 'en'` }],
    answer: `css('[role=dialog][aria-modal=true]')`,
  },
];

/* ------------------------------------------------------------------------------------- */
/* In the page                                                                           */
/* ------------------------------------------------------------------------------------- */

const HELP = `${REACH}
  // Inside a closed <details> a control still has boxes in Chrome, laid over what is drawn there.
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !(e.closest('details:not([open])') && !e.closest('summary'));
  const labelled = (t) => all().filter(shown).find((e) => (e.getAttribute('aria-label') || '').toLowerCase().startsWith(t.toLowerCase()));
  const saying = (t) => all().filter(shown).find((e) => ((e.textContent || '').trim() + ' ' + (e.getAttribute('aria-label') || '')).toLowerCase().includes(t.toLowerCase()));
  const css = (sel) => [...document.querySelectorAll(sel)].find(shown);
  // An entrance still running on it or around it, as the eye waits for it to land: a rise moves the
  // box 6 px, a sheet comes up from below its own height, and the first frame is drawn at the start
  // even under reduced motion; on a page short of frames (CI's runner) that frame is all there is.
  const arriving = (el) => { for (let n = el; n; n = n.parentElement) for (const a of n.getAnimations()) { const end = a.effect && a.effect.getComputedTiming().endTime; if (a.playState === 'running' && Number.isFinite(end)) return true; } return false; };
  const landed = async (el) => { for (const until = performance.now() + 1500; arriving(el) && performance.now() < until; ) await pause(50); };
  const tabLink = (name) => [...document.querySelectorAll('nav a')].find((a) => shown(a) && a.textContent.trim() === name);
  /** Where the reader is: the tab, the heading, the dialog, the search's rows, the fields shown, the scroll. */
  const screenNow = () => {
    const main = document.querySelector('main');
    const on = [...document.querySelectorAll('nav a[aria-current=page]')].find(shown);
    const dialog = [...document.querySelectorAll('[role=dialog][aria-modal=true]')].find(shown);
    // On the screen, not in a sheet slid off it: the map's closed sheet keeps a heading Chrome calls visible.
    const slidOff = (e) => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') { const r = n.getBoundingClientRect(); return r.top >= innerHeight - 1 || r.bottom <= 1; } return false; };
    const headings = main ? [...main.querySelectorAll('h2')].filter((h) => shown(h) && !slidOff(h) && !h.closest('[role=dialog]')) : [];
    // A screen whose only heading is for the ear, the planner's form and the ride, is named by it.
    const heading = headings.find((h) => !h.classList.contains('sr-only')) ?? headings[0];
    // The words a screen is asked with, not a time field opened inside it.
    const fields = [...document.querySelectorAll('main input')].filter((f) => shown(f) && (f.type === 'text' || f.type === 'search') && !f.closest('details'));
    return {
      tab: on ? [...document.querySelectorAll('nav a')].filter(shown).indexOf(on) + ':' + on.textContent.trim() : '-',
      heading: heading ? heading.textContent.trim().slice(0, 48) : '-',
      dialog: dialog ? (dialog.getAttribute('aria-label') || 'dialog') : '',
      results: !!css('header .z-results'),
      fields: fields.map((f) => f.id || f.type).join(','),
      values: fields.map((f) => f.id).map((id) => (document.getElementById(id) || {}).value || '').join('|'),
      scroll: main ? Math.round(main.scrollTop) : 0,
      url: location.pathname + location.search,
      // For a back finding only: the app's own record of the step, the planner's form folded or not, and work in progress.
      app: [history.state && history.state.trip ? 'trip' + (history.state.over ? ' over' : '') : 'no trip', document.querySelector('main .fold-clear.fold-closed') ? 'form folded' : 'form open', document.querySelector('[aria-busy="true"]') ? 'busy' : 'idle', [...document.querySelectorAll('main .figure')].filter(shown).length + ' figures'].join(', '),
    };
  };
`;

/** Finds the element, brings it into the part of its scroller the screen shows, and says where it is. */
const LOCATE = `async function (T, expr, keyboard) {${HELP}
  const el = await (async () => (${'${expr}'}))();
  if (!el || el === true) return null;
  await landed(el);
  // Every box between it and the screen that scrolls: a list inside a sheet scrolls, and so does the sheet.
  const scrollers = [];
  for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if (/(auto|scroll)/.test(o) && n.scrollHeight > n.clientHeight + 1) scrollers.push(n); }
  let moved = 0;
  const seen = () => { const r = el.getBoundingClientRect(); let top = 0, bottom = innerHeight - keyboard; for (const s of scrollers) { const b = s.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); } return r.top >= top - 1 && r.bottom <= bottom + 1; };
  if (!seen()) {
    const before = scrollers.map((s) => s.scrollTop);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    moved = scrollers.reduce((sum, s, i) => sum + Math.abs(s.scrollTop - before[i]), 0);
    await pause(250);
  }
  window.__jt = el;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, moved, view: scrollers[0] ? scrollers[0].clientHeight : innerHeight,
    label: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40) };
}`;

/**
 * The dots nearest the middle of the map, in CSS pixels: discs of a colour on Leaflet's
 * canvas, a stop's or the reader's own, clear of the chips along the top and the buttons
 * along the bottom.
 */
const dotsOf = (token: '--c-map-stop' | '--c-map-me') => `(() => {
  const map = [...document.querySelectorAll('.leaflet-container')].find((e) => e.getBoundingClientRect().width > 250);
  // The reader's position has a pane of its own, over the canvas the stops are drawn on; it was drawn on that one.
  const canvases = map ? [...map.querySelectorAll('.leaflet-overlay-pane canvas, .leaflet-reader-pane canvas')] : [];
  if (!canvases.length) return [];
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('${token}').trim();
  probe.fillRect(0, 0, 1, 1);
  const [fr, fg, fb] = probe.getImageData(0, 0, 1, 1).data;
  // The part of the map on screen: turned sideways, the map is a card taller than the gap between the bars.
  const whole = map.getBoundingClientRect(), view = document.querySelector('main').getBoundingClientRect();
  const area = { left: whole.left, right: whole.right, top: Math.max(whole.top, view.top), bottom: Math.min(whole.bottom, view.bottom) };
  area.width = area.right - area.left;
  area.height = area.bottom - area.top;
  const read = canvases.map((canvas) => { const box = canvas.getBoundingClientRect(); return { canvas, box, k: canvas.width / box.width, data: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data }; });
  const isStop = (x, y) => read.some(({ canvas, box, k, data }) => { const cx = Math.round((x - box.left) * k), cy = Math.round((y - box.top) * k); if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return false; const i = (cy * canvas.width + cx) * 4; return data[i + 3] > 200 && Math.abs(data[i] - fr) < 14 && Math.abs(data[i + 1] - fg) < 14 && Math.abs(data[i + 2] - fb) < 14; });
  const mid = { x: area.left + area.width / 2, y: area.top + area.height / 2 };
  const found = [];
  // Clear of the chips and the buttons, which take a fixed share of a short map turned sideways.
  for (let y = area.top + Math.min(80, area.height * 0.25); y < area.bottom - Math.min(120, area.height * 0.3); y += 2) for (let x = area.left + 24; x < area.right - 24; x += 2) {
    if (!(isStop(x, y) && isStop(x + 2, y) && isStop(x - 2, y) && isStop(x, y + 2) && isStop(x, y - 2))) continue;
    // A dot the finger can reach: not under a chip or a button floating over the map.
    const hit = document.elementFromPoint(x, y);
    if (!hit || !map.contains(hit) || hit.closest('button, a')) continue;
    // One point a dot, its first: the scan meets each disc on several rows.
    if (!found.some((f) => Math.hypot(f.x - x, f.y - y) < 12)) found.push({ x, y: y + 2, d: Math.hypot(x - mid.x, y - mid.y) });
  }
  return found.sort((a, b) => a.d - b.d).slice(0, 4).map(({ x, y }) => ({ x, y }));
})()`;
export const STOP_DOT = dotsOf('--c-map-stop');

/** What is at the point the finger lands, and where the found element is now. */
const AT_POINT = `function (x, y) {
  const el = window.__jt; if (!el) return { gone: true };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(x, y);
  const ok = !!hit && (el.contains(hit) || hit.contains(el) || (hit.closest('label') && hit.closest('label').contains(el)));
  const who = hit ? (hit.getAttribute('aria-label') || hit.textContent || hit.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40) : 'nothing';
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, covered: ok ? null : who };
}`;

/**
 * A fold that closes, looked at the moment it does: nothing inside it still to see. Under reduced
 * motion every element took a 0.01 ms transition, so the fields of a closing fold eased out of
 * sight on their own, and a page short of frames (CI's runner, four of them at once) kept the
 * planner's form on screen under its answer, its fields there for a reader and for this harness.
 */
const FOLDS = `(() => {
  window.__foldLeaks = [];
  const seen = 'input, button, a, h2';
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (!el.classList || !el.classList.contains('fold-closed') || (r.oldValue || '').includes('fold-closed')) continue;
      const inside = [...el.querySelectorAll(seen)];
      const still = inside.filter((d) => getComputedStyle(d).visibility !== 'hidden');
      if (still.length) window.__foldLeaks.push(still.length + ' of ' + inside.length);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})()`;

/**
 * Where each control a tap brought is laid out in every frame drawn after it: its offset in
 * the page, which neither a transform nor a scroll moves. A control first drawn in one place
 * and then settled in another jumped under the eye, however short the first frame was; the
 * check of the tap itself, a quarter of a second, saw a frame of 100 ms only by luck. Controls
 * on screen before the tap are left out: a screen opening moves what it covers.
 */
const FRAMES = `(() => {
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const shown = () => {
    const by = new Map();
    for (const el of document.querySelectorAll('button, a[href], input, summary, [role=button], [role=link]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const l = label(el);
      // Two controls saying the same are not told apart: neither is followed.
      by.set(l, by.has(l) ? null : el);
    }
    return by;
  };
  let round = 0;
  window.__laidOut = (el) => { let x = 0, y = 0; for (let n = el; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
  window.__watchFrames = () => {
    const mine = ++round, before = new Set(shown().keys()), drawn = new Map(), until = performance.now() + 4000;
    window.__drawn = drawn;
    const frame = () => {
      if (mine !== round || performance.now() > until) return;
      for (const [l, el] of shown()) {
        if (!el || before.has(l)) continue;
        const [x, y] = window.__laidOut(el), seen = drawn.get(l) || [], last = seen[seen.length - 1];
        if (!last || last[0] !== x || last[1] !== y) seen.push([x, y]);
        drawn.set(l, seen);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
})()`;

/** A field's keyboard: its attributes, and where it and the next thing land with a keyboard over the bottom of the screen. */
const KEYS = `function (keyboard, wanted) {
  const f = window.__jt;
  const next = wanted ? window.__jn : null;
  const r = f.getBoundingClientRect();
  const limit = innerHeight - keyboard;
  // The browser brings the field just above the keyboard, and everything in its scroller with it.
  const lift = Math.max(0, r.bottom + 8 - limit);
  const field = { top: r.top - lift, bottom: r.bottom - lift };
  let ahead = null;
  if (next) {
    const n = next.getBoundingClientRect();
    const fixed = getComputedStyle(next).position === 'fixed' || !!next.closest('header');
    const t = n.top - (fixed ? 0 : lift), b = n.bottom - (fixed ? 0 : lift);
    ahead = { label: (next.getAttribute('aria-label') || next.textContent || '').trim().slice(0, 30), covered: Math.max(0, Math.round(Math.min(b, innerHeight) - Math.max(t, limit))), height: Math.round(n.height), offTop: Math.round(Math.max(0, -t)) };
  }
  return {
    attrs: { type: f.type, inputMode: f.inputMode || '', enterKeyHint: f.enterKeyHint || '', autocapitalize: f.getAttribute('autocapitalize') || '', autocomplete: f.getAttribute('autocomplete') || '', autocorrect: f.getAttribute('autocorrect') || '', spellcheck: f.getAttribute('spellcheck') || '' },
    fieldHidden: field.top < 0 || field.bottom > limit,
    ahead,
  };
}`;

/* ------------------------------------------------------------------------------------- */
/* Running one                                                                           */
/* ------------------------------------------------------------------------------------- */

interface Screen {
  tab: string;
  heading: string;
  dialog: string;
  results: boolean;
  fields: string;
  values: string;
  scroll: number;
  url: string;
  app: string;
}
const same =(a: Screen, b: Screen) => a.tab.split(':')[0] === b.tab.split(':')[0] && a.heading === b.heading && a.dialog === b.dialog && a.results === b.results && a.fields === b.fields;
/** The same place in another language: the tab by its position, and whether a dialog is up. */
const sameAnyLang = (a: Screen, b: Screen) => a.tab.split(':')[0] === b.tab.split(':')[0] && !!a.dialog === !!b.dialog && a.results === b.results && a.fields === b.fields;
const layered = (s: Screen) => !!s.dialog || s.results;
const name = (s: Screen) => [s.tab, s.heading, s.dialog && `[${s.dialog}]`, s.results && '[results]', s.fields && `{${s.fields}}`].filter(Boolean).join(' · ');

export interface Run {
  journey: string;
  phone: Phone;
  lang: Lang;
  /** turned, offline, text200, or nothing. */
  variant: string;
  taps: number;
  keys: number;
  scrolls: number;
  decisions: number;
  options: number;
  screens: number;
  appMs: number;
  worstMs: number;
  zones: { easy: number; stretch: number; hard: number };
  small: string[];
  answerTop: number | null;
  findings: Finding[];
}

const label = (j: Journey) => `${j.task} · ${j.entry}`;

async function stepWait(page: Session, T: object, expr: string | undefined, ms = 8000): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  if (!expr) {
    await sleep(350);
    return { ok: true, ms: 0 };
  }
  const deadline = t0 + ms;
  while (Date.now() < deadline) {
    const got = await page.call<boolean>(`async function (T) {${HELP} return !!(await (async () => (${expr}))()); }`, T).catch(() => false);
    if (got) return { ok: true, ms: Date.now() - t0 };
    await sleep(30);
  }
  return { ok: false, ms: Date.now() - t0 };
}

/** The finger: a touch down and up at the point given, which Chrome turns into the tap and the click. synthesizeTapGesture clicked nothing here. */
async function touch(page: Session, x: number, y: number): Promise<void> {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** What a run left installed in its page for the next one to take out: the 200 % text. */
const undo = new WeakMap<Worker, () => Promise<void>>();

/** How a pass holds the phone and what the network does: turned sideways, the notices' server offline. */
interface Held {
  turned?: boolean;
  api?: Worker['api'];
}

async function open(w: Worker, j: Journey, phone: Phone, lang: Lang, theme: 'light' | 'dark', text200: boolean, held: Held = {}): Promise<boolean> {
  const { page } = w;
  w.api = held.api ?? 'incidents';
  w.logged.length = w.thrown.length = w.agora = 0;
  const metrics = PHONES[phone];
  await page.send('Emulation.setDeviceMetricsOverride', held.turned ? { ...metrics, width: metrics.height, height: metrics.width } : metrics);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setTimezoneOverride', { timezoneId: PHONE_ZONE });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: j.start.motion ? 'no-preference' : 'reduce' }] });
  const prepared = {
    clock: j.start.night ? NIGHT : DAY,
    stored: { ...(j.start.stored ?? {}), 'urbanos-lugo-lang': lang, 'urbanos-lugo-theme': theme },
    geo: j.start.geo ?? 'none',
    at: j.start.at ?? [43.0125, -7.5558],
    fixMs: j.start.fixMs,
  };
  await page.goto('about:blank');
  await page.evaluate(`window.name = ''`);
  await page.goto(`${process.env.BASE ?? 'http://localhost:3002'}/${j.start.path ?? ''}${j.start.query ?? ''}#audit=${encodeURIComponent(JSON.stringify(prepared))}`);
  try {
    await page.waitFor('document.querySelector("main h1")', 15_000);
  } catch {
    return false;
  }
  // As the phone's own setting: on every document of the run, a reload's included.
  if (text200) {
    await page.evaluate(`document.documentElement.style.fontSize = '200%'`);
    // At the first readystatechange: the parser has made <html> by then, and the app's module has not run.
    const { identifier } = await page.onNewDocument(`document.addEventListener('readystatechange', () => { document.documentElement.style.fontSize = '200%'; }, { once: true })`);
    undo.set(w, () => page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).then(() => undefined));
  }
  // The document the journey runs in: a back that loads another one has left the app, however briefly.
  await page.evaluate(`window.__journeyDoc = true`);
  if (process.env.NO_ANCHOR) await page.evaluate(`document.querySelector('main').style.overflowAnchor = 'none'`);
  await sleep(900);
  return true;
}

export async function runJourney(w: Worker, j: Journey, phone: Phone, lang: Lang, opts: { theme?: 'light' | 'dark'; text200?: boolean; back?: boolean } & Held = {}): Promise<Run> {
  const { page } = w;
  const T = { ...JSON.parse(JSON.stringify(DICT[lang])), at: AT } as object;
  const H = opts.turned ? PHONES[phone].width : PHONES[phone].height;
  const where = `${label(j)} · ${phone}${opts.turned ? ' · turned' : ''}${opts.api === 'offline' ? ' · offline' : ''}${opts.text200 ? ' · text 200 %' : ''}${lang === 'gl' ? '' : ` · ${lang}`}`;
  const run: Run = { journey: label(j), phone, lang, variant: [opts.turned && 'turned', opts.api === 'offline' && 'offline', opts.text200 && 'text200'].filter(Boolean).join(','), taps: 0, keys: 0, scrolls: 0, decisions: 0, options: 0, screens: 1, appMs: 0, worstMs: 0, zones: { easy: 0, stretch: 0, hard: 0 }, small: [], answerTop: null, findings: [] };
  const flow = (detail: string) => run.findings.push({ kind: 'flow', where, detail });
  const backFinding = (detail: string) => run.findings.push({ kind: 'back', where, detail });
  const thumb = (detail: string) => run.findings.push({ kind: 'thumb', where, detail });

  if (!(await open(w, j, phone, lang, opts.theme ?? 'light', !!opts.text200, opts))) {
    flow('the app never drew');
    return run;
  }
  const snap = () => page.call<Screen>(`function () {${HELP} return screenNow(); }`);
  const alike = j.relabels ? sameAnyLang : same;
  /** JOURNEY_SHOTS=dir: a photograph after every step, for the report's before and after. */
  const shoot = async (step: string) => {
    if (!process.env.JOURNEY_SHOTS) return;
    mkdirSync(process.env.JOURNEY_SHOTS, { recursive: true });
    const { data } = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    const slug = `${label(j)} ${phone} ${lang}${opts.text200 ? ' t200' : ''} ${step}`.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    writeFileSync(path.join(process.env.JOURNEY_SHOTS, `${slug}.png`), Buffer.from(data, 'base64'));
  };
  await shoot('0');
  const stack: Screen[] = [await snap()];
  const seen = new Set([name(stack[0])]);
  const interaction = async () => {
    const events = await page.evaluate<[string, number, number, number][]>(`(window.__probe && window.__probe.events.splice(0)) || []`).catch(() => []);
    return events.filter(([n]) => /pointer|click|key|touch/.test(n)).reduce((m, [, , d]) => Math.max(m, d), 0);
  };

  /** Find, bring into view, check what is under the finger, tap. Returns the label, or null if there was nothing to tap. */
  const tapOn = async (expr: string, keyboard = 0): Promise<string | null> => {
    // A reader waits for what they are looking for to appear; so does this, a second and a half.
    type Located = { x: number; y: number; w: number; h: number; moved: number; view: number; label: string };
    let at = null as Located | null;
    for (const end = Date.now() + 1500; !at && Date.now() < end; await sleep(100)) at = await page.call<Located | null>(LOCATE.replace('${expr}', () => expr), T, expr, keyboard);
    if (!at) return null;
    if (at.moved) run.scrolls += Math.max(1, Math.ceil(Math.abs(at.moved) / (at.view * 0.6)));
    await sleep(250);
    const now = await page.call<{ gone?: boolean; x: number; y: number; covered: string | null }>(AT_POINT, at.x, at.y);
    if (now.gone) return null;
    if (Math.hypot(now.x - at.x, now.y - at.y) > 4) flow(`"${at.label}" moved ${Math.round(Math.hypot(now.x - at.x, now.y - at.y))} px between being seen and being tapped`);
    if (now.covered) flow(`"${at.label}" is under "${now.covered}" where the finger lands`);
    const drewElsewhere = await page.call<number>(`function (label) { const el = window.__jt, seen = window.__drawn && window.__drawn.get(label); if (!el || !seen || !window.__laidOut) return 0; const [x, y] = window.__laidOut(el); return Math.round(Math.max(...seen.map(([sx, sy]) => Math.hypot(sx - x, sy - y)))); }`, at.label);
    if (drewElsewhere > 4) flow(`"${at.label}" was drawn ${drewElsewhere} px from where it came to rest, before the finger got to it`);
    const zone = now.y < H * 0.25 ? 'hard' : now.y < H * 0.5 ? 'stretch' : 'easy';
    run.zones[zone]++;
    if (zone === 'hard') thumb(`"${at.label}" is tapped in the top quarter of the screen, at ${Math.round(now.y)} of ${H} px`);
    if (Math.min(at.w, at.h) < 44) run.small.push(`${at.label} ${Math.round(at.w)}×${Math.round(at.h)}`);
    await page.evaluate(`window.__probe && (window.__probe.events.length = 0)`).catch(() => undefined);
    if (process.env.SCROLL_LOG) await page.evaluate(`(() => { const m = document.querySelector('main'); window.__sl = []; const t0 = performance.now(); if (!window.__slOn) { window.__slOn = 1; m.addEventListener('scroll', () => window.__sl.push(Math.round(performance.now() - t0) + 'ms ' + Math.round(m.scrollTop) + ' active=' + (document.activeElement && (document.activeElement.id || document.activeElement.tagName + '.' + String(document.activeElement.className).slice(0, 30)))), { passive: true }); } })()`);
    // Where the screen was scrolled when the finger left it, the reach for this tap included.
    scrolledAtTap = await page.evaluate<number>(`Math.round(document.querySelector('main').scrollTop)`);
    await page.evaluate(`window.__watchFrames && window.__watchFrames()`);
    await touch(page, now.x, now.y);
    run.taps++;
    return at.label;
  };
  let scrolledAtTap: number | null = null;

  for (const [i, step] of j.steps.entries()) {
    const before = await snap();
    scrolledAtTap = null;
    await page.evaluate(`window.__leftAt = null`);
    if (process.env.JOURNEY_DEBUG) console.log(`    ${where} before step ${i + 1}: ${name(before)} history ${await page.evaluate('history.length + JSON.stringify(history.state)')}`);
    stack[stack.length - 1] = before;
    if ('tap' in step) {
      if (step.options) {
        const n = await page.call<number>(`async function (T) {${HELP} const o = await (async () => (${step.options}))(); return o ? o.length : 0; }`, T);
        if (n > 1) {
          run.decisions++;
          run.options += n;
        }
      }
      const tapped = await tapOn(step.tap);
      if (!tapped && step.optional) continue;
      if (!tapped) {
        flow(`step ${i + 1}: nothing to tap (${step.tap.slice(0, 70)})`);
        break;
      }
    } else if ('type' in step) {
      const keyboard = Math.round(H * KEYBOARD);
      // A field the keyboard's own key has just moved to needs no tap.
      const already = await page.call<string | null>(`async function (T) {${HELP} const f = await (async () => (${step.type}))(); if (!f || document.activeElement !== f) return null; window.__jt = f; return f.id || 'field'; }`, T);
      const tapped = already ?? (await tapOn(step.type));
      if (!tapped) {
        flow(`step ${i + 1}: no field to type in`);
        break;
      }
      await sleep(150);
      if (step.clear) {
        // Emptied a backspace a letter, unless the field came in with all of it selected, and
        // what is typed replaces it.
        const { length, selected } = await page.evaluate<{ length: number; selected: boolean }>(`(() => { const f = window.__jt; return { length: f.value.length, selected: f.value.length > 0 && f.selectionStart === 0 && f.selectionEnd === f.value.length }; })()`);
        if (!selected) {
          await page.call(`function () {${HELP} fill(window.__jt, ''); }`);
          run.keys += length;
        }
      }
      const text = typeof step.text === 'string' ? step.text : (step.text[lang] ?? step.text.gl);
      for (const ch of text) {
        await page.send('Input.insertText', { text: ch });
        run.keys++;
        await sleep(40);
      }
      // Rows that move while letters go in are the typing's; what moves after the last one is not.
      await page.evaluate(`window.__watchFrames && window.__watchFrames()`);
      // What was typed is what the field holds, in a field the eye can read it in.
      const held = await page.evaluate<{ value: string; width: number }>(`({ value: window.__jt.value, width: Math.round(window.__jt.getBoundingClientRect().width) })`);
      if (!held.value.includes(text)) flow(`typing "${text}" into "${tapped}" gives "${held.value}"`);
      if (held.width < 48) flow(`the field "${tapped}" is ${held.width} px wide while it is typed in`);
      await stepWait(page, T, step.wait);
      if (step.next) await page.call(`async function (T) {${HELP} window.__jn = (await (async () => (${step.next}))()) || null; }`, T);
      const got = await page.call<{ attrs: Record<string, string>; fieldHidden: boolean; ahead: { label: string; covered: number; height: number; offTop: number } | null }>(KEYS, keyboard, !!step.next);
      if (got) {
        if (got.fieldHidden) thumb(`the field "${tapped}" is under the keyboard or above the screen while it is typed in`);
        if (got.ahead && (got.ahead.covered > 0 || got.ahead.offTop > 0)) thumb(`with the keyboard up, "${got.ahead.label}" is ${got.ahead.covered ? `${got.ahead.covered} of ${got.ahead.height} px under the keyboard` : `${got.ahead.offTop} px above the screen`}`);
        if (step.next && !got.ahead) thumb(`with the keyboard up there is no "${step.next.slice(0, 40)}" at all`);
        const a = got.attrs;
        if (!a.enterKeyHint && a.type !== 'search') thumb(`the field "${tapped}" shows the plain return key: no enterkeyhint, not type=search`);
        if (a.autocorrect !== 'off' || a.spellcheck !== 'false') thumb(`the field "${tapped}" lets the keyboard correct what is typed (autocorrect "${a.autocorrect || 'default'}", spellcheck "${a.spellcheck || 'default'}"): a stop's name or a pole's code is not a word`);
        if (a.autocomplete !== 'off') thumb(`the field "${tapped}" lets the browser lay its own history over the app's suggestions (autocomplete "${a.autocomplete || 'default'}")`);
      }
    } else if ('enter' in step) {
      await page.evaluate(`window.__watchFrames && window.__watchFrames()`);
      await press(page, 'Enter', 13);
      run.keys++;
    } else if ('tapAt' in step) {
      const at = await page.evaluate<{ x: number; y: number }>(`(() => { const m = [...document.querySelectorAll('.leaflet-container')].find((e) => e.getBoundingClientRect().width > 250).getBoundingClientRect(); return { x: m.left + m.width / 2 + ${step.tapAt[0]}, y: m.top + m.height / 2 + ${step.tapAt[1]} }; })()`);
      run.zones[at.y < H * 0.25 ? 'hard' : at.y < H * 0.5 ? 'stretch' : 'easy']++;
      await touch(page, at.x, at.y);
      run.taps++;
    } else if ('tapMap' in step) {
      // The dots nearest the middle, one at a time, as a finger tries the next when one does not answer.
      const dots = await page.evaluate<{ x: number; y: number }[]>(step.tapMap === 'me' ? dotsOf('--c-map-me') : STOP_DOT);
      if (!dots.length) {
        flow(`step ${i + 1}: no ${step.tapMap === 'me' ? "dot for the reader's position" : 'stop'} on the part of the map on screen`);
        break;
      }
      for (const [n, box] of dots.entries()) {
        const zone = box.y < H * 0.25 ? 'hard' : box.y < H * 0.5 ? 'stretch' : 'easy';
        run.zones[zone]++;
        await touch(page, box.x, box.y);
        run.taps++;
        if ((await stepWait(page, T, step.wait, 900)).ok) break;
        if (n === 0) thumb(`the ${step.tapMap === 'me' ? "reader's own dot" : 'stop dot nearest the middle of the map'} did not answer a tap`);
      }
      // Turned sideways at zoom 16 the names drawn beside the dots share their colour, and the
      // finder takes letters for dots; a stop tapped there does open (round 42, by hand).
      if (opts.turned && !(await stepWait(page, T, 'wait' in step ? step.wait : undefined, 300)).ok) {
        thumb(`no stop dot found on the map turned sideways answered a tap`);
        run.screens = seen.size;
        return run;
      }
    }
    const waited = await stepWait(page, T, 'wait' in step ? step.wait : undefined);
    run.appMs += waited.ms;
    if (!waited.ok) {
      flow(`step ${i + 1}: what it leads to never came (${(('wait' in step && step.wait) || '').slice(0, 80)})`);
      break;
    }
    run.worstMs = Math.max(run.worstMs, await interaction());
    // A screen still at work is not yet the step's screen: a planner field's pick plans from an
    // effect, after the step's own wait may already have passed, and the answer then waits for
    // its walks (up to a second). Idle twice, a tenth of a second apart, before it is looked at.
    const settled = await stepWait(page, T, `!document.querySelector('[aria-busy="true"]') && new Promise((r) => setTimeout(() => r(!document.querySelector('[aria-busy="true"]')), 100))`, 3000);
    run.appMs += settled.ms;
    await sleep(200);
    const after = await snap();
    if (process.env.SCROLL_LOG) console.log('    scrolls after step', i + 1, await page.evaluate('JSON.stringify(window.__sl || [])'));
    await shoot(String(i + 1));
    if (process.env.JOURNEY_DEBUG) console.log(`    ${where} step ${i + 1}: ${name(after)} scroll ${after.scroll}`);
    if (!alike(before, after)) {
      const move = 'stack' in step ? step.stack : undefined;
      const back = stack.findIndex((s) => alike(s, after));
      // The fields of the screen left, as they were when it was left: a pick that fills them and
      // plans at once leaves them filled, and that is what back has to bring back.
      const leftAt = await page.evaluate<number | null>(`window.__leftAt ?? null`);
      if (leftAt !== null) stack[stack.length - 1].scroll = leftAt;
      else if (scrolledAtTap !== null) stack[stack.length - 1].scroll = scrolledAtTap;
      stack[stack.length - 1].values = await page.call<string>(`function (ids) { return ids.split(',').filter(Boolean).map((id) => (document.getElementById(id) || {}).value || '').join('|'); }`, before.fields);
      if (move === 'collapse') {
        const tabOf = (s: Screen) => s.tab.split(':')[0];
        while (stack.length > 1 && tabOf(stack[stack.length - 1]) === tabOf(after)) stack.pop();
        stack.push(after);
      } else if (move === 'pop' || (move !== 'push' && back >= 0 && back < stack.length - 1)) stack.splice(back + 1);
      else if (move !== 'push' && layered(stack[stack.length - 1]) && !layered(after)) stack[stack.length - 1] = after;
      else if (move !== 'none') stack.push(after);
      seen.add(name(after));
    }
  }
  run.screens = seen.size;
  const leaks = await page.evaluate<string[]>(`window.__foldLeaks || []`).catch(() => []);
  if (leaks.length) flow(`a fold closed with what was inside it still on screen until the next frame (${[...new Set(leaks)].join(', ')} of its fields, buttons, links and headings)`);
  if (run.findings.some((f) => f.kind === 'flow' && /never|nothing|no field|no map/.test(f.detail))) return run;

  // The answer: on screen, and not under anything.
  const answer = await page.call<{ top: number; bottom: number; covered: string | null; outside?: number } | null>(
    `async function (T) {${HELP} const el = await (async () => (${j.answer}))(); if (!el || el === true) return null; await landed(el); const r = el.getBoundingClientRect(); const main = document.querySelector('main'), m = main.getBoundingClientRect(); if (main.contains(el) && (r.bottom < m.top + 8 || r.top > m.bottom - 8)) return { top: Math.round(r.top), bottom: Math.round(r.bottom), covered: null, outside: Math.round(r.top < m.top ? r.top - m.top : r.top - m.bottom) }; const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + Math.min(r.width / 2, 20)), Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 12)))); return { top: Math.round(r.top), bottom: Math.round(r.bottom), covered: !!hit && !el.contains(hit) && !hit.contains(el) ? (hit.getAttribute('aria-label') || hit.textContent || hit.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) : null }; }`,
    T,
  );
  if (!answer) flow('the journey ended without its answer on screen');
  else {
    run.answerTop = answer.top;
    // With the text at 200 % or the phone turned, the screen holds a fraction of what it holds
    // upright: an answer below the fold there is reach, the house bar's, not a broken journey.
    const fold = opts.text200 || opts.turned ? thumb : flow;
    if (answer.outside !== undefined) (answer.outside < 0 ? flow : fold)(answer.outside < 0 ? `the screen opened scrolled ${-answer.outside} px past its answer` : `the answer starts ${answer.outside} px below the bottom of the screen`);
    else if (answer.top < 0 || answer.top > H - 60) fold(`the answer is off the screen, its top at ${answer.top} of ${H} px`);
    else if (answer.covered) fold(`the answer, ${answer.top} px down, is under "${answer.covered}"`);
  }

  // Away and back: what was set or planned is still there.
  if (j.away) {
    await tapOn(`tabLink(${j.away.tab})`);
    await sleep(700);
    await page.send('Page.navigateToHistoryEntry', { entryId: await previousEntry(page) }).catch(() => undefined);
    await sleep(900);
    const still = await stepWait(page, T, j.away.still, 2500);
    if (!still.ok) backFinding(`${j.away.what} is gone after another tab and back`);
  }

  if (j.lock) {
    const before = await page.call<string>(`async function (T) {${HELP} const el = await (async () => (${j.lock!.stale}))(); return el ? el.textContent.trim() : ''; }`, T);
    await page.evaluate(`window.__auditLock(${LOCKED_MS})`);
    const t0 = Date.now();
    let after = before;
    while (Date.now() - t0 < 20_000 && after === before) {
      after = await page.call<string>(`async function (T) {${HELP} const el = await (async () => (${j.lock!.stale}))(); return el ? el.textContent.trim() : ''; }`, T).catch(() => before);
      if (after === before) await sleep(100);
    }
    const stale = Date.now() - t0;
    if (after === before) backFinding(`woken after two hours locked, the screen still shows the time it was locked at, 20 s on: "${before.slice(0, 40)}"`);
    else if (stale > 1000) backFinding(`woken after two hours locked, the screen showed the time it was locked at for ${(stale / 1000).toFixed(1)} s`);
  }

  if (j.reload) {
    const at = await snap();
    await page.send('Page.reload', {});
    try {
      await page.waitFor('document.querySelector("main h1")', 15_000);
    } catch {
      flow('the app never drew after a reload');
    }
    // As long as a reader waits for a page to come back, five seconds; a planned trip is asked again.
    let reloaded = await snap();
    for (const end = Date.now() + 5000; !same(at, reloaded) && Date.now() < end; reloaded = await snap()) await sleep(150);
    await page.evaluate(`window.__journeyDoc = true`).catch(() => undefined);
    if (!same(at, reloaded)) backFinding(`a reload lands on ${name(reloaded)}, not ${name(at)}`);
    else if (reloaded.url !== at.url) backFinding(`a reload keeps the screen but moves the address from ${at.url} to ${reloaded.url}`);
  }

  if (opts.back === false) return run;
  if (j.installed) await walkBackInApp(page, T, stack, backFinding, shoot);
  else await walkBackSystem(page, stack, backFinding, alike, shoot);
  return run;
}

async function previousEntry(page: Session): Promise<number> {
  const { currentIndex, entries } = await page.send<{ currentIndex: number; entries: { id: number; url: string }[] }>('Page.getNavigationHistory');
  return entries[Math.max(0, currentIndex - 1)].id;
}

/** The system's back, one press at a time: each lands on the screen before it, as it was left, and the last one leaves. */
async function walkBackSystem(page: Session, stack: Screen[], found: (detail: string) => void, alike = same, shoot: (step: string) => Promise<void> = async () => {}): Promise<void> {
  const snap = () => page.call<Screen>(`function () {${HELP} return screenNow(); }`).catch(() => null);
  let current = await snap();
  for (let i = stack.length - 2; i >= -1; i--) {
    const { currentIndex, entries } = await page.send<{ currentIndex: number; entries: { id: number; url: string }[] }>('Page.getNavigationHistory');
    const prev = entries[currentIndex - 1];
    const leaves = !prev || !prev.url.startsWith('http');
    if (i >= 0 && leaves) return found(`back leaves the app from ${current ? name(current) : '?'}, with ${i + 1} screen${i ? 's' : ''} behind it: ${stack.slice(0, i + 1).map(name).join(' ← ')}`);
    if (i < 0) {
      if (!leaves) {
        await page.send('Page.navigateToHistoryEntry', { entryId: prev.id });
        await sleep(800);
        const extra = await snap();
        found(extra && current && same(extra, current) ? `back from the journey's first screen does nothing: ${name(current)}` : `back from the journey's first screen goes on to ${extra ? name(extra) : '?'}, a screen the journey never came from`);
      }
      return;
    }
    if (process.env.SCROLL_LOG) await page.evaluate(`window.__sl = []`);
    // The app's own record of the step backed from, for a finding below.
    const left = await page.evaluate<string>(`JSON.stringify(history.state)`).catch(() => '?');
    await page.send('Page.navigateToHistoryEntry', { entryId: prev.id });
    await sleep(800);
    if (process.env.SCROLL_LOG) console.log('    scrolls after back', await page.evaluate('JSON.stringify(window.__sl || [])'), await page.evaluate('document.querySelector("main").scrollHeight + "/" + document.querySelector("main").clientHeight'));
    if (!(await page.evaluate<boolean>('!!window.__journeyDoc').catch(() => false))) return found(`back from ${current ? name(current) : '?'} loads the page again instead of moving inside it`);
    const got = await snap();
    await shoot(`back-${stack.length - 1 - i}`);
    if (process.env.JOURNEY_DEBUG) console.log(`    back ${stack.length - 1 - i}: ${got ? name(got) : '?'} scroll ${got?.scroll}, entry says ${await page.evaluate('JSON.stringify(history.state && history.state.scroll)')}, left at ${stack[i].scroll}`);
    const want = stack[i];
    if (!got) return found(`back from ${current ? name(current) : '?'} broke the page`);
    // With the screens the journey saw, the steps this journey's history kept (the page is reused,
    // so counted back to the blank page it opened from) and the app's record of the two steps.
    if (!alike(got, want)) {
      let first = currentIndex;
      while (first > 0 && entries[first - 1].url.startsWith('http')) first--;
      const landed = await page.evaluate<string>(`JSON.stringify(history.state)`).catch(() => '?');
      return found(`back from ${current ? `${name(current)} [${current.app}]` : '?'} lands on ${name(got)} [${got.app}], not ${name(want)} (seen: ${stack.map((s) => `${name(s)} [${s.app}]`).join(' → ')}; the journey's history held ${currentIndex - first + 1} steps; left ${left}, landed ${landed})`);
    }
    // The scroll as it settles, a second and a half: under four pages' load the frames it takes come late.
    for (const end = Date.now() + 1500; Math.abs(got.scroll - want.scroll) > 8 && Date.now() < end; ) {
      await sleep(100);
      got.scroll = (await snap())?.scroll ?? got.scroll;
    }
    if (Math.abs(got.scroll - want.scroll) > 8) found(`back to ${name(want)} puts the scroll at ${got.scroll} px, where it was left at ${want.scroll}`);
    if (got.values !== want.values) found(`back to ${name(want)} brings the fields back as "${got.values}", left as "${want.values}"`);
    current = got;
  }
}

/** The app's own way back on every screen the journey went through: the back link, the close button. */
async function walkBackInApp(page: Session, T: object, stack: Screen[], found: (detail: string) => void, shoot: (step: string) => Promise<void> = async () => {}): Promise<void> {
  const snap = () => page.call<Screen>(`function () {${HELP} return screenNow(); }`);
  for (let i = stack.length - 2; i >= 0; i--) {
    const current = await snap();
    const ways = await page.call<boolean>(
      `function (T) {${HELP} const names = [T.arrivals.back, T.lines.backToLines, T.menu.close, T.favourites.close, T.qr.close, T.map.closeStop, T.map.closeControls, T.planner.editTrip];
        const way = all().find((e) => names.includes((e.getAttribute('aria-label') || e.textContent || '').trim()));
        if (!way) return false; way.click(); return true; }`,
      T,
    );
    if (!ways) return found(`the installed app has no way back from ${name(current)} to ${name(stack[i])}`);
    await sleep(700);
    const got = await snap();
    await shoot(`app-back-${stack.length - 1 - i}`);
    if (!same(got, stack[i])) return found(`the app's own back from ${name(current)} lands on ${name(got)}, not ${name(stack[i])}`);
  }
}

/* ------------------------------------------------------------------------------------- */
/* The matrix                                                                            */
/* ------------------------------------------------------------------------------------- */

interface Pass {
  name: string;
  phone: Phone;
  lang: Lang;
  theme: 'light' | 'dark';
  text200?: boolean;
  turned?: boolean;
  api?: Worker['api'];
  /** Only the journeys whose label matches. */
  only?: RegExp;
}

export const CORE: Pass[] = [
  { name: 'small gl', phone: 'small', lang: 'gl', theme: 'light' },
  { name: 'large gl', phone: 'large', lang: 'gl', theme: 'dark' },
];
const FULL: Pass[] = [
  ...CORE,
  { name: 'small es', phone: 'small', lang: 'es', theme: 'dark' },
  { name: 'large en', phone: 'large', lang: 'en', theme: 'light' },
  { name: 'small gl, text 200 %', phone: 'small', lang: 'gl', theme: 'light', text200: true },
  { name: 'small gl, turned sideways', phone: 'small', lang: 'gl', theme: 'dark', turned: true },
  { name: 'large gl, offline', phone: 'large', lang: 'gl', theme: 'light', api: 'offline' },
];

/** The journeys over the passes, four pages at a time; what `audit:browser` gates on. */
export async function journeys(browser: Browser, passes: Pass[] = CORE): Promise<Run[]> {
  const jobs = passes.flatMap((pass) => JOURNEYS.filter((j) => (!pass.only || pass.only.test(label(j))) && !(j.notice && pass.api === 'offline')).map((j) => ({ pass, j })));
  const only = process.env.JOURNEYS && process.env.JOURNEYS !== 'full' ? new RegExp(process.env.JOURNEYS, 'i') : null;
  const todo = only ? jobs.filter(({ j }) => only.test(label(j))) : jobs;
  const runs: Run[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Number(process.env.AUDIT_PAGES ?? 4), todo.length) }, async () => {
      const w = await worker(browser);
      await w.page.onNewDocument(PROBE_SOURCE);
      await w.page.onNewDocument(FRAMES);
      await w.page.onNewDocument(FOLDS);
      // Where the screen was when the app left it: the scroll at each step it adds to the history.
      await w.page.onNewDocument(`(() => { const push = history.pushState.bind(history); history.pushState = (s, t, u) => { const m = document.querySelector('main'); window.__leftAt = m ? Math.round(m.scrollTop) : null; push(s, t, u); }; })()`);
      const cpu = Number(process.env.JOURNEY_CPU ?? 1);
      if (cpu > 1) await w.page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      while (next < todo.length) {
        const { pass, j } = todo[next++];
        try {
          await undo.get(w)?.();
          undo.delete(w);
          const r = await runJourney(w, j, pass.phone, pass.lang, { theme: pass.theme, text200: pass.text200, turned: pass.turned, api: pass.api });
          for (const f of r.findings) if (pass.text200 && !f.where.includes('200')) f.where += ' · text 200 %';
          runs.push(r);
        } catch (error) {
          runs.push({ journey: label(j), phone: pass.phone, lang: pass.lang, variant: pass.name, taps: 0, keys: 0, scrolls: 0, decisions: 0, options: 0, screens: 0, appMs: 0, worstMs: 0, zones: { easy: 0, stretch: 0, hard: 0 }, small: [], answerTop: null, findings: [{ kind: 'flow', where: `${label(j)} · ${pass.name}`, detail: `the run broke: ${String(error).slice(0, 160)}` }] });
        }
      }
      await w.page.close();
    }),
  );
  return runs;
}

if (process.argv[1] && /journeys\.ts$/.test(process.argv[1])) {
  await withBrowser(async (browser) => {
    // JOURNEY_PASSES=<pattern> picks passes of the full matrix by name ("200", "en", "turned").
    const passes = process.env.JOURNEY_PASSES ? FULL.filter((p) => new RegExp(process.env.JOURNEY_PASSES!, 'i').test(p.name)) : process.env.JOURNEYS === 'full' ? FULL : CORE;
    const started = Date.now();
    const runs = await journeys(browser, passes);
    runs.sort((a, b) => a.journey.localeCompare(b.journey) || a.phone.localeCompare(b.phone) || a.lang.localeCompare(b.lang) || a.variant.localeCompare(b.variant));
    console.log('\n=== journeys ===');
    console.log(`  ${'task · entry'.padEnd(58)} ${'phone'.padEnd(10)} taps keys scr dec  scrn  app ms worst  easy/str/hard  answer`);
    for (const r of runs) {
      console.log(
        `  ${r.journey.slice(0, 58).padEnd(58)} ${`${r.phone} ${r.lang}${r.variant ? ` ${r.variant}` : ''}`.padEnd(10)} ${String(r.taps).padStart(4)} ${String(r.keys).padStart(4)} ${String(r.scrolls).padStart(3)} ${String(r.decisions).padStart(3)} ${String(r.screens).padStart(5)} ${String(r.appMs).padStart(7)} ${String(Math.round(r.worstMs)).padStart(5)}  ${`${r.zones.easy}/${r.zones.stretch}/${r.zones.hard}`.padStart(13)}  ${r.answerTop ?? '-'}`,
      );
    }
    const all = runs.flatMap((r) => r.findings);
    for (const kind of ['flow', 'back', 'thumb'] as const) {
      const rows = all.filter((f) => f.kind === kind);
      console.log(`\n=== ${kind} ===  ${rows.length || 'none'}`);
      const grouped = new Map<string, string[]>();
      for (const f of rows) grouped.set(f.detail, [...(grouped.get(f.detail) ?? []), f.where]);
      for (const [detail, at] of grouped) console.log(`    ${detail}\n      in ${at.length > 3 ? `${at.slice(0, 3).join('; ')} and ${at.length - 3} more` : at.join('; ')}`);
    }
    const small = new Map<string, number>();
    for (const r of runs) for (const s of r.small) small.set(s, (small.get(s) ?? 0) + 1);
    console.log(`\n=== tapped under 44 px ===  ${small.size || 'none'}`);
    for (const [s, n] of small) console.log(`    ${s} (${n})`);
    if (process.env.JOURNEYS_JSON) writeFileSync(process.env.JOURNEYS_JSON, JSON.stringify(runs, null, 1));
    console.log(`\n  ${runs.length} runs of ${JOURNEYS.length} journeys over ${passes.length} passes, in ${Math.round((Date.now() - started) / 1000)} s`);
    const gated = all.filter((f) => f.kind !== 'thumb');
    console.log(`  must hold: ${gated.length} finding${gated.length === 1 ? '' : 's'} (flow ${all.filter((f) => f.kind === 'flow').length}, back ${all.filter((f) => f.kind === 'back').length}); house bar: thumb ${all.filter((f) => f.kind === 'thumb').length}`);
    if (gated.length) process.exitCode = 1;
  });
}
