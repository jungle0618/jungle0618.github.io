"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GameShell from "../../components/GameShell";
import EnemyScheduleDialog from "../../components/EnemyScheduleDialog";
import StatIcon from "../../components/StatIcon";
import usePointerDrag from "../../hooks/usePointerDrag";
import useTeamSelectionActions from "../../hooks/useTeamSelectionActions";
import { createBattleReplay, runBattle } from "../../lib/battleService";
import { DUO_CHALLENGE_TEAM_SIZE, getChallengeLabel, getMultiplayerRoundChallenges } from "../../lib/challengeConfig";
import { buildChallengeEncounterTeam } from "../../lib/encounterLogic";
import { ITEM_ICONS } from "../../lib/assetConfig";
import { DUO_CLEAR_SCORE, MAX_ROUND } from "../../lib/gameConfig";
import { compactTeamToRight, configureTeamsFromCollection } from "../../lib/lineupLogic";
import { buildDuoLineup, createMultiplayerBattleEnvironment, hasHiddenSingleTestAchievement, isHigherRankTeamInPairing } from "../../lib/multiplayerLogic";
import { formatDisplayName } from "../../lib/petCatalog";
import { buildLevelSeriesScore, calculateLevelScore } from "../../lib/battleScoring";
import {
  getDeployableMultiplayerRoster,
  hydrateMultiplayerRoster,
  hydrateSavedLineup,
  multiplayerTeamName,
  serializeLineup,
} from "./multiplayerAdapter";
import { createMultiplayerApi } from "./multiplayerApi";
import ModeLogin from "./ModeLogin";
import MultiplayerBusyOverlay from "./MultiplayerBusyOverlay";
import MultiplayerOverview, { historyChallengeLabel } from "./MultiplayerOverview";

function playerChallenges(round) {
  return getMultiplayerRoundChallenges(round).map((challenge, index) => ({
    ...challenge,
    teamSize: challenge.kind === "duo" ? DUO_CHALLENGE_TEAM_SIZE / 2 : challenge.teamSize,
    kindLabel: getChallengeLabel(challenge),
    label: `${index + 1}. ${getChallengeLabel(challenge)}｜${challenge.encounter.name}`,
  }));
}

function savedLineupForChallenge(rows, challenge, roster) {
  const matching = rows.filter((row) => String(row.challengeId) === String(challenge.id));
  const slots = Array(challenge.teamSize).fill(null);
  matching.forEach((row) => {
    const index = Number(row.slotIndex);
    if (index >= 0 && index < slots.length) slots[index] = row.petName || null;
  });
  return hydrateSavedLineup(slots, roster, challenge.teamSize);
}

function savedVersion(rows, challengeId) {
  return Math.max(0, ...rows.filter((row) => String(row.challengeId) === String(challengeId)).map((row) => Number(row.version) || 0));
}

function activeSpecialEffectLabels(game, team) {
  if (!team) return [];
  const labels = [];
  if (team.turtleNetEnabled) labels.push("烏龜網路：任一我方龜系死亡時，全場其餘龜系也死亡");
  if (game?.gameState?.isRaining && team.waterParkEnabled) labels.push("公館水樂園：雨天全隊等級 +2");
  return labels;
}

export default function MultiplayerMode({ onBack }) {
  const api = useMemo(() => createMultiplayerApi(), []);
  const [session, setSession] = useState(null);
  const [game, setGame] = useState(null);
  const [teams, setTeams] = useState([]);
  const [pairingTeams, setPairingTeams] = useState([]);
  const [gamePhase, setGamePhase] = useState("prepare");
  const [battleReplay, setBattleReplay] = useState(null);
  const [battleReplays, setBattleReplays] = useState([]);
  const [bossLevel, setBossLevel] = useState(1);
  const [busy, setBusy] = useState(true);
  const [busyAction, setBusyAction] = useState("initial-load");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [compendiumPet, setCompendiumPet] = useState(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [enemyScheduleOpen, setEnemyScheduleOpen] = useState(false);
  const [teamEditMode, setTeamEditMode] = useState("standard");
  const { draggedItem, pointerDragGhost, dragHoverTarget, startPointerDrag, clearDragging } = usePointerDrag();

  useEffect(() => {
    if (!status) return undefined;
    const timeoutId = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    if (!overviewOpen) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setOverviewOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [overviewOpen]);

  const challenges = useMemo(() => playerChallenges(game?.round ?? 1), [game?.round]);
  const duoChallengeIndexes = useMemo(() => challenges
    .map((challenge, index) => challenge.kind === "duo" ? index : null)
    .filter((index) => index !== null), [challenges]);
  const hasPairingMode = duoChallengeIndexes.length > 0 && Boolean(game?.duoPartner);
  const ownTeam = game?.teams?.find((team) => team.teamId === String(session?.teamId));
  const roster = useMemo(() => hydrateMultiplayerRoster(ownTeam?.roster ?? []), [ownTeam?.roster]);
  const partnerRoster = useMemo(() => hydrateMultiplayerRoster(game?.duoPartner?.roster ?? []), [game?.duoPartner?.roster]);
  const viewerIsHigher = useMemo(() => isHigherRankTeamInPairing(
    game,
    session?.teamId,
    game?.duoPartner?.teamId
  ), [game, session?.teamId]);
  const partnerSavedTeams = useMemo(() => {
    if (!game?.duoPartner) return challenges.map(() => null);
    return challenges.map((challenge) => challenge.kind === "duo"
      ? savedLineupForChallenge(game.duoPartner.currentLineups ?? [], challenge, partnerRoster)
      : null);
  }, [challenges, game?.duoPartner, partnerRoster]);
  const standardCompanionLabels = useMemo(() => challenges.map((challenge) => {
    if (challenge.kind !== "duo" || !game?.duoPartner) return null;
    return `${multiplayerTeamName(game.duoPartner)}的三格（${viewerIsHigher ? "聯隊後排" : "聯隊前排"}・唯讀）`;
  }), [challenges, game?.duoPartner, viewerIsHigher]);
  const standardCompanionPlacements = useMemo(() => challenges.map((challenge) =>
    challenge.kind === "duo" && game?.duoPartner && viewerIsHigher ? "before" : "after"
  ), [challenges, game?.duoPartner, viewerIsHigher]);
  const pairDisplayTeams = useMemo(() => challenges.map((challenge, index) =>
    challenge.kind === "duo" ? (pairingTeams[index] ?? partnerSavedTeams[index]) : (teams[index] ?? [])
  ), [challenges, pairingTeams, partnerSavedTeams, teams]);
  const pairCompanionTeams = useMemo(() => challenges.map((challenge, index) =>
    challenge.kind === "duo" ? (teams[index] ?? []) : null
  ), [challenges, teams]);
  const pairCompanionLabels = useMemo(() => challenges.map((challenge) => {
    if (challenge.kind !== "duo" || !ownTeam) return null;
    return `${multiplayerTeamName(ownTeam)}的三格（${viewerIsHigher ? "聯隊前排" : "聯隊後排"}・唯讀）`;
  }), [challenges, ownTeam, viewerIsHigher]);
  const pairCompanionPlacements = useMemo(() => challenges.map((challenge) =>
    challenge.kind === "duo" && game?.duoPartner && viewerIsHigher ? "after" : "before"
  ), [challenges, game?.duoPartner, viewerIsHigher]);
  const displayTeams = teamEditMode === "pair" ? pairDisplayTeams : teams;
  const displayCompanionTeams = teamEditMode === "pair"
    ? pairCompanionTeams
    : challenges.map((challenge, index) => challenge.kind === "duo" ? (pairingTeams[index] ?? partnerSavedTeams[index]) : null);
  const displayCompanionLabels = teamEditMode === "pair" ? pairCompanionLabels : standardCompanionLabels;
  const displayCompanionPlacements = teamEditMode === "pair" ? pairCompanionPlacements : standardCompanionPlacements;
  const editableTeamIndexes = useMemo(() => (
    teamEditMode === "pair"
      ? duoChallengeIndexes
      : challenges.map((_, index) => index)
  ), [challenges, duoChallengeIndexes, teamEditMode]);
  const activeTeams = teamEditMode === "pair" ? pairingTeams : teams;
  const setActiveTeams = teamEditMode === "pair" ? setPairingTeams : setTeams;
  const collectionTeams = useMemo(() => editableTeamIndexes.map((index) => activeTeams[index] ?? []), [activeTeams, editableTeamIndexes]);
  const activeCollection = useMemo(
    () => teamEditMode === "pair" ? getDeployableMultiplayerRoster(partnerRoster) : getDeployableMultiplayerRoster(roster),
    [partnerRoster, roster, teamEditMode]
  );
  const cardProps = useMemo(() => ({ formatDisplayName, itemIcons: ITEM_ICONS, StatIcon, showPersistentProgress: true }), []);
  const activeSpecialEffects = useMemo(() => activeSpecialEffectLabels(game, ownTeam), [game, ownTeam]);

  const loadGame = useCallback(async () => {
    const nextGame = await api.loadPlayerGame();
    setGame(nextGame);
    setGamePhase("prepare");
    setBattleReplay(null);
    setBattleReplays([]);
  }, [api]);

  useEffect(() => {
    if (!game || !ownTeam) return;
    const nextRoster = hydrateMultiplayerRoster(ownTeam.roster ?? []);
    const nextPartnerRoster = hydrateMultiplayerRoster(game.duoPartner?.roster ?? []);
    const nextChallenges = playerChallenges(game.round);
    const nextTeams = nextChallenges.map((challenge) => savedLineupForChallenge(ownTeam.currentLineups ?? [], challenge, nextRoster));
    const nextPairingTeams = nextChallenges.map((challenge) => challenge.kind === "duo"
      ? savedLineupForChallenge(game.duoPartner?.currentLineups ?? [], challenge, nextPartnerRoster)
      : []);
    setTeams(nextTeams);
    setPairingTeams(nextPairingTeams);
  }, [game, ownTeam]);

  useEffect(() => {
    if (teamEditMode === "pair" && !hasPairingMode) setTeamEditMode("standard");
  }, [hasPairingMode, teamEditMode]);

  useEffect(() => {
    let cancelled = false;
    api.loadSession().then(async (current) => {
      if (cancelled || !current.authenticated || current.role !== "team") return;
      setSession(current);
      await loadGame();
    }).catch((nextError) => !cancelled && setError(nextError.message)).finally(() => {
      if (!cancelled) { setBusy(false); setBusyAction(null); }
    });
    return () => { cancelled = true; };
  }, [api, loadGame]);

  const { onDropToSlot } = useTeamSelectionActions({
    gamePhase,
    teams: activeTeams,
    setTeams: setActiveTeams,
    setStatusSuccess: setStatus,
    notifyLineupChanges: false,
    canEditTeamIndex: (teamIndex) => editableTeamIndexes.includes(teamIndex),
    clearDragging,
  });

  function onPointerDownTeamPet(teamIndex, slotIndex, event) {
    if (busy || !editableTeamIndexes.includes(teamIndex) || !activeTeams[teamIndex]?.[slotIndex]) return;
    startPointerDrag({ source: "team", teamIndex, slotIndex, data: activeTeams[teamIndex][slotIndex] }, event, { onDropToSlot, onTap: ({ data }) => setCompendiumPet(data) });
  }

  function onPointerDownCollectionPet(pet, event) {
    if (busy) return;
    startPointerDrag({ source: "collection", data: pet }, event, { onDropToSlot, onTap: ({ data }) => setCompendiumPet(data) });
  }

  function autoConfigureTeams(random = null) {
    clearDragging();
    const configured = configureTeamsFromCollection(getDeployableMultiplayerRoster(roster), challenges, random);
    setTeams(configured);
    setStatus(random ? "已從自己的角色池隨機組隊" : "已從自己的角色池依等級一鍵組隊");
  }

  function randomConfigureTeams() {
    let state = Date.now();
    autoConfigureTeams(() => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    });
  }

  async function login({ accountId, password }) {
    setBusy(true); setBusyAction("login"); setError(null);
    try {
      const nextSession = await api.loginTeam({ teamId: accountId, password });
      setSession(nextSession);
      await loadGame();
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function logout() {
    await api.logout(); setSession(null); setGame(null); setTeams([]); setPairingTeams([]);
  }

  async function saveLineups() {
    setBusy(true); setBusyAction("save"); setError(null);
    try {
      await api.savePlayerLineups({
        round: game.round,
        lineupUpdates: challenges.map((challenge, index) => ({
          challengeId: challenge.id,
          lineup: serializeLineup(teams[index] ?? [], challenge.teamSize),
          version: savedVersion(ownTeam.currentLineups ?? [], challenge.id),
        })),
      });
      await loadGame();
      setStatus("陣容已儲存到伺服器");
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function refreshGame() {
    setBusy(true); setBusyAction("refresh"); setError(null);
    try { await loadGame(); }
    catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); setBusyAction(null); }
  }

  function testBattles() {
    clearDragging();
    const unlockedHiddenAchievement = challenges.some((challenge, index) =>
      challenge.kind === "single" && hasHiddenSingleTestAchievement(teams[index] ?? [])
    );
    const replays = challenges.flatMap((challenge, index) => {
      const ownChallengeTeam = compactTeamToRight(teams[index] ?? [], challenge.teamSize);
      const partnerChallengeTeam = compactTeamToRight((pairingTeams[index] ?? partnerSavedTeams[index] ?? []), challenge.teamSize);
      const battleTeam = challenge.kind === "duo"
        ? (viewerIsHigher
            ? buildDuoLineup(partnerChallengeTeam, ownChallengeTeam)
            : buildDuoLineup(ownChallengeTeam, partnerChallengeTeam))
        : ownChallengeTeam;
      const environment = createMultiplayerBattleEnvironment(
        game,
        challenge.kind === "duo"
          ? [ownTeam, game?.duoPartner].filter(Boolean)
          : [ownTeam].filter(Boolean)
      );
      const challengeReplays = Array.from({ length: challenge.maxBossLevel }, (_, levelIndex) => {
        const level = levelIndex + 1;
        const result = runBattle(
          battleTeam.map((pet) => (pet ? { ...pet } : null)),
          buildChallengeEncounterTeam(challenge, level),
          { environment }
        );
        return createBattleReplay(result, {
          encounterId: `test-${challenge.id}-${level}`,
          encounterName: challenge.encounter.name,
          challenge,
          challengeIndex: index,
          bossLevel: level,
          environment,
          score: calculateLevelScore(result, level, { clearScore: challenge.kind === "duo" ? DUO_CLEAR_SCORE : 1 }),
        });
      });
      const challengeScore = buildLevelSeriesScore(challengeReplays.map((replay) => replay.score));
      return challengeReplays.map((replay) => ({
        ...replay,
        score: {
          ...replay.score,
          roundTotal: challengeScore.total,
          clearedLevels: challengeScore.clearedLevels,
        },
      }));
    });
    setBattleReplays(replays);
    const selectedReplay = replays.find((replay) => replay.score.cleared) ?? replays[0] ?? null;
    setBattleReplay(selectedReplay);
    setBossLevel(selectedReplay?.bossLevel ?? 1);
    setGamePhase("battle");
    setStatus(unlockedHiddenAchievement ? "中了隱藏成就：多人模式單人關測試戰鬥擺出了狗、熊、兔子、耳廓狐、雪貂！" : null);
  }

  async function openHistory(battles, historyGroup) {
    setBusy(true); setBusyAction("history"); setError(null);
    try {
      const sortedBattles = [...battles]
        .filter((battle) => battle && battle.battleId)
        .sort((a, b) => Number(a.bossLevel ?? String(a.battleId).match(/lv(\d+)$/)?.[1]) - Number(b.bossLevel ?? String(b.battleId).match(/lv(\d+)$/)?.[1]));
      if (!sortedBattles.length) throw new Error("這筆戰鬥紀錄缺少可讀取的 battleId");
      const rawReplays = await api.loadBattleReplays(sortedBattles.map((battle) => battle.battleId));
      const challenge = getMultiplayerRoundChallenges(historyGroup.round).find((item) => item.id === historyGroup.challengeId);
      const roundTotal = battles.reduce((total, battle) => total + (Number(battle.score) || 0), 0);
      const replayChallenge = challenge ? {
        ...challenge,
        kindLabel: getChallengeLabel(challenge),
        label: `${getChallengeLabel(challenge)}｜${challenge.encounter.name}`,
      } : null;
      const replays = rawReplays.map((item) => ({
        ...item,
        challenge: replayChallenge ?? item.challenge,
        score: { ...item.score, roundTotal },
      }));
      const replay = replays[0];
      setBattleReplays(replays);
      setBattleReplay(replay ?? null);
      setBossLevel(replay?.bossLevel ?? 1);
      setGamePhase("battle");
      setStatus(`正在播放${historyChallengeLabel(historyGroup.round, historyGroup.challengeId)}正式戰鬥`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  function returnToPreparation() {
    setGamePhase("prepare");
    setBattleReplay(null);
    setBattleReplays([]);
    setBossLevel(1);
    setStatus(null);
  }

  if (!session) return <ModeLogin role="team" onSubmit={login} onBack={onBack} error={error} busy={busy} />;
  if (!game) return <main className="mode-dashboard-page"><p className="mode-loading">{error ?? "讀取遊戲資料中…"}</p></main>;

  const selectedChallenge = battleReplay?.challenge ?? challenges[0];
  const panelChallenges = battleReplay?.battleId && selectedChallenge ? [selectedChallenge] : challenges;
  const challengePanels = panelChallenges.map((challenge) => ({
    challenge,
    monsters: buildChallengeEncounterTeam(challenge, battleReplay?.challenge?.id === challenge.id ? bossLevel : 1),
    score: battleReplay?.challenge?.id === challenge.id ? battleReplay.score : null,
    bossLevel: battleReplay?.challenge?.id === challenge.id ? bossLevel : 1,
    active: battleReplay?.challenge?.id === challenge.id,
  }));

  return (
    <GameShell
      phase={gamePhase}
      headerProps={{
        round: game.round,
        maxRound: MAX_ROUND,
        totalScore: ownTeam?.score ?? 0,
        title: "多人模式",
        subtitle: ownTeam ? `目前隊伍：${multiplayerTeamName(ownTeam)}` : "",
        desktopAsideTitle: "生效的特殊卡效果",
        desktopAsideItems: activeSpecialEffects,
      }}
      teamProps={{
        teams: displayTeams,
        challenges,
        companionTeams: displayCompanionTeams,
        companionLabels: displayCompanionLabels,
        companionPlacements: displayCompanionPlacements,
        editableTeamIndexes,
        isReadOnlyView: busy,
        draggedItem,
        dragHoverTarget,
        onPointerDownTeamPet,
        onAutoConfigureTeam: teamEditMode === "standard" ? () => autoConfigureTeams() : undefined,
        onRandomConfigureTeam: teamEditMode === "standard" ? randomConfigureTeams : undefined,
      }}
      collectionProps={{
        collection: activeCollection,
        teams: collectionTeams,
        isReadOnlyView: busy,
        draggedItem,
        isDragHover: Boolean(draggedItem?.source === "team" && dragHoverTarget?.collection),
        onPointerDownCollectionPet,
        title: hasPairingMode && teamEditMode === "pair" ? `${multiplayerTeamName(game?.duoPartner ?? {})}的角色池` : "角色池",
        action: hasPairingMode ? {
          label: teamEditMode === "pair" ? "切換回自己的角色池" : `切換到${multiplayerTeamName(game?.duoPartner ?? {})}的角色池`,
          onClick: () => setTeamEditMode((current) => current === "pair" ? "standard" : "pair"),
          disabled: busy,
        } : null,
        subtitle: hasPairingMode
          ? (teamEditMode === "pair"
              ? "此角色池只能放到雙人關的自己三格。"
              : "此角色池不能放到雙人關；切到 Pair 模式才可覆蓋雙人關三格。")
          : undefined,
      }}
      battleProps={{ battleReplay, battleReplays, onSelectReplay: (replay) => { setBattleReplay(replay); setBossLevel(replay.bossLevel); } }}
      encounterProps={{ encounter: selectedChallenge?.encounter, monsters: selectedChallenge ? buildChallengeEncounterTeam(selectedChallenge, bossLevel) : [], score: battleReplay?.score, bossLevel, challenges: challengePanels, onSelectMonster: setCompendiumPet }}
      prepareActions={[
        { id: "test", label: "測試戰鬥", onClick: testBattles, disabled: busy },
        { id: "save", label: busyAction === "save" ? "儲存中…" : "儲存陣容", onClick: saveLineups, disabled: busy, active: busyAction === "save", primary: true },
        { id: "refresh", label: busyAction === "refresh" ? "讀取中…" : "重新整理", onClick: refreshGame, disabled: busy, active: busyAction === "refresh", primary: false },
      ]}
      battleActions={{ secondary: { label: "返回編隊", onClick: returnToPreparation } }}
      pointerDragGhost={pointerDragGhost}
      cardProps={cardProps}
      compendiumPet={compendiumPet}
      onCompendiumPetOpened={() => setCompendiumPet(null)}
      quickActions={[
        { id: "teams", label: overviewOpen ? "關閉各隊資訊" : "各隊資訊", onClick: () => setOverviewOpen((open) => !open), expanded: overviewOpen },
        { id: "enemies", label: enemyScheduleOpen ? "關閉敵方資訊" : "敵方資訊", onClick: () => setEnemyScheduleOpen((open) => !open), expanded: enemyScheduleOpen },
      ]}
    >
      {overviewOpen ? <MultiplayerOverview game={game} session={session} cardProps={cardProps} onClose={() => setOverviewOpen(false)} onLogout={logout} onBack={onBack} onSelectHistory={openHistory} /> : null}
      {enemyScheduleOpen ? (
        <EnemyScheduleDialog
          title="多人模式敵方資訊"
          description="依正式回合顯示敵方陣容。"
          maxRound={MAX_ROUND}
          currentRound={game.round}
          getRoundChallenges={getMultiplayerRoundChallenges}
          onClose={() => setEnemyScheduleOpen(false)}
        />
      ) : null}
      {error ? <p className="mode-error multiplayer-status-overlay">{error}</p> : status ? <p className="multiplayer-status-overlay">{status}</p> : null}
      <MultiplayerBusyOverlay active={busy} label={busyAction === "history" ? "正在讀取戰鬥紀錄…" : busyAction === "save" ? "正在儲存並重新讀取資料…" : "正在讀取多人資料…"} />
    </GameShell>
  );
}
