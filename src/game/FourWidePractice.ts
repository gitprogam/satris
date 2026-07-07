import { COLS, TOTAL_ROWS } from "./constants";
import { Board } from "./Board";
import { GameEngine } from "./GameEngine";

// tetr.io 커뮤니티의 "4-Wide 연습" 트레이너(Four-tris, DDRKirby 4-Wide Trainer 등) 컨셉을
// 재현: 보드 양옆에 가비지 벽을 쌓아 가운데 4칸 우물만 남기고, 그 우물에서만 계속
// 줄을 지워 콤보를 이어가야 한다. 콤보가 끊기면(줄 못 지운 락) 그 판은 끝. 벽은 줄어들
// 때마다 자동으로 다시 채워져서 무한히 반복 연습할 수 있다.
export const WELL_WIDTH = 4;
export const WELL_START = Math.floor((COLS - WELL_WIDTH) / 2);
export const WELL_END = WELL_START + WELL_WIDTH - 1;
const WALL_COLS = Array.from({ length: COLS }, (_, c) => c).filter((c) => c < WELL_START || c > WELL_END);
const WALL_HEIGHT = 10;

export class FourWidePractice {
  board: Board;
  engine: GameEngine;
  bestCombo = 0;
  private prevCombo = -1;

  constructor(seed?: number) {
    this.board = new Board(COLS);
    this.buildWalls();
    this.engine = new GameEngine(seed, { board: this.board, colBounds: [WELL_START, WELL_END] });
    this.engine.onBoardChanged = () => this.afterLock();
  }

  private buildWalls() {
    for (let i = 0; i < WALL_HEIGHT; i++) {
      this.board.addPartialGarbage(WALL_COLS);
    }
  }

  // 같은 GameEngine 인스턴스를 재사용하면서 벽만 새로 쌓고 콤보/최고기록을 초기화한다.
  // InputHandler가 이 engine 참조를 그대로 들고 있으므로 재시작 때 새로 만들 필요가 없다.
  restart(seed?: number) {
    this.engine.reset(seed);
    this.prevCombo = -1;
    this.bestCombo = 0;
    this.buildWalls();
  }

  private wallHeight(): number {
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

  private afterLock() {
    if (this.engine.gameOver) return;

    if (this.engine.combo > this.bestCombo) this.bestCombo = this.engine.combo;

    const brokeCombo = this.prevCombo >= 0 && this.engine.combo === -1;
    this.prevCombo = this.engine.combo;

    if (brokeCombo) {
      this.engine.gameOver = true;
      return;
    }

    const deficit = WALL_HEIGHT - this.wallHeight();
    for (let i = 0; i < deficit; i++) {
      this.board.addPartialGarbage(WALL_COLS);
    }
  }
}
