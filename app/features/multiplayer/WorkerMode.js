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
import { DRAW_CARDS, INITIAL_ROUND_POOL_NAMES, MAX_PET_LEVEL, MAX_ROUND } from "../../lib/gameConfig";
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

function WorkerLineupEditor({ team, round, challenges, busy, onSave }) {
  const initialLineups = useMemo(() => Object.fromEntries(challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    return [challenge.id, getSavedLineup(team, challenge, slotCount)];
  })), [challenges, team]);
  const [drafts, setDrafts] = useState(initialLineups);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => setDrafts(initialLineups), [initialLineups]);

  const usedByChallenge = useMemo(() => Object.fromEntries(challenges.map((challenge) => [
    challenge.id,
    new Set(challenges
      .filter((other) => other.id !== challenge.id)
      .flatMap((other) => drafts[other.id] ?? [])
      .filter(Boolean)),
  ])), [challenges, drafts]);

  function updateSlot(challengeId, slotIndex, petName) {
    setDrafts((current) => ({
      ...current,
      [challengeId]: current[challengeId].map((value, index) => index === slotIndex ? petName : value),
    }));
  }

  async function save(challenge) {
    setSavingId(challenge.id);
    try {
      await onSave({
        teamId: team.teamId,
        round,
        challengeId: challenge.id,
        lineup: drafts[challenge.id],
        version: getLineupVersion(team, challenge.id),
      });
    } finally {
      setSavingId(null);
    }
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
                  <select value={petName} onChange={(event) => updateSlot(challenge.id, slotIndex, event.target.value)} disabled={busy || savingId === challenge.id}>
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
            <button className="worker-lineup-save" onClick={() => save(challenge)} disabled={busy || savingId || duplicate || reused}>
              {savingId === challenge.id ? "儲存中…" : "儲存這個陣容"}
            </button>
          </section>
        );
      })}
    </div>
  );
}

function WorkerRosterEditor({ team, busy, onSaveLevels }) {
  const allPets = useMemo(() => getPetCompendiumList().slice().sort((a, b) =>
    (Number(b.tier) || 1) - (Number(a.tier) || 1) || String(a.name).localeCompare(String(b.name), "zh-Hant")
  ), []);
  const rosterByName = useMemo(() => new Map((team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet])), [team.roster, team.rosterMeta]);
  const initialLevels = useMemo(() => Object.fromEntries(allPets.map((pet) => [
    pet.name, Number(rosterByName.get(pet.name)?.level) || 0,
  ])), [allPets, rosterByName]);
  const [draftLevels, setDraftLevels] = useState(initialLevels);
  const changedPets = allPets.filter((pet) => draftLevels[pet.name] !== initialLevels[pet.name]);

  useEffect(() => setDraftLevels(initialLevels), [initialLevels]);

  function setLevel(petName, level) {
    setDraftLevels((current) => ({
      ...current,
      [petName]: Math.max(0, Math.min(MAX_PET_LEVEL, Math.floor(Number(level) || 0))),
    }));
  }

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
                <button type="button" aria-label={`${pet.name}降一級`} onClick={() => setLevel(pet.name, level - 1)} disabled={busy || level <= 0}>−</button>
                <span>{level > 0 ? `Lv.${level}` : "未解鎖"}</span>
                <button type="button" aria-label={`${pet.name}升一級`} onClick={() => setLevel(pet.name, level + 1)} disabled={busy || level >= MAX_PET_LEVEL}>＋</button>
              </div>
              <small className={`worker-roster-pet__delta${delta > 0 ? " is-increase" : delta < 0 ? " is-decrease" : ""}`}>
                {delta > 0 ? `增加 ${delta} 級` : delta < 0 ? `減少 ${Math.abs(delta)} 級` : "等級未變更"}
              </small>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="worker-lineup-save"
        disabled={busy || changedPets.length === 0}
        onClick={() => onSaveLevels({
          teamId: team.teamId,
          updates: changedPets.map((pet) => {
            const rosterPet = rosterByName.get(pet.name);
            return { petName: pet.name, level: draftLevels[pet.name], version: Number(rosterPet?.version) || 0 };
          }),
        })}
      >
        {changedPets.length ? `確認等級變更（${changedPets.length} 隻）` : "等級未變更"}
      </button>
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
  const [selectedTeamDetails, setSelectedTeamDetails] = useState(null);
  const [workerTestData, setWorkerTestData] = useState(null);
  const [testModeOpen, setTestModeOpen] = useState(false);
  const [battleReplay, setBattleReplay] = useState(null);
  const [battleReplays, setBattleReplays] = useState([]);
  const [bossLevel, setBossLevel] = useState(1);
  const cardProps = useMemo(() => ({ formatDisplayName, itemIcons: ITEM_ICONS, StatIcon, showPersistentProgress: true }), []);
  // 摘要資料刻意不含 roster；點選隊伍後必須等 loadWorkerTeam 完整資料回來。
  const selectedTeam = selectedTeamId ? selectedTeamDetails : null;

  useEffect(() => {
    if (!status) return undefined;
    const timeoutId = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const loadGame = useCallback(async () => {
    const nextGame = await api.loadWorkerGame();
    setFormalEncounterCatalog(nextGame.formalEncounters ?? []);
    setGame(nextGame);
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
    setSelectedTeamDetails(null);
    try { const result = await api.loadWorkerTeam(teamId); setSelectedTeamDetails(result.team); }
    catch (nextError) { setError(nextError.message); }
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
      if (selectedTeamId === String(teamId)) {
        const refreshed = await api.loadWorkerTeam(teamId);
        setSelectedTeamDetails(refreshed.team);
      }
      setStatus(`第 ${result.round} 回合已替第 ${teamId} 小隊自動抽 ${result.cardCount} 張卡片`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function setInitialRostersForAllTeams() {
    if (!window.confirm(`確定要把所有小隊角色池改成固定初始 ${INITIAL_ROUND_POOL_NAMES.length} 張嗎？這會清空本回合已設定的陣容。`)) return;
    setBusy(true); setBusyAction("initial-rosters"); setError(null); setStatus(null);
    try {
      const result = await api.setInitialRosters({ clearCurrentRoundLineups: true });
      await loadGame();
      if (selectedTeamId) {
        const refreshed = await api.loadWorkerTeam(selectedTeamId);
        setSelectedTeamDetails(refreshed.team);
      }
      setStatus(`已將 ${result.teams} 個小隊重設為固定初始 ${result.initialPoolSize} 張角色池，並清空第 ${result.round} 回合陣容`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function saveRosterLevels(payload) {
    setBusy(true); setBusyAction("levels"); setError(null); setStatus(null);
    try {
      const result = await api.updateRosterLevels(payload);
      await loadGame();
      setStatus(`已確認 ${result.updated} 隻角色的等級變更；解鎖 ${result.unlocked ?? 0} 隻，鎖定 ${result.locked ?? 0} 隻`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
  }

  async function saveLineup(payload) {
    setBusy(true); setBusyAction("lineup"); setError(null); setStatus(null);
    try {
      await api.saveWorkerLineup(payload);
      await loadGame();
      setStatus("陣容已儲存；未填滿的欄位會以空格參戰");
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); setBusyAction(null); }
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
          <section className="mode-panel"><h2>所有小隊目前資料</h2><p>點選一個小隊，開啟完整的角色等級與出戰隊伍設定。</p><div className="worker-team-grid">{game.teams.map((team) => (
          <button type="button" className="worker-team-card" key={team.teamId} onClick={() => selectTeam(team.teamId)} disabled={busy}>
              <strong>#{team.rank || "—"} {team.teamName || `第 ${team.teamId} 小隊`}</strong>
              <span>{team.score} 分</span>
              <span>已解鎖 {team.rosterCount ?? team.roster?.length ?? 0} 隻角色</span>
            </button>
          ))}</div></section>
        </>
      )}
      {selectedTeamId ? (
        <div className="worker-team-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setSelectedTeamId(null)}>
          {selectedTeam ? <section className="worker-team-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-team-dialog-title">
            <header className="worker-team-dialog__header">
              <div><h2 id="worker-team-dialog-title">#{selectedTeam.rank || "—"} {selectedTeam.teamName || `第 ${selectedTeam.teamId} 小隊`}</h2><p>{selectedTeam.score} 分・已解鎖 {selectedTeam.roster?.length ?? selectedTeam.rosterCount ?? 0} 隻</p></div>
              <div className="worker-team-dialog__header-actions">
                <button type="button" onClick={resetTeamPassword} disabled={busy}>重設密碼</button>
                <button type="button" onClick={() => { setSelectedTeamId(null); setSelectedTeamDetails(null); }} disabled={busy}>關閉</button>
              </div>
            </header>
            <div className="worker-team-dialog__body">
              <section className="worker-team-detail__section">
                <h3>調整角色等級</h3>
                <p>Lv.0 代表未解鎖；每張角色卡下方會顯示本次增加或減少的等級，按確認後才送出。</p>
                <button type="button" className="worker-lineup-save" onClick={() => drawSelectedTeamRoster(selectedTeam.teamId)} disabled={busy || !game || game.phase === "finished" || game.round === 1}>
                  {busyAction === "draw-one" ? "抽卡中…" : `這隊自動抽 ${DRAW_CARDS} 張`}
                </button>
                <WorkerRosterEditor team={selectedTeam} busy={busy} onSaveLevels={saveRosterLevels} />
              </section>
              <section className="worker-team-detail__section">
                <h3>設定出戰隊伍</h3>
                <WorkerLineupEditor team={selectedTeam} round={game.round} challenges={getMultiplayerRoundChallenges(game.round)} busy={busy} onSave={saveLineup} />
              </section>
            </div>
          </section> : <section className="worker-team-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-team-dialog-title"><p className="mode-loading">正在載入隊伍完整資料…</p></section>}
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
