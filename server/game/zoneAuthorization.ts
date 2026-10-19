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

export function createZoneOperatorGuard(configuredIds = process.env.ZONE_OPERATOR_IDS ?? "") {
  return (req: any, res: any, next: (error?: unknown) => void) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ message: "Unauthorized" });
    const userId = req.user?.claims?.sub;
    if (typeof userId !== "string" || !isZoneOperator(userId, configuredIds)) {
      return res.status(403).json({ message: "Apenas operadores autorizados podem controlar a zona" });
    }
    next();
  };
}
