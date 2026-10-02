import { useEffect, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Config } from "@lichess-org/chessground/config";
import type * as cg from "@lichess-org/chessground/types";

export interface BoardView {
  fen: string;
  turnColor: cg.Color;
  check: boolean;
  lastMove: [string, string] | null;
  /** Origin square → destination squares the solver may play. Empty = view only. */
  dests: Map<string, string[]>;
  orientation: cg.Color;
}

interface BoardProps {
  view: BoardView;
  interactive: boolean;
  onMove: (orig: string, dest: string) => void;
}

/**
 * Chessground board. Display-only: dests come from the engine and every
 * submitted move is re-validated by the engine (rejected moves snap back
 * when the parent re-syncs `fen`).
 */
export function Board({ view, interactive, onMove }: BoardProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!hostRef.current) return;
    apiRef.current = Chessground(hostRef.current, {
      coordinates: true,
      movable: {
        free: false,
        events: {
          after: (orig, dest) => onMoveRef.current(orig as string, dest as string),
        },
      },
    });
    const observer = new ResizeObserver(() => apiRef.current?.redrawAll());
    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      apiRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const config: Config = {
      fen: view.fen,
      turnColor: view.turnColor,
      check: view.check ? view.turnColor : false,
      lastMove: view.lastMove
        ? [view.lastMove[0] as cg.Key, view.lastMove[1] as cg.Key]
        : undefined,
      orientation: view.orientation,
      movable: {
        free: false,
        color: interactive ? view.turnColor : undefined,
        dests: (view.dests.size > 0
          ? view.dests
          : undefined) as unknown as cg.Dests | undefined,
        showDests: true,
        events: {
          after: (orig, dest) => onMoveRef.current(orig as string, dest as string),
        },
      },
    };
    apiRef.current?.set(config);
  }, [view, interactive]);

  return (
    <div className="board-holder">
      <div ref={hostRef} className="cg-wrap" />
    </div>
  );
}
