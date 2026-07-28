"use client";

import { useMemo, useState } from "react";
import GameCard from "../../components/GameCard";
import { getChallengeLabel, getMultiplayerRoundChallenges } from "../../lib/challengeConfig";
import { hydrateMultiplayerRoster, multiplayerTeamName } from "./multiplayerAdapter";

function teamFeatureLabels(team = {}) {
  return [
    team.turtleNetEnabled ? `烏龜網路${team.turtle_net && !String(team.turtle_net).toLowerCase().includes("true") ? `：${team.turtle_net}` : ""}` : null,
    team.waterParkEnabled ? `公館水樂園${team.water_park && !String(team.water_park).toLowerCase().includes("true") ? `：${team.water_park}` : ""}` : null,
  ].filter(Boolean);
}

export function historyChallengeLabel(round, challengeId) {
  const challenge = getMultiplayerRoundChallenges(Number(round)).find((item) => item.id === String(challengeId));
  return challenge
    ? `第 ${round} 回合・${getChallengeLabel(challenge)}｜${challenge.encounter.name}`
    : `第 ${round} 回合・${challengeId}`;
}

export function groupBattleHistory(rows = []) {
  const groups = new Map();
  rows.forEach((battle) => {
    const key = `${battle.round}:${battle.challengeId}`;
    if (!groups.has(key)) groups.set(key, { key, round: Number(battle.round), challengeId: String(battle.challengeId), battles: [] });
    groups.get(key).battles.push(battle);
  });
  return [...groups.values()].sort((a, b) => b.round - a.round || a.challengeId.localeCompare(b.challengeId));
}

export function groupChallengeParticipants(battles = [], teams = []) {
  const teamNames = new Map(teams.map((team) => [String(team.teamId), multiplayerTeamName(team)]));
  const groups = new Map();
  battles.forEach((battle) => {
    const teamIds = String(battle.teamIds ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    const key = [...teamIds].sort().join(",");
    if (!groups.has(key)) groups.set(key, { key, teamIds, battles: [], score: 0 });
    const group = groups.get(key);
    group.battles.push(battle);
    group.score += Number(battle.score) || 0;
  });
  return [...groups.values()].map((group) => ({
    ...group,
    label: group.teamIds.map((id) => teamNames.get(id) ?? `第 ${id} 小隊`).join("＋"),
  }));
}

export default function MultiplayerOverview({ game, session, cardProps, onClose, onLogout, onBack, onSelectHistory }) {
  const ranked = [...(game.teams ?? [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const historyGroups = useMemo(() => groupBattleHistory(game.battleHistory), [game.battleHistory]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [historyKey, setHistoryKey] = useState(historyGroups[0]?.key ?? "");
  const selectedTeam = ranked.find((team) => team.teamId === selectedTeamId);
  const selectedHistory = historyGroups.find((group) => group.key === historyKey);
  const participants = groupChallengeParticipants(selectedHistory?.battles, game.teams);
  const selectedRoster = hydrateMultiplayerRoster(selectedTeam?.publicRoster ?? selectedTeam?.roster ?? []);
  const currentPairings = game.currentPairings ?? game.duoPairings ?? [];
  const teamsById = new Map((game.teams ?? []).map((team) => [String(team.teamId), team]));

  return (
    <div className="game-tutorial-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="game-compendium-dialog multiplayer-info-dialog" role="dialog" aria-modal="true" aria-labelledby="multiplayer-info-title">
        <div className="game-settings-dialog-header">
          <h2 id="multiplayer-info-title" className="game-settings-dialog-title">
            {selectedTeam ? `${multiplayerTeamName(selectedTeam)}｜角色等級` : `各隊資訊｜${session.teamName || session.workerId || "工人"}`}
          </h2>
          <button type="button" className="game-tutorial-close" onClick={onClose}>關閉</button>
        </div>
        <div className="pet-compendium-body multiplayer-info-body">
          {selectedTeam ? (
            <section className="multiplayer-info-section">
              <button type="button" className="pet-compendium-back" onClick={() => setSelectedTeamId(null)}>← 返回各隊列表</button>
              <div className="multiplayer-roster-level-grid">
                {selectedRoster.map((pet) => <GameCard key={pet.name} data={pet} showLevel qualityVisibility="never" {...cardProps} />)}
              </div>
            </section>
          ) : (
            <>
              <section className="multiplayer-info-section">
                <h3>排名與角色等級分布</h3>
                <p>
                  點選隊伍可查看該隊每張卡片的等級。
                  {game.gameState?.isRaining ? " 本回合天氣：下雨。" : ""}
                </p>
                <div className="multiplayer-team-info-grid">
                  {ranked.map((team) => (
                    <button type="button" key={team.teamId} onClick={() => setSelectedTeamId(team.teamId)}>
                      <strong>#{team.rank || "—"} {multiplayerTeamName(team)}</strong>
                      <b>總分 {team.score}</b>
                      <span>卡片等級總和 {team.cardLevelTotal ?? (team.roster ?? []).reduce((total, pet) => total + (Number(pet.level) || 1), 0)}</span>
                      {teamFeatureLabels(team).map((label) => <span key={label}>{label}</span>)}
                    </button>
                  ))}
                </div>
              </section>
              {currentPairings.length ? (
                <section className="multiplayer-info-section">
                  <h3>本回合雙人配對</h3>
                  <div className="multiplayer-pairing-list">
                    {currentPairings.map((pairing) => {
                      const higher = teamsById.get(String(pairing.higherRankTeamId));
                      const lower = teamsById.get(String(pairing.lowerRankTeamId));
                      return (
                        <div className="multiplayer-pairing-row" key={`${pairing.challengeId}:${pairing.pairId}`}>
                          <span>{historyChallengeLabel(game.round, pairing.challengeId)}</span>
                          <strong>#{higher?.rank ?? "—"} {multiplayerTeamName(higher ?? { teamId: pairing.higherRankTeamId })} ＋ #{lower?.rank ?? "—"} {multiplayerTeamName(lower ?? { teamId: pairing.lowerRankTeamId })}</strong>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              <section className="multiplayer-info-section">
                <h3>過去戰鬥</h3>
                {historyGroups.length ? (
                  <>
                    <label className="multiplayer-history-select">
                      選擇回合關卡
                      <select value={historyKey} onChange={(event) => setHistoryKey(event.target.value)}>
                        {historyGroups.map((group) => <option key={group.key} value={group.key}>{historyChallengeLabel(group.round, group.challengeId)}</option>)}
                      </select>
                    </label>
                    <div className="multiplayer-history-participants">
                      {participants.map((participant) => (
                        <button type="button" key={participant.key} disabled={!onSelectHistory} onClick={() => {
                          if (!onSelectHistory) return;
                          onClose();
                          onSelectHistory(participant.battles, selectedHistory);
                        }}>
                          <strong>{participant.label}</strong>
                          <span>本關得分 {participant.score}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : <span>尚無戰鬥紀錄</span>}
              </section>
            </>
          )}
        </div>
        <div className="multiplayer-info-footer"><button onClick={onLogout}>登出</button><button onClick={onBack}>回主頁</button></div>
      </section>
    </div>
  );
}
