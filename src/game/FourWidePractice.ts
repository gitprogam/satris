import { COLS, TOTAL_ROWS } from "./constants";
import { Board } from "./Board";
import { GameEngine } from "./GameEngine";

// 일반 모드(기본, 그냥 클릭): 실제 four-tris 오픈소스(github.com/fiorescarlatto/four-tris,
// Tetris.au3의 GridSpawn4W/AddWide/CheckLines를 gh CLI로 직접 확인해서 재현)를 그대로
// 따른다 - 벽은 보드 전체 높이가 항상 꽉 찬 고정 기둥이고, 시작할 때 우물에 원본과
// 동일한 6가지 3블록 잔여물 패턴 중 하나가 무작위로 깔린다. 콤보가 끊겨도 게임이
// 끝나지 않고 콤보 카운터만 리셋된 채 계속 진행 - 진짜 블록아웃 때만 끝남.
//
// 이스터에그(hardcore=true, 4-Wide 메뉴 버튼 Shift+클릭): 그 이전의 원래(구) 버전을
// 그대로 유지 - 벽은 10줄짜리 재적재 방식(줄어들면 그만큼 다시 쌓임), 우물은 완전히
// 빈 채로 시작, 콤보가 끊기는 순간 즉시 게임오버. "재밌으니까 그대로 둬라"는 요청에
// 따라 일반 모드와 완전히 다른 별개의 벽/잔여물 로직을 그대로 유지한다 - 절대 공유
// 로직으로 합치지 말 것.
export const WELL_WIDTH = 4;
export const WELL_START = Math.floor(COLS / 2) - 2;
export const WELL_END = WELL_START + WELL_WIDTH - 1;
const WALL_COLS = Array.from({ length: COLS }, (_, c) => c).filter((c) => c < WELL_START || c > WELL_END);

// (일반 모드) GridSpawn4W()의 Switch Random(0,5,1) 6가지 케이스를 그대로 옮김.
// [우물 내 상대 열(0~3), 바닥에서 몇 줄 위(0=맨 아래)]
const RESIDUE_PATTERNS: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0]],
  [[1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[3, 0], [3, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[3, 0], [3, 1], [2, 0]],
];

// (이스터에그 하드코어 모드 전용) 벽 목표 높이
const HARDCORE_WALL_HEIGHT = 10;

export class FourWidePractice {
  board: Board;
  engine: GameEngine;
  bestCombo = 0;
  private hardcore: boolean;
  private prevCombo = -1;

  constructor(seed?: number, hardcore = false) {
    this.hardcore = hardcore;
    this.board = new Board(COLS);
    if (this.hardcore) {
      this.buildHardcoreWalls();
    } else {
      this.buildNormalWalls();
      this.buildStartingResidue();
    }
    this.engine = new GameEngine(seed, { board: this.board, colBounds: [WELL_START, WELL_END] });
    this.engine.onBoardChanged = () => this.afterLock();
    // 일반 모드는 벽이 항상 보드 전체 높이라 "스택 18줄" 위험 경고가 상시 켜지는
    // 부작용이 있어서 꺼둔다. 이스터에그는 벽이 10줄뿐이라 원래 동작 그대로 둔다.
    if (!this.hardcore) this.engine.dangerIndicatorEnabled = false;
  }

  // --- 일반 모드: 벽이 보드 전체 높이로 항상 꽉 참 (four-tris 원본과 동일) ---
  private buildNormalWalls() {
    for (let row = 0; row < TOTAL_ROWS; row++) {
      for (const col of WALL_COLS) {
        this.board.grid[row][col] = "GARBAGE";
      }
    }
  }

  private buildStartingResidue() {
    const bottomRow = TOTAL_ROWS - 1;
    const pattern = RESIDUE_PATTERNS[Math.floor(Math.random() * RESIDUE_PATTERNS.length)];
    for (const [dCol, rowsUp] of pattern) {
      this.board.grid[bottomRow - rowsUp][WELL_START + dCol] = "GARBAGE";
    }
  }

  // --- 이스터에그(하드코어): 예전 10줄 재적재 벽, 그대로 유지 ---
  private buildHardcoreWalls() {
    for (let i = 0; i < HARDCORE_WALL_HEIGHT; i++) {
      this.board.addPartialGarbage(WALL_COLS);
    }
  }

  private hardcoreWallHeight(): number {
    const col = WALL_COLS[0];
    let topRow = -1;
    for (let row = 0; row < TOTAL_ROWS; row++) {
      if (this.board.grid[row][col] !== null) {
        topRow = row;
        break;
      }
    }
    return topRow === -1 ? 0 : TOTAL_ROWS - topRow;
  }

  // 같은 GameEngine 인스턴스를 재사용하면서 벽/잔여물을 새로 쌓고 최고기록을 초기화한다.
  // InputHandler가 이 engine 참조를 그대로 들고 있으므로 재시작 때 새로 만들 필요가 없다.
  restart(seed?: number) {
    this.engine.reset(seed);
    this.bestCombo = 0;
    this.prevCombo = -1;
    if (this.hardcore) {
      this.buildHardcoreWalls();
    } else {
      this.buildNormalWalls();
      this.buildStartingResidue();
    }
  }

  private afterLock() {
    if (this.engine.gameOver) return;

    if (this.engine.combo > this.bestCombo) this.bestCombo = this.engine.combo;

    if (this.hardcore) {
      const brokeCombo = this.prevCombo >= 0 && this.engine.combo === -1;
      this.prevCombo = this.engine.combo;
      if (brokeCombo) {
        this.engine.gameOver = true;
        return;
      }

      const deficit = HARDCORE_WALL_HEIGHT - this.hardcoreWallHeight();
      for (let i = 0; i < deficit; i++) {
        this.board.addPartialGarbage(WALL_COLS);
      }
      return;
    }

    // 일반 모드: 클리어로 생긴 맨 위 빈 줄들의 벽 부분을 즉시 다시 채워서 벽이 항상
    // 보드 끝까지 꽉 차있게 유지한다 (원본 AddWide와 동일한 효과).
    for (let row = 0; row < TOTAL_ROWS; row++) {
      for (const col of WALL_COLS) {
        if (this.board.grid[row][col] === null) {
          this.board.grid[row][col] = "GARBAGE";
        }
      }
    }
  }
}
