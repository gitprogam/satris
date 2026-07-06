import { COLS, TOTAL_ROWS } from "./constants";
import type { PieceType } from "./constants";

export type Cell = PieceType | null;

export class Board {
  grid: Cell[][];

  constructor() {
    this.grid = Board.emptyGrid();
  }

  static emptyGrid(): Cell[][] {
    return Array.from({ length: TOTAL_ROWS }, () => Array<Cell>(COLS).fill(null));
  }

  isInsideCols(col: number): boolean {
    return col >= 0 && col < COLS;
  }

  isCellFree(row: number, col: number): boolean {
    if (col < 0 || col >= COLS) return false;
    if (row >= TOTAL_ROWS) return false;
    if (row < 0) return true; // 버퍼 위쪽은 항상 비어있다고 취급
    return this.grid[row][col] === null;
  }

  lockCells(cells: [number, number][], type: PieceType) {
    for (const [row, col] of cells) {
      if (row >= 0 && row < TOTAL_ROWS && col >= 0 && col < COLS) {
        this.grid[row][col] = type;
      }
    }
  }

  // 꽉 찬 줄을 찾아 제거하고, 제거된 줄 수와 인덱스를 반환
  clearLines(): number[] {
    const fullRows: number[] = [];
    for (let row = 0; row < TOTAL_ROWS; row++) {
      if (this.grid[row].every((c) => c !== null)) {
        fullRows.push(row);
      }
    }
    if (fullRows.length === 0) return [];

    const fullSet = new Set(fullRows);
    const remaining = this.grid.filter((_, idx) => !fullSet.has(idx));
    const newRows = Array.from({ length: fullRows.length }, () => Array<Cell>(COLS).fill(null));
    this.grid = [...newRows, ...remaining];
    return fullRows;
  }

  reset() {
    this.grid = Board.emptyGrid();
  }
}
