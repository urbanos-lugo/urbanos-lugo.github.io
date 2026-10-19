import { useT } from '../../i18n';

/** The app's name heading the navigation, on the desktop rail and in the phone's menu. */
export function Wordmark() {
  const t = useT();
  return <span className="text-emph font-semibold tracking-title">{t.nav.appName}</span>;
}
