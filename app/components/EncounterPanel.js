"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import GameCard from "./GameCard";
import StatIcon from "./StatIcon";
import { ITEM_ICONS } from "../lib/assetConfig";
import { formatDisplayName } from "../lib/petCatalog";

function EncounterDetailsDialog({ row, onClose, onSelectMonster }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const { challenge, monsters, bossLevel = 1 } = row;
  const displayMonsters = [...monsters].reverse();

  return createPortal(
    <div className="encounter-details-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="encounter-details-dialog" role="dialog" aria-modal="true" aria-labelledby="encounter-details-title">
        <header className="encounter-details-header">
          <div>
            <span>{challenge.kindLabel ?? challenge.label ?? challenge.kind}</span>
            <h2 id="encounter-details-title">{challenge.encounter.name} Lv.{bossLevel}</h2>
          </div>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="encounter-details-lineup" aria-label="敵方實戰站位，角色由左至右排列">
          {displayMonsters.map((monster, index) => (
            <div
              className="encounter-details-slot"
              key={`${monster.name}-${index}`}
              role="button"
              tabIndex={0}
              aria-label={`查看${formatDisplayName(monster.name)}的詳細資訊`}
              onClick={() => onSelectMonster?.(monster)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectMonster?.(monster);
                }
              }}
            >
              <GameCard
                data={monster}
                showLevel
                showName
                className="encounter-details-card"
                formatDisplayName={formatDisplayName}
                itemIcons={ITEM_ICONS}
                StatIcon={StatIcon}
              />
            </div>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}

function EncounterChallenge({ row, onOpen }) {
  const { challenge, monsters, score, bossLevel = 1, active = false } = row;
  const encounter = challenge.encounter;
  return (
    <section
      className={`encounter-challenge${active ? " encounter-challenge--active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(row);
        }
      }}
    >
      <div className="encounter-challenge-head">
        <span>{challenge.kindLabel ?? challenge.label ?? challenge.kind}</span>
        <strong>{encounter.name} Lv.{bossLevel}</strong>
      </div>
      {encounter.description ? <p className="encounter-panel-description">{encounter.description}</p> : null}
    </section>
  );
}

export default function EncounterPanel({ encounter, monsters, score, bossLevel = 1, challenges = null, onSelectMonster }) {
  const [selectedRow, setSelectedRow] = useState(null);
  if (challenges?.length) {
    return (
      <>
        <aside className="encounter-panel" aria-label="本回合怪物">
          <div className="encounter-challenge-list">
            {challenges.map((row) => <EncounterChallenge key={row.challenge.id} row={row} onOpen={setSelectedRow} />)}
          </div>
        </aside>
        {selectedRow ? <EncounterDetailsDialog row={selectedRow} onClose={() => setSelectedRow(null)} onSelectMonster={onSelectMonster} /> : null}
      </>
    );
  }

  const fallbackRow = {
    challenge: { kindLabel: "", encounter },
    monsters,
    score,
    bossLevel,
  };
  return (
    <>
      <aside className="encounter-panel" aria-label="本回合怪物">
        <div className="encounter-challenge-list">
          <EncounterChallenge row={fallbackRow} onOpen={setSelectedRow} />
        </div>
      </aside>
      {selectedRow ? <EncounterDetailsDialog row={selectedRow} onClose={() => setSelectedRow(null)} onSelectMonster={onSelectMonster} /> : null}
    </>
  );
}
