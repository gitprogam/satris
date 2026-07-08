import { COLS, TOTAL_ROWS } from "./constants";
import { Board } from "./Board";
import { GameEngine } from "./GameEngine";

// 실제 four-tris 오픈소스(github.com/fiorescarlatto/four-tris, Tetris.au3의 GridSpawn4W
// /AddWide/CheckLines)를 직접 확인해서 그대로 재현: 보드 양옆은 "재적재되는 10줄짜리
// 벽"이 아니라 시작부터 끝까지 보드 전체 높이가 항상 꽉 찬 고정 기둥이고, 가운데 4칸
// 우물만 플레이 가능하다. 줄이 지워지면(=위쪽에 빈 줄이 생기면) 그 빈 줄의 벽 부분을
// 즉시 다시 채워서 벽이 절대 무너지지 않게 유지한다.
//
// 일반 모드(기본, 그냥 클릭): 시작할 때 우물에 원본과 동일한 "6가지 3블록 잔여물 패턴"
// 중 하나가 무작위로 깔리고, 콤보가 끊겨도 게임이 끝나지 않고 콤보 카운터만 리셋된 채
// 계속 진행 - 진짜 블록아웃 때만 끝남.
// 이스터에그(hardcore=true, 4-Wide 메뉴 버튼 Shift+클릭): 원래(구) 버전 그대로 -
// 우물이 완전히 빈 채로 시작하고, 콤보가 끊기는 순간 즉시 게임오버. 두 모드는 서로
// 섞이지 않고 완전히 분리되어 있다.
export const WELL_WIDTH = 4;
export const WELL_START = Math.floor(COLS / 2) - 2;
export const WELL_END = WELL_START + WELL_WIDTH - 1;
const WALL_COLS = Array.from({ length: COLS }, (_, c) => c).filter((c) => c < WELL_START || c > WELL_END);

// GridSpawn4W()의 Switch Random(0,5,1) 6가지 케이스를 그대로 옮김.
// [우물 내 상대 열(0~3), 바닥에서 몇 줄 위(0=맨 아래)]
const RESIDUE_PATTERNS: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0]],
  [[1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[3, 0], [3, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[3, 0], [3, 1], [2, 0]],
];

export class FourWidePractice {
  board: Board;
  engine: GameEngine;
  bestCombo = 0;
  private hardcore: boolean;
  private prevCombo = -1;

  constructor(seed?: number, hardcore = false) {
    this.hardcore = hardcore;
    this.board = new Board(COLS);
    this.buildWalls();
    if (!this.hardcore) this.buildStartingResidue();
    this.engine = new GameEngine(seed, { board: this.board, colBounds: [WELL_START, WELL_END] });
    this.engine.onBoardChanged = () => this.afterLock();
    this.engine.dangerIndicatorEnabled = false; // 벽이 항상 꽉 차있어서 "18줄" 기준이 무의미해짐
  }

  // 보드 전체 높이에서 우물 바깥 열을 전부 채운다 (원본 GridSpawn4W의 초기화와 동일).
  private buildWalls() {
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

  // 같은 GameEngine 인스턴스를 재사용하면서 벽/잔여물을 새로 쌓고 최고기록을 초기화한다.
  // InputHandler가 이 engine 참조를 그대로 들고 있으므로 재시작 때 새로 만들 필요가 없다.
  restart(seed?: number) {
    this.engine.reset(seed);
    this.bestCombo = 0;
    this.prevCombo = -1;
    this.buildWalls();
    if (!this.hardcore) this.buildStartingResidue();
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
    }

    // 클리어로 생긴 맨 위 빈 줄들의 벽 부분을 즉시 다시 채워서 벽이 항상 보드 끝까지
    // 꽉 차있게 유지한다 (원본 AddWide와 동일한 효과, 매번 전체를 다시 확인하는 방식).
    for (let row = 0; row < TOTAL_ROWS; row++) {
      for (const col of WALL_COLS) {
        if (this.board.grid[row][col] === null) {
          this.board.grid[row][col] = "GARBAGE";
        }
      }
    }
  }
}
