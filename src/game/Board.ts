import { COLS, TOTAL_ROWS } from "./constants";
import type { PieceType } from "./constants";

export type Cell = PieceType | "GARBAGE" | null;

export class Board {
  grid: Cell[][];
  // 보드 폭. 기본값은 솔로/1v1용 COLS(10). 2v2 "합체 보드"는 COLS*2(20)짜리 Board
  // 하나를 두 GameEngine이 공유해서 쓴다 (src/game/GameEngine.ts 참고).
  width: number;

  constructor(width: number = COLS) {
    this.width = width;
    this.grid = this.emptyGrid();
  }

  private emptyGrid(): Cell[][] {
    return Array.from({ length: TOTAL_ROWS }, () => Array<Cell>(this.width).fill(null));
  }

  isInsideCols(col: number): boolean {
    return col >= 0 && col < this.width;
  }

  isCellFree(row: number, col: number): boolean {
    if (col < 0 || col >= this.width) return false;
    if (row >= TOTAL_ROWS) return false;
    if (row < 0) return true; // 버퍼 위쪽은 항상 비어있다고 취급
    return this.grid[row][col] === null;
  }

  lockCells(cells: [number, number][], type: PieceType) {
    for (const [row, col] of cells) {
      if (row >= 0 && row < TOTAL_ROWS && col >= 0 && col < this.width) {
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
    const newRows = Array.from({ length: fullRows.length }, () => Array<Cell>(this.width).fill(null));
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
      Array.from({ length: this.width }, (_, c) => (c === holeCol ? null : "GARBAGE"))
    );
    this.grid = [...this.grid.slice(lines), ...garbageRows];
    return overflow;
  }

  // 4-Wide 연습(이스터에그 하드코어 모드)용: 맨 아래에 지정된 열(cols)만 "GARBAGE"로
  // 채운 줄을 삽입하고 기존 줄은 위로 밀어올린다. addGarbage()와 달리 구멍이 하나가
  // 아니라, 지정한 열 이외의 나머지 전부가 뚫려있는 형태(=4칸 우물을 그대로 남겨둔
  // 채 양옆 벽만 다시 쌓기)라 별도 메서드로 분리했다.
  addPartialGarbage(cols: number[]) {
    const colSet = new Set(cols);
    const row: Cell[] = Array.from({ length: this.width }, (_, c) => (colSet.has(c) ? "GARBAGE" : null));
    this.grid = [...this.grid.slice(1), row];
  }

  reset() {
    this.grid = this.emptyGrid();
  }
}
