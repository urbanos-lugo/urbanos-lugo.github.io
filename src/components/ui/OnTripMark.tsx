import { useT } from '../../i18n';

/** The dot on the planner's tab while a ride is followed, said to a screen reader. Where it sits and its fill are the caller's. */
export function OnTripMark({ className }: { className: string }) {
  const t = useT();
  return (
    <>
      <span className={`h-2.5 w-2.5 rounded-pill ${className}`} aria-hidden="true" />
      <span className="sr-only">{t.companion.onTrip}</span>
    </>
  );
}
