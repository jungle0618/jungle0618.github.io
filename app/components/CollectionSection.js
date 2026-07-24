"use client";

import { useMemo, useState } from "react";
import GameCard from "./GameCard";

const SORT_OPTIONS = [
  { key: "level", label: "等級" },
  { key: "tier", label: "稀有度" },
  { key: "atk", label: "攻擊" },
  { key: "hp", label: "生命" },
];

export default function CollectionSection({
  collection,
  team,
  teams,
  excludeSelected = true,
  isReadOnlyView = false,
  draggedItem,
  isDragHover = false,
  onPointerDownCollectionPet,
  title = "角色池",
  subtitle,
  formatDisplayName,
  itemIcons,
  StatIcon,
}) {
  const [sortIndex, setSortIndex] = useState(0);
  const [descending, setDescending] = useState(true);
  const [tagFilter, setTagFilter] = useState(null);
  const sortOption = SORT_OPTIONS[sortIndex];
  const tagOptions = useMemo(
    () => [...new Set(collection.flatMap((pet) => pet.tags ?? []))].sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [collection]
  );
  const availablePets = useMemo(() => {
    const selectedNames = new Set((teams ?? [team ?? []]).flat().filter(Boolean).map((pet) => pet.name));
    const direction = descending ? -1 : 1;
    return collection
      .filter((pet) => !excludeSelected || !selectedNames.has(pet.name))
      .filter((pet) => !(pet.special?.oncePerGame && (Number(pet.deployments) || Number(pet.gameRoundsDeployed) || 0) > 0))
      .filter((pet) => tagFilter == null || pet.tags?.includes(tagFilter))
      .sort((a, b) => {
        const valueDiff = (Number(a[sortOption.key]) || 0) - (Number(b[sortOption.key]) || 0);
        return valueDiff !== 0
          ? valueDiff * direction
          : String(a.name).localeCompare(String(b.name));
      });
  }, [collection, team, teams, excludeSelected, sortOption.key, descending, tagFilter]);

  return (
    <section
      className={`panel collection-panel${isDragHover ? " collection-panel--drag-hover" : ""}`}
      data-collection-drop-zone="true"
    >
      <div className="collection-panel-heading">
        <h2 className="panel-title">{title}</h2>
        <div className="collection-toolbar">
          <span className="collection-count">可用 {availablePets.length}／共 {collection.length}</span>
          <button
            type="button"
            className="collection-sort-button"
            onClick={() => setSortIndex((current) => (current + 1) % SORT_OPTIONS.length)}
            title="切換排序欄位"
          >
            排序：{sortOption.label}
          </button>
          <button
            type="button"
            className="collection-sort-button"
            onClick={() => setDescending((current) => !current)}
            title="切換排序方向"
          >
            {descending ? "高 → 低" : "低 → 高"}
          </button>
        </div>
      </div>
      {tagOptions.length ? (
        <div className="collection-tag-filter" aria-label="依標籤篩選角色">
          <span>標籤</span>
          <button type="button" className={tagFilter == null ? "collection-tag-filter-btn collection-tag-filter-btn--active" : "collection-tag-filter-btn"} onClick={() => setTagFilter(null)}>全部</button>
          {tagOptions.map((tag) => (
            <button key={tag} type="button" className={tagFilter === tag ? "collection-tag-filter-btn collection-tag-filter-btn--active" : "collection-tag-filter-btn"} onClick={() => setTagFilter((current) => current === tag ? null : tag)}>{tag}</button>
          ))}
        </div>
      ) : null}
      {subtitle || isReadOnlyView ? (
        <p className="panel-subtitle">
          {subtitle ?? `角色池共有 ${collection.length} 隻動物（唯讀）`}
        </p>
      ) : null}
      {availablePets.length === 0 ? (
        <p className="collection-empty">
          {collection.length === 0 ? "角色池尚未有任何動物。" : tagFilter ? `沒有「${tagFilter}」標籤的可用角色。` : "角色池中的動物都已上場。"}
        </p>
      ) : (
        <div className="collection-grid">
          {availablePets.map((pet) => {
            const isDragged = draggedItem?.source === "collection" && draggedItem.data?.name === pet.name;
            return (
              <div
                key={pet.name}
                className={`collection-card${isDragged ? " collection-card--dragging" : ""}`}
                onPointerDown={isReadOnlyView ? undefined : (event) => onPointerDownCollectionPet(pet, event)}
              >
                <GameCard
                  data={pet}
                  showLevel
                  qualityVisibility="never"
                  showQualityInTooltip
                  formatDisplayName={formatDisplayName}
                  itemIcons={itemIcons}
                  StatIcon={StatIcon}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
