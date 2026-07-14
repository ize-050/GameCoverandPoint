export function calculateProgressReward(score: number) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return {
    xpEarned: 50 + Math.floor(safeScore * 0.5),
    coinsEarned: 10 + Math.floor(safeScore / 20),
  };
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}
