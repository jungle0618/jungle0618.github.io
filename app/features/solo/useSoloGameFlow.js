"use client";

import { useCallback, useRef } from "react";
import { createBattleReplay, runBattle } from "../../lib/battleService";
import {
  advanceDeploymentStates,
  applyDrawsToCollection,
  drawPetCards,
} from "./soloProgression";
import { compactTeamToRight } from "../../lib/lineupLogic";
import { buildChallengeEncounterTeam, buildRoundScore, buildSoloSummary, calculateSoloScore } from "../../lib/soloLogic";
import { getChallengeLabel, getRoundChallenges } from "../../lib/soloConfig";
import { DRAW_CARDS, DUO_CLEAR_SCORE } from "../../lib/gameConfig";

function makeEmptyTeams(challenges) {
  return challenges.map((challenge) => Array(challenge.teamSize).fill(null));
}

export default function useSoloGameFlow({
  round,
  bossLevel,
  maxRound,
  tutorialComplete,
  teams,
  challenges,
  collection,
  consumedPetNames,
  roundResults,
  drawCards,
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
}) {
  const preBattleSnapshotRef = useRef(null);

  const startBattle = useCallback(() => {
    clearDragging();
    preBattleSnapshotRef.current = {
      bossLevel,
      teams: teams.map((row) => row.map((pet) => (pet ? { ...pet } : null))),
      collection: collection.map((pet) => ({ ...pet })),
      consumedPetNames: [...consumedPetNames],
      roundResults: roundResults.map((result) => ({ ...result, score: { ...result.score } })),
    };
    const battleTeams = teams.map((team) => compactTeamToRight(team, team.length));
    const consumedThisRound = battleTeams.flat()
      .filter((pet) => pet?.special?.oncePerGame)
      .map((pet) => pet.name);
    const replays = [];
    const challengeResults = [];
    let tutorialBlocked = false;

    for (const [challengeIndex, challenge] of challenges.entries()) {
      if (tutorialBlocked) break;
      const challengeReplays = [];
      const battleTeam = battleTeams[challengeIndex] ?? [];

      for (let level = 1; level <= challenge.maxBossLevel; level += 1) {
        const levelTeam = battleTeam.map((pet) => (pet ? { ...pet } : null));
        const battleResult = runBattle(levelTeam, buildChallengeEncounterTeam(challenge, level));
        const score = calculateSoloScore(battleResult, level, { clearScore: challenge.kind === "duo" ? DUO_CLEAR_SCORE : 1 });
        challengeReplays.push(createBattleReplay(battleResult, {
          encounterId: `${challenge.id}-${level}`,
          encounterName: challenge.encounter.name,
          challenge,
          challengeIndex,
          bossLevel: level,
          score,
        }));
      }

      const challengeScore = buildRoundScore(
        challengeReplays.map((replay) => replay.score),
        { scoreEnabled: challenge.scoreEnabled }
      );
      const challengeReplaysWithScore = challengeReplays.map((replay) => ({
        ...replay,
        score: {
          ...replay.score,
          roundTotal: challengeScore.total,
          clearedLevels: challengeScore.clearedLevels,
        },
      }));
      replays.push(...challengeReplaysWithScore);
      challengeResults.push({
        challengeId: challenge.id,
        label: getChallengeLabel(challenge),
        encounterName: challenge.encounter.name,
        kind: challenge.kind,
        score: challengeScore,
      });

      if (challenge.kind === "tutorial" && !challengeScore.cleared) {
        tutorialBlocked = true;
      }
    }

    const isTutorialRun = challenges.length === 1 && challenges[0]?.kind === "tutorial";
    const roundScore = {
      total: challengeResults.reduce((sum, result) => sum + result.score.total, 0),
      highestCleared: Math.max(0, ...challengeResults.map((result) => result.score.highestCleared ?? 0)),
      clearedLevels: challengeResults.flatMap((result) => result.score.clearedLevels ?? []),
      cleared: challengeResults.some((result) => result.score.cleared),
      challengeResults,
      tutorialBlocked,
    };
    const postBattleCollection = isTutorialRun
      ? collection
      : advanceDeploymentStates(collection, battleTeams.flat());
    const firstClearedReplay = replays.find((replay) => replay.challenge?.scoreEnabled && replay.score.cleared)
      ?? replays.find((replay) => replay.score.cleared);
    const selectedReplay = firstClearedReplay ?? replays[0];
    const roundResult = {
      round,
      encounterName: challenges.map((challenge) => `${getChallengeLabel(challenge)} ${challenge.encounter.name}`).join(" + "),
      bossLevel: roundScore.highestCleared,
      score: roundScore,
    };
    setBattleReplays(replays);
    setBattleReplay(selectedReplay);
    setBossLevel(selectedReplay?.bossLevel ?? 1);
    if (!isTutorialRun) {
      setRoundResults((previous) => [
        ...previous.filter((entry) => entry.round !== round),
        roundResult,
      ].sort((a, b) => a.round - b.round));
    }
    setStatusSuccess(
      tutorialBlocked
        ? "教學關 Lv.1 未通過，請重來後調整隊伍"
        : isTutorialRun
        ? "教學關 Lv.1 已通過，可以進入正式第 1 回合"
        : `第 ${round} 回合通過 ${roundScore.total} 個正式等級`
    );
    setCollection(postBattleCollection);
    if (!isTutorialRun && consumedThisRound.length) {
      setConsumedPetNames((previous) => [...new Set([...previous, ...consumedThisRound])]);
    }
    setGamePhase("battle");
  }, [round, bossLevel, teams, challenges, collection, consumedPetNames, roundResults, clearDragging, setBattleReplay, setBattleReplays, setRoundResults, setStatusSuccess, setBossLevel, setCollection, setConsumedPetNames, setGamePhase]);

  const retryBattle = useCallback(() => {
    const snapshot = preBattleSnapshotRef.current;
    if (!snapshot) return;
    clearDragging();
    setBossLevel(snapshot.bossLevel);
    setTeams(snapshot.teams);
    setCollection(snapshot.collection);
    setConsumedPetNames(snapshot.consumedPetNames);
    setRoundResults(snapshot.roundResults);
    setBattleReplay(null);
    setBattleReplays([]);
    setGamePhase("prepare");
    setStatusSuccess(`已回到第 ${round} 回合戰鬥前，可重新調整陣容`);
    preBattleSnapshotRef.current = null;
  }, [round, clearDragging, setBossLevel, setTeams, setCollection, setConsumedPetNames, setRoundResults, setBattleReplay, setBattleReplays, setGamePhase, setStatusSuccess]);

  const continueToNextRound = useCallback(() => {
    if (!tutorialComplete) {
      const firstRoundChallenges = getRoundChallenges(1);
      const draws = drawPetCards(1, DRAW_CARDS, 1, gameSeed);
      const drawnCollection = applyDrawsToCollection([], draws);
      setTutorialComplete(true);
      setRound(1);
      setBossLevel(1);
      setCollection(drawnCollection);
      setTeams(makeEmptyTeams(firstRoundChallenges));
      setBattleReplay(null);
      setBattleReplays([]);
      setGamePhase("prepare");
      setStatusSuccess("教學關完成，已抽取正式第 1 回合角色池，請配置關卡隊伍");
      return;
    }

    if (round === maxRound) {
      setFinalSummary(buildSoloSummary(roundResults));
      setStatusSuccess("已顯示最終分數結算");
      return;
    }

    const nextRound = round + 1;
    const nextChallenges = getRoundChallenges(nextRound);
    const consumed = new Set(consumedPetNames);
    const draws = drawPetCards(nextRound, drawCards * 4, 1, gameSeed)
      .filter((pet) => !consumed.has(pet.name))
      .slice(0, drawCards);
    const drawnCollection = applyDrawsToCollection(collection, draws);
    setRound(nextRound);
    setBossLevel(1);
    setCollection(drawnCollection);
    setTeams(makeEmptyTeams(nextChallenges));
    setBattleReplay(null);
    setBattleReplays([]);
    setGamePhase("prepare");
    setStatusSuccess(`第 ${nextRound} 回合抽卡完成，請配置 ${nextChallenges.length} 個關卡隊伍`);
  }, [round, maxRound, tutorialComplete, roundResults, drawCards, gameSeed, collection, consumedPetNames, setFinalSummary, setStatusSuccess, setRound, setBossLevel, setCollection, setTeams, setBattleReplay, setBattleReplays, setGamePhase, setTutorialComplete]);

  return { startBattle, retryBattle, continueToNextRound };
}
