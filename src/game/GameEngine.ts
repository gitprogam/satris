import {
  BUFFER_ROWS,
  COLS,
  gravityForLevel,
  LINES_PER_LEVEL,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
} from "./constants";
import type { PieceType } from "./constants";
import { Board } from "./Board";
import { SevenBag } from "./Bag";
import { get180Kicks, getKicks, PIECE_SHAPES } from "./pieces";
import type { RotationState } from "./pieces";
import { DEFAULT_SETTINGS, type EngineSettings } from "./Settings";

export interface ActivePiece {
  type: PieceType;
  rotation: RotationState;
  row: number;
  col: number;
}

// tetr.io의 All-Mini+ 판정 방식: T피스는 3코너 룰로 full/mini 스핀 모두 가능하지만,
// T 이외의 모든 피스는 immobile(회전 후 위로 못 움직임)일 때만 mini 스핀이 인정된다.
// 그래서 "spin"/"spin-single"/"spin-double"/"spin-triple"(정식 스핀)은 사실상 T피스 전용이고,
// "spin-mini"/"spin-mini-single"은 어떤 피스로도 나올 수 있다 (실제 피스 종류는 spinPiece에 기록).
export type ClearType =
  | "single"
  | "double"
  | "triple"
  | "tetris"
  | "spin"
  | "spin-mini"
  | "spin-single"
  | "spin-mini-single"
  | "spin-double"
  | "spin-triple";

export interface ClearEvent {
  type: ClearType;
  lines: number;
  backToBack: boolean;
  combo: number;
  score: number;
  id: number;
  attack: number;
  spinPiece: PieceType | null;
}

interface GarbageChunk {
  lines: number;
  holeCol: number;
}

// 클리어 타입별 기본 가비지(공격) 물량 - 콤보/B2B 배율이 붙기 전 base 값
// (Jstris/Tetris Friends 계열 표, 검색으로 확인)
function baseAttackFor(clearedCount: number, spin: "full" | "mini" | null): number {
  if (spin === "full") {
    if (clearedCount === 2) return 4;
    if (clearedCount === 3) return 6;
    return 0; // T-Spin(0줄) / T-Spin Single(1줄)
  }
  if (spin === "mini") return 0;
  if (clearedCount === 2) return 1;
  if (clearedCount === 3) return 2;
  if (clearedCount >= 4) return 4;
  return 0;
}

const NEXT_PREVIEW = 5;
const SPAWN_ROW = BUFFER_ROWS - 2;
const SPAWN_COL = 3;

export class GameEngine {
  board = new Board();
  bag: SevenBag;
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
  // B2B 스트릭 단계 수 (0=끊김). 4 이상부터 Surge가 쌓여서 스트릭이 끊길 때 한꺼번에 방출됨.
  private b2bCount = 0;

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
  // DCD(DAS Cut Delay): 회전/스폰 시 진행 중이던 DAS 충전을 일시정지시키는 시간(ms)
  private dasCutTimer = 0;

  das = DEFAULT_SETTINGS.das;
  arr = DEFAULT_SETTINGS.arr;
  sdf = DEFAULT_SETTINGS.sdf;
  dcd = DEFAULT_SETTINGS.dcd;

  applySettings(settings: Partial<EngineSettings>) {
    if (settings.das !== undefined) this.das = settings.das;
    if (settings.arr !== undefined) this.arr = settings.arr;
    if (settings.sdf !== undefined) this.sdf = settings.sdf;
    if (settings.dcd !== undefined) this.dcd = settings.dcd;
  }

  lastClear: ClearEvent | null = null;
  private clearIdCounter = 0;

  // PvP: 상대에게서 받은 공격이 쌓이는 큐. 락 시점에 내 공격으로 먼저 상쇄되고,
  // 이번 락에서 줄을 못 지웠을 때만 남은 만큼 실제로 보드에 삽입됨.
  garbageQueue: GarbageChunk[] = [];

  onGameOver: (() => void) | null = null;
  onAttackSent: ((lines: number) => void) | null = null;
  onBoardChanged: (() => void) | null = null;

  constructor(seed?: number) {
    this.bag = new SevenBag(seed);
    this.spawnNext();
  }

  reset(seed?: number) {
    this.board.reset();
    this.bag = new SevenBag(seed);
    this.garbageQueue = [];
    this.holdType = null;
    this.canHold = true;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.combo = -1;
    this.backToBack = false;
    this.b2bCount = 0;
    this.gameOver = false;
    this.paused = false;
    this.gravityAccum = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.lastClear = null;
    this.heldDir = null;
    this.dasTimer = { left: 0, right: 0 };
    this.arrTimer = { left: 0, right: 0 };
    this.dasCutTimer = 0;
    this.softDropActive = false;
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

  // Clutch Clear: 스폰 위치가 막혀 있어도 곧바로 게임오버시키지 않고, 버퍼 위쪽으로
  // 밀어 올려서라도 놓일 자리가 있으면 거기서 이어서 진행한다 (방금 지운 줄 덕분에
  // 자리가 났을 수 있으므로). 맨 위(row 0)까지 올려도 안 되면 그때 진짜 게임오버.
  private spawnNext() {
    const type = this.bag.next();
    let spawnRow = SPAWN_ROW;
    let piece: ActivePiece = { type, rotation: 0, row: spawnRow, col: SPAWN_COL };
    while (!this.canPlace(piece) && spawnRow > 0) {
      spawnRow--;
      piece = { ...piece, row: spawnRow };
    }
    this.active = piece;
    this.canHold = true;
    this.gravityAccum = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.lastActionWasRotate = false;
    this.cutDas();

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

  // 이동/회전 직후에는 바닥에 닿아있는지 다시 계산해야 한다. 그렇지 않으면 킥으로 위로
  // 튕겨 올라가거나(예: I피스 킥, T-스핀 피니시) 턱을 타고 옆으로 미끄러져 내려가서
  // 실제로는 허공에 떠 있는데도 isGrounded가 이전 값(true)에 머물러 있게 되고,
  // 락 타이머가 계속 쌓여 다음 중력 판정(최대 한 칸당 걸리는 시간만큼 늦게 옴)이
  // 오기도 전에 허공에서 그대로 고정("미노가 공중에 뜨는" 버그)돼버린다.
  private onSuccessfulMove() {
    if (!this.active) return;
    const wasGrounded = this.isGrounded;
    const nowGrounded = !this.canPlace({ ...this.active, row: this.active.row + 1 });

    if (nowGrounded && wasGrounded) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    } else if (nowGrounded && !wasGrounded) {
      this.lockTimer = 0;
      this.lockResets = 0;
    } else {
      this.lockTimer = 0;
    }

    this.isGrounded = nowGrounded;
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
        this.cutDas();
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
        this.cutDas();
        return;
      }
    }
  }

  softDrop(active: boolean) {
    if (this.softDropActive !== active) {
      // 소프트드롭 on/off 전환 시 누적된 중력 시간을 리셋해서 속도가 튀지 않게 함
      this.gravityAccum = 0;
    }
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

  // tetr.io All-Mini+ 판정 방식.
  // - T피스: 기존 3코너 룰로 full 또는 mini 판정. 3코너 조건을 못 채우면 immobile 여부로 mini 폴백.
  // - T 이외 모든 피스: immobile(회전 후 위로 못 움직임 = "overhang")일 때만 mini 인정, full은 불가능.
  private detectSpin(): "full" | "mini" | null {
    if (!this.active || !this.lastActionWasRotate) return null;

    if (this.active.type === "T") {
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

      if (filledCount >= 3) {
        // 전방 코너(회전 방향 기준 "앞쪽" 두 코너)가 둘 다 채워져 있으면 정식 스핀
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
      return this.isImmobile() ? "mini" : null;
    }

    return this.isImmobile() ? "mini" : null;
  }

  // All-Mini+의 immobile(overhang) 판정: 회전 후 위로 움직일 수 없으면 스핀으로 인정.
  // 착지 상태에서는 아래로 못 움직이는 게 당연하고, 좌우는 라인 클리어 가능성에 영향 없다는
  // tetr.io의 실전 단순화를 그대로 따름 (위쪽만 확인).
  private isImmobile(): boolean {
    if (!this.active) return false;
    return !this.canPlace({ ...this.active, row: this.active.row - 1 });
  }

  // PvP: 상대에게서 온 공격을 큐에 쌓음 (구멍 컬럼은 도착 시점에 한 번 정해짐 - "Change on Attack")
  queueGarbage(lines: number) {
    if (lines <= 0) return;
    const holeCol = Math.floor(Math.random() * COLS);
    this.garbageQueue.push({ lines, holeCol });
  }

  private isBoardEmpty(): boolean {
    return this.board.grid.every((row) => row.every((cell) => cell === null));
  }

  // 이번 락에서 보낼 공격으로 쌓여있던 상대 공격(가비지)을 먼저 상쇄하고,
  // 이번 락에서 줄을 못 지웠을 때만 남은 가비지를 실제로 보드에 삽입한다.
  private resolveGarbage(clearedCount: number, outgoingAttack: number) {
    let remaining = outgoingAttack;
    while (remaining > 0 && this.garbageQueue.length > 0) {
      const chunk = this.garbageQueue[0];
      if (chunk.lines <= remaining) {
        remaining -= chunk.lines;
        this.garbageQueue.shift();
      } else {
        chunk.lines -= remaining;
        remaining = 0;
      }
    }
    if (remaining > 0) {
      this.onAttackSent?.(remaining);
    }
    if (clearedCount === 0 && this.garbageQueue.length > 0) {
      for (const chunk of this.garbageQueue) {
        this.board.addGarbage(chunk.lines, chunk.holeCol);
      }
      this.garbageQueue = [];
    }
  }

  private lockPiece() {
    if (!this.active) return;
    const spin = this.detectSpin();
    const spinPiece = spin ? this.active.type : null;
    const cells = this.getCells(this.active);
    this.board.lockCells(cells, this.active.type);
    const clearedRows = this.board.clearLines();
    const clearedCount = clearedRows.length;

    const attack = this.applyScoring(clearedCount, spin, spinPiece);
    this.resolveGarbage(clearedCount, attack);
    this.onBoardChanged?.();

    this.active = null;
    if (!this.gameOver) {
      this.spawnNext();
    }
  }

  private applyScoring(clearedCount: number, spin: "full" | "mini" | null, spinPiece: PieceType | null): number {
    const isPerfectClear = clearedCount > 0 && this.isBoardEmpty();

    let type: ClearType | null = null;
    let base = 0;

    if (spin === "full") {
      if (clearedCount === 0) { type = "spin"; base = 400; }
      else if (clearedCount === 1) { type = "spin-single"; base = 800; }
      else if (clearedCount === 2) { type = "spin-double"; base = 1200; }
      else if (clearedCount === 3) { type = "spin-triple"; base = 1600; }
    } else if (spin === "mini") {
      if (clearedCount === 0) { type = "spin-mini"; base = 100; }
      else { type = "spin-mini-single"; base = 200; }
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

    let attack = 0;

    if (type) {
      const isHardType = type === "tetris" || spin !== null;
      const b2bWasActive = this.b2bCount > 0;
      const scoreBtbMultiplier = b2bWasActive && isHardType && clearedCount > 0 ? 1.5 : 1;
      let gained = Math.floor(base * this.level * scoreBtbMultiplier);
      if (this.combo > 0) {
        gained += 50 * this.combo * this.level;
      }
      this.score += gained;

      if (clearedCount > 0) {
        // 1) 콤보 배율 (tetr.io 공식: base>0이면 base*(1+0.25*combo),
        //    base===0인 클리어가 콤보로 이어지면 2콤보부터 ln(1+1.25*combo))
        attack = this.comboScaledAttack(baseAttackFor(clearedCount, spin), this.combo);

        // 2) B2B Charging: 스트릭이 이어지는 공격마다 +1
        if (b2bWasActive && isHardType) {
          attack += 1;
        }

        // 3) B2B 스트릭/Surge 상태 갱신
        if (isPerfectClear) {
          // 올클리어는 클리어 종류와 무관하게 B2B를 +2 시킴
          this.b2bCount += 2;
          attack += 10; // 퍼펙트 클리어 자체의 즉시 보너스 (검색으로 확인한 관례적 수치)
        } else if (isHardType) {
          this.b2bCount += 1;
        } else {
          // 어려운 클리어가 아니라 스트릭이 끊김 -> 그동안 쌓인 Surge(B2B4 이상부터, 값=b2bCount)를 한꺼번에 방출
          if (this.b2bCount >= 4) {
            attack += this.b2bCount;
          }
          this.b2bCount = 0;
        }
        this.backToBack = this.b2bCount > 0;
      }

      this.lastClear = {
        type,
        lines: clearedCount,
        backToBack: this.backToBack && isHardType,
        combo: this.combo,
        score: gained,
        id: this.clearIdCounter++,
        attack,
        spinPiece,
      };
    }

    if (clearedCount > 0) {
      this.lines += clearedCount;
      const newLevel = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      if (newLevel !== this.level) this.level = newLevel;
    }

    return attack;
  }

  // tetr.io 콤보 배율 공식: base가 있으면 base*(1+0.25*combo).
  // base가 0인 클리어(예: 싱글)가 콤보로 이어지는 경우엔 2콤보(combo>=2)부터
  // ln(1+1.25*combo)로 대체된다. 반올림은 기본값인 내림(DOWN)을 사용.
  private comboScaledAttack(base: number, combo: number): number {
    if (combo <= 0) return base;
    if (base > 0) {
      return Math.floor(base * (1 + 0.25 * combo));
    }
    if (combo >= 2) {
      return Math.floor(Math.log(1 + 1.25 * combo));
    }
    return 0;
  }

  setInput(dir: "left" | "right" | null) {
    if (this.heldDir === dir) return;
    this.heldDir = dir;
    if (dir) {
      this.dasTimer[dir] = 0;
      this.arrTimer[dir] = 0;
      this.move(dir === "left" ? -1 : 1, 0);
    }
  }

  // DCD(DAS Cut Delay): 회전하거나 새 피스가 스폰될 때, 방향키를 누르고 있었다면
  // 그 DAS 충전을 dcd(ms)만큼 일시정지시킴 (진행도는 유지, tetr.io 동작 방식)
  private cutDas() {
    if (this.heldDir && this.dcd > 0) {
      this.dasCutTimer = this.dcd;
    }
  }

  update(deltaMs: number) {
    if (this.gameOver || this.paused || !this.active) return;

    // DAS/ARR 처리
    if (this.heldDir) {
      if (this.dasCutTimer > 0) {
        this.dasCutTimer = Math.max(0, this.dasCutTimer - deltaMs);
      } else {
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
    }

    if (this.softDropActive && this.sdf >= 41) {
      // SDF 최댓값: 바닥까지 즉시 떨어지되(락딜레이는 그대로 유지) 하드드롭과 달리 즉시 고정되진 않음
      const ghostRow = this.getGhostRow();
      if (ghostRow > this.active.row) {
        this.score += ghostRow - this.active.row;
        this.active.row = ghostRow;
        this.lastActionWasRotate = false;
      }
      this.isGrounded = true;
      this.gravityAccum = 0;
    } else {
      const baseGravity = gravityForLevel(this.level);
      const effectiveGravity = this.softDropActive ? baseGravity / this.sdf : baseGravity;

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
    }

    if (this.isGrounded) {
      this.lockTimer += deltaMs;
      if (this.lockTimer >= LOCK_DELAY) {
        this.lockPiece();
      }
    }
  }
}
