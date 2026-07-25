"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatDisplayName,
  getPetCompendiumList,
  getPetLevelStats,
  getPetQualityLabel,
  getPetSpecialEffectText,
} from "../lib/petCatalog";
import { MAX_BOSS_LEVEL } from "../lib/gameConfig";
import { ENEMY_DEFINITIONS, ENEMY_LEVEL_GROWTH, getCharacterTags, getEnemyDefinition, getEnemyLevelMultiplier, getLevelMultiplier, scaleSpecialForLevel } from "../lib/characterConfig";
import { filterCompendiumEntries, findPlayerCompendiumEntry } from "../lib/compendiumVisibility";

function CharacterTags({ tags = [] }) {
  if (!tags.length) return null;
  return <div className="pet-compendium-tags" aria-label={`標籤：${tags.join("、")}`}>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

function PetCompendiumDetail({ entry, onBack, backButtonRef }) {
  const { name, image, tier } = entry;
  const title = formatDisplayName(name);
  const qualityLabel = entry.isEnemy ? "敵方角色" : getPetQualityLabel(tier);

  return (
    <div className="pet-compendium-detail">
      <button
        ref={backButtonRef}
        type="button"
        className="pet-compendium-back"
        onClick={onBack}
      >
        ← 返回圖鑑列表
      </button>
      <div className="pet-compendium-detail-hero">
        <img
          src={image}
          alt=""
          className={`pet-compendium-detail-img${entry.isEnemy ? " pet-compendium-img--enemy" : ""}`}
          width={96}
          height={96}
          draggable={false}
        />
        <div className="pet-compendium-detail-hero-text">
          <h3 className="pet-compendium-detail-title">{title}</h3>
          <p className="pet-compendium-detail-tier-line" title={`品質：${qualityLabel}`}>
            <span className="pet-compendium-quality-value">{qualityLabel}</span>
            <span className="pet-compendium-tier-label">品質</span>
          </p>
          <CharacterTags tags={entry.tags} />
        </div>
      </div>
      <p className="pet-compendium-detail-lead">
        {`我方等級為 Lv.1～Lv.10，敵方等級為 Lv.1～Lv.${MAX_BOSS_LEVEL}；我方攻防與固定加值效果每級乘 1.2，敵方每級乘 1.1。以下為各等級的基礎攻防與戰場效果。`}
      </p>
      <div className="pet-compendium-level-grid">
        {Array.from({ length: entry.isEnemy ? MAX_BOSS_LEVEL : 10 }, (_, index) => index + 1).map((lv) => {
          const multiplier = entry.isEnemy ? getEnemyLevelMultiplier(lv) : getLevelMultiplier(lv);
          const stats = entry.isEnemy
            ? { atk: Math.max(1, Math.floor(entry.atk * multiplier)), hp: Math.max(1, Math.floor(entry.hp * multiplier)) }
            : getPetLevelStats(name, tier, lv);
          const armor = entry.isEnemy ? Math.max(0, Math.floor((entry.battleArmor ?? 0) * multiplier)) : 0;
          const effect = getPetSpecialEffectText(entry.isEnemy
            ? { ...entry, special: scaleSpecialForLevel(entry.special, lv, ENEMY_LEVEL_GROWTH) }
            : { name, level: lv });
          return (
            <div key={lv} className="pet-compendium-level-card">
              <div className="pet-compendium-level-card-head">Lv.{lv}</div>
              {stats ? (
                <dl className="pet-compendium-level-stats">
                  <dt>ATK</dt>
                  <dd>{stats.atk}</dd>
                  <dt>HP</dt>
                  <dd>{stats.hp}</dd>
                  {armor > 0 ? <><dt>護甲</dt><dd>{armor}</dd></> : null}
                </dl>
              ) : (
                <p className="pet-compendium-level-missing">無此等等級資料</p>
              )}
              {effect ? (
                <p className="pet-compendium-level-effect">{effect}</p>
              ) : (
                <p className="pet-compendium-level-effect pet-compendium-level-effect--muted">
                  無額外戰場主動效果。
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PetCompendiumLauncher({ selectedPet = null, onSelectedPetOpened, includeEnemies = false, includeLegendary = false }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [qualityFilter, setQualityFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const closeRef = useRef(null);
  const backRef = useRef(null);

  const allEntries = useMemo(() => [
    ...getPetCompendiumList().map((entry) => ({ ...entry, isEnemy: false })),
    ...(includeEnemies
      ? Object.entries(ENEMY_DEFINITIONS).map(([id, entry]) => ({ ...entry, id, isEnemy: true, tags: getCharacterTags(entry) }))
      : []),
  ], [includeEnemies]);
  const entries = useMemo(
    () => filterCompendiumEntries(allEntries, includeLegendary),
    [allEntries, includeLegendary]
  );
  const tierOptions = useMemo(() => [...new Set(entries.map((row) => row.tier).filter(Number.isFinite))].sort((a, b) => a - b), [entries]);
  const tagOptions = useMemo(() => [...new Set(entries.flatMap((row) => row.tags ?? []))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [entries]);
  const filteredEntries = useMemo(
    () => entries.filter((row) =>
      (qualityFilter == null || (qualityFilter === "enemy" ? row.isEnemy : !row.isEnemy && row.tier === qualityFilter)) &&
      (tagFilter == null || row.tags?.includes(tagFilter))
    ),
    [entries, qualityFilter, tagFilter]
  );

  const closeDialog = useCallback(() => {
    setSelected(null);
    setOpen(false);
  }, []);

  const openDialog = useCallback(() => {
    setSelected(null);
    setQualityFilter(null);
    setTagFilter(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!selectedPet) return;
    const entry = selectedPet.isEnemy
      ? (() => {
          const enemy = getEnemyDefinition(selectedPet.id);
          return { ...enemy, id: selectedPet.id, isEnemy: true, tags: getCharacterTags(enemy) };
        })()
      : findPlayerCompendiumEntry(allEntries, selectedPet.name);
    if (entry) {
      setQualityFilter(null);
      setTagFilter(null);
      setSelected(entry);
      setOpen(true);
    }
    onSelectedPetOpened?.();
  }, [selectedPet, allEntries, onSelectedPetOpened]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (selected) {
        setSelected(null);
        return;
      }
      closeDialog();
    }
    document.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => {
      if (selected) {
        backRef.current?.focus();
      } else {
        closeRef.current?.focus();
      }
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(t);
    };
  }, [open, selected, closeDialog]);

  return (
    <>
      <button
        type="button"
        className={`game-compendium-fab${includeEnemies && includeLegendary ? " game-compendium-fab--worker" : ""}`}
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        圖鑑
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="game-tutorial-backdrop game-compendium-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div
            className={`game-compendium-dialog${includeEnemies && includeLegendary ? " game-compendium-dialog--worker" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pet-compendium-title"
          >
            <div className="game-settings-dialog-header">
              <h2 id="pet-compendium-title" className="game-settings-dialog-title">
                {selected ? `${formatDisplayName(selected.name)} — 詳情` : "寵物圖鑑"}
              </h2>
              <button
                ref={closeRef}
                type="button"
                className="game-tutorial-close"
                onClick={closeDialog}
              >
                關閉
              </button>
            </div>
            <div className="pet-compendium-body">
              {selected ? (
                <PetCompendiumDetail
                  entry={selected}
                  onBack={() => setSelected(null)}
                  backButtonRef={backRef}
                />
              ) : (
                <>
                  <p className="pet-compendium-intro">
                    {includeEnemies
                      ? "工人圖鑑收錄所有我方與敵方角色。"
                      : "圖鑑收錄非傳奇我方角色；敵方與傳奇角色資料需從遊戲中出現的角色卡片查看。"}
                    <strong> 點選卡片</strong>
                    {includeEnemies
                      ? `可查看我方 Lv.1～Lv.10、敵方 Lv.1～Lv.${MAX_BOSS_LEVEL} 面板與效果數值。`
                      : "可查看我方 Lv.1～Lv.10 面板與效果數值。"}
                  </p>
                  <div className="pet-compendium-filters" aria-label="圖鑑篩選">
                    <div className="pet-compendium-filter-row">
                      <span className="pet-compendium-filter-label">品質</span>
                      <button
                        type="button"
                        className={`pet-compendium-filter-btn${qualityFilter == null ? " pet-compendium-filter-btn--active" : ""}`}
                        aria-pressed={qualityFilter == null}
                        onClick={() => {
                          setQualityFilter(null);
                          setTagFilter(null);
                        }}
                      >
                        全部
                      </button>
                      {tierOptions.map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          className={`pet-compendium-filter-btn${qualityFilter === tier ? " pet-compendium-filter-btn--active" : ""}`}
                          aria-pressed={qualityFilter === tier}
                          onClick={() => setQualityFilter((current) => (current === tier ? null : tier))}
                        >
                          {getPetQualityLabel(tier)}
                        </button>
                      ))}
                      {includeEnemies ? (
                        <button
                          type="button"
                          className={`pet-compendium-filter-btn${qualityFilter === "enemy" ? " pet-compendium-filter-btn--active" : ""}`}
                          aria-pressed={qualityFilter === "enemy"}
                          onClick={() => setQualityFilter((current) => (current === "enemy" ? null : "enemy"))}
                        >
                          敵方
                        </button>
                      ) : null}
                    </div>
                    <div className="pet-compendium-filter-row">
                      <span className="pet-compendium-filter-label">標籤</span>
                      <button
                        type="button"
                        className={`pet-compendium-filter-btn${tagFilter == null ? " pet-compendium-filter-btn--active" : ""}`}
                        aria-pressed={tagFilter == null}
                        onClick={() => setTagFilter(null)}
                      >
                        全部
                      </button>
                      {tagOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`pet-compendium-filter-btn${tagFilter === tag ? " pet-compendium-filter-btn--active" : ""}`}
                          aria-pressed={tagFilter === tag}
                          onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="pet-compendium-filter-count">
                      顯示 {filteredEntries.length} / {entries.length} 隻
                    </div>
                  </div>
                  <ul className="pet-compendium-grid" aria-label="寵物列表">
                    {filteredEntries.map((row) => {
                      const title = formatDisplayName(row.name);
                      const effect = getPetSpecialEffectText(row.isEnemy ? row : { name: row.name, level: 1 });
                      const levelOneStats = row.isEnemy
                        ? { atk: row.atk, hp: row.hp }
                        : getPetLevelStats(row.name, row.tier, 1);
                      return (
                        <li key={row.isEnemy ? `enemy-${row.id}` : `player-${row.name}`}>
                          <button
                            type="button"
                            className="pet-compendium-card"
                            onClick={() => setSelected(row)}
                          >
                            <div className="pet-compendium-card-top">
                              <img
                                src={row.image}
                                alt=""
                                className={`pet-compendium-img${row.isEnemy ? " pet-compendium-img--enemy" : ""}`}
                                draggable={false}
                              />
                              <div className="pet-compendium-meta">
                                <span className="pet-compendium-name">{title}</span>
                                <span
                                  className="pet-compendium-tier"
                                  title={row.isEnemy ? "敵方角色詳細資訊" : `品質：${getPetQualityLabel(row.tier)}`}
                                >
                                  {row.isEnemy ? "敵方角色" : getPetQualityLabel(row.tier)}
                                </span>
                              </div>
                            </div>
                            <CharacterTags tags={row.tags} />
                            {levelOneStats ? (
                              <dl className="pet-compendium-card-stats" aria-label={`等級 1，攻擊 ${levelOneStats.atk}，生命 ${levelOneStats.hp}`}>
                                <div><dt>ATK</dt><dd>{levelOneStats.atk}</dd></div>
                                <div><dt>HP</dt><dd>{levelOneStats.hp}</dd></div>
                              </dl>
                            ) : null}
                            {effect ? (
                              <p className="pet-compendium-effect">{effect}</p>
                            ) : (
                              <p className="pet-compendium-effect pet-compendium-effect--muted">
                                無額外戰場主動效果。
                              </p>
                            )}
                            <span className="pet-compendium-card-hint">點擊看詳情</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
