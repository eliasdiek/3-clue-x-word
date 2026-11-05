import type { ReactNode } from "react";
import { GRID_SIZE } from "@/lib/constants/game";
import { isLetter, type GridRows } from "@/lib/puzzle/grid";
import { cn } from "@/lib/utils";

export type BoardCellState = {
  active?: boolean;
  highlighted?: boolean;
  problem?: boolean;
};

type CrosswordBoardProps = {
  grid: GridRows;
  /** Show black squares and clue numbers (after Done). */
  finished: boolean;
  numbers?: (number | null)[][];
  cellState?: (row: number, column: number) => BoardCellState;
  onCellPointerDown?: (row: number, column: number) => void;
  label: string;
  /** Rendered inside the board (positioned over it), e.g. the typing input. */
  children?: ReactNode;
};

const INDEXES = Array.from({ length: GRID_SIZE }, (_, i) => i);

/**
 * The 12×12 board with row and column numbers (1–12, matching "R01C05"
 * references). Purely presentational: the editor supplies state and input.
 */
export function CrosswordBoard({
  grid,
  finished,
  numbers,
  cellState,
  onCellPointerDown,
  label,
  children,
}: CrosswordBoardProps) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-[1.5rem_1fr] grid-rows-[1.5rem_1fr] gap-1 select-none sm:grid-cols-[2rem_1fr] sm:grid-rows-[2rem_1fr]">
      <span aria-hidden />
      <div aria-hidden className="grid grid-cols-12 rounded-md bg-brand-soft/70 text-center text-xs font-bold text-ink-muted sm:text-sm">
        {INDEXES.map((i) => (
          <span key={i} className="flex items-center justify-center">
            {i + 1}
          </span>
        ))}
      </div>
      <div aria-hidden className="grid grid-rows-12 rounded-md bg-brand-soft/70 text-center text-xs font-bold text-ink-muted sm:text-sm">
        {INDEXES.map((i) => (
          <span key={i} className="flex items-center justify-center">
            {i + 1}
          </span>
        ))}
      </div>

      <div className="relative">
        <div
          role="grid"
          aria-label={label}
          aria-rowcount={GRID_SIZE}
          aria-colcount={GRID_SIZE}
          className="grid aspect-square grid-cols-12 grid-rows-12 overflow-hidden rounded-md border-2 border-navy bg-grid-line gap-px"
        >
          {INDEXES.map((row) => (
            <div key={row} role="row" className="contents">
              {INDEXES.map((column) => {
                const value = grid[row][column];
                const letter = isLetter(value) ? value : null;
                const black = finished && !letter;
                const number = finished ? numbers?.[row]?.[column] : null;
                const state = cellState?.(row, column) ?? {};
                return (
                  <div
                    key={column}
                    role="gridcell"
                    aria-selected={state.active || undefined}
                    aria-label={`Row ${row + 1}, column ${column + 1}: ${letter ?? (black ? "black square" : "empty")}`}
                    onPointerDown={
                      onCellPointerDown
                        ? (event) => {
                            event.preventDefault();
                            onCellPointerDown(row, column);
                          }
                        : undefined
                    }
                    className={cn(
                      "relative flex items-center justify-center",
                      black
                        ? "bg-block"
                        : state.problem
                          ? "bg-danger"
                          : state.highlighted
                            ? "bg-brand-soft"
                            : "bg-surface",
                      onCellPointerDown && !black && "cursor-pointer",
                    )}
                  >
                    {number ? (
                      <span className="absolute top-0.5 left-0.5 font-grid-number text-[clamp(0.5rem,1.3vw,0.72rem)] leading-none font-bold text-ink">
                        {number}
                      </span>
                    ) : null}
                    {letter ? (
                      <span
                        className={cn(
                          "font-grid text-[clamp(0.95rem,3.6vw,1.75rem)] leading-none font-bold",
                          state.problem ? "text-danger-ink" : "text-ink",
                        )}
                      >
                        {letter}
                      </span>
                    ) : null}
                    {state.active ? (
                      <span aria-hidden className="pointer-events-none absolute inset-0 ring-3 ring-brand ring-inset" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
