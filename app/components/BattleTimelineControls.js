"use client";

const PLAYBACK_SPEED_OPTIONS = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
  { value: 5, label: "5×" },
];

export default function BattleTimelineControls({
  paused,
  onTogglePause,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onEnd,
  canEnd,
  playbackSpeed,
  onPlaybackSpeedChange,
  onGoToStart,
  canGoToStart,
  onShowContribution,
  canShowContribution = false,
}) {
  const buttons = [
    ["回到開頭", onGoToStart, !canGoToStart, ""],
    [paused ? "繼續" : "暫停", onTogglePause, !paused && !canEnd && !canNext && !canPrev, ""],
    ["上一步", onPrev, !canPrev, ""],
    ["下一步", onNext, !canNext, ""],
    ["結束", onEnd, !canEnd, " battle-control-button--primary"],
  ];
  return (
    <div className="battle-timeline-controls" aria-label="戰鬥動畫控制">
      {buttons.map(([label, onClick, disabled, classSuffix]) => (
        <button key={label} type="button" className={`battle-control-button${classSuffix}`} onClick={onClick} disabled={disabled}>
          {label}
        </button>
      ))}
      <label className="battle-timeline-controls__speed">
        <span className="battle-timeline-controls__speed-label">播放速度</span>
        <select
          className="battle-timeline-controls__speed-select"
          value={String(playbackSpeed)}
          onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
          aria-label="播放速度"
        >
          {PLAYBACK_SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="battle-control-button battle-control-button--contribution"
        onClick={onShowContribution}
        disabled={!canShowContribution}
      >
        查看角色結算貢獻
      </button>
    </div>
  );
}
