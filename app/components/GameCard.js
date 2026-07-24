"use client";

import {
  getCardTier,
  getPetQualityLabel,
  getPetSpecialEffectText,
} from "../lib/petCatalog";
import CardTooltip from "./CardTooltip";
import { useRef, useState } from "react";

export default function GameCard({
  data,
  showLevel = false,
  showName = false,
  /** 收藏 always；上場隊伍傳 never。 */
  qualityVisibility = "never",
  /** 拖曳中指標經過此卡時，在詳細說明內顯示品質。 */
  showQualityInTooltip = false,
  /** 強制顯示 tooltip（拖曳經過卡片時使用） */
  forceTooltipVisible = false,
  className = "",
  onPointerDown,
  formatDisplayName,
  itemIcons,
  StatIcon,
  isPlaceholder = false,
  placeholderText = "",
  showPersistentProgress = false,
}) {
  const rootRef = useRef(null);
  const [pointerInside, setPointerInside] = useState(false);
  const tooltipOpen = pointerInside || forceTooltipVisible;

  if (isPlaceholder) {
    return (
      <div className={`game-card game-card-placeholder ${className}`}>
        <div className="game-card-placeholder-text">{placeholderText}</div>
      </div>
    );
  }

  const displayName =
    typeof formatDisplayName === "function"
      ? formatDisplayName(data.displayName ?? data.name)
      : (data.displayName ?? data.name ?? "");

  const cardTier = getCardTier(data);
  const qualityLabel = getPetQualityLabel(cardTier);

  const effectText = getPetSpecialEffectText(data);
  const evolutionRoundsRemaining = data.evolved || !data.special?.evolvesAfterGameRounds
    ? null
    : Math.max(0, data.special.evolvesAfterGameRounds - (data.gameRoundsDeployed ?? 0));
  const persistentRoundTarget = data.special?.evolvesAfterGameRounds ?? null;
  const persistentRounds = Math.max(0, Number(data.gameRoundsDeployed) || 0);

  const showQualityOnCard = qualityVisibility === "always";
  const resolvedAtk = data.atk ?? 0;
  const resolvedHp = data.hp ?? 0;
  const visibleTags = (data.tags ?? []).slice(0, 2);
  const hiddenTagCount = Math.max(0, (data.tags?.length ?? 0) - visibleTags.length);
  return (
    <div
      ref={rootRef}
      className={`game-card pet-card pet-card--tier-${cardTier} ${className}`.trim()}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
    >
      <div className="game-card-meta-row">
        <span className="game-card-level pet-card-level">
          {showLevel ? `Lv.${data.level ?? 1}` : ""}
        </span>
        <div className="game-card-tags" aria-label={`標籤：${data.tags?.join("、") || "無"}`}>
          {visibleTags.map((tag) => <span key={tag}>{tag}</span>)}
          {hiddenTagCount > 0 ? <span title={data.tags.slice(2).join("、")}>+{hiddenTagCount}</span> : null}
        </div>
        {showQualityOnCard ? (
          <span
            className="game-card-quality-label pet-card-quality-label"
            title={`品質：${qualityLabel}`}
            aria-label={`品質 ${qualityLabel}`}
          >
            {qualityLabel}
          </span>
        ) : null}
      </div>

      {showPersistentProgress && persistentRoundTarget ? (
        <div className="game-card-evolution-progress">
          出戰回合 {Math.min(persistentRounds, persistentRoundTarget)}/{persistentRoundTarget}
        </div>
      ) : evolutionRoundsRemaining != null ? (
        <div className="game-card-evolution-progress">
          再出戰 {evolutionRoundsRemaining} 回合進化
        </div>
      ) : null}
      {showName ? <div className="game-card-name">{displayName}</div> : null}
      <div className="pet-card-icon-wrap">
        {data.image ? (
          <img
            src={data.image}
            alt={displayName}
            className="pet-card-icon"
            draggable={false}
          />
        ) : null}
      </div>

      <div className="pet-card-stats">
        <span className="game-card-stat-value">
          <StatIcon src={itemIcons.sword} alt="atk" />
          <span>{resolvedAtk}</span>
        </span>
        <span className="game-card-stat-value">
          <StatIcon src={itemIcons.heart} alt="hp" />
          <span>{resolvedHp}</span>
        </span>
      </div>

      <CardTooltip
        anchorRef={rootRef}
        open={tooltipOpen}
        rootClassName="card-tooltip"
        lineClassName="card-tooltip-line"
        title={`名稱：${displayName}`}
        statText={`基本資訊：ATK ${resolvedAtk} / HP ${resolvedHp}`}
        levelText={showLevel ? `等級：Lv.${data.level ?? 1}` : null}
        tierText={showQualityInTooltip ? `品質：${qualityLabel}` : null}
        tagText={data.tags?.join("、") || null}
        tierClassName={`card-tooltip-tier card-tooltip-tier-${cardTier}`}
        effectText={effectText}
      />
    </div>
  );
}
