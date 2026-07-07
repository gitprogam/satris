import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { BUFFER_ROWS, COLS, VISIBLE_ROWS } from "../game/constants";
import type { Cell } from "../game/Board";
import { colorForCell, drawCell } from "./cellDraw";

// 상대방에게서 받은 보드 스냅샷만 그리는 가벼운 뷰. 고스트/홀드/넥스트는 없음 -
// 실제로 상대 클라이언트를 시뮬레이션하지 않고 락(lock)마다 오는 그리드를 그대로 표시.
export class OpponentBoardView {
  container = new Container();
  private cellSize: number;
  private bg = new Graphics();
  private gfx = new Graphics();
  private label: Text;
  private grid: Cell[][] | null = null;
  private connected = false;

  constructor(cellSize = 12) {
    this.cellSize = cellSize;
    const w = COLS * cellSize;
    const h = VISIBLE_ROWS * cellSize;

    this.label = new Text({
      text: "상대방",
      style: new TextStyle({ fill: 0x9090b0, fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: "700" }),
    });
    this.container.addChild(this.label);

    this.bg.rect(0, 20, w, h).fill({ color: 0x0a0a12 }).stroke({ color: 0x33334a, width: 1 });
    this.container.addChild(this.bg);
    this.gfx.x = 0;
    this.gfx.y = 20;
    this.container.addChild(this.gfx);
  }

  setConnected(connected: boolean) {
    this.connected = connected;
  }

  setGrid(grid: Cell[][]) {
    this.grid = grid;
  }

  render() {
    this.gfx.clear();
    if (!this.connected || !this.grid) return;
    for (let row = BUFFER_ROWS; row < BUFFER_ROWS + VISIBLE_ROWS; row++) {
      const gridRow = this.grid[row];
      if (!gridRow) continue;
      for (let col = 0; col < COLS; col++) {
        const cell = gridRow[col];
        if (cell) {
          drawCell(this.gfx, col * this.cellSize, (row - BUFFER_ROWS) * this.cellSize, this.cellSize, colorForCell(cell));
        }
      }
    }
  }
}
