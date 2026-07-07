import { COLS, TOTAL_ROWS } from "./constants";
import type { PieceType } from "./constants";

export type Cell = PieceType | "GARBAGE" | null;

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

  // 맨 아래에 가비지 줄을 삽입 (holeCol만 비어있고 나머지는 꽉 찬 줄), 기존 줄은 위로 밀림.
  // 맨 위로 밀려나가면서 사라지는 줄에 채워진 셀이 하나라도 있었으면 true를 반환
  // ("Garbage Out" - 가비지 때문에 블록이 보드 밖으로 밀려난 상태, 게임오버 조건).
  addGarbage(lines: number, holeCol: number): boolean {
    if (lines <= 0) return false;
    const overflow = this.grid.slice(0, lines).some((row) => row.some((cell) => cell !== null));
    const garbageRows: Cell[][] = Array.from({ length: lines }, () =>
      Array.from({ length: COLS }, (_, c) => (c === holeCol ? null : "GARBAGE"))
    );
    this.grid = [...this.grid.slice(lines), ...garbageRows];
    return overflow;
  }

  reset() {
    this.grid = Board.emptyGrid();
  }
}
