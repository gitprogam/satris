import {
  BUFFER_ROWS,
  DEFAULT_ARR,
  DEFAULT_DAS,
  gravityForLevel,
  LINES_PER_LEVEL,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  SOFT_DROP_FACTOR,
} from "./constants";
import type { PieceType } from "./constants";
import { Board } from "./Board";
import { SevenBag } from "./Bag";
import { get180Kicks, getKicks, PIECE_SHAPES } from "./pieces";
import type { RotationState } from "./pieces";

export interface ActivePiece {
  type: PieceType;
  rotation: RotationState;
  row: number;
  col: number;
}

export type ClearType =
  | "single"
  | "double"
  | "triple"
  | "tetris"
  | "tspin"
  | "tspin-mini"
  | "tspin-single"
  | "tspin-mini-single"
  | "tspin-double"
  | "tspin-triple";

export interface ClearEvent {
  type: ClearType;
  lines: number;
  backToBack: boolean;
  combo: number;
  score: number;
  id: number;
}

const NEXT_PREVIEW = 5;
const SPAWN_ROW = BUFFER_ROWS - 2;
const SPAWN_COL = 3;

export class GameEngine {
  board = new Board();
  bag = new SevenBag();
  active: ActivePiece | null = null;
  holdType: PieceType | null = null;
  canHold = true;
  lastActionWasRotate = false;
  lastKickIndex = 0;

  score = 0;
  level = 1;
  lines = 0;
  combo = -1;
  backToBack = false;

  gameOver = false;
  paused = false;

  private gravityAccum = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private isGrounded = false;

  // 입력 반복 (DAS/ARR) 상태
  private dasTimer: Record<"left" | "right", number> = { left: 0, right: 0 };
  private arrTimer: Record<"left" | "right", number> = { left: 0, right: 0 };
  private heldDir: "left" | "right" | null = null;

  das = DEFAULT_DAS;
  arr = DEFAULT_ARR;

  lastClear: ClearEvent | null = null;
  private clearIdCounter = 0;

  onGameOver: (() => void) | null = null;

  constructor() {
    this.spawnNext();
  }

  reset() {
    this.board.reset();
    this.bag = new SevenBag();
    this.holdType = null;
    this.canHold = true;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.combo = -1;
    this.backToBack = false;
    this.gameOver = false;
    this.paused = false;
    this.gravityAccum = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.lastClear = null;
    this.spawnNext();
  }

  get nextQueue(): PieceType[] {
    return this.bag.peek(NEXT_PREVIEW);
  }

  private getCells(piece: ActivePiece): [number, number][] {
    const shape = PIECE_SHAPES[piece.type][piece.rotation];
    return shape.map(([r, c]) => [r + piece.row, c + piece.col] as [number, number]);
  }

  private canPlace(piece: ActivePiece): boolean {
    const cells = this.getCells(piece);
    return cells.every(([r, c]) => this.board.isCellFree(r, c));
  }

  private spawnNext() {
    const type = this.bag.next();
    const piece: ActivePiece = {
      type,
      rotation: 0,
      row: SPAWN_ROW,
      col: SPAWN_COL,
    };
    this.active = piece;
    this.canHold = true;
    this.gravityAccum = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.lastActionWasRotate = false;

    if (!this.canPlace(piece)) {
      this.gameOver = true;
      this.onGameOver?.();
    }
  }

  getGhostRow(): number {
    if (!this.active) return 0;
    let testRow = this.active.row;
    while (this.canPlace({ ...this.active, row: testRow + 1 })) {
      testRow++;
    }
    return testRow;
  }

  getActiveCells(): [number, number][] {
    if (!this.active) return [];
    return this.getCells(this.active);
  }

  getGhostCells(): [number, number][] {
    if (!this.active) return [];
    const ghostRow = this.getGhostRow();
    const shape = PIECE_SHAPES[this.active.type][this.active.rotation];
    return shape.map(([r, c]) => [r + ghostRow, c + this.active!.col] as [number, number]);
  }

  private move(dx: number, dy: number): boolean {
    if (!this.active || this.gameOver || this.paused) return false;
    const next = { ...this.active, row: this.active.row + dy, col: this.active.col + dx };
    if (this.canPlace(next)) {
      this.active = next;
      this.lastActionWasRotate = false;
      this.onSuccessfulMove();
      return true;
    }
    return false;
  }

  moveLeft() {
    this.move(-1, 0);
  }
  moveRight() {
    this.move(1, 0);
  }

  private onSuccessfulMove() {
    if (this.isGrounded) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  }

  rotate(dir: 1 | -1) {
    if (!this.active || this.gameOver || this.paused) return;
    const from = this.active.rotation;
    const to = ((from + dir + 4) % 4) as RotationState;
    const kicks = getKicks(this.active.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const candidate: ActivePiece = { ...this.active, rotation: to, col: this.active.col + dx, row: this.active.row + dy };
      if (this.canPlace(candidate)) {
        this.active = candidate;
        this.lastActionWasRotate = true;
        this.lastKickIndex = i;
        this.onSuccessfulMove();
        return;
      }
    }
  }

  rotate180() {
    if (!this.active || this.gameOver || this.paused) return;
    const from = this.active.rotation;
    const to = ((from + 2) % 4) as RotationState;
    const kicks = get180Kicks(this.active.type, from);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const candidate: ActivePiece = { ...this.active, rotation: to, col: this.active.col + dx, row: this.active.row + dy };
      if (this.canPlace(candidate)) {
        this.active = candidate;
        this.lastActionWasRotate = true;
        this.lastKickIndex = i;
        this.onSuccessfulMove();
        return;
      }
    }
  }

  softDrop(active: boolean) {
    this.softDropActive = active;
  }
  private softDropActive = false;

  hardDrop() {
    if (!this.active || this.gameOver || this.paused) return;
    const ghostRow = this.getGhostRow();
    const dropDistance = ghostRow - this.active.row;
    this.active.row = ghostRow;
    this.score += dropDistance * 2;
    this.lockPiece();
  }

  hold() {
    if (!this.active || !this.canHold || this.gameOver || this.paused) return;
    const currentType = this.active.type;
    if (this.holdType === null) {
      this.holdType = currentType;
      this.spawnNext();
    } else {
      const swapType = this.holdType;
      this.holdType = currentType;
      this.active = {
        type: swapType,
        rotation: 0,
        row: SPAWN_ROW,
        col: SPAWN_COL,
      };
      this.gravityAccum = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.isGrounded = false;
      this.lastActionWasRotate = false;
    }
    this.canHold = false;
  }

  private detectTSpin(): "full" | "mini" | null {
    if (!this.active || this.active.type !== "T" || !this.lastActionWasRotate) return null;
    const { row, col } = this.active;
    const centerR = row + 1;
    const centerC = col + 1;
    const corners = [
      [centerR - 1, centerC - 1],
      [centerR - 1, centerC + 1],
      [centerR + 1, centerC - 1],
      [centerR + 1, centerC + 1],
    ];
    const filled = corners.map(([r, c]) => !this.board.isCellFree(r, c));
    const filledCount = filled.filter(Boolean).length;
    if (filledCount < 3) return null;

    // 전방 코너(회전 방향 기준 위쪽 두 코너 중 회전상태에 따른 "앞쪽")가 둘 다 채워져 있으면 정식 T-spin
    const frontPairsByRotation: Record<number, [number, number]> = {
      0: [0, 1], // spawn: 위쪽 두 코너가 앞
      1: [1, 3], // R: 오른쪽 두 코너
      2: [2, 3], // 2: 아래쪽 두 코너
      3: [0, 2], // L: 왼쪽 두 코너
    };
    const [a, b] = frontPairsByRotation[this.active.rotation];
    const frontFilled = filled[a] && filled[b];
    if (frontFilled) return "full";
    // 5번째 킥(인덱스 4)으로 회전했다면 mini여도 full 취급 (가이드라인 규칙)
    if (this.lastKickIndex === 4) return "full";
    return "mini";
  }

  private lockPiece() {
    if (!this.active) return;
    const tspin = this.detectTSpin();
    const cells = this.getCells(this.active);
    this.board.lockCells(cells, this.active.type);
    const clearedRows = this.board.clearLines();
    const clearedCount = clearedRows.length;

    this.applyScoring(clearedCount, tspin);

    this.active = null;
    if (!this.gameOver) {
      this.spawnNext();
    }
  }

  private applyScoring(clearedCount: number, tspin: "full" | "mini" | null) {
    let type: ClearType | null = null;
    let base = 0;

    if (tspin === "full") {
      if (clearedCount === 0) { type = "tspin"; base = 400; }
      else if (clearedCount === 1) { type = "tspin-single"; base = 800; }
      else if (clearedCount === 2) { type = "tspin-double"; base = 1200; }
      else if (clearedCount === 3) { type = "tspin-triple"; base = 1600; }
    } else if (tspin === "mini") {
      if (clearedCount === 0) { type = "tspin-mini"; base = 100; }
      else { type = "tspin-mini-single"; base = 200; }
    } else if (clearedCount > 0) {
      if (clearedCount === 1) { type = "single"; base = 100; }
      else if (clearedCount === 2) { type = "double"; base = 300; }
      else if (clearedCount === 3) { type = "triple"; base = 500; }
      else if (clearedCount >= 4) { type = "tetris"; base = 800; }
    }

    if (clearedCount > 0) {
      this.combo++;
    } else {
      this.combo = -1;
    }

    if (type) {
      const isHardType = type === "tetris" || tspin !== null;
      const btbBonus = this.backToBack && isHardType && clearedCount > 0 ? 1.5 : 1;
      let gained = Math.floor(base * this.level * btbBonus);
      if (this.combo > 0) {
        gained += 50 * this.combo * this.level;
      }
      this.score += gained;

      if (clearedCount > 0) {
        if (isHardType) this.backToBack = true;
        else this.backToBack = false;
      }

      this.lastClear = {
        type,
        lines: clearedCount,
        backToBack: this.backToBack && isHardType,
        combo: this.combo,
        score: gained,
        id: this.clearIdCounter++,
      };
    } else if (tspin && clearedCount === 0) {
      // T-spin without line clear already handled above
    }

    if (clearedCount > 0) {
      this.lines += clearedCount;
      const newLevel = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      if (newLevel !== this.level) this.level = newLevel;
    }
  }

  setInput(dir: "left" | "right" | null) {
    if (this.heldDir !== dir) {
      this.heldDir = dir;
      if (dir) {
        this.dasTimer[dir] = 0;
        this.arrTimer[dir] = 0;
        this.move(dir === "left" ? -1 : 1, 0);
      }
    }
  }

  update(deltaMs: number) {
    if (this.gameOver || this.paused || !this.active) return;

    // DAS/ARR 처리
    if (this.heldDir) {
      const dir = this.heldDir;
      this.dasTimer[dir] += deltaMs;
      if (this.dasTimer[dir] >= this.das) {
        this.arrTimer[dir] += deltaMs;
        if (this.arr <= 0) {
          // 즉시 반복: 벽에 닿을 때까지 이동
          while (this.move(dir === "left" ? -1 : 1, 0)) { /* keep moving */ }
        } else {
          while (this.arrTimer[dir] >= this.arr) {
            this.arrTimer[dir] -= this.arr;
            if (!this.move(dir === "left" ? -1 : 1, 0)) break;
          }
        }
      }
    }

    const baseGravity = gravityForLevel(this.level);
    const effectiveGravity = this.softDropActive ? baseGravity / SOFT_DROP_FACTOR : baseGravity;

    this.gravityAccum += deltaMs;
    while (this.gravityAccum >= effectiveGravity) {
      this.gravityAccum -= effectiveGravity;
      if (this.canPlace({ ...this.active, row: this.active.row + 1 })) {
        this.active.row++;
        if (this.softDropActive) this.score += 1;
        this.isGrounded = false;
        this.lastActionWasRotate = false;
      } else {
        this.isGrounded = true;
        break;
      }
    }

    if (this.isGrounded) {
      this.lockTimer += deltaMs;
      if (this.lockTimer >= LOCK_DELAY) {
        this.lockPiece();
      }
    }
  }
}
