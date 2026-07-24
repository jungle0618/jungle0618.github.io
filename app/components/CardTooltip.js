"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const FLOATING_Z = 2147483000;

function useFloatingTooltipStyle(anchorRef, active) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!active) {
      setStyle(null);
      return undefined;
    }
    const el = anchorRef?.current;
    if (!el) {
      setStyle(null);
      return undefined;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tipWidth = Math.min(280, vw * 0.72);
      let cx = r.left + r.width / 2;
      const margin = 10;
      const half = tipWidth / 2 + margin;
      cx = Math.max(half, Math.min(vw - half, cx));
      const gap = 8;
      const edgePad = 8;
      /** 僅用於決定往上或往下錨定，不限制 tooltip 高度（內容可超出視窗／原容器） */
      const availAbove = Math.max(0, r.top - margin - gap - edgePad);
      const availBelow = Math.max(0, vh - r.bottom - margin - gap - edgePad);
      let placeAbove = availAbove >= availBelow;
      if (placeAbove && availAbove < 1) placeAbove = false;
      if (!placeAbove && availBelow < 1) placeAbove = true;
      if (placeAbove) {
        setStyle({
          position: "fixed",
          left: `${cx}px`,
          top: `${r.top - gap}px`,
          transform: "translate(-50%, -100%)",
          width: `${tipWidth}px`,
          zIndex: FLOATING_Z,
        });
      } else {
        setStyle({
          position: "fixed",
          left: `${cx}px`,
          top: `${r.bottom + gap}px`,
          transform: "translate(-50%, 0)",
          width: `${tipWidth}px`,
          zIndex: FLOATING_Z,
        });
      }
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, active]);

  return style;
}

export default function CardTooltip({
  anchorRef,
  open = false,
  rootClassName,
  lineClassName,
  title,
  statText,
  levelText,
  tierText,
  tagText,
  tierClassName = "",
  effectText,
}) {
  const hasMeta = Boolean(statText || levelText || tierText || tagText);
  const floatingStyle = useFloatingTooltipStyle(anchorRef, open);

  const inner = (
    <>
      {title ? (
        <div className={`${lineClassName} card-tooltip-title`.trim()}>
          {title}
        </div>
      ) : null}
      {hasMeta ? (
        <div className="card-tooltip-meta">
          {statText ? <div className={lineClassName}>{statText}</div> : null}
          {levelText ? <div className={lineClassName}>{levelText}</div> : null}
          {tierText ? <div className={`${lineClassName} ${tierClassName}`.trim()}>{tierText}</div> : null}
          {tagText ? <div className={lineClassName}>標籤：{tagText}</div> : null}
        </div>
      ) : null}
      {effectText ? (
        <div className={`${lineClassName} card-tooltip-effect`.trim()}>
          {effectText}
        </div>
      ) : null}
    </>
  );

  if (typeof document === "undefined" || !open || !floatingStyle) return null;
  return createPortal(
    <div
      className={`${rootClassName} card-tooltip--floating`.trim()}
      style={floatingStyle}
      role="tooltip"
    >
      {inner}
    </div>,
    document.body
  );
}
