"use client";

import { useEffect, useState } from "react";
import GameCard from "./GameCard";

export default function TeamSection({
  team,
  teams,
  challenges = [],
  companionTeams = [],
  companionLabels = [],
  companionPlacements = [],
  subtitle,
  modeActions = [],
  editableTeamIndexes = null,
  isReadOnlyView = false,
  draggedItem,
  dragHoverTarget = null,
  onPointerDownTeamPet,
  onAutoConfigureTeam,
  autoConfigureDisabled = false,
  onOptimalConfigureTeam,
  optimalConfigureDisabled = false,
  onRandomConfigureTeam,
  formatDisplayName,
  itemIcons,
  StatIcon,
}) {
  const interactionLocked = isReadOnlyView;
  const rows = teams ?? [team];
  const [mobileRowIndex, setMobileRowIndex] = useState(0);
  const editableIndexSet = editableTeamIndexes ? new Set(editableTeamIndexes) : null;

  useEffect(() => {
    setMobileRowIndex((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  return (
    <section className="panel team-panel">
      <div className="team-panel-heading">
        <h2 className="panel-title team-panel-title">上場隊伍</h2>
        {rows.length > 1 ? (
          <div className="mobile-team-row-tabs" role="tablist" aria-label="切換上場隊伍">
            {rows.map((row, rowIndex) => (
              <button
                type="button"
                role="tab"
                aria-selected={mobileRowIndex === rowIndex}
                className={mobileRowIndex === rowIndex ? "is-active" : ""}
                key={challenges[rowIndex]?.id ?? `mobile-team-${rowIndex}`}
                onClick={() => setMobileRowIndex(rowIndex)}
              >
                隊伍 {rowIndex + 1}
                <small>{row.filter(Boolean).length}/{row.length}</small>
              </button>
            ))}
          </div>
        ) : null}
        {!interactionLocked && (onAutoConfigureTeam || onOptimalConfigureTeam || onRandomConfigureTeam) ? (
          <div className="team-configure-actions">
            {modeActions.map((action) => (
              <button
                type="button"
                className={`ghost-button team-auto-configure-button${action.active ? " is-active" : ""}`}
                onClick={action.onClick}
                disabled={action.disabled}
                key={action.id ?? action.label}
              >
                {action.label}
              </button>
            ))}
            {onAutoConfigureTeam ? <button type="button" className="ghost-button team-auto-configure-button" onClick={onAutoConfigureTeam} disabled={autoConfigureDisabled}>一鍵組隊</button> : null}
            {onOptimalConfigureTeam ? <button type="button" className="ghost-button team-auto-configure-button" onClick={onOptimalConfigureTeam} disabled={optimalConfigureDisabled}>最優組隊</button> : null}
            {onRandomConfigureTeam ? <button type="button" className="ghost-button team-auto-configure-button" onClick={onRandomConfigureTeam}>隨機組隊</button> : null}
          </div>
        ) : !interactionLocked && modeActions.length ? (
          <div className="team-configure-actions">
            {modeActions.map((action) => (
              <button
                type="button"
                className={`ghost-button team-auto-configure-button${action.active ? " is-active" : ""}`}
                onClick={action.onClick}
                disabled={action.disabled}
                key={action.id ?? action.label}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {subtitle ? <p className="panel-subtitle team-panel-subtitle">{subtitle}</p> : null}
      {rows.map((row, rowIndex) => {
        const challenge = challenges[rowIndex];
        const label = challenge?.label ?? (rows.length > 1 ? `隊伍 ${rowIndex + 1}` : "上場隊伍");
        const companionTeam = companionTeams[rowIndex];
        const editable = !editableIndexSet || editableIndexSet.has(rowIndex);
        const companionCards = companionTeam?.map((pet, index) => pet ? (
          <div className="team-slot team-slot--companion" key={`companion-${rowIndex}-${index}`}>
            <GameCard data={pet} showLevel qualityVisibility="never" showQualityInTooltip formatDisplayName={formatDisplayName} itemIcons={itemIcons} StatIcon={StatIcon} />
          </div>
        ) : (
          <div className="team-slot team-slot--companion" key={`companion-${rowIndex}-${index}`}>
            <GameCard isPlaceholder placeholderText="空格" className="team-slot-card-placeholder team-slot-card-placeholder--empty" />
          </div>
        ));
        return (
          <div
            key={challenge?.id ?? `team-row-${rowIndex}`}
            className={`team-row${mobileRowIndex !== rowIndex ? " team-row--mobile-hidden" : ""}`}
            data-team-row-index={rowIndex}
          >
            {rows.length > 1 || challenge ? (
              <div className="team-row-heading">
                <strong>{label}</strong>
                <span>{row.filter(Boolean).length}/{row.length}</span>
              </div>
            ) : null}
            {companionTeam ? <div className="team-companion-heading"><strong>{companionLabels[rowIndex] ?? "搭檔的三格（唯讀）"}</strong><span>{companionTeam.filter(Boolean).length}/{companionTeam.length}</span></div> : null}
            <div className="team-grid">
              {companionTeam && companionPlacements[rowIndex] === "before" ? companionCards : null}
              {row.map((pet, index) => {
                const isDraggedFromTeam =
                  Boolean(draggedItem) &&
                  draggedItem.source === "team" &&
                  draggedItem.teamIndex === rowIndex &&
                  draggedItem.slotIndex === index;
                const shownPet = isDraggedFromTeam ? null : pet;

                return (
                  <div
                    key={`slot-${rowIndex}-${index}`}
                    data-team-slot-index={index}
                    className={`team-slot ${
                      editable &&
                      !interactionLocked &&
                      draggedItem &&
                      draggedItem.source === "collection"
                        ? "team-slot-drop-active"
                        : ""
                    }`}
                  >
                    {shownPet ? (
                      <GameCard
                        data={shownPet}
                        showLevel
                        qualityVisibility="never"
                        showQualityInTooltip
                        forceTooltipVisible={
                          Boolean(draggedItem) &&
                          dragHoverTarget?.teamIndex === rowIndex &&
                          dragHoverTarget?.slotIndex === index
                        }
                        onPointerDown={
                          interactionLocked || !editable
                            ? undefined
                            : (event) => onPointerDownTeamPet(rowIndex, index, event)
                        }
                        formatDisplayName={formatDisplayName}
                        itemIcons={itemIcons}
                        StatIcon={StatIcon}
                      />
                    ) : (
                      <GameCard
                        isPlaceholder
                        placeholderText=""
                        className="team-slot-card-placeholder team-slot-card-placeholder--empty"
                      />
                    )}
                  </div>
                );
              })}
              {companionTeam && companionPlacements[rowIndex] !== "before" ? companionCards : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
