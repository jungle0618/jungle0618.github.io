"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GAME_TUTORIAL_PAGES } from "../lib/gameTutorialPages";

export default function GameTutorialLauncher() {
  const [open, setOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const titleId = useId();
  const total = GAME_TUTORIAL_PAGES.length;
  const page = GAME_TUTORIAL_PAGES[pageIndex];

  const close = useCallback(() => {
    setOpen(false);
    setPageIndex(0);
  }, []);

  const goPrev = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setPageIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [pageIndex]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="game-tutorial-fab"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        遊戲教學
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="game-tutorial-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="game-tutorial-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="game-tutorial-dialog-header">
              <h2 id={titleId} className="game-tutorial-dialog-title">
                {page.title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                className="game-tutorial-close"
                onClick={close}
              >
                關閉
              </button>
            </div>
            <div ref={bodyRef} className="game-tutorial-body game-tutorial-md-root">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.markdown}</ReactMarkdown>
            </div>
            <div className="game-tutorial-footer">
              <div className="game-tutorial-footer-left">
                <button
                  type="button"
                  className="game-tutorial-paging-btn"
                  onClick={goPrev}
                  disabled={pageIndex <= 0}
                >
                  上一頁
                </button>
              </div>
              <div className="game-tutorial-footer-center" aria-live="polite">
                第 {pageIndex + 1} / {total} 頁
              </div>
              <div className="game-tutorial-footer-right">
                <button
                  type="button"
                  className="game-tutorial-paging-btn"
                  onClick={goNext}
                  disabled={pageIndex >= total - 1}
                >
                  下一頁
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
