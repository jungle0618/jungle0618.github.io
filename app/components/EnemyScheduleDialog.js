"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { buildChallengeEncounterTeam } from "../lib/encounterLogic";
import { getChallengeLabel } from "../lib/challengeConfig";
import { getPetSpecialEffectText } from "../lib/petCatalog";

export default function EnemyScheduleDialog({ title, description, maxRound, currentRound = maxRound, getRoundChallenges, onClose }) {
  const visibleRoundCount = Math.max(0, Math.min(maxRound, Number(currentRound) || maxRound));
  const rounds = useMemo(() => Array.from({ length: visibleRoundCount }, (_, index) => ({
    round: index + 1,
    challenges: getRoundChallenges(index + 1),
  })), [getRoundChallenges, visibleRoundCount]);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="worker-team-dialog-backdrop enemy-schedule-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="worker-team-dialog worker-enemy-schedule" role="dialog" aria-modal="true" aria-labelledby="enemy-schedule-title">
        <header className="worker-team-dialog__header">
          <div><h2 id="enemy-schedule-title">{title}</h2><p>{description}</p></div>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="worker-team-dialog__body worker-enemy-schedule__body">
          {rounds.map(({ round, challenges }) => (
            <section className="worker-enemy-round" key={round}>
              <h3>第 {round} 回合</h3>
              {challenges.map((challenge) => {
                const enemies = buildChallengeEncounterTeam(challenge, 1);
                return (
                  <article className="worker-enemy-challenge" key={challenge.id}>
                    <div className="worker-enemy-challenge__heading">
                      <strong>{getChallengeLabel(challenge)}｜{challenge.encounter.name}</strong>
                      <span>{challenge.encounter.description}</span>
                    </div>
                    <div className="worker-enemy-lineup">
                      {enemies.map((enemy, index) => (
                        <div className="worker-enemy-card" key={`${enemy.id}-${index}`}>
                          <img src={enemy.image} alt="" />
                          <div>
                            <strong>{index + 1}. {enemy.name}</strong>
                            <span>{enemy.atk} ATK・{enemy.hp} HP{enemy.battleArmor ? `・${enemy.battleArmor} 護甲` : ""}</span>
                            <small>{getPetSpecialEffectText(enemy) ?? "無特殊效果"}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}
