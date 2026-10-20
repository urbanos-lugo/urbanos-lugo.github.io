import { gl } from './gl';
import { es } from './es';
import { en } from './en';

/**
 * The dictionaries without React. The engine and the services read these, and the services
 * run in the Deno worker too, where the React context in `index.ts` would bring React along.
 */

export const LANGS = ['gl', 'es', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/**
 * The shape every language must have, taken from the Galician dictionary: `es` and `en`
 * are typed against it, so a key they forget or invent is a compile error.
 */
export type Dict = typeof gl;

const DICTIONARIES: Record<Lang, Dict> = { gl, es, en };

/** Short code for the toggle. */
export const LANG_CODE: Record<Lang, string> = { gl: 'GL', es: 'ES', en: 'EN' };

/** Each language named in itself, so the person looking for it recognises it. */
export const LANG_NAME: Record<Lang, string> = { gl: 'Galego', es: 'Español', en: 'English' };

/** BCP 47 tag for Intl formatting, so an English reader does not get Galician month names. */
export const LOCALE: Record<Lang, string> = { gl: 'gl-ES', es: 'es-ES', en: 'en-GB' };

export const translations = (lang: Lang): Dict => DICTIONARIES[lang] ?? gl;
