import { createContext, useContext } from 'react';
import { type Dict, type Lang, translations } from './translations';

export * from './translations';

/**
 * The interface language, for components. Set once at the top of the app; everything
 * below reads it through `useLang()` / `useT()` instead of a `lang` prop on every screen.
 */
export const LangContext = createContext<Lang>('gl');

export const useLang = (): Lang => useContext(LangContext);
export const useT = (): Dict => translations(useContext(LangContext));
