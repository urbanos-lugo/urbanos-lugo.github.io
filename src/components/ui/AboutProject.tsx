import { useT } from '../../i18n';
import { CONTACT_EMAIL, REPO_URL } from '../../project';

// Each on its own line, so the 44 px applies to it.
const link = 'flex min-h-tap items-center self-start underline decoration-dotted underline-offset-link';

/**
 * Who made this and what it does with you: at the foot of the phone's menu, and in «Tarifas e
 * info» on every screen size. It lived in the menu alone, and the menu has no button from lg
 * up, so on a computer the reader was never told the app is unofficial, nor shown the code or
 * a way to write. A fragment, so it falls into the column of whichever block holds it.
 */
export function AboutProject() {
  const t = useT();
  return (
    <>
      <span className="text-ink-2">{t.menu.unofficial}</span>
      <span>{t.menu.privacy}</span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={`mt-0.5 ${link}`}>
        {t.menu.sourceCode}
      </a>
      {/* The chooser, not a blank issue: it sends a complaint about the service to buslugo.com first. */}
      <a href={`${REPO_URL}/issues/new/choose`} target="_blank" rel="noopener noreferrer" className={link}>
        {t.menu.reportProblem}
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
        {t.menu.contact(CONTACT_EMAIL)}
      </a>
    </>
  );
}
