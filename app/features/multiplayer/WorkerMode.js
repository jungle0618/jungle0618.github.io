"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createMultiplayerApi } from "./multiplayerApi";
import ModeLogin from "./ModeLogin";
import MultiplayerOverview, { historyChallengeLabel } from "./MultiplayerOverview";
import MultiplayerBusyOverlay from "./MultiplayerBusyOverlay";
import PetCompendiumLauncher from "../../components/PetCompendiumLauncher";
import BattleSection from "../../components/BattleSection";
import { calculateOfficialRound, getOfficialLineupVersions } from "./officialRound";
import { hydrateMultiplayerRoster, serializeLineup } from "./multiplayerAdapter";
import { getChallengeLabel, getMultiplayerRoundChallenges, setFormalEncounterCatalog } from "../../lib/challengeConfig";
import { ITEM_ICONS } from "../../lib/assetConfig";
import { DRAW_CARDS, INITIAL_ROUND_POOL_NAMES, MAX_LEVEL_GAP, MAX_PET_LEVEL, MAX_ROUND } from "../../lib/gameConfig";
import { formatDisplayName, getPetCompendiumList } from "../../lib/petCatalog";
import { configureTeamsFromCollection } from "../../lib/lineupLogic";
import { canDrawPetAtRound } from "../../lib/cardDrawLogic";
import { ONCE_PER_GAME_PET_NAMES } from "../../lib/characterConfig";
import StatIcon from "../../components/StatIcon";
import EnemyScheduleDialog from "../../components/EnemyScheduleDialog";
import DevTestLauncher from "../../components/DevTestLauncher";

function getSavedLineup(team, challenge, slotCount) {
  const rows = team.currentLineups
    .filter((row) => String(row.challengeId) === challenge.id)
    .sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex));
  return Array.from({ length: slotCount }, (_, index) => rows.find((row) => Number(row.slotIndex) === index)?.petName ?? "");
}

function getLineupVersion(team, challengeId) {
  return Math.max(0, ...team.currentLineups
    .filter((row) => String(row.challengeId) === challengeId)
    .map((row) => Number(row.version) || 0));
}

function createLineupDraft(team, challenges) {
  return Object.fromEntries(challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    return [challenge.id, getSavedLineup(team, challenge, slotCount)];
  }));
}

function createRosterLevelDraft(team, allPets) {
  const rosterByName = new Map((team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet]));
  return Object.fromEntries(allPets.map((pet) => [
    pet.name, Number(rosterByName.get(pet.name)?.level) || 0,
  ]));
}

function buildUsedByChallenge(challenges, drafts) {
  return Object.fromEntries(challenges.map((challenge) => [
    challenge.id,
    new Set(challenges
      .filter((other) => other.id !== challenge.id)
      .flatMap((other) => drafts[other.id] ?? [])
      .filter(Boolean)),
  ]));
}

function lineupsMatch(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function levelRangeFromDraft(draftLevels) {
  const unlockedLevels = Object.values(draftLevels).map((value) => Number(value) || 0).filter((value) => value > 0);
  if (!unlockedLevels.length) return 0;
  return Math.max(...unlockedLevels) - Math.min(...unlockedLevels);
}

function summarizeTeamDraft(team, allPets, challenges, teamLevelDrafts, teamLineupDrafts) {
  const initialLevels = createRosterLevelDraft(team, allPets);
  const draftLevels = teamLevelDrafts[String(team.teamId)] ?? initialLevels;
  const initialLineups = createLineupDraft(team, challenges);
  const draftLineups = teamLineupDrafts[String(team.teamId)] ?? initialLineups;
  let increasedLevels = 0;
  let decreasedLevels = 0;
  allPets.forEach((pet) => {
    const delta = (draftLevels[pet.name] ?? 0) - (initialLevels[pet.name] ?? 0);
    if (delta > 0) increasedLevels += delta;
    if (delta < 0) decreasedLevels += Math.abs(delta);
  });
  const changedChallenges = challenges.filter((challenge) => !lineupsMatch(draftLineups[challenge.id] ?? [], initialLineups[challenge.id] ?? []));
  const levelRange = levelRangeFromDraft(draftLevels);
  return {
    increasedLevels,
    decreasedLevels,
    hasLineupChanges: changedChallenges.length > 0,
    changedChallengeCount: changedChallenges.length,
    levelRange,
    exceedsLevelGap: levelRange >= MAX_LEVEL_GAP,
  };
}

function WorkerLineupEditor({ team, challenges, busy, drafts, onUpdateSlot }) {
  const usedByChallenge = useMemo(() => Object.fromEntries(challenges.map((challenge) => [
    challenge.id,
    new Set(challenges
      .filter((other) => other.id !== challenge.id)
      .flatMap((other) => drafts[other.id] ?? [])
      .filter(Boolean)),
  ])), [challenges, drafts]);

  function updateSlot(challengeId, slotIndex, petName) {
    onUpdateSlot(team.teamId, challengeId, slotIndex, petName);
  }

  return (
    <div className="worker-lineup-editors">
      {challenges.map((challenge) => {
        const lineup = drafts[challenge.id] ?? [];
        const duplicate = lineup.some((name, index) => name && lineup.indexOf(name) !== index);
        const reused = lineup.some((name) => name && usedByChallenge[challenge.id].has(name));
        return (
          <section className="worker-lineup-editor" key={challenge.id}>
            <div className="worker-lineup-editor__heading">
              <strong>{getChallengeLabel(challenge)}｜{challenge.encounter.name}</strong>
              <span>{challenge.kind === "duo" ? "本隊 3 格" : `${challenge.teamSize} 格`}・後排 → 前排</span>
            </div>
            <div className="worker-lineup-slots">
              {lineup.map((petName, slotIndex) => (
                <label key={slotIndex}>
                  <span>{slotIndex + 1}</span>
                  <select value={petName} onChange={(event) => updateSlot(challenge.id, slotIndex, event.target.value)} disabled={busy}>
                    <option value="">空格</option>
                    {team.roster.map((pet) => {
                      const usedOnce = ONCE_PER_GAME_PET_NAMES.includes(String(pet.petName)) && Number(pet.gameRoundsDeployed) > 0;
                      const unavailable = usedOnce || (usedByChallenge[challenge.id].has(String(pet.petName)) && petName !== String(pet.petName));
                      return <option key={pet.petName} value={pet.petName} disabled={unavailable}>{pet.petName} Lv.{pet.level}{usedOnce ? "（已出戰）" : unavailable ? "（已用於其他關卡）" : ""}</option>;
                    })}
                  </select>
                </label>
              ))}
            </div>
            {duplicate ? <small className="worker-lineup-warning">同一陣容有重複角色</small> : null}
            {reused ? <small className="worker-lineup-warning">有角色已用於本回合其他關卡</small> : null}
          </section>
        );
      })}
    </div>
  );
}

function WorkerRosterEditor({ team, allPets, busy, draftLevels, onSetLevel }) {
  const initialLevels = useMemo(() => createRosterLevelDraft(team, allPets), [allPets, team]);

  return (
    <>
      <div className="worker-roster-list worker-roster-list--all-pets">
        {allPets.map((pet) => {
          const level = draftLevels[pet.name] ?? 0;
          const delta = level - initialLevels[pet.name];
          return (
            <div className={level === 0 ? "worker-roster-pet worker-roster-pet--locked" : "worker-roster-pet"} key={pet.name}>
              <div className="worker-roster-pet__identity">
                <img src={pet.image} alt="" />
                <div><strong>{pet.name}</strong><small>稀有度 {pet.tier}</small></div>
              </div>
              <div className="worker-roster-pet__controls">
                <button type="button" aria-label={`${pet.name}降一級`} onClick={() => onSetLevel(team.teamId, pet.name, level - 1)} disabled={busy || level <= 0}>−</button>
                <span>{level > 0 ? `Lv.${level}` : "未解鎖"}</span>
                <button type="button" aria-label={`${pet.name}升一級`} onClick={() => onSetLevel(team.teamId, pet.name, level + 1)} disabled={busy || level >= MAX_PET_LEVEL}>＋</button>
              </div>
              <small className={`worker-roster-pet__delta${delta > 0 ? " is-increase" : delta < 0 ? " is-decrease" : ""}`}>
                {delta > 0 ? `增加 ${delta} 級` : delta < 0 ? `減少 ${Math.abs(delta)} 級` : "等級未變更"}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WorkerAllLineupsDialog({ game, busy, onClose }) {
  const challenges = useMemo(() => getMultiplayerRoundChallenges(game.round), [game.round]);
  const rankedTeams = useMemo(() => [...(game.teams ?? [])]
    .sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99) || String(a.teamId).localeCompare(String(b.teamId))), [game.teams]);

  return (
    <div className="worker-team-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="worker-team-dialog worker-team-dialog--lineup-overview" role="dialog" aria-modal="true" aria-labelledby="worker-all-lineups-title">
        <header className="worker-team-dialog__header">
          <div>
            <h2 id="worker-all-lineups-title">第 {game.round} 回合全部隊伍出戰列表</h2>
            <p>依排名排序；各隊模板由上到下拼接，站位順序為後排 → 前排。</p>
          </div>
          <div className="worker-team-dialog__header-actions">
            <button type="button" onClick={onClose} disabled={busy}>關閉</button>
          </div>
        </header>
        <div className="worker-team-dialog__body worker-team-dialog__body--lineup-overview">
          {rankedTeams.map((team) => (
            <section className="worker-lineup-overview-team" key={team.teamId}>
              <div className="worker-lineup-overview-team__heading">
                <strong>#{team.rank || "—"} {team.teamName || `第 ${team.teamId} 小隊`}</strong>
                <span>{team.score} 分</span>
              </div>
              <div className="worker-lineup-editors">
                {challenges.map((challenge) => {
                  const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
                  const lineup = getSavedLineup(team, challenge, slotCount);
                  return (
                    <section className="worker-lineup-editor worker-lineup-editor--readonly" key={`${team.teamId}-${challenge.id}`}>
                      <div className="worker-lineup-editor__heading">
                        <strong>{getChallengeLabel(challenge)}｜{challenge.encounter.name}</strong>
                        <span>{challenge.kind === "duo" ? "本隊 3 格" : `${challenge.teamSize} 格`}・後排 → 前排</span>
                      </div>
                      <div className="worker-lineup-slots worker-lineup-slots--readonly">
                        {lineup.map((petName, slotIndex) => (
                          <div key={slotIndex} className="worker-lineup-slot-readonly">
                            <span>{slotIndex + 1}</span>
                            <b>{petName || "空格"}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function WorkerMode({ onBack }) {
  const api = useMemo(() => createMultiplayerApi(), []);
  const [session, setSession] = useState(null);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(true);
  const [busyAction, setBusyAction] = useState("initial-load");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [allLineupsOpen, setAllLineupsOpen] = useState(false);
  const [enemyScheduleOpen, setEnemyScheduleOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [workerTestData, setWorkerTestData] = useState(null);
  const [testModeOpen, setTestModeOpen] = useState(false);
  const [battleReplay, setBattleReplay] = useState(null);
  const [battleReplays, setBattleReplays] = useState([]);
  const [bossLevel, setBossLevel] = useState(1);
  const [teamLevelDrafts, setTeamLevelDrafts] = useState({});
  const [teamLineupDrafts, setTeamLineupDrafts] = useState({});
  const allPets = useMemo(() => getPetCompendiumList().slice().sort((a, b) =>
    (Number(b.tier) || 1) - (Number(a.tier) || 1) || String(a.name).localeCompare(String(b.name), "zh-Hant")
  ), []);
  const cardProps = useMemo(() => ({ formatDisplayName, itemIcons: ITEM_ICONS, StatIcon, showPersistentProgress: true }), []);
  const challenges = useMemo(() => game ? getMultiplayerRoundChallenges(game.round) : [], [game]);
  const selectedTeam = useMemo(() => (
    selectedTeamId
      ? (game?.teams ?? []).find((team) => String(team.teamId) === String(selectedTeamId)) ?? null
      : null
  ), [game?.teams, selectedTeamId]);
  const selectedTeamLevelDraft = useMemo(() => (
    selectedTeam ? (teamLevelDrafts[String(selectedTeam.teamId)] ?? createRosterLevelDraft(selectedTeam, allPets)) : null
  ), [allPets, selectedTeam, teamLevelDrafts]);
  const selectedTeamLineupDraft = useMemo(() => (
    selectedTeam ? (teamLineupDrafts[String(selectedTeam.teamId)] ?? createLineupDraft(selectedTeam, challenges)) : null
  ), [challenges, selectedTeam, teamLineupDrafts]);
  const pendingLevelChanges = useMemo(() => {
    if (!game) return 0;
    return game.teams.reduce((total, team) => {
      const draft = teamLevelDrafts[String(team.teamId)];
      if (!draft) return total;
      const initial = createRosterLevelDraft(team, allPets);
      return total + allPets.filter((pet) => draft[pet.name] !== initial[pet.name]).length;
    }, 0);
  }, [allPets, game, teamLevelDrafts]);
  const pendingLineupChanges = useMemo(() => {
    if (!game) return 0;
    return game.teams.reduce((total, team) => {
      const draft = teamLineupDrafts[String(team.teamId)];
      if (!draft) return total;
      const initial = createLineupDraft(team, challenges);
      return total + challenges.filter((challenge) => JSON.stringify(draft[challenge.id] ?? []) !== JSON.stringify(initial[challenge.id] ?? [])).length;
    }, 0);
  }, [challenges, game, teamLineupDrafts]);
  const teamDraftSummaries = useMemo(() => {
    if (!game) return {};
    return Object.fromEntries(game.teams.map((team) => [
      String(team.teamId),
      summarizeTeamDraft(team, allPets, challenges, teamLevelDrafts, teamLineupDrafts),
    ]));
  }, [allPets, challenges, game, teamLevelDrafts, teamLineupDrafts]);
  const hasPendingChanges = pendingLevelChanges > 0 || pendingLineupChanges > 0;

  useEffect(() => {
    if (!status) return undefined;
    const timeoutId = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const loadGame = useCallback(async () => {
    const nextGame = await api.loadWorkerGame();
    setFormalEncounterCatalog(nextGame.formalEncounters ?? []);
    setGame(nextGame);
    setTeamLevelDrafts({});
    setTeamLineupDrafts({});
  }, [api]);
  useEffect(() => {
    let cancelled = false;
    api.loadSession().then(async (current) => {
      if (cancelled || !current.authenticated || current.role !== "worker") return;
      setSession(current);
      await loadGame();
    }).catch((nextError) => !cancelled && setError(nextError.message)).finally(() => {
      if (!cancelled) { setBusy(false); setBusyAction(null); }
    });
    return () => { cancelled = true; };
  }, [api, loadGame]);

  useEffect(() => {
    if (!overviewOpen) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setOverviewOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [overviewOpen]);

  useEffect(() => {
    if (!allLineupsOpen) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setAllLineupsOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [allLineupsOpen]);

  useEffect(() => {
    if (!selectedTeamId || busy) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setSelectedTeamId(null);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, selectedTeamId]);

  async function login({ accountId, password }) {
    setBusy(true); setBusyAction("login");
    setError(null);
    try {
      const nextSession = await api.loginWorker({ workerId: accountId, password });
      setSession(nextSession);
      await loadGame();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false); setBusyAction(null);
    }
  }

  async function selectTeam(teamId) {
    setSelectedTeamId(String(teamId));
  }

  function updateTeamLevelDraft(teamId, petName, level) {
    const normalizedTeamId = String(teamId);
    const team = (game?.teams ?? []).find((item) => String(item.teamId) === normalizedTeamId);
    if (!team) return;
    setTeamLevelDrafts((current) => {
      const base = current[normalizedTeamId] ?? createRosterLevelDraft(team, allPets);
      return {
        ...current,
        [normalizedTeamId]: {
          ...base,
          [petName]: Math.max(0, Math.min(MAX_PET_LEVEL, Math.floor(Number(level) || 0))),
        },
      };
    });
  }

  function updateTeamLineupDraft(teamId, challengeId, slotIndex, petName) {
    const normalizedTeamId = String(teamId);
    const team = (game?.teams ?? []).find((item) => String(item.teamId) === normalizedTeamId);
    if (!team) return;
    setTeamLineupDrafts((current) => {
      const base = current[normalizedTeamId] ?? createLineupDraft(team, challenges);
      return {
        ...current,
        [normalizedTeamId]: {
          ...base,
          [challengeId]: (base[challengeId] ?? []).map((value, index) => index === slotIndex ? petName : value),
        },
      };
    });
  }

  async function openTestMode() {
    setBusy(true); setBusyAction("test-data"); setError(null);
    try {
      setWorkerTestData(await api.loadWorkerTestData());
      setTestModeOpen(true);
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); setBusyAction(null); }
  }

  async function resetTeamPassword() {
    const password = window.prompt(`請輸入第 ${selectedTeam.teamId} 小隊的新密碼（至少 4 個字元）`);
    if (password == null) return;
    setBusy(true); setBusyAction("password"); setError(null); setStatus(null);
    try {
      await api.resetTeamPassword({ teamId: selectedTeam.teamId, password });
      setStatus(`第 ${selectedTeam.teamId} 小隊密碼已重設`);
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); setBusyAction(null); }
  }

  async function logout() {
    await api.logout();
    setSession(null);
    setGame(null);
  }

  async function drawRosters() {
    if (game.round === 1) {
      setError("第 1 回合不抽卡；請改用固定初始 10 張按鈕");
      return;
    }
    if (!window.confirm(`確定要讓每個小隊各抽 ${DRAW_CARDS} 張卡片嗎？`)) return;
    setBusy(true); setBusyAction("draw"); setError(null);
    try {
      const result = await api.drawRosters({
        cardCount: DRAW_CARDS,
        eligiblePetNames: getPetCompendiumList()
          .filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, game.round))
          .map((pet) => pet.name),
      });
      await loadGame();
      setStatus(`第 ${result.round} 回合自動抽卡完成：${result.teams.length} 個小隊各抽 ${result.cardCount} 張`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function drawSelectedTeamRoster(teamId) {
    if (game.round === 1) {
      setError("第 1 回合不抽卡；請改用固定初始 10 張規則");
      return;
    }
    if (!window.confirm(`確定要讓第 ${teamId} 小隊自動抽 ${DRAW_CARDS} 張卡片嗎？`)) return;
    setBusy(true); setBusyAction("draw-one"); setError(null); setStatus(null);
    try {
      const result = await api.drawRosters({
        cardCount: DRAW_CARDS,
        teamIds: [String(teamId)],
        eligiblePetNames: getPetCompendiumList()
          .filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, game.round))
          .map((pet) => pet.name),
      });
      await loadGame();
      setStatus(`第 ${result.round} 回合已替第 ${teamId} 小隊自動抽 ${result.cardCount} 張卡片`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function setInitialRostersForAllTeams() {
    if (!window.confirm(`確定要把所有小隊角色池改成固定初始 ${INITIAL_ROUND_POOL_NAMES.length} 張嗎？這會清空本回合已設定的陣容。`)) return;
    setBusy(true); setBusyAction("initial-rosters"); setError(null); setStatus(null);
    try {
      const result = await api.setInitialRosters({ clearCurrentRoundLineups: true });
      await loadGame();
      setStatus(`已將 ${result.teams} 個小隊重設為固定初始 ${result.initialPoolSize} 張角色池，並清空第 ${result.round} 回合陣容`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function saveAllChanges() {
    if (!game || !hasPendingChanges) return;
    const lineupValidation = game.teams.map((team) => {
      const drafts = teamLineupDrafts[String(team.teamId)] ?? createLineupDraft(team, challenges);
      const usedByChallenge = buildUsedByChallenge(challenges, drafts);
      const invalidChallenge = challenges.find((challenge) => {
        const lineup = drafts[challenge.id] ?? [];
        const duplicate = lineup.some((name, index) => name && lineup.indexOf(name) !== index);
        const reused = lineup.some((name) => name && usedByChallenge[challenge.id].has(name));
        return duplicate || reused;
      });
      return invalidChallenge ? { team, challenge: invalidChallenge } : null;
    }).find(Boolean);
    if (lineupValidation) {
      setError(`第 ${lineupValidation.team.teamId} 小隊的 ${getChallengeLabel(lineupValidation.challenge)} 陣容有重複或跨關重用角色`);
      return;
    }

    setBusy(true); setBusyAction("save-all"); setError(null); setStatus("正在儲存所有暫存變更…");
    try {
      const teams = game.teams.map((team) => {
        const teamId = String(team.teamId);
        const rosterDraft = teamLevelDrafts[teamId];
        const lineupDraft = teamLineupDrafts[teamId];
        const rosterByName = new Map((team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet]));
        const initialLevels = createRosterLevelDraft(team, allPets);
        const initialLineups = createLineupDraft(team, challenges);
        const rosterUpdates = rosterDraft
          ? allPets
            .filter((pet) => rosterDraft[pet.name] !== initialLevels[pet.name])
            .map((pet) => {
              const rosterPet = rosterByName.get(pet.name);
              return { petName: pet.name, level: rosterDraft[pet.name], version: Number(rosterPet?.version) || 0 };
            })
          : [];
        const lineupUpdates = lineupDraft
          ? challenges
            .filter((challenge) => !lineupsMatch(lineupDraft[challenge.id] ?? [], initialLineups[challenge.id] ?? []))
            .map((challenge) => ({
              challengeId: challenge.id,
              lineup: lineupDraft[challenge.id] ?? [],
              version: getLineupVersion(team, challenge.id),
            }))
          : [];
        return rosterUpdates.length || lineupUpdates.length ? { teamId, rosterUpdates, lineupUpdates } : null;
      }).filter(Boolean);
      const result = await api.saveWorkerDrafts({ round: game.round, teams });
      await loadGame();
      setStatus(`已批次儲存 ${result.updatedPets ?? 0} 項等級變更與 ${result.updatedChallenges ?? 0} 個關卡陣容`);
      setSelectedTeamId(null);
    } catch (nextError) {
      setError(nextError.message);
      setStatus(null);
    } finally {
      setBusy(false); setBusyAction(null);
    }
  }

  async function autoConfigureAllLineups() {
    if (!window.confirm(`確定要依目前角色等級，替所有小隊自動配置第 ${game.round} 回合陣容嗎？`)) return;
    setBusy(true); setBusyAction("auto-lineups"); setError(null); setStatus(null);
    try {
      const roundGame = await api.loadWorkerRoundData();
      setFormalEncounterCatalog(roundGame.formalEncounters ?? []);
      const roundChallenges = getMultiplayerRoundChallenges(roundGame.round).map((challenge) => ({
        ...challenge,
        teamSize: challenge.kind === "duo" ? 3 : challenge.teamSize,
      }));
      const lineups = roundGame.teams.flatMap((team) => {
        const configured = configureTeamsFromCollection(hydrateMultiplayerRoster(team.roster), roundChallenges);
        return roundChallenges.map((challenge, index) => ({
          teamId: team.teamId,
          challengeId: challenge.id,
          lineup: serializeLineup(configured[index], challenge.teamSize),
        }));
      });
      const result = await api.autoConfigureAllLineups({ round: roundGame.round, lineups });
      await loadGame();
      setStatus(`已替 ${result.teams} 個小隊完成第 ${result.round} 回合一鍵組隊`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function resolveRound() {
    if (!window.confirm(`確定要正式結算第 ${game.round} 回合並鎖定目前所有陣容嗎？`)) return;
    setBusy(true); setBusyAction("resolve"); setError(null); setStatus("正在前端計算所有正式戰鬥…");
    try {
      const currentGame = await api.loadWorkerRoundData();
      setFormalEncounterCatalog(currentGame.formalEncounters ?? []);
      setGame(currentGame);
      const result = calculateOfficialRound(currentGame);
      setStatus(`已完成 ${result.battles.length} 場戰鬥，正在寫入 Google Sheet…`);
      const saved = await api.saveOfficialRound({
        round: currentGame.round,
        version: currentGame.version,
        lineupVersions: getOfficialLineupVersions(currentGame),
        battles: result.battles,
      });
      await loadGame();
      setStatus(saved.phase === "finished" ? "全部回合已正式結算" : `正式結算完成，已進入第 ${saved.round} 回合`);
    } catch (nextError) { setError(nextError.message); setStatus(null); } finally { setBusy(false); setBusyAction(null); }
  }

  async function resetGame() {
    const confirmation = window.prompt("這會清除所有角色池、陣容、分數與戰報，並回到第 1 回合。\n密碼雜湊不會修改。若確定，請輸入 RESET");
    if (confirmation !== "RESET") {
      if (confirmation != null) setError("未輸入 RESET，已取消重置");
      return;
    }
    setBusy(true); setBusyAction("reset"); setError(null); setStatus(null);
    try {
      await api.resetGame(confirmation);
      await loadGame();
      setStatus("遊戲已重置到第 1 回合；所有帳號密碼雜湊均已保留");
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function refreshGame() {
    setBusy(true); setBusyAction("refresh"); setError(null);
    try { await loadGame(); }
    catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); setBusyAction(null); }
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
      const replay = replays[0] ?? null;
      setBattleReplays(replays);
      setBattleReplay(replay);
      setBossLevel(replay?.bossLevel ?? 1);
      setOverviewOpen(false);
      setStatus(`正在播放${historyChallengeLabel(historyGroup.round, historyGroup.challengeId)}正式戰鬥`);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false); setBusyAction(null);
    }
  }

  if (!session) return <ModeLogin role="worker" onSubmit={login} onBack={onBack} error={error} busy={busy} />;
  if (testModeOpen) {
    return (
      <DevTestLauncher
        standalone
        workerTestData={workerTestData ?? {}}
        loadAnalysis={(challengeId) => api.loadWorkerAnalysis(challengeId)}
        onBack={() => setTestModeOpen(false)}
      />
    );
  }
  return (
    <main className="mode-dashboard-page mode-dashboard-page--worker">
      <header className="mode-dashboard-header">
        <div><span>管理工具</span><h1>工人模式</h1></div>
        <div className="mode-dashboard-actions">
          <div className="worker-action-group worker-action-group--info" aria-label="工人資訊">
            <button onClick={() => setOverviewOpen(true)} disabled={busy || !game}>各隊資訊</button>
            <button onClick={() => setAllLineupsOpen(true)} disabled={busy || !game}>本回合全部出戰列表</button>
            <PetCompendiumLauncher includeEnemies includeLegendary />
            <button onClick={() => setEnemyScheduleOpen(true)} disabled={busy || !game}>關卡敵方陣容</button>
          <button onClick={openTestMode} disabled={busy}>測試模式</button>
          </div>
          <div className="worker-action-group worker-action-group--game" aria-label="回合操作">
            <button className={busyAction === "initial-rosters" ? "is-pending" : ""} onClick={setInitialRostersForAllTeams} disabled={busy || !game || game.phase === "finished"}>{busyAction === "initial-rosters" ? "設定中…" : `全部隊伍設為初始 ${INITIAL_ROUND_POOL_NAMES.length} 張`}</button>
            <button className={busyAction === "draw" ? "is-pending" : ""} onClick={drawRosters} disabled={busy || !game || game.phase === "finished" || game.round === 1}>{busyAction === "draw" ? "抽卡中…" : `自動抽卡（第 2 回合後，每隊 ${DRAW_CARDS} 張）`}</button>
            <button className={busyAction === "auto-lineups" ? "is-pending" : ""} onClick={autoConfigureAllLineups} disabled={busy || !game || game.phase === "finished"}>{busyAction === "auto-lineups" ? "組隊中…" : "所有隊伍一鍵組隊"}</button>
            <button className={busyAction === "resolve" ? "is-pending" : ""} onClick={resolveRound} disabled={busy || !game || game.phase === "finished"}>{busyAction === "resolve" ? "結算中…" : "正式結算並進入下一回合"}</button>
          </div>
          <div className="worker-action-group worker-action-group--session" aria-label="工作階段">
            <button className={`worker-reset-button${busyAction === "reset" ? " is-pending" : ""}`} onClick={resetGame} disabled={busy}>{busyAction === "reset" ? "重置中…" : "Reset 遊戲"}</button>
            <button className={busyAction === "refresh" ? "is-pending" : ""} onClick={refreshGame} disabled={busy}>{busyAction === "refresh" ? "讀取中…" : "重新整理"}</button>
            <button onClick={logout} disabled={busy}>登出</button>
            <button onClick={onBack} disabled={busy}>回主頁</button>
          </div>
        </div>
      </header>
      {error ? <p className="mode-error">{error}</p> : null}
      {status ? <p className="status-box status-success">{status}</p> : null}
      {!game ? <p className="mode-loading">讀取遊戲資料中…</p> : (
        <>
          <section className="mode-panel"><h2>第 {game.round} 回合・{game.phase}</h2><p>資料版本 {game.version}</p></section>
          <section className="mode-panel"><h2>所有小隊目前資料</h2><p>點選一個小隊編輯草稿；完成後回到主畫面底部統一儲存。</p><div className="worker-team-grid">{game.teams.map((team) => {
            const draftSummary = teamDraftSummaries[String(team.teamId)] ?? {
              increasedLevels: 0,
              decreasedLevels: 0,
              hasLineupChanges: false,
              changedChallengeCount: 0,
              levelRange: 0,
              exceedsLevelGap: false,
            };
            return (
          <button type="button" className={`worker-team-card${draftSummary.exceedsLevelGap ? " worker-team-card--warning" : ""}`} key={team.teamId} onClick={() => selectTeam(team.teamId)} disabled={busy}>
              <strong>#{team.rank || "—"} {team.teamName || `第 ${team.teamId} 小隊`}</strong>
              <span>{team.score} 分</span>
              <span>已解鎖 {team.rosterCount ?? team.roster?.length ?? 0} 隻角色</span>
              {draftSummary.increasedLevels || draftSummary.decreasedLevels || draftSummary.hasLineupChanges || draftSummary.exceedsLevelGap ? (
                <div className="worker-team-card__drafts">
                  {draftSummary.increasedLevels || draftSummary.decreasedLevels ? (
                    <small className="is-dirty">
                      等級 {draftSummary.increasedLevels ? `+${draftSummary.increasedLevels}` : "+0"} / {draftSummary.decreasedLevels ? `-${draftSummary.decreasedLevels}` : "-0"}
                    </small>
                  ) : null}
                  {draftSummary.hasLineupChanges ? (
                    <small className="is-dirty">
                      陣容已修改 {draftSummary.changedChallengeCount} 關
                    </small>
                  ) : null}
                  {draftSummary.exceedsLevelGap ? (
                    <small className="is-warning">
                      等級差 {draftSummary.levelRange}，已達警戒值 {MAX_LEVEL_GAP}
                    </small>
                  ) : null}
                </div>
              ) : null}
            </button>
            );
          })}</div></section>
          <section className="mode-panel">
            <h2>統一儲存</h2>
            <p>目前暫存 {pendingLevelChanges} 項等級變更、{pendingLineupChanges} 個關卡陣容。編輯小隊時不會立即送出；按下這裡才會寫回 Google Sheet。</p>
            <button type="button" className={`worker-lineup-save${busyAction === "save-all" ? " is-pending" : ""}`} onClick={saveAllChanges} disabled={busy || !hasPendingChanges}>
              {busyAction === "save-all" ? "儲存中…" : hasPendingChanges ? "儲存所有暫存變更" : "目前沒有待儲存變更"}
            </button>
          </section>
        </>
      )}
      {selectedTeamId ? (
        <div className="worker-team-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setSelectedTeamId(null)}>
          {selectedTeam ? <section className="worker-team-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-team-dialog-title">
            <header className="worker-team-dialog__header">
              <div><h2 id="worker-team-dialog-title">#{selectedTeam.rank || "—"} {selectedTeam.teamName || `第 ${selectedTeam.teamId} 小隊`}</h2><p>{selectedTeam.score} 分・已解鎖 {selectedTeam.roster?.length ?? selectedTeam.rosterCount ?? 0} 隻</p></div>
              <div className="worker-team-dialog__header-actions">
                <button type="button" onClick={resetTeamPassword} disabled={busy}>重設密碼</button>
                <button type="button" onClick={() => setSelectedTeamId(null)} disabled={busy}>關閉</button>
              </div>
            </header>
            <div className="worker-team-dialog__body">
              <section className="worker-team-detail__section">
                <h3>調整角色等級</h3>
                <p>Lv.0 代表未解鎖；每張角色卡下方會顯示本次增加或減少的等級，變更會先暫存在本頁。</p>
                <button type="button" className="worker-lineup-save" onClick={() => drawSelectedTeamRoster(selectedTeam.teamId)} disabled={busy || !game || game.phase === "finished" || game.round === 1}>
                  {busyAction === "draw-one" ? "抽卡中…" : `這隊自動抽 ${DRAW_CARDS} 張`}
                </button>
                <WorkerRosterEditor team={selectedTeam} allPets={allPets} busy={busy} draftLevels={selectedTeamLevelDraft} onSetLevel={updateTeamLevelDraft} />
              </section>
              <section className="worker-team-detail__section">
                <h3>設定出戰隊伍</h3>
                <p>陣容變更會先暫存；請回主畫面底部按一次儲存。</p>
                <WorkerLineupEditor team={selectedTeam} challenges={challenges} busy={busy} drafts={selectedTeamLineupDraft} onUpdateSlot={updateTeamLineupDraft} />
              </section>
            </div>
          </section> : <section className="worker-team-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-team-dialog-title"><p className="mode-loading">找不到隊伍資料，請重新整理</p></section>}
        </div>
      ) : null}
      {allLineupsOpen && game ? <WorkerAllLineupsDialog game={game} busy={busy} onClose={() => setAllLineupsOpen(false)} /> : null}
      {overviewOpen && game ? <MultiplayerOverview game={game} session={session} cardProps={cardProps} onClose={() => setOverviewOpen(false)} onLogout={logout} onBack={onBack} onSelectHistory={openHistory} /> : null}
      {enemyScheduleOpen ? (
        <EnemyScheduleDialog
          title="正式版關卡敵方陣容"
          description="依正式多人模式順序顯示；陣容方向為後排 → 前排，面板為 Lv.1。"
          maxRound={MAX_ROUND}
          currentRound={game.round}
          getRoundChallenges={getMultiplayerRoundChallenges}
          onClose={() => setEnemyScheduleOpen(false)}
        />
      ) : null}
      {battleReplay ? (
        <div className="game-tutorial-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) {
            setBattleReplay(null);
            setBattleReplays([]);
            setBossLevel(1);
          }
        }}>
          <section className="game-compendium-dialog multiplayer-info-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-history-title">
            <div className="game-settings-dialog-header">
              <h2 id="worker-history-title" className="game-settings-dialog-title">過去戰鬥回放</h2>
              <button type="button" className="game-tutorial-close" onClick={() => {
                setBattleReplay(null);
                setBattleReplays([]);
                setBossLevel(1);
              }}>關閉</button>
            </div>
            <div className="pet-compendium-body multiplayer-info-body">
              <BattleSection
                battleReplay={battleReplay}
                battleReplays={battleReplays}
                onSelectReplay={(replay) => {
                  setBattleReplay(replay);
                  setBossLevel(replay?.bossLevel ?? 1);
                }}
              />
            </div>
          </section>
        </div>
      ) : null}
      <MultiplayerBusyOverlay active={busy} label={busyAction === "resolve" ? "正在結算並讀取下一回合…" : busyAction === "reset" ? "正在重置並重新讀取資料…" : "正在處理多人資料…"} />
    </main>
  );
}
