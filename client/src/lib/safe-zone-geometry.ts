export interface ZoneEllipseRadii {
  x: number;
  y: number;
}

/** Server zone coordinates and radii share the same 0–100 map-percent units. */
export function isOutsideSafeZone(
  xPct: number,
  yPct: number,
  centerXPct: number,
  centerYPct: number,
  radiusPct: number,
): boolean {
  if (![xPct, yPct, centerXPct, centerYPct, radiusPct].every(Number.isFinite)) return false;
  return Math.hypot(xPct - centerXPct, yPct - centerYPct) > Math.max(0, radiusPct);
}

/** Convert a world-space percent radius to canvas pixels without distorting map units. */
export function zoneEllipseRadii(radiusPct: number, width: number, height: number): ZoneEllipseRadii {
  const radius = Number.isFinite(radiusPct) ? Math.max(0, radiusPct) / 100 : 0;
  return {
    x: radius * Math.max(0, width),
    y: radius * Math.max(0, height),
  };
}
