import type { RefObject } from 'react';
import { Bus, Check, ChevronDown, ChevronRight, Layers, LocateFixed, MapPin, Navigation } from 'lucide-react';
import { useT } from '../../i18n';
import { BusLine, BusStop } from '../../types';
import type { NearbyLine } from '../../utils/places';
import { LineBadge } from '../ui/LineBadge';
import { SectionLabel } from '../ui/SectionLabel';
import { SectionTitle } from '../ui/SectionTitle';
import { ChoiceChip, CloseButton } from '../ui/controls';

export type Preset = 'all' | 'nearby' | 'stop' | 'hula' | 'campus' | 'ceao';
export type Layer = 'stops' | 'buses' | 'routes';

/** Matches the stop board: what somebody standing there could reasonably walk to. */
export const AROUND_STOP_RADIUS_M = 400;
/** How far someone will walk to a different line. */
export const NEARBY_RADIUS_M = 750;

const card = 'card p-3.5';
/** A panel's list of rows that scrolls inside its card; the height cap is each list's. */
const list = 'space-y-1 overflow-y-auto pr-1';

export interface MapControlsProps {
  sheetRef: RefObject<HTMLDivElement | null>;
  sheetOpen: boolean;
  onCloseSheet: () => void;
  busCount: number;
  stopCount: number;
  stopsWithQr: number;
  locate: { isLocating: boolean; isFollowing: boolean; error: string | null; toggle: () => void };
  onCenterLugo: () => void;
  preset: Preset;
  onPreset: (preset: Preset) => void;
  /** The stop whose neighbourhood is on show, when the preset is 'stop'. */
  aroundStop: BusStop | null;
  nearbyLines: NearbyLine[];
  layers: Record<Layer, boolean>;
  onToggleLayer: (layer: Layer) => void;
  listedLines: BusLine[];
  pickedLineIds: string[];
  onSelectLine: (line: BusLine) => void;
  onOpenLine: (line: BusLine) => void;
}

/**
 * Everything the map is controlled with. A sheet over the map below `lg`, an ordinary
 * sidebar from `lg` up — one set of markup, because two would drift apart the first time
 * either was edited. `invisible` when closed and not merely translated off, so tabbing
 * cannot walk into a list of twenty-four lines nobody can see.
 */
export function MapControls(p: MapControlsProps) {
  const t = useT();
  const presets: [Preset, string][] = [
    ['all', t.map.allLines],
    ['nearby', t.map.nearbyFilter],
    ['hula', t.map.filterHula],
    ['campus', t.map.filterCampus],
    ['ceao', t.map.filterCeao],
  ];
  const layerButtons: { id: Layer; Icon: typeof MapPin; tint: string; label: string }[] = [
    { id: 'stops', Icon: MapPin, tint: 'text-accent', label: t.map.layerStops },
    { id: 'buses', Icon: Bus, tint: 'text-estimated', label: t.map.layerBuses },
    { id: 'routes', Icon: Layers, tint: 'text-accent', label: t.map.layerRoutes },
  ];
  const locateLabel = p.locate.isLocating ? t.map.locating : p.locate.isFollowing ? t.map.stopFollowing : t.map.myLocation;

  // First of the panels on a phone, so the map has its own controls directly under it; second
  // in the sidebar. Drawn twice, one shown per breakpoint, rather than moved by CSS order: the
  // order moved what is drawn and not what Tab and a screen reader follow, and on a phone the
  // focus went down past locate and centre and back up to these (1.3.2, 2.4.3).
  const quickFilters = (shown: string) => (
    <div className={`${card} ${shown}`}>
      <SectionLabel quiet className="mb-2">{t.map.quickFilters}</SectionLabel>
      {/* A scrolling row on a phone, where five stacked buttons took 150 px of a sheet; wrapped in the sidebar, where a sideways scroll hides four of five. */}
      <div className="chip-rail lg:flex-wrap lg:overflow-x-visible">
        {presets.map(([preset, label]) => (
          <ChoiceChip key={preset} on={p.preset === preset} onClick={() => p.onPreset(preset)} tone="accent" dense>
            {label}
          </ChoiceChip>
        ))}
      </div>
      {p.preset === 'stop' && p.aroundStop && (
        <div className="mt-2.5 rounded-control border border-accent bg-accent/tint p-3">
          <p className="text-note text-ink">{t.map.aroundStopActive(p.aroundStop.name, AROUND_STOP_RADIUS_M)}</p>
          <button onClick={() => p.onPreset('all')} className="btn btn-secondary btn-dense mt-2 bg-bg">
            {t.map.aroundStopClear}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={p.sheetRef}
      role={p.sheetOpen ? 'dialog' : undefined}
      aria-modal={p.sheetOpen ? true : undefined}
      aria-label={p.sheetOpen ? t.map.controls : undefined}
      className={`order-2 flex flex-col gap-3.5 lg:order-none lg:col-span-4 fixed inset-x-0 bottom-0 z-sheet max-h-sheet-max overflow-y-auto rounded-t-sheet border-t border-edge bg-surface p-3.5 shadow-overlay transition-transform duration-move motion-reduce:transition-none lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:visible lg:translate-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${
        p.sheetOpen ? 'translate-y-0' : 'invisible translate-y-full'
      }`}
    >
      {/* The handle: which way the sheet goes, and its own way out. Gone at `lg`. */}
      <div className="order-first -mt-1 flex items-center justify-between gap-2 lg:hidden">
        <SectionLabel quiet>{t.map.controls}</SectionLabel>
        <CloseButton label={t.map.closeControls} onClick={p.onCloseSheet} icon={ChevronDown} />
      </div>
      {quickFilters('lg:hidden')}

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-line">
          <div>
            <SectionTitle icon={Navigation} small subtitle={t.map.subtitle}>
              {t.map.mapTitle}
            </SectionTitle>
          </div>
          <div className="text-right">
            <span className="flex items-center gap-1 text-label font-black text-estimated">
              <Bus className="w-3.5 h-3.5 text-estimated" aria-hidden="true" />
              {p.busCount} {t.map.scheduledBusesCount}
            </span>
            <span className="text-label text-ink-3">{t.map.stopsCount(p.stopCount, p.stopsWithQr)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <button
            id="btn-map-locate"
            onClick={p.locate.toggle}
            disabled={p.locate.isLocating}
            aria-pressed={p.locate.isFollowing}
            className={`btn btn-dense shadow-hair transition-colors ${p.locate.isFollowing ? 'btn-secondary border-accent text-ink' : 'btn-primary'}`}
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>{locateLabel}</span>
          </button>
          <button id="btn-map-center" onClick={p.onCenterLugo} className="btn btn-secondary btn-dense">
            {t.map.centerLugo}
          </button>
        </div>
        {p.locate.error && (
          <p role="alert" className="mt-2 text-note text-ink-2">
            {p.locate.error}
          </p>
        )}
      </div>

      {quickFilters('hidden lg:block')}

      {p.preset === 'nearby' && p.nearbyLines.length > 0 && (
        <div className={card}>
          <SectionLabel quiet className="mb-2">{t.map.nearbyTitle(NEARBY_RADIUS_M)}</SectionLabel>
          <div className={`${list} max-h-list-nearby-max`}>
            {p.nearbyLines.map(({ line, nearestStop, walkMeters }) => (
              <button key={line.id} onClick={() => p.onSelectLine(line)} className="row-button p-2">
                <LineBadge number={line.number} color={line.color} size="sm" />
                <span className="min-w-0 flex-1 break-words text-ink-2">{nearestStop.name}</span>
                <span className="tnum shrink-0 font-semibold text-ink-3">{t.common.walkDistance(walkMeters)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={card}>
        <SectionLabel quiet className="mb-2">{t.map.layers}</SectionLabel>
        <div className="grid grid-cols-3 gap-1 bg-surface p-1 rounded-control text-label">
          {layerButtons.map(({ id, Icon, tint, label }) => (
            <button
              key={id}
              onClick={() => p.onToggleLayer(id)}
              aria-pressed={p.layers[id]}
              className={`h-tap rounded-inset font-semibold flex items-center justify-center gap-1 transition-all ${p.layers[id] ? 'bg-bg text-ink shadow-hair' : 'text-ink-3'}`}
            >
              <Icon className={`w-3 h-3 ${tint}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="caps-label text-ink-3">
            {t.map.linesList}
            {p.pickedLineIds.length > 0 && <span className="ml-1.5 text-accent">· {t.map.linesPicked(p.pickedLineIds.length)}</span>}
          </span>
          <button
            onClick={() => p.onPreset('all')}
            aria-pressed={p.pickedLineIds.length === 0}
            className={`flex h-tap min-w-tap items-center justify-center rounded-control px-3 text-label font-semibold ${p.pickedLineIds.length === 0 ? 'bg-surface text-accent' : 'text-ink-3 hover:text-ink'}`}
          >
            {t.map.allLines}
          </button>
        </div>
        {/* Drawing the route and reading the timetable are two different errands, so two buttons. */}
        <div className={`${list} max-h-list-lines-max`}>
          {p.listedLines.map((line) => {
            const isSelected = p.pickedLineIds.includes(line.id);
            return (
              <div key={line.id} className={`flex items-stretch gap-1 rounded-control text-label transition-all border bg-surface ${isSelected ? 'border-accent font-bold shadow-hair' : 'border-line text-ink-2'}`}>
                <button onClick={() => p.onSelectLine(line)} aria-pressed={isSelected} className="flex min-h-tap min-w-0 flex-1 items-center gap-2 p-2.5 text-left">
                  <LineBadge number={line.number} color={line.color} size="sm" />
                  {/* Whole: cut, it kept the origin and lost where the line goes, "Opuesto Piscina
                      Pedreiras - Rúa Mercad..." in the desktop column; held to two lines it still lost
                      its end under a reader's text spacing and at 200 %. */}
                  <span className="min-w-0 break-words">{line.name}</span>
                  {/* The row is a switch, and a tick is what says so. */}
                  {isSelected && <Check className="ml-auto h-4 w-4 shrink-0 text-accent stroke-heavy" aria-hidden="true" />}
                </button>
                <button onClick={() => p.onOpenLine(line)} title={t.map.openLineInfo} aria-label={`${t.map.openLineInfo}: ${line.number}`} className="flex min-h-tap w-tap shrink-0 items-center justify-center rounded-r-control-inner">
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isSelected ? 'text-accent' : 'text-ink-3'}`} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
