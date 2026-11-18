import { useEffect, useState, type ReactNode } from 'react';
import { Star, MapPin, Trash2, ArrowRight, Route, Clock, type LucideIcon } from 'lucide-react';
import { useLang, useT } from '../i18n';
import { daysLabel, frequencyLabel } from '../utils/serviceLabels';
import { BusStop, BusLine } from '../types';
import { BUS_STOPS, BUS_LINES, linesByNumber, poleCode } from '../data/transitData';
import { LineBadge } from './ui/LineBadge';
import { CloseButton, Segmented } from './ui/controls';
import { DialogTitle } from './ui/DialogTitle';
import { Drawer } from './ui/Drawer';
import { EmptyState } from './ui/EmptyState';

interface FavoritesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  favoriteStopIds: string[];
  favoriteLineIds: string[];
  onSelectStop: (stop: BusStop) => void;
  onSelectLine: (line: BusLine) => void;
  /** Saves or unsaves: the bin, and "Desfacer" after it. */
  onToggleFavoriteStop: (stopId: string) => void;
  onToggleFavoriteLine: (lineId: string) => void;
}

/**
 * A saved thing: the body opens it, the bin removes it, the arrow opens it too. Removed, the row
 * stays while the drawer is open and the bin is "Desfacer": the row went at once, with the
 * button that held the focus and nothing said (2.4.3, 4.1.3). The same button, so the focus stays.
 */
function SavedRow({ onOpen, onToggle, removed, removeLabel, children }: { onOpen: () => void; onToggle: () => void; removed: boolean; removeLabel: string; children: ReactNode }) {
  const t = useT();
  return (
    // The buttons go under the text when both do not fit: beside it at 200% text the stop's
    // zone spilled 54 px out of the row.
    <div className="py-3.5 px-cap-3.5 rounded-control border border-edge hover:border-accent hover:bg-surface/wash transition-all flex flex-wrap items-center justify-between gap-3 group bg-bg shadow-hair">
      <button type="button" onClick={onOpen} className="min-w-floor-row flex-1 cursor-pointer text-left">
        {children}
      </button>
      <div className="ml-auto flex shrink-0 items-center">
        {/* 44 px like every other control: at 28 it sat a finger's width from the arrow. */}
        <button
          onClick={onToggle}
          aria-label={removed ? undefined : removeLabel}
          title={removed ? undefined : removeLabel}
          className={removed ? 'link min-w-tap justify-center px-2' : 'flex h-tap w-tap items-center justify-center text-ink-3 hover:text-warn-ink rounded-control hover:bg-warn transition-colors'}
        >
          {removed ? t.planner.undoClear : <Trash2 className="w-4 h-4" aria-hidden="true" />}
        </button>
        {/* The row's own button already opens it: this one is for the eye, not a second stop for a screen reader. */}
        <button onClick={onOpen} tabIndex={-1} aria-hidden="true" className="p-1.5 text-accent hover:text-accent">
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const Empty = ({ icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) => (
  <EmptyState icon={icon}>
    <h3 className="text-body font-bold text-ink-2">{title}</h3>
    <p className="text-label text-ink-3 mt-1">{hint}</p>
  </EmptyState>
);

export function FavoritesDrawer({ isOpen, onClose, favoriteStopIds, favoriteLineIds, onSelectStop, onSelectLine, onToggleFavoriteStop, onToggleFavoriteLine }: FavoritesDrawerProps) {
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState<'stops' | 'lines'>('stops');
  /** What was removed since the drawer opened, as "s:<id>" and "l:<id>": those rows stay, to be undone. */
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) setRemoved([]);
  }, [isOpen]);
  if (!isOpen) return null;

  const favoriteStops = BUS_STOPS.filter((s) => favoriteStopIds.includes(s.id) || removed.includes(`s:${s.id}`));
  const favoriteLines = BUS_LINES.filter((l) => favoriteLineIds.includes(l.id) || removed.includes(`l:${l.id}`));
  const open = (act: () => void) => () => {
    act();
    onClose();
  };
  const toggle = (key: string, act: () => void) => () => {
    setRemoved((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));
    act();
  };

  return (
    <Drawer open={isOpen} onClose={onClose} label={t.favourites.title} closeLabel={t.favourites.close} wide>
      <div className="@container py-5 px-cap-5 border-b border-edge bg-surface">
        <div className="flex items-center justify-between gap-3 mb-4">
          <DialogTitle icon={Star} tone="warn" title={t.favourites.title} subtitle={t.favourites.subtitle} compact />
          <CloseButton label={t.favourites.close} onClick={onClose} />
        </div>
        {/* The tabs' icons go with the star, for the same reason: the word before the picture. */}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            {
              id: 'stops',
              label: (
                <span className="flex items-center justify-center gap-1.5">
                  <MapPin className="hidden w-3.5 h-3.5 shrink-0 text-accent @min-icons:block" />
                  {t.favourites.tabStops} ({favoriteStopIds.length})
                </span>
              ),
            },
            {
              id: 'lines',
              label: (
                <span className="flex items-center justify-center gap-1.5">
                  <Route className="hidden w-3.5 h-3.5 shrink-0 @min-icons:block" />
                  {t.favourites.tabLines} ({favoriteLineIds.length})
                </span>
              ),
            },
          ]}
        />
      </div>

      <span role="status" className="sr-only">
        {removed.length ? t.favourites.removed : ''}
      </span>
      <div className="flex-1 overflow-y-auto py-5 px-cap-5 space-y-2.5">
        {tab === 'stops' &&
          (favoriteStops.length === 0 ? (
            <Empty icon={Star} title={t.favourites.noFavoriteStops} hint={t.favourites.noFavoriteStopsHint} />
          ) : (
            favoriteStops.map((stop) => (
              <SavedRow key={stop.id} onOpen={open(() => onSelectStop(stop))} onToggle={toggle(`s:${stop.id}`, () => onToggleFavoriteStop(stop.id))} removed={!favoriteStopIds.includes(stop.id)} removeLabel={t.favourites.remove}>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent shrink-0" />
                  <span className="min-w-0 break-words font-bold text-body text-ink group-hover:text-accent">{stop.name}</span>
                </div>
                <div className="text-label text-ink-3 mt-0.5 ml-6">
                  {poleCode(stop) && (
                    <>
                      {t.favourites.codeShort} <span className="tnum font-bold text-ink-2">{poleCode(stop)}</span> &bull;{' '}
                    </>
                  )}
                  {stop.zone}
                </div>
                <div className="flex gap-1 flex-wrap mt-2 ml-6">
                  {/* The number, once: they printed the line's id, and the 11 and its three
                      variants, "11-Igrexa de Bóveda" among them, are all an "11" on the bus. */}
                  {linesByNumber(stop.lines).map((line) => (
                    <LineBadge key={line.number} number={line.number} color={line.color} size="inline" />
                  ))}
                </div>
              </SavedRow>
            ))
          ))}

        {tab === 'lines' &&
          (favoriteLines.length === 0 ? (
            <Empty icon={Route} title={t.favourites.noFavoriteLines} hint={t.favourites.noFavoriteLinesHint} />
          ) : (
            favoriteLines.map((line) => (
              <SavedRow key={line.id} onOpen={open(() => onSelectLine(line))} onToggle={toggle(`l:${line.id}`, () => onToggleFavoriteLine(line.id))} removed={!favoriteLineIds.includes(line.id)} removeLabel={t.favourites.remove}>
                <div className="flex items-center gap-2.5">
                  <LineBadge number={line.number} color={line.color} size="row" />
                  <div className="min-w-0">
                    <span className="break-words font-bold text-body text-ink group-hover:text-accent">{line.name}</span>
                    <div className="text-label text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-ink-3" />
                        {frequencyLabel(line, lang)}
                      </span>
                      <span>&bull;</span>
                      <span>{daysLabel(line, lang)}</span>
                    </div>
                  </div>
                </div>
              </SavedRow>
            ))
          ))}
      </div>
    </Drawer>
  );
}
