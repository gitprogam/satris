import { COLS, TOTAL_ROWS } from "./constants";
import { Board } from "./Board";
import { GameEngine } from "./GameEngine";

// tetr.io 커뮤니티의 "4-Wide 연습" 트레이너(Four-tris, DDRKirby 4-Wide Trainer 등) 컨셉을
// 재현: 보드 양옆에 가비지 벽을 쌓아 가운데 4칸 우물만 남기고, 그 우물에서만 계속
// 줄을 지워 콤보를 이어가야 한다. 벽은 줄어들 때마다 자동으로 다시 채워져서 무한히
// 반복 연습할 수 있다.
//
// 일반 모드(기본, 그냥 클릭): 시작할 때 우물에 T-스핀용 3블록 잔여물이 깔려있고,
// 콤보가 끊겨도 게임이 끝나지 않고 콤보 카운터만 리셋된 채 계속 진행 - 진짜
// 블록아웃 때만 끝남.
// 이스터에그(hardcore=true, 4-Wide 메뉴 버튼 Shift+클릭): 원래(구) 버전 그대로 -
// 우물이 완전히 빈 채로 시작하고, 콤보가 끊기는 순간 즉시 게임오버. 두 모드는
// 서로 섞이지 않고 완전히 분리되어 있다.
export const WELL_WIDTH = 4;
export const WELL_START = Math.floor((COLS - WELL_WIDTH) / 2);
export const WELL_END = WELL_START + WELL_WIDTH - 1;
const WALL_COLS = Array.from({ length: COLS }, (_, c) => c).filter((c) => c < WELL_START || c > WELL_END);
const WALL_HEIGHT = 10;

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
  }

  private buildWalls() {
    for (let i = 0; i < WALL_HEIGHT; i++) {
      this.board.addPartialGarbage(WALL_COLS);
    }
  }

  // Four-tris 등 실제 4-wide 트레이너는 시작할 때부터 우물에 "3블록 잔여물"을 깔아둬서
  // 첫 수부터 T-스핀으로 이어갈 수 있게 한다(검색으로 확인). T 180도 회전(rotation 2,
  // 평평한 쪽이 위/줄기가 아래)이 정확히 꽂히는 3블록 노치를 벽 바로 위에 만든다 -
  // engine.detectSpin()으로 실제 "full"(진짜 스핀, 미니 아님) 판정임을 검증해둔 배치.
  private buildStartingResidue() {
    const wallTopRow = TOTAL_ROWS - WALL_HEIGHT;
    const overhangRow = wallTopRow - 2;
    this.board.grid[wallTopRow][WELL_START] = "GARBAGE"; // 노치 왼쪽 아래
    this.board.grid[wallTopRow][WELL_START + 2] = "GARBAGE"; // 노치 오른쪽 아래
    this.board.grid[overhangRow][WELL_START] = "GARBAGE"; // 왼쪽 오버행 (스핀 필수로 만듦)
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

    if (this.hardcore) {
      const brokeCombo = this.prevCombo >= 0 && this.engine.combo === -1;
      this.prevCombo = this.engine.combo;
      if (brokeCombo) {
        this.engine.gameOver = true;
        return;
      }
    }

    const deficit = WALL_HEIGHT - this.wallHeight();
    for (let i = 0; i < deficit; i++) {
      this.board.addPartialGarbage(WALL_COLS);
    }
  }
}
