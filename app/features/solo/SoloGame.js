"use client";

import { useMemo, useState } from "react";
import FinalRankOverlay from "../../components/FinalRankOverlay";
import EnemyScheduleDialog from "../../components/EnemyScheduleDialog";
import GameShell from "../../components/GameShell";
import GuidedGameTutorial from "../../components/GuidedGameTutorial";
import StatIcon from "../../components/StatIcon";
import usePointerDrag from "../../hooks/usePointerDrag";
import useTeamSelectionActions from "../../hooks/useTeamSelectionActions";
import { ITEM_ICONS } from "../../lib/assetConfig";
import { DRAW_CARDS, MAX_ROUND } from "../../lib/gameConfig";
import { buildNewPet, formatDisplayName } from "../../lib/petCatalog";
import { configureTeamsFromCollection } from "../../lib/lineupLogic";
import {
  getChallengeLabel,
  getRoundChallenges,
  getTutorialChallenge,
  TUTORIAL_POOL_NAMES,
  TUTORIAL_RECOMMENDED_TEAM,
} from "../../lib/soloConfig";
import { buildChallengeEncounterTeam } from "../../lib/soloLogic";
import useSoloGameFlow from "./useSoloGameFlow";

function makeEmptyTeams(challenges) {
  return challenges.map((challenge) => Array(challenge.teamSize).fill(null));
}

function configuredChallengeLabels(challenges) {
  return challenges.map((challenge, index) => ({
    ...challenge,
    kindLabel: getChallengeLabel(challenge),
    label: `${index + 1}. ${getChallengeLabel(challenge)}｜${challenge.encounter.name}`,
  }));
}

function duplicateNamesBetweenTeams(teams) {
  const owners = new Map();
  const duplicates = new Set();
  teams.forEach((team, teamIndex) => {
    const names = new Set(team.filter(Boolean).map((pet) => pet.name));
    names.forEach((name) => {
      if (owners.has(name) && owners.get(name) !== teamIndex) duplicates.add(name);
      owners.set(name, teamIndex);
    });
  });
  return [...duplicates];
}

function hasDuplicateWithinSingleChallenge(team, challenge) {
  if (challenge.kind === "duo") return false;
  const names = team.filter(Boolean).map((pet) => pet.name);
  return new Set(names).size !== names.length;
}

function buildTutorialCollection() {
  return TUTORIAL_POOL_NAMES.map((name) => buildNewPet({ name }, 1));
}

export default function SoloGame() {
  const initialChallenges = configuredChallengeLabels([getTutorialChallenge()]);
  const [gameSeed, setGameSeed] = useState(() => Date.now());
  const [gamePhase, setGamePhase] = useState("prepare");
  const [round, setRound] = useState(1);
  const [tutorialComplete, setTutorialComplete] = useState(false);
  const [bossLevel, setBossLevel] = useState(1);
  const [teams, setTeams] = useState(() => makeEmptyTeams(initialChallenges));
  const [collection, setCollection] = useState(buildTutorialCollection);
  const [consumedPetNames, setConsumedPetNames] = useState([]);
  const [battleReplay, setBattleReplay] = useState(null);
  const [battleReplays, setBattleReplays] = useState([]);
  const [roundResults, setRoundResults] = useState([]);
  const [, setStatus] = useState("請先用固定角色池配置教學關隊伍並通過 Lv.1");
  const [finalSummary, setFinalSummary] = useState(null);
  const [guidedTutorialOpen, setGuidedTutorialOpen] = useState(true);
  const [compendiumPet, setCompendiumPet] = useState(null);
  const [enemyScheduleOpen, setEnemyScheduleOpen] = useState(false);

  const cardProps = useMemo(() => ({ formatDisplayName, itemIcons: ITEM_ICONS, StatIcon }), []);
  const { draggedItem, pointerDragGhost, dragHoverTarget, startPointerDrag, clearDragging } = usePointerDrag();
  const setStatusSuccess = setStatus;

  const { onDropToSlot } = useTeamSelectionActions({
    gamePhase,
    teams,
    setTeams,
    setStatusSuccess,
    clearDragging,
  });

  const roundChallenges = useMemo(
    () => configuredChallengeLabels(tutorialComplete ? getRoundChallenges(round) : [getTutorialChallenge()]),
    [round, tutorialComplete]
  );

  const { startBattle, retryBattle, continueToNextRound } = useSoloGameFlow({
    round,
    bossLevel,
    maxRound: MAX_ROUND,
    tutorialComplete,
    teams,
    challenges: roundChallenges,
    collection,
    consumedPetNames,
    roundResults,
    drawCards: DRAW_CARDS,
    gameSeed,
    clearDragging,
    setStatusSuccess,
    setBattleReplay,
    setBattleReplays,
    setRoundResults,
    setGamePhase,
    setFinalSummary,
    setTutorialComplete,
    setRound,
    setBossLevel,
    setCollection,
    setConsumedPetNames,
    setTeams,
  });

  function initializeNewGame() {
    const nextChallenges = configuredChallengeLabels([getTutorialChallenge()]);
    clearDragging();
    setGameSeed(Date.now());
    setGamePhase("prepare");
    setRound(1);
    setTutorialComplete(false);
    setBossLevel(1);
    setTeams(makeEmptyTeams(nextChallenges));
    setCollection(buildTutorialCollection());
    setConsumedPetNames([]);
    setBattleReplay(null);
    setBattleReplays([]);
    setRoundResults([]);
    setFinalSummary(null);
    setEnemyScheduleOpen(false);
    setGuidedTutorialOpen(true);
    setStatusSuccess("請先用固定角色池配置教學關隊伍並通過 Lv.1");
  }

  function onPointerDownTeamPet(teamIndex, slotIndex, event) {
    if (gamePhase !== "prepare" || !teams[teamIndex]?.[slotIndex]) return;
    startPointerDrag(
      { source: "team", teamIndex, slotIndex, data: teams[teamIndex][slotIndex] },
      event,
      { onDropToSlot, onTap: (payload) => setCompendiumPet(payload.data) }
    );
  }

  function onPointerDownCollectionPet(pet, event) {
    if (gamePhase !== "prepare") return;
    startPointerDrag(
      { source: "collection", data: pet },
      event,
      { onDropToSlot, onTap: (payload) => setCompendiumPet(payload.data) }
    );
  }

  function autoConfigureTeam() {
    clearDragging();
    if (!tutorialComplete) {
      const byName = new Map(collection.map((pet) => [pet.name, pet]));
      const recommended = TUTORIAL_RECOMMENDED_TEAM.map((name) => byName.get(name) ? { ...byName.get(name) } : null);
      setTeams([recommended]);
      setStatusSuccess("已配置教學推薦隊伍：大猩猩與增幅角色在後，熊在最前排");
      return;
    }
    const configuredTeams = configureTeamsFromCollection(collection, roundChallenges);
    setTeams(configuredTeams);
    setStatusSuccess(`已依等級自動配置 ${configuredTeams.flat().filter(Boolean).length} 隻動物`);
  }

  function randomConfigureTeam() {
    clearDragging();
    let state = Date.now();
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const configuredTeams = configureTeamsFromCollection(collection, roundChallenges, random);
    setTeams(configuredTeams);
    setStatusSuccess(`已隨機配置 ${configuredTeams.flat().filter(Boolean).length} 隻動物`);
  }

  const selectedChallenge = battleReplay?.challenge ?? roundChallenges[0];
  const encounter = selectedChallenge?.encounter;
  const encounterTeam = useMemo(
    () => selectedChallenge ? buildChallengeEncounterTeam(selectedChallenge, bossLevel) : [],
    [selectedChallenge, bossLevel]
  );
  const challengePanels = useMemo(
    () => roundChallenges.map((challenge) => ({
      challenge,
      monsters: buildChallengeEncounterTeam(
        challenge,
        battleReplay?.challenge?.id === challenge.id ? bossLevel : 1
      ),
      score: battleReplay?.challenge?.id === challenge.id ? battleReplay.score : null,
      bossLevel: battleReplay?.challenge?.id === challenge.id ? bossLevel : 1,
      active: battleReplay?.challenge?.id === challenge.id,
    })),
    [roundChallenges, battleReplay, bossLevel]
  );
  const totalScore = roundResults.reduce((sum, result) => sum + result.score.total, 0);
  const selectedCount = teams.flat().filter(Boolean).length;
  const requiredCount = teams.reduce((sum, team) => sum + team.length, 0);
  const duplicateNames = duplicateNamesBetweenTeams(teams);
  const singleTeamDuplicate = teams.some((team, index) => hasDuplicateWithinSingleChallenge(team, roundChallenges[index]));
  const canStartBattle = selectedCount === requiredCount && requiredCount > 0 && duplicateNames.length === 0 && !singleTeamDuplicate;
  const startButtonText = selectedCount !== requiredCount
    ? `請選擇 ${requiredCount} 隻上場（${selectedCount}/${requiredCount}）`
    : duplicateNames.length
    ? `不同關卡不能重複：${duplicateNames.join("、")}`
    : singleTeamDuplicate
    ? "單人關隊伍不能使用重複角色"
    : "開始戰鬥";
  const tutorialBlocked = Boolean(battleReplay?.challenge?.kind === "tutorial" && !battleReplay?.score?.cleared);
  const nextActionLabel = tutorialBlocked
    ? "請先通過教學關"
    : !tutorialComplete
    ? "進入正式第 1 回合"
    : round >= MAX_ROUND
    ? "結算總分"
    : "進入下一回合並抽卡";

  return (
    <>
      <GameShell
        phase={gamePhase}
        headerProps={{ round, maxRound: MAX_ROUND, totalScore }}
        teamProps={{
          teams,
          challenges: roundChallenges,
          draggedItem,
          dragHoverTarget,
          onPointerDownTeamPet,
          onAutoConfigureTeam: autoConfigureTeam,
          onRandomConfigureTeam: randomConfigureTeam,
        }}
        collectionProps={{
          collection,
          teams,
          draggedItem,
          isDragHover: Boolean(draggedItem?.source === "team" && dragHoverTarget?.collection),
          onPointerDownCollectionPet,
        }}
        battleProps={{
          battleReplay,
          battleReplays,
          onSelectReplay: (replay) => {
            setBattleReplay(replay);
            setBossLevel(replay.bossLevel);
          },
        }}
        encounterProps={{
          encounter,
          monsters: encounterTeam,
          score: battleReplay?.score,
          bossLevel,
          challenges: challengePanels,
          onSelectMonster: setCompendiumPet,
        }}
        prepareAction={{
          id: "start-battle",
          label: startButtonText,
          onClick: startBattle,
          disabled: !canStartBattle,
          primary: true,
          guidedTarget: "start-battle",
        }}
        battleActions={{
          secondary: { label: "重來", onClick: retryBattle },
          primary: { label: nextActionLabel, onClick: continueToNextRound, disabled: tutorialBlocked },
        }}
        pointerDragGhost={pointerDragGhost}
        cardProps={cardProps}
        compendiumPet={compendiumPet}
        onCompendiumPetOpened={() => setCompendiumPet(null)}
        quickActions={[{
          id: "demo-enemies",
          label: enemyScheduleOpen ? "關閉敵方資訊" : "敵方資訊",
          onClick: () => setEnemyScheduleOpen((open) => !open),
          expanded: enemyScheduleOpen,
        }]}
      >
        {guidedTutorialOpen && round === 1 ? (
          <GuidedGameTutorial
            gamePhase={gamePhase}
            selectedCount={selectedCount}
            requiredCount={requiredCount}
            canStartBattle={canStartBattle}
            onDismiss={() => setGuidedTutorialOpen(false)}
          />
        ) : null}
      </GameShell>
      {enemyScheduleOpen ? (
        <EnemyScheduleDialog
          title="Demo 關卡敵方陣容"
          description="依 Demo 關卡順序顯示；陣容方向為後排 → 前排，面板為 Lv.1。"
          maxRound={MAX_ROUND}
          getRoundChallenges={getRoundChallenges}
          onClose={() => setEnemyScheduleOpen(false)}
        />
      ) : null}
      <FinalRankOverlay
        summary={finalSummary}
        onDismiss={() => setFinalSummary(null)}
        onRestart={initializeNewGame}
      />
    </>
  );
}
