/**
 * Great-circle distance, in one place. Two functions because the polyline accumulators
 * need unrounded metres and everything in the app wants whole ones.
 */

const EARTH_RADIUS_M = 6371e3;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Metres between two points, unrounded. */
export function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The same, rounded to the metre. */
export const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number =>
  Math.round(metresBetween(lat1, lon1, lat2, lon2));

/** What a device orientation event carries, as far as a heading needs it; iOS adds its own two fields. */
export interface OrientationReading {
  alpha: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

/**
 * Which way the top of the screen faces, in degrees clockwise from north, or null when the
 * reading is not tied to north. iOS hands over the compass heading itself (and -1 as its
 * accuracy while the compass needs calibrating); elsewhere an absolute reading's alpha turns
 * the other way. The screen's own rotation is added: turned sideways, the top of the screen
 * is what was the phone's side.
 */
export function headingFromOrientation(reading: OrientationReading, screenAngle: number): number | null {
  let heading: number;
  if (typeof reading.webkitCompassHeading === 'number' && Number.isFinite(reading.webkitCompassHeading)) {
    if ((reading.webkitCompassAccuracy ?? 0) < 0) return null;
    heading = reading.webkitCompassHeading;
  } else if (reading.absolute && typeof reading.alpha === 'number' && Number.isFinite(reading.alpha)) {
    heading = 360 - reading.alpha;
  } else return null;
  return (((heading + screenAngle) % 360) + 360) % 360;
}

/** Enough sides that the circle of a 500 m wifi fix still reads as a circle. */
const CIRCLE_SIDES = 64;

/**
 * The circle of a fix's accuracy ([lat, lng], metres), as a polygon round the point, so a map
 * draws it at its true size at every zoom. A degree of longitude is shorter than one of
 * latitude by the cosine of the latitude, 0.73 in Lugo: left out, the circle is an ellipse
 * that overstates the error east and west by a third.
 */
export function accuracyCircle([lat, lng]: [number, number], metres: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = (metres / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos(toRad(lat));
  const ring = Array.from({ length: CIRCLE_SIDES + 1 }, (_, i) => {
    const a = (i / CIRCLE_SIDES) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Part of the way from one heading to another, round the short side: 350° to 10° passes north, not south. */
export function turnToward(from: number, to: number, share: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (((from + delta * share) % 360) + 360) % 360;
}
