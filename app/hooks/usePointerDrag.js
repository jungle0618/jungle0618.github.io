"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DATA_TEAM_SLOT = "data-team-slot-index";
const DATA_TEAM_ROW = "data-team-row-index";
const DATA_COLLECTION_DROP_ZONE = "data-collection-drop-zone";
const DRAG_START_DISTANCE_PX = 6;
const TOUCH_DRAG_HOLD_MS = 80;

function readTeamSlotUnderPointer(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target) return null;
  const slot = target.closest(`[${DATA_TEAM_SLOT}]`);
  if (!slot) return null;
  const row = slot.closest(`[${DATA_TEAM_ROW}]`);
  const rawIndex = slot.getAttribute(DATA_TEAM_SLOT);
  const rawTeamIndex = row?.getAttribute(DATA_TEAM_ROW) ?? "0";
  const index = Number(rawIndex);
  const teamIndex = Number(rawTeamIndex);
  if (Number.isNaN(index) || Number.isNaN(teamIndex)) return null;
  return { teamIndex, index };
}

function isCollectionDropZoneAt(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  return Boolean(target?.closest(`[${DATA_COLLECTION_DROP_ZONE}]`));
}

function hoverTargetsFromPoint(clientX, clientY) {
  const teamSlot = readTeamSlotUnderPointer(clientX, clientY);
  return {
    teamIndex: teamSlot?.teamIndex ?? null,
    slotIndex: teamSlot?.index ?? null,
    collection: isCollectionDropZoneAt(clientX, clientY),
  };
}

function getDropTargetAt(clientX, clientY) {
  const { teamIndex, slotIndex, collection } = hoverTargetsFromPoint(clientX, clientY);
  if (teamIndex !== null && slotIndex !== null) return { zone: "team", teamIndex, index: slotIndex };
  if (collection) return { zone: "collection" };
  return null;
}

export default function usePointerDrag() {
  const [draggedItem, setDraggedItem] = useState(null);
  const [pointerDragGhost, setPointerDragGhost] = useState(null);
  /** 拖曳中指標下方的隊伍格或收藏區。 */
  const [dragHoverTarget, setDragHoverTarget] = useState(null);
  const payloadRef = useRef(null);
  const cleanupRef = useRef(null);

  const clearDragging = useCallback(() => {
    payloadRef.current = null;
    setDraggedItem(null);
    setPointerDragGhost(null);
    setDragHoverTarget(null);
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const startPointerDrag = useCallback((payload, event, handlers) => {
    if (event.button !== 0) return;

    payloadRef.current = payload;
    const startX = event.clientX;
    const startY = event.clientY;
    const isTouchPointer = event.pointerType === "touch";
    let hasStartedDragging = false;
    let touchMoved = false;
    let touchDragTimer = null;
    let latestX = startX;
    let latestY = startY;

    const beginDragging = (x, y) => {
      if (hasStartedDragging) return;
      hasStartedDragging = true;
      setDraggedItem(payload);
      setPointerDragGhost({ x, y, data: payload.data });
      setDragHoverTarget(hoverTargetsFromPoint(x, y));
    };

    const handlePointerMove = (moveEvent) => {
      const x = moveEvent.clientX;
      const y = moveEvent.clientY;
      latestX = x;
      latestY = y;
      if (!hasStartedDragging) {
        const distance = Math.hypot(x - startX, y - startY);
        if (isTouchPointer) {
          // 快速移動交給水平 scroll；只要手指停留達時間，即使期間有小幅移動也進入拖曳。
          if (distance >= DRAG_START_DISTANCE_PX) touchMoved = true;
          return;
        }
        if (distance < DRAG_START_DISTANCE_PX) return;
        beginDragging(x, y);
      }
      if (hasStartedDragging) moveEvent.preventDefault();
      setPointerDragGhost((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          x,
          y,
        };
      });
      setDragHoverTarget(hoverTargetsFromPoint(x, y));
    };

    const handlePointerUp = (upEvent) => {
      const activePayload = payloadRef.current;
      if (activePayload && !hasStartedDragging) {
        if (!touchMoved) handlers.onTap?.(activePayload, upEvent);
        clearDragging();
      } else if (activePayload) {
        const x = upEvent.clientX;
        const y = upEvent.clientY;
        const target = getDropTargetAt(x, y);
        if (target !== null) {
          handlers.onDropToSlot(target, activePayload);
        } else {
          clearDragging();
        }
      } else {
        clearDragging();
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (touchDragTimer) window.clearTimeout(touchDragTimer);
      cleanupRef.current = null;
    };

    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (touchDragTimer) window.clearTimeout(touchDragTimer);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    if (isTouchPointer) {
      touchDragTimer = window.setTimeout(() => {
        if (payloadRef.current) beginDragging(latestX, latestY);
      }, TOUCH_DRAG_HOLD_MS);
    }
  }, [clearDragging]);

  return {
    draggedItem,
    pointerDragGhost,
    dragHoverTarget,
    startPointerDrag,
    clearDragging,
  };
}
