import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Moon } from 'lucide-react';
import { CloseButton } from './components/ui/controls';
import { StopArrivalsView } from './components/StopArrivalsView';
import { StopHome } from './components/StopHome';
import { LinesView } from './components/LinesView';
import { RoutePlannerView } from './components/RoutePlannerView';
import { TripCompanionView } from './components/TripCompanionView';
import { AlertsView } from './components/AlertsView';
import { FaresView } from './components/FaresView';
import { FavoritesDrawer } from './components/FavoritesDrawer';
import { QrScannerModal } from './components/QrScannerModal';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { SideNav } from './components/SideNav';
import { MenuDrawer } from './components/MenuDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTripCompanion } from './hooks/useTripCompanion';
import { useFavourites, useRecentStops } from './hooks/useStoredList';
import { langFromLocation, sideBySide, useTabRoute, type Screen } from './hooks/useTabRoute';
import { useServiceAlerts } from './hooks/useServiceAlerts';
import { useTheme } from './hooks/useTheme';
import { useClock } from './hooks/useClock';
import { Lang, LangContext, translations } from './i18n';
import { BUS_STOPS, BUS_LINES, stopById } from './data/transitData';
import { PATHS, isCrawler, pickLang, type Tab } from './routes';
import { pageHead } from './seo';
import { networkAtRest } from './utils/arrivals';
import { dayWord } from './utils/serviceLabels';
import { findStop } from './utils/places';
import { readString, writeString } from './utils/storage';
import { sectionedNotices } from './utils/operatorNotices';
import { changesNow, latestRun, readNoticeChanges, runsAt } from './utils/noticeChanges';
import { isSnapshotStale } from './utils/snapshotAge';
import { BusStop, BusLine } from './types';
import { Pane } from './components/ui/Pane';

// Leaflet and its layers are only needed on the map tab, so they load with it.
const InteractiveMap = lazy(() => import('./components/Map/TransitMap').then((m) => ({ default: m.TransitMap })));

const LANG_KEY = 'urbanos-lugo-lang';

/** The address's language if it names one; else remembered, else the browser's (routes.ts says why a crawler gets Galician). */
const initialLang = (): Lang =>
  pickLang({ address: langFromLocation(), crawler: isCrawler(navigator.userAgent), stored: readString(LANG_KEY), browser: navigator.language });

const stopIds = new Set(BUS_STOPS.map((s) => s.id));
const lineIds = new Set(BUS_LINES.map((l) => l.id));

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  // The open tab lives in the address bar, with the language, and what is open on it in the
  // history's entry, so the back gesture moves between screens and steps out of a board first.
  const [screen, go, popped] = useTabRoute('stops', lang);
  const activeTab = screen.tab;
  /** What was last open on each tab, so the bar goes back to it, as the stops tab always did with its board. */
  const lastOn = useRef<Partial<Record<Tab, Screen>>>({});
  lastOn.current[activeTab] = screen;
  // The board needs a stop from the first render, so it opens on the busiest interchange.
  const [selectedStop, setSelectedStop] = useState<BusStop>(() => [...BUS_STOPS].sort((a, b) => b.lines.length - a.lines.length)[0]);
  /** The map must not draw that default as chosen: a big blue dot on a stop nobody picked. */
  const [stopWasChosen, setStopWasChosen] = useState(false);
  /** What the reader asked the map to show, so it can stop guessing between its stop and its line. */
  const [mapFocus, setMapFocus] = useState<'stop' | 'line'>('line');
  /** No line until somebody opens one; the map started with 1.1 drawn over a choice nobody had made. */
  const [selectedLine, setSelectedLine] = useState<BusLine | null>(null);
  /** A place chosen in the search box, on its way to the planner as a destination. A counter, so asking for the same place twice is two asks. */
  const [placeRequest, setPlaceRequest] = useState<{ query: string; nonce: number } | null>(null);
  /**
   * The map stays mounted between visits — a remount was a fresh WebGL context and a fresh
   * style download every time — but nothing before the first: it is a lazy chunk.
   */
  const [mapEverOpened, setMapEverOpened] = useState(false);
  useEffect(() => {
    if (activeTab === 'map') setMapEverOpened(true);
  }, [activeTab]);

  // The stops tab opens on the saved-stops home; choosing a stop anywhere switches it to that stop's board.
  const boardStop = screen.stop ? stopById(screen.stop) : undefined;
  const [recentStopIds, rememberStop, clearRecentStops] = useRecentStops();
  const [favoriteStopIds, toggleFavoriteStop] = useFavourites('urbanos_lugo_fav_stops', stopIds);
  const [favoriteLineIds, toggleFavoriteLine] = useFavourites('urbanos_lugo_fav_lines', lineIds);
  const [isNightBannerDismissed, setIsNightBannerDismissed] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const t = translations(lang);

  // The "no service" banner comes from the runs the boards read: no bus on the road, and the next one's day and time.
  const now = useClock(60_000);
  const rest = useMemo(() => networkAtRest(now), [now]);
  const isOutOfService = rest.atRest;

  /** The operator's notices, fetched once here for everybody who shows them, and only while their own days last. */
  const alerts = useServiceAlerts(now);
  // A notice written out line by line goes on the lines and boards it names; a stale snapshot's would be last week's news.
  const operatorNotices = isSnapshotStale(alerts.snapshotAt) ? [] : sectionedNotices(alerts.data?.alerts);
  // What those notices change, read once: closed and moved stops, lines running late. Each screen asks it about its own moment.
  const noticeChanges = useMemo(() => readNoticeChanges(operatorNotices, now.getFullYear()), [alerts.data, alerts.snapshotAt, now]);
  // A festival night the notice extends: the timetable says nothing runs, and the banner must not.
  const runningTonight = isOutOfService ? (changesNow(noticeChanges, now)?.lines ?? []).filter((change) => runsAt(change, now)) : [];
  /** The ride in progress, above the tabs: the planner is unmounted the moment the reader looks at the map. */
  const companion = useTripCompanion(lang);

  const screenTitle = ({ stops: t.nav.stops, lines: t.nav.lines, map: t.nav.map, plan: t.nav.plan, info: t.menu.alerts, fares: t.menu.fares } satisfies Record<Tab, string>)[activeTab];

  // Each copy of index.html ships its language's head; once the app knows who is reading, the
  // page and the tab title say so, from the same table, because a search engine takes the
  // title the running page sets. The stops tab is the root's screen and has the root's title.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = pageHead(activeTab === 'stops' ? '' : PATHS[activeTab], lang).title;
    writeString(LANG_KEY, lang);
  }, [lang, activeTab]);

  /** A tab from the bar, the menu or the search: what was last open on it, as a step of its own. */
  const goToTab = (tab: Tab) => {
    if (tab !== activeTab) go({ ...(lastOn.current[tab] ?? { tab }), over: false });
  };
  /**
   * A stop's board or a line's page. Opened from its own tab's list it goes over the list, and
   * the way back is the history's; from anywhere else it is a step of its own. Side by side,
   * where the list stays on screen, it replaces what was open rather than add a step.
   */
  const openOnTab = (next: Screen) => {
    if (activeTab !== next.tab) return go(next);
    const side = sideBySide();
    go({ ...next, over: !side && !screen.stop && !screen.line }, side);
  };
  /** Back to the list: the history's way if the board or the line was put over it. */
  const backToList = (tab: Tab) => (screen.over ? window.history.back() : go({ tab }, true));
  const openLine = (line: BusLine) => {
    setSelectedLine(line);
    openOnTab({ tab: 'lines', line: line.id });
  };
  /** `viaQr`: the reader got here off the sticker on that pole. Cleared on every other route in. */
  const selectStop = (stop: BusStop, viaQr = false) => {
    setSelectedStop(stop);
    setStopWasChosen(true);
    rememberStop(stop.id);
    openOnTab({ tab: 'stops', stop: stop.id, ...(viaQr ? { qr: true } : {}) });
  };
  // Leaving the board un-chooses the stop for the map too, by the app's back or the system's.
  useEffect(() => {
    if (activeTab === 'stops' && !boardStop) setStopWasChosen(false);
  }, [activeTab, boardStop]);
  const viewStopOnMap = (stop: BusStop) => {
    setSelectedStop(stop);
    setStopWasChosen(true);
    setMapFocus('stop');
    go({ tab: 'map' });
  };
  const viewLineOnMap = (line: BusLine) => {
    setSelectedLine(line);
    setMapFocus('line');
    go({ tab: 'map' });
  };
  const openAlerts = () => go({ tab: 'info' });

  // Direct QR links (`?parada=xRiq`, `?stop=101`) and shared lines (`?linea=`), resolved the way
  // the scanner resolves them, in place of the entry they arrived on: as a step of their own
  // they left the first back press on a screen nobody had seen, the stops tab under a line.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stopParam = params.get('parada') || params.get('stop') || params.get('qr') || params.get('ps');
    const lineParam = params.get('linea') || params.get('line');
    const stop = stopParam && findStop(stopParam);
    const line = lineParam && BUS_LINES.find((l) => l.id.toLowerCase() === lineParam.toLowerCase() || l.number.toLowerCase() === lineParam.toLowerCase());
    if (stop) setSelectedStop(stop);
    if (line) {
      setSelectedLine(line);
      go({ tab: 'lines', line: line.id }, true);
    } else if (stop) go({ tab: 'stops', stop: stop.id, qr: true }, true);
  }, []);

  // The ride is above the tabs, and the planner's entries under it are no screens any more: back
  // from the ride goes to wherever the reader was before the planner, not onto the ride again.
  useEffect(() => {
    if (popped && companion.trip && activeTab === 'plan' && !screen.ride) window.history.back();
  }, [screen, popped]);

  return (
    <LangContext.Provider value={lang}>
      <div className="flex h-viewport bg-bg text-ink lg:flex-row">
        {/* First in the document, so it is the first Tab stop. */}
        <a href="#contido" className="sr-only focus:not-sr-only focus:absolute focus:z-dialog focus:m-2 focus:rounded-tag focus:bg-accent focus:px-3 focus:py-2 focus:text-body focus:font-bold focus:text-on-accent">
          {t.nav.skipToContent}
        </a>
        <SideNav activeTab={activeTab} setActiveTab={goToTab} alertCount={alerts.announcedIncidents} tripActive={companion.trip !== null} setLang={setLang} theme={theme} setTheme={setTheme} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onOpenFavorites={() => setIsFavoritesOpen(true)}
            savedCount={favoriteStopIds.length + favoriteLineIds.length}
            onSelectStop={selectStop}
            onSelectLine={openLine}
            onSelectPlace={(query) => {
              setPlaceRequest((prev) => ({ query, nonce: (prev?.nonce ?? 0) + 1 }));
              go({ tab: 'plan' });
            }}
            onOpenQrScanner={() => setIsQrModalOpen(true)}
            onOpenMenu={() => setIsMenuOpen(true)}
            onOpenTab={goToTab}
            alertCount={alerts.announcedIncidents}
          />

          {/* Nothing is running: the one useful sentence at 03:00 is when the first bus goes. Two lines, the whole row a link to the notices; the festival sentence keeps "no service" from being a lie on San Froilán. */}
          {isOutOfService && (
            <div className={`fold ${isNightBannerDismissed ? 'fold-closed' : ''}`}>
              <div>
            <div className="flex items-center gap-1 border-b border-line bg-surface pl-3.5 pr-1">
              <button onClick={openAlerts} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <Moon className="h-4.5 w-4.5 shrink-0 text-ink-2" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  {/* Both lines wrap rather than cut: the time is the end of the sentence, and with the
                      day word in it "primeiro bus mañá ás ~06:50" was cut at "~0…"; the festivals
                      line lost half its words at 320 px. */}
                  {runningTonight.length > 0 ? (
                    <>
                      <span className="block text-body font-semibold">{t.nightBanner.extended(runningTonight.map((change) => change.line), latestRun(runningTonight, now)!)}</span>
                      <span className="block text-label text-ink-3">{t.nightBanner.extendedSource} ›</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-body font-semibold">{t.nightBanner.closed(rest.firstBus, dayWord(lang, rest.daysAhead, now))}</span>
                      <span className="block text-label text-ink-3">{t.nightBanner.festivals} ›</span>
                    </>
                  )}
                </span>
                <span className="sr-only">{t.nightBanner.seeNotices}</span>
              </button>
              <CloseButton label={t.nightBanner.dismiss} onClick={() => setIsNightBannerDismissed(true)} />
            </div>
              </div>
            </div>
          )}

          {/* Positioned, so it is the containing block of every absolute box inside it. It was
              not, and the screen-reader text of each line card (an absolute 1 px box) took its
              place from the page: on the lines tab the page grew 1,392 px taller than the
              screen, scrolled under the bars, and on a desktop a page scrollbar narrowed the
              bottom bar from 375 to 360 px each time the tab opened.
              Under the ride's bar, which is stuck to its foot, the height of the bar stays free
              when the focus scrolls something into view: the keep-awake switch took the focus
              entirely behind it (WCAG 2.4.11). */}
          <main id="contido" className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto has-[.trip-bar]:scroll-pb-20">
            <ErrorBoundary t={t} resetKey={activeTab}>
              {/* One heading for the page, naming what is on screen: correct in both the one-pane and the two-pane layout. */}
              <h1 className="sr-only">{screenTitle}</h1>

              {/* Below lg the two panes take turns; from lg up the saved stops stay beside the board. */}
              {activeTab === 'stops' && (
                <div className="page h-full lg:grid lg:grid-cols-12 lg:gap-6 lg:px-6 lg:pt-4">
                  <Pane side="list" shown={!boardStop}>
                    <StopHome favoriteStopIds={favoriteStopIds} favoriteLineIds={favoriteLineIds} onSelectLine={openLine} recentStopIds={recentStopIds} onClearRecent={clearRecentStops} onSelectStop={selectStop} onOpenQrScanner={() => setIsQrModalOpen(true)} />
                  </Pane>
                  <Pane side="detail" shown={!!boardStop}>
                    <StopArrivalsView
                      selectedStop={boardStop ?? selectedStop}
                      onSelectLine={openLine}
                      onViewOnMap={viewStopOnMap}
                      onSelectStop={selectStop}
                      onBack={() => backToList('stops')}
                      isFavorite={favoriteStopIds.includes((boardStop ?? selectedStop).id)}
                      onToggleFavorite={toggleFavoriteStop}
                      viaQr={!!screen.qr && !!boardStop}
                      notices={operatorNotices}
                      changes={noticeChanges}
                      onOpenAlerts={openAlerts}
                    />
                  </Pane>
                </div>
              )}

              {activeTab === 'lines' && (
                <LinesView
                  selectedLine={BUS_LINES.find((l) => l.id === screen.line) ?? selectedLine}
                  lineOpen={!!screen.line}
                  onOpenLine={openLine}
                  onBack={() => backToList('lines')}
                  onSelectStop={selectStop}
                  onViewLineOnMap={viewLineOnMap}
                  favoriteLineIds={favoriteLineIds}
                  onToggleFavoriteLine={toggleFavoriteLine}
                  notices={operatorNotices}
                  changes={noticeChanges}
                  onOpenAlerts={openAlerts}
                />
              )}

              {mapEverOpened && (
                <div className={activeTab === 'map' ? 'contents' : 'hidden'}>
                  <Suspense
                    fallback={
                      <div className="page map-gutter">
                        <div className="map-placeholder flex h-map-desktop animate-waiting items-center justify-center text-body font-medium text-ink-3">{t.map.loadingMap}</div>
                      </div>
                    }
                  >
                    <InteractiveMap selectedStop={stopWasChosen ? selectedStop : undefined} selectedLine={selectedLine} focus={mapFocus} onSelectStop={selectStop} onSelectLine={setSelectedLine} onOpenLine={openLine} visible={activeTab === 'map'} />
                  </Suspense>
                </div>
              )}

              {activeTab === 'plan' &&
                (companion.trip ? (
                  <TripCompanionView companion={companion} />
                ) : (
                  <RoutePlannerView
                    onSelectStop={selectStop}
                    onSelectLine={openLine}
                    destinationRequest={placeRequest}
                    // The ride takes the answer's place in the history: back from it leaves the planner.
                    onStartTrip={(...trip) => {
                      companion.start(...trip);
                      go({ ...screen, ride: true }, true);
                    }}
                    changes={noticeChanges}
                    onOpenAlerts={openAlerts}
                    answerShown={!!screen.trip}
                    onAnswer={(trip, inPlace) => {
                      const replace = inPlace || sideBySide() || !!screen.trip;
                      go({ tab: 'plan', trip, over: screen.trip ? screen.over : !replace }, replace);
                    }}
                    onEditTrip={() => (screen.over ? window.history.back() : go({ tab: 'plan' }, true))}
                    onShowAnswer={(trip) => go({ tab: 'plan', trip, over: true })}
                  />
                ))}
              {activeTab === 'info' && <AlertsView alerts={alerts} />}
              {activeTab === 'fares' && <FaresView />}
            </ErrorBoundary>
          </main>

          <BottomNav activeTab={activeTab} setActiveTab={goToTab} tripActive={companion.trip !== null} />
        </div>

        <MenuDrawer open={isMenuOpen} onClose={() => setIsMenuOpen(false)} onOpenTab={goToTab} alertCount={alerts.announcedIncidents} setLang={setLang} theme={theme} setTheme={setTheme} />
        <FavoritesDrawer
          isOpen={isFavoritesOpen}
          onClose={() => setIsFavoritesOpen(false)}
          favoriteStopIds={favoriteStopIds}
          favoriteLineIds={favoriteLineIds}
          onSelectStop={selectStop}
          onSelectLine={openLine}
          onRemoveFavoriteStop={toggleFavoriteStop}
          onRemoveFavoriteLine={toggleFavoriteLine}
        />
        <QrScannerModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} onSelectStop={(stop) => selectStop(stop, true)} />
      </div>
    </LangContext.Provider>
  );
}
