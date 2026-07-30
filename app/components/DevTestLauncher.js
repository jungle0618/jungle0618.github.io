"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GameShell from "./GameShell";
import StatIcon from "./StatIcon";
import usePointerDrag from "../hooks/usePointerDrag";
import useTeamSelectionActions from "../hooks/useTeamSelectionActions";
import { createBattleReplay, runBattle } from "../lib/battleService";
import { buildLevelSeriesScore, calculateLevelScore } from "../lib/battleScoring";
import { ITEM_ICONS } from "../lib/assetConfig";
import { DUO_CLEAR_SCORE, MAX_ROUND } from "../lib/gameConfig";
import { buildNewPet, formatDisplayName, getPetCompendiumList } from "../lib/petCatalog";
import { compactTeamToRight, selectRandomTeam } from "../lib/lineupLogic";
import { buildChallengeEncounterTeam } from "../lib/soloLogic";
import { getLocalWorkerTestData } from "../lib/localWorkerTestData";

function getTestChallenges(workerTestData = {}) { return workerTestData.challenges ?? []; }

export default function DevTestLauncher({ standalone = false, onBack, workerTestData = {}, loadAnalysis }) {
  const [open, setOpen] = useState(standalone);
  const closeRef = useRef(null);
  const titleId = useId();

  const close = useCallback(() => {
    if (standalone) onBack?.();
    else setOpen(false);
  }, [standalone, onBack]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const testGame = open ? (
    <DevTestGame
      titleId={titleId}
      closeRef={closeRef}
      close={close}
      closeLabel={standalone ? "回工人模式" : "關閉"}
      workerTestData={workerTestData}
      loadAnalysis={loadAnalysis}
    />
  ) : null;

  if (standalone) return <div className="game-dev-test-standalone">{testGame}</div>;

  return (
    <>
      <button
        type="button"
        className="game-dev-test-fab"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        測試
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(<div className="dev-test-shell-portal" role="dialog" aria-modal="true" aria-labelledby={titleId}>{testGame}</div>, document.body)
        : null}
    </>
  );
}

function DevTestGame({ titleId, closeRef, close, closeLabel, workerTestData, loadAnalysis }) {
  const resolvedWorkerTestData = useMemo(
    () => (workerTestData?.challenges?.length ? workerTestData : getLocalWorkerTestData()),
    [workerTestData]
  );
  const challenges = useMemo(() => getTestChallenges(resolvedWorkerTestData), [resolvedWorkerTestData]);
  const collection = useMemo(
    () => getPetCompendiumList().map((card) => buildNewPet(card, 1)),
    []
  );
  const [challengeId, setChallengeId] = useState(challenges[0]?.id ?? "");
  const selectedChallenge = challenges.find((challenge) => challenge.id === challengeId) ?? challenges[0];
  const [phase, setPhase] = useState("prepare");
  const [team, setTeam] = useState(() => Array(selectedChallenge?.teamSize ?? 6).fill(null));
  const [battleReplay, setBattleReplay] = useState(null);
  const [battleReplays, setBattleReplays] = useState([]);
  const [showCardMetrics, setShowCardMetrics] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setSelectedAnalysis(loadAnalysis ? null : {
      metrics: resolvedWorkerTestData?.metrics?.[selectedChallenge?.id] ?? null,
      optimalLineups: resolvedWorkerTestData?.optimalLineups?.[selectedChallenge?.id] ?? [],
      oneClickLineup: resolvedWorkerTestData?.oneClickLineups?.[selectedChallenge?.id] ?? [],
    });
    if (loadAnalysis && selectedChallenge?.id) {
      loadAnalysis(selectedChallenge.id).then((result) => { if (!cancelled) setSelectedAnalysis(result); }).catch(() => { if (!cancelled) setSelectedAnalysis(null); });
    }
    return () => { cancelled = true; };
  }, [loadAnalysis, resolvedWorkerTestData, selectedChallenge?.id]);
  const optimalTeamsByChallenge = useMemo(() => {
    const byName = new Map(collection.map((pet) => [pet.name, pet]));
    return { score: null, teams: (selectedAnalysis?.optimalLineups ?? []).map((lineup) => lineup.map((name) => byName.get(name)).filter(Boolean)) };
  }, [collection, selectedAnalysis]);
  const [compendiumPet, setCompendiumPet] = useState(null);
  const [selectedBossLevel, setSelectedBossLevel] = useState(1);
  const cardProps = useMemo(() => ({ formatDisplayName, itemIcons: ITEM_ICONS, StatIcon }), []);
  const { draggedItem, pointerDragGhost, dragHoverTarget, startPointerDrag, clearDragging } = usePointerDrag();

  const setTeamValue = useCallback((nextTeam) => {
    setTeam(nextTeam);
    setBattleReplay(null);
    setBattleReplays([]);
  }, []);

  const { onDropToSlot } = useTeamSelectionActions({
    gamePhase: phase,
    team,
    setTeam: setTeamValue,
    setStatusSuccess: () => {},
    clearDragging,
  });

  useEffect(() => {
    clearDragging();
    setPhase("prepare");
    setTeam((current) => compactTeamToRight(current, selectedChallenge.teamSize));
    setBattleReplay(null);
    setBattleReplays([]);
    setSelectedBossLevel(1);
    setShowCardMetrics(false);
  }, [clearDragging, selectedChallenge]);

  const onPointerDownTeamPet = useCallback((teamIndex, slotIndex, event) => {
    if (phase !== "prepare" || !team[slotIndex]) return;
    startPointerDrag(
      { source: "team", teamIndex: 0, slotIndex, data: team[slotIndex] },
      event,
      { onDropToSlot, onTap: (payload) => setCompendiumPet(payload.data) }
    );
  }, [onDropToSlot, phase, startPointerDrag, team]);

  const onPointerDownCollectionPet = useCallback((pet, event) => {
    if (phase !== "prepare") return;
    startPointerDrag(
      { source: "collection", data: pet },
      event,
      { onDropToSlot, onTap: (payload) => setCompendiumPet(payload.data) }
    );
  }, [onDropToSlot, phase, startPointerDrag]);

  const autoConfigureTeam = useCallback(() => {
    clearDragging();
    const names = selectedAnalysis?.oneClickLineup ?? [];
    const byName = new Map(collection.map((pet) => [pet.name, pet]));
    setTeamValue(compactTeamToRight(names.map((name) => byName.get(name)).filter(Boolean), selectedChallenge.teamSize));
  }, [clearDragging, collection, selectedChallenge.id, selectedChallenge.teamSize, setTeamValue, selectedAnalysis]);

  const randomConfigureTeam = useCallback(() => {
    clearDragging();
    setTeamValue(selectRandomTeam(collection, selectedChallenge.teamSize));
  }, [clearDragging, collection, selectedChallenge.teamSize, setTeamValue]);

  const optimalCandidates = optimalTeamsByChallenge.teams ?? [];
  const selectedMetrics = selectedAnalysis?.metrics ?? null;
  const metricRows = selectedMetrics
    ? Object.entries(selectedMetrics).sort(([, left], [, right]) =>
      right.nearBestRate - left.nearBestRate ||
      right.coreLoss - left.coreLoss ||
      right.shapley - left.shapley
    )
    : [];
  const optimalConfigureTeam = useCallback(() => {
    if (!optimalCandidates.length) return;
    clearDragging();
    const selected = optimalCandidates[Math.floor(Math.random() * optimalCandidates.length)];
    setTeamValue(selected.map((pet) => (pet ? { ...pet } : null)));
  }, [clearDragging, optimalCandidates, setTeamValue]);

  const runAllLevels = useCallback(() => {
    const compactedTeam = compactTeamToRight(team, selectedChallenge.teamSize);
    if (compactedTeam.filter(Boolean).length !== selectedChallenge.teamSize) return;

    const replays = Array.from({ length: selectedChallenge.maxBossLevel }, (_, levelIndex) => {
      const bossLevel = levelIndex + 1;
      const result = runBattle(
        compactedTeam.map((pet) => (pet ? { ...pet } : null)),
        buildChallengeEncounterTeam(selectedChallenge, bossLevel)
      );
      return createBattleReplay(result, {
        encounterId: `worker-test-${selectedChallenge.id}-${bossLevel}-${Date.now()}`,
        encounterName: selectedChallenge.encounter.name,
        challenge: selectedChallenge,
        challengeIndex: 0,
        bossLevel,
        score: calculateLevelScore(result, bossLevel, { clearScore: selectedChallenge.kind === "duo" ? DUO_CLEAR_SCORE : 1 }),
      });
    });
    const seriesScore = buildLevelSeriesScore(replays.map((replay) => replay.score));
    const scoredReplays = replays.map((replay) => ({
      ...replay,
      score: {
        ...replay.score,
        roundTotal: seriesScore.total,
        clearedLevels: seriesScore.clearedLevels,
      },
    }));
    const firstFailed = scoredReplays.find((replay) => !replay.score.cleared);
    const initialReplay = firstFailed ?? scoredReplays.at(-1);
    setTeam(compactedTeam);
    setBattleReplays(scoredReplays);
    setBattleReplay(initialReplay);
    setSelectedBossLevel(initialReplay?.bossLevel ?? 1);
    setPhase("battle");
  }, [selectedChallenge, team]);

  const selectReplay = useCallback((replay) => {
    setBattleReplay(replay);
    setSelectedBossLevel(replay.bossLevel);
  }, []);

  const resetToPrepare = useCallback(() => {
    setPhase("prepare");
    setBattleReplay(null);
    setBattleReplays([]);
    setSelectedBossLevel(1);
  }, []);

  const selectedCount = team.filter(Boolean).length;
  const requiredCount = selectedChallenge.teamSize;
  const canRun = selectedCount === requiredCount;
  const encounterMonsters = buildChallengeEncounterTeam(selectedChallenge, selectedBossLevel);
  const clearedCount = battleReplays.filter((replay) => replay.score.cleared).length;

  return (
    <div className="dev-test-demo-shell">
      <GameShell
        phase={phase}
        headerProps={{
          round: selectedChallenge.testRound,
          maxRound: MAX_ROUND,
          totalScore: clearedCount,
        }}
        teamProps={{
          team,
          challenges: [selectedChallenge],
          draggedItem,
          dragHoverTarget,
          onPointerDownTeamPet,
          onAutoConfigureTeam: autoConfigureTeam,
          autoConfigureDisabled: !(selectedAnalysis?.oneClickLineup?.length),
          onOptimalConfigureTeam: optimalConfigureTeam,
          optimalConfigureDisabled: optimalCandidates.length === 0,
          onRandomConfigureTeam: randomConfigureTeam,
        }}
        collectionProps={{
          collection,
          team,
          draggedItem,
          isDragHover: Boolean(draggedItem?.source === "team" && dragHoverTarget?.collection),
          onPointerDownCollectionPet,
          title: "所有友方動物・全解鎖 Lv.1",
          subtitle: "測試卡池固定為全角色 Lv.1；拖曳角色到上方隊伍格即可上場。",
        }}
        battleProps={{
          battleReplay,
          battleReplays,
          onSelectReplay: selectReplay,
        }}
        encounterProps={{
          encounter: selectedChallenge.encounter,
          monsters: encounterMonsters,
          score: battleReplay?.score,
          bossLevel: selectedBossLevel,
          challenges: [{
            challenge: selectedChallenge,
            monsters: encounterMonsters,
            score: battleReplay?.score,
            bossLevel: selectedBossLevel,
            active: true,
          }],
          onSelectMonster: setCompendiumPet,
        }}
        prepareAction={{
          id: "simulate-all-levels",
          label: canRun
            ? `模擬 Lv.1～Lv.${selectedChallenge.maxBossLevel}`
            : `請選滿隊伍（${selectedCount}/${requiredCount}）`,
          onClick: runAllLevels,
          disabled: !canRun,
          primary: true,
        }}
        battleActions={{
          secondary: { label: "返回編隊", onClick: resetToPrepare },
          primary: { label: "重新模擬所有等級", onClick: runAllLevels },
        }}
        pointerDragGhost={pointerDragGhost}
        cardProps={cardProps}
        compendiumPet={compendiumPet}
        onCompendiumPetOpened={() => setCompendiumPet(null)}
      >
        <div className="dev-test-top-controls" aria-label="測試模式設定">
          <div className="dev-test-top-controls__title">
            <span>TEST MODE</span>
            <strong id={titleId}>全等級戰鬥模擬</strong>
          </div>
          <label>
            <span>選擇關卡</span>
            <select value={challengeId} onChange={(event) => setChallengeId(event.target.value)}>
              {challenges.map((challenge) => (
                <option key={challenge.id} value={challenge.id}>
                  {challenge.testOnly ? challenge.label : `第 ${challenge.testRound} 回合｜${challenge.label}`}
                </option>
              ))}
            </select>
          </label>
          <small>我方全角色固定 Lv.1</small>
          <button type="button" onClick={() => setShowCardMetrics(true)}>查看角色指標</button>
          <button ref={closeRef} type="button" onClick={close}>{closeLabel}</button>
        </div>
        {showCardMetrics ? (
          <div
            className="dev-test-metrics-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowCardMetrics(false);
            }}
          >
            <section className="dev-test-metrics-dialog" role="dialog" aria-modal="true" aria-labelledby="dev-test-metrics-title">
              <div className="dev-test-metrics-dialog__header">
                <div>
                  <span>FORMAL CARD VALUES</span>
                  <h2 id="dev-test-metrics-title">{selectedChallenge.label}</h2>
                </div>
                <button type="button" onClick={() => setShowCardMetrics(false)}>關閉</button>
              </div>
              {selectedMetrics ? (
                <>
                  <p className="dev-test-metrics-dialog__hint">依近最佳選用率排序；核心禁用損失越高，代表角色越難被替代。</p>
                  <div className="dev-test-metrics-table-wrap">
                    <table className="dev-test-metrics-table">
                      <thead>
                        <tr><th>排名</th><th>角色</th><th>Shapley</th><th>核心禁用損失</th><th>近最佳選用率</th></tr>
                      </thead>
                      <tbody>
                        {metricRows.map(([name, row], index) => (
                          <tr key={name}>
                            <td>{index + 1}</td>
                            <th scope="row">{name}</th>
                            <td>{row.shapley.toFixed(3)}</td>
                            <td>{row.coreLoss}</td>
                            <td>{row.nearBestRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="dev-test-metrics-dialog__empty">此工人特別測試關目前沒有對應的 formal-card-values 主線數據。</p>
              )}
            </section>
          </div>
        ) : null}
      </GameShell>
    </div>
  );
}
