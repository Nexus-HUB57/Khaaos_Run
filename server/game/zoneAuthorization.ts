export function isZoneOperator(userId: string, configuredIds = process.env.ZONE_OPERATOR_IDS ?? ""): boolean {
  if (!userId) return false;
  const allowedIds = new Set(
    configuredIds
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return allowedIds.has(userId);
}
