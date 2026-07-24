/** 將單一 Boss 等級的戰鬥結果轉成所有模式共用的等級分數。 */
export function calculateLevelScore(battleResult, bossLevel = 1, { clearScore = 1 } = {}) {
  const enemyInitialHp = Math.max(1, battleResult.rightInitialHp ?? 0);
  const enemyRemainingHp = Math.max(0, battleResult.rightFinalHp ?? 0);
  const cleared = battleResult.rightRemaining === 0 && !battleResult.timedOut;
  const level = Math.max(1, Math.floor(bossLevel));
  return {
    total: cleared ? Number(clearScore) || 0 : 0,
    bossLevel: level,
    highestCleared: cleared ? level : 0,
    clearedLevels: cleared ? [level] : [],
    cleared,
    enemyRemainingHp,
    enemyInitialHp,
    battleRounds: battleResult.battleFrames.length,
  };
}

/** 合併同一關卡各 Boss 等級的分數。 */
export function buildLevelSeriesScore(levelScores = [], { scoreEnabled = true } = {}) {
  if (!scoreEnabled) {
    const cleared = levelScores.some((score) => score.cleared);
    return {
      total: 0,
      bossLevel: 1,
      highestCleared: cleared ? 1 : 0,
      clearedLevels: cleared ? [1] : [],
      cleared,
      enemyRemainingHp: levelScores.at(-1)?.enemyRemainingHp ?? 0,
      enemyInitialHp: levelScores.at(-1)?.enemyInitialHp ?? 0,
      battleRounds: levelScores.reduce((sum, score) => sum + (score.battleRounds ?? 0), 0),
    };
  }
  const clearedLevels = levelScores
    .filter((score) => score.cleared)
    .map((score) => score.bossLevel)
    .sort((a, b) => a - b);
  const highestCleared = clearedLevels.at(-1) ?? 0;
  return {
    total: levelScores.reduce((sum, score) => sum + (Number(score.total) || 0), 0),
    bossLevel: highestCleared || 1,
    highestCleared,
    clearedLevels,
    cleared: clearedLevels.length > 0,
    enemyRemainingHp: levelScores.at(-1)?.enemyRemainingHp ?? 0,
    enemyInitialHp: levelScores.at(-1)?.enemyInitialHp ?? 0,
    battleRounds: levelScores.reduce((sum, score) => sum + (score.battleRounds ?? 0), 0),
  };
}
