import { CreditCard, Info, Phone, Globe, HelpCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { FARE_CARDS } from '../data/transitData';
import { NotAffiliated } from './ui/Provenance';
import { SectionLabel } from './ui/SectionLabel';
import { SectionTitle } from './ui/SectionTitle';

/** Where somebody can check any of this: the operator's own site, and an independent reader of the same timetables. */
const PORTALS = [
  { href: 'https://buslugo.com', label: 'buslugo.com' },
  // urbanoslugo.com is gone: it redirects off HTTPS, which browsers refuse to follow.
  { href: 'https://tpgalicia.github.io/urban/lugo', label: 'TP Galicia (GitHub)' },
];

const card = 'card py-5 px-cap-5';

const Bullets = ({ title, lines, hollow = false }: { title: string; lines: string[]; hollow?: boolean }) => (
  <div>
    <SectionLabel as="h3">{title}</SectionLabel>
    <ul className="mt-2 space-y-1.5 text-note text-ink">
      {lines.map((line) => (
        <li key={line} className="flex gap-2">
          <span className={`mt-1.75 h-1.5 w-1.5 shrink-0 rounded-pill ${hollow ? 'border border-ink-3' : 'bg-ink-3'}`} aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  </div>
);

/** How the service works: what it costs, what is asked of the people on board, and who to ask when something is wrong. */
export function FaresView() {
  const t = useT();
  // Only two of the eight card strings interpolate a number, so only those are functions.
  const copy = (value: string | ((minutes: number) => string), minutes = 0) => (typeof value === 'function' ? value(minutes) : value);

  return (
    <div className="page page-gutter py-6 space-y-8">
      <div className="space-y-4">
        <div>
          <SectionTitle icon={CreditCard} subtitle={t.fares.faresSubtitle}>
            {t.fares.faresTitle}
          </SectionTitle>
          {/* Right under the line that names the operator and calls the prices official. */}
          <NotAffiliated />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FARE_CARDS.map((fare) => {
            const words = t.fares.cards[fare.id];
            const minutes = 'minutes' in fare ? fare.minutes : 0;
            return (
              <div key={fare.id} className={`${card} flex flex-col justify-between`}>
                <div>
                  <span className="tag bg-surface text-accent uppercase tracking-caps">{words.badge}</span>
                  <h3 className="font-bold text-body text-ink mt-2.5">{words.title}</h3>
                  {/* No invented number when the operator publishes none. */}
                  <div className="text-title font-black text-ink mt-1 font-mono">{fare.price || <span className="text-body text-ink-3">{t.fares.priceNotPublished}</span>}</div>
                  <p className="text-label font-bold text-ink-2 mt-1">{copy(words.subtitle, minutes)}</p>
                  <p className="text-note text-ink-3 mt-2">{copy(words.details, minutes)}</p>
                </div>
                <a href={fare.sourceUrl} target="_blank" rel="noopener noreferrer" className="link mt-3 self-start">
                  {fare.source}
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summarised rather than copied: their page is the one that counts and is linked. */}
      <div className={card}>
        <SectionTitle icon={Info} subtitle={t.rules.subtitle}>
          {t.rules.title}
        </SectionTitle>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Bullets title={t.rules.mustTitle} lines={t.rules.must} />
          <Bullets title={t.rules.mustNotTitle} lines={t.rules.mustNot} hollow />
        </div>
        <a href="https://buslugo.com/normativa/" target="_blank" rel="noopener noreferrer" className="link mt-4">
          {t.rules.sourceLink}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${card} space-y-3`}>
          <SectionTitle icon={HelpCircle} small>
            {t.fares.faqTitle}
          </SectionTitle>
          <div className="space-y-3">
            {t.faresContent.faqs.map((faq, i) => (
              <div key={i} className="inset-panel">
                <div className="text-label font-bold text-ink">{faq.q}</div>
                <div className="text-label text-ink-2 mt-1">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} space-y-4`}>
          <SectionTitle icon={Info} small>
            {t.fares.contactTitle}
          </SectionTitle>
          <div className="space-y-3 text-label text-ink-2">
            <div className="inset-panel flex items-start gap-3">
              <Phone className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-ink">{t.fares.phones}</div>
                <div className="mt-0.5">Concello de Lugo - Mobilidade: 982 29 74 00</div>
                <div>Monbus Lugo: 982 24 16 00</div>
              </div>
            </div>
            <div className="inset-panel flex items-start gap-3">
              <Globe className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-ink">{t.fares.portals}</div>
                <ul className="mt-1 space-y-0.5">
                  {PORTALS.map((portal) => (
                    <li key={portal.href}>
                      <a href={portal.href} target="_blank" rel="noopener noreferrer" className="link">
                        {portal.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
