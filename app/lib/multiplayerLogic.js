import {
  MULTIPLAYER_DUO_CONTRIBUTION_SIZE,
  MULTIPLAYER_SINGLE_LINEUP_SIZE,
} from "./multiplayerConfig";

function clonePet(pet) {
  return pet ? { ...pet } : null;
}

/**
 * 保留空格與格子順序，讓缺席角色可直接以空格進入正式戰鬥。
 * 陣列一律是後排 → 前排。
 */
export function normalizeLineup(lineup = [], size = MULTIPLAYER_SINGLE_LINEUP_SIZE) {
  return Array.from({ length: size }, (_, index) => clonePet(lineup[index]));
}

/** 只使用 Apps Script 回傳的回合配對快照；前端不自行補算分組。 */
export function resolveDuoPairings(game = {}, challengeId) {
  const safeGame = game ?? {};
  const saved = (safeGame.currentPairings ?? safeGame.duoPairings ?? [])
    .filter((pairing) => !challengeId || String(pairing.challengeId) === String(challengeId));
  return saved;
}

/** 以 Apps Script 回傳的回合配對快照判斷強隊；沒有快照時不擅自決定。 */
export function isHigherRankTeamInPairing(game = {}, teamId, partnerId) {
  const safeGame = game ?? {};
  const pairing = (safeGame.currentPairings ?? safeGame.duoPairings ?? []).find((item) =>
    [String(item.higherRankTeamId), String(item.lowerRankTeamId)].includes(String(teamId))
  );
  return pairing ? String(pairing.higherRankTeamId) === String(teamId) : false;
}

/**
 * 合成雙人關六人隊。弱隊的三格在後，強隊（高排名）的三格在前。
 * 空格不壓縮，battleLogic 會自然略過空格參戰。
 */
export function buildDuoLineup(lowerRankLineup = [], higherRankLineup = []) {
  return [
    ...normalizeLineup(lowerRankLineup, MULTIPLAYER_DUO_CONTRIBUTION_SIZE),
    ...normalizeLineup(higherRankLineup, MULTIPLAYER_DUO_CONTRIBUTION_SIZE),
  ];
}

export function buildLevelDistribution(roster = []) {
  return roster.reduce((distribution, pet) => {
    const level = Math.max(1, Number(pet?.level) || 1);
    distribution[level] = (distribution[level] ?? 0) + 1;
    return distribution;
  }, {});
}

/**
 * 玩家取得的多人公開資料：只能看到自己的當前陣容；其他隊只暴露等級分布。
 * 此函式是未來 API 回傳資料的共同契約，避免 UI 意外使用到他隊陣容。
 */
export function createPlayerGameView(gameState = {}, viewerTeamId) {
  const teams = (gameState.teams ?? []).map((team) => {
    const isViewer = team.teamId === viewerTeamId;
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      rank: team.rank,
      score: team.score,
      levelDistribution: buildLevelDistribution(team.roster),
      currentLineup: isViewer
        ? normalizeLineup(team.currentLineup, team.lineupSize ?? MULTIPLAYER_SINGLE_LINEUP_SIZE)
        : undefined,
    };
  });

  return {
    round: gameState.round,
    phase: gameState.phase,
    teams,
    battleHistory: gameState.battleHistory ?? [],
  };
}

/** 工人模式可用完整狀態；複製資料以避免結算畫面直接改到快取。 */
export function createWorkerGameView(gameState = {}) {
  return {
    ...gameState,
    teams: (gameState.teams ?? []).map((team) => ({
      ...team,
      roster: (team.roster ?? []).map(clonePet),
      currentLineup: normalizeLineup(team.currentLineup, team.lineupSize ?? MULTIPLAYER_SINGLE_LINEUP_SIZE),
    })),
  };
}
