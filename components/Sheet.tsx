"use client";

// SHEET — the bottom sheet behind the plan editor and the "not feeling it"
// reasons. An inline expansion inside a control bar pushes every card below it
// down the page; a sheet costs the layout nothing and is what the platform does.
//
// Drag-to-dismiss runs on the same pointer primitives as SwipeDeck — one gesture
// implementation, two features — with setPointerCapture so a fast flick that
// leaves the element still resolves.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Mono sub-label, the telemetry voice. */
  sub?: string;
  children: ReactNode;
}

export default function Sheet({ open, onClose, title, sub, children }: SheetProps) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  const end = useCallback(() => {
    start.current = null;
    setDy((d) => {
      if (d > 96) onClose();
      return 0;
    });
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDy(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-scrim" type="button" aria-label="Close" onClick={onClose} />
      <div
        className="sheet"
        ref={panel}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined }}
        data-dragging={start.current !== null ? "1" : undefined}
      >
        <div
          className="sheet-grip"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current === null) return;
            setDy(Math.max(0, e.clientY - start.current));
          }}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span className="sheet-grabber" aria-hidden="true" />
        </div>
        <header className="sheet-head">
          <h2>{title}</h2>
          {sub && <span className="sheet-sub">{sub}</span>}
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
