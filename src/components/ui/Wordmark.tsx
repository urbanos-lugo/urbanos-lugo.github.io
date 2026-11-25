import { tabLink } from '../../hooks/useTabRoute';
import { useLang, useT } from '../../i18n';
import type { NavTab } from '../navSections';

/** The app's name heading the navigation, on the desktop rail and in the phone's menu, and the way to the tab it opens on. */
export function Wordmark({ start, onHome }: { start: NavTab; onHome: () => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <a {...tabLink(start, onHome, lang)} className="flex min-h-tap items-center text-emph font-semibold tracking-title">
      {t.nav.appName}
    </a>
  );
}
