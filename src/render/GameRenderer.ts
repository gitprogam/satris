import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  BUFFER_ROWS,
  CELL_SIZE,
  COLS,
  GHOST_ALPHA,
  PIECE_COLORS,
  VISIBLE_ROWS,
} from "../game/constants";
import type { PieceType } from "../game/constants";
import { GameEngine, type ClearType } from "../game/GameEngine";
import { PIECE_SHAPES } from "../game/pieces";

const BOARD_W = COLS * CELL_SIZE;
const BOARD_H = VISIBLE_ROWS * CELL_SIZE;
const SIDE_PANEL_W = 170;
const MARGIN = 24;

const CLEAR_LABELS: Record<ClearType, string> = {
  single: "SINGLE",
  double: "DOUBLE",
  triple: "TRIPLE",
  tetris: "TETRIS",
  tspin: "T-SPIN",
  "tspin-mini": "T-SPIN MINI",
  "tspin-single": "T-SPIN SINGLE",
  "tspin-mini-single": "T-SPIN MINI SINGLE",
  "tspin-double": "T-SPIN DOUBLE",
  "tspin-triple": "T-SPIN TRIPLE",
};

function drawCell(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1) {
  const pad = 1.5;
  g.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 4);
  g.fill({ color, alpha });
  g.roundRect(x + pad * 2, y + pad * 2, size - pad * 4, size * 0.32, 3);
  g.fill({ color: 0xffffff, alpha: alpha * 0.18 });
}

export class GameRenderer {
  app: Application;
  private boardLayer = new Container();
  private boardBg = new Graphics();
  private boardGfx = new Graphics();
  private holdGfx = new Graphics();
  private nextGfx = new Graphics();
  private holdBox = new Graphics();
  private nextBox = new Graphics();

  private scoreText: Text;
  private levelText: Text;
  private linesText: Text;
  private clearMsgText: Text;
  private comboText: Text;
  private holdLabel: Text;
  private nextLabel: Text;
  private overlayContainer = new Container();
  private overlayBg = new Graphics();
  private overlayText: Text;
  private overlaySubText: Text;

  private clearMsgTimer = 0;
  private lastClearId = -1;

  constructor(app: Application) {
    this.app = app;

    const root = new Container();
    app.stage.addChild(root);

    const totalW = SIDE_PANEL_W + MARGIN + BOARD_W + MARGIN + SIDE_PANEL_W;
    const totalH = BOARD_H;
    root.x = Math.max(0, (app.screen.width - totalW) / 2);
    root.y = Math.max(0, (app.screen.height - totalH) / 2);

    // 보드 배경
    this.boardLayer.x = SIDE_PANEL_W + MARGIN;
    root.addChild(this.boardLayer);

    this.boardBg.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x0a0a12 });
    for (let c = 1; c < COLS; c++) {
      this.boardBg.moveTo(c * CELL_SIZE, 0).lineTo(c * CELL_SIZE, BOARD_H);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      this.boardBg.moveTo(0, r * CELL_SIZE).lineTo(BOARD_W, r * CELL_SIZE);
    }
    this.boardBg.stroke({ color: 0x24243a, width: 1 });
    this.boardBg.rect(0, 0, BOARD_W, BOARD_H).stroke({ color: 0x4a4a6a, width: 2 });
    this.boardLayer.addChild(this.boardBg);
    this.boardLayer.addChild(this.boardGfx);

    // Hold 패널 (왼쪽)
    const holdContainer = new Container();
    holdContainer.x = 0;
    holdContainer.y = 0;
    root.addChild(holdContainer);

    const labelStyle = new TextStyle({
      fill: 0x9090b0,
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 2,
    });

    this.holdLabel = new Text({ text: "HOLD", style: labelStyle });
    this.holdLabel.x = 0;
    this.holdLabel.y = 0;
    holdContainer.addChild(this.holdLabel);

    this.holdBox.roundRect(0, 28, SIDE_PANEL_W - 20, 90, 8).fill({ color: 0x15151f }).stroke({ color: 0x33334a, width: 2 });
    holdContainer.addChild(this.holdBox);
    this.holdGfx.x = 0;
    this.holdGfx.y = 28;
    holdContainer.addChild(this.holdGfx);

    // 통계 (Hold 아래)
    const statStyle = new TextStyle({
      fill: 0xd0d0e8,
      fontFamily: "Arial, sans-serif",
      fontSize: 15,
      fontWeight: "600",
    });
    const scoreLabel = new Text({ text: "SCORE", style: labelStyle });
    scoreLabel.y = 150;
    holdContainer.addChild(scoreLabel);
    this.scoreText = new Text({ text: "0", style: statStyle });
    this.scoreText.y = 172;
    holdContainer.addChild(this.scoreText);

    const levelLabel = new Text({ text: "LEVEL", style: labelStyle });
    levelLabel.y = 210;
    holdContainer.addChild(levelLabel);
    this.levelText = new Text({ text: "1", style: statStyle });
    this.levelText.y = 232;
    holdContainer.addChild(this.levelText);

    const linesLabel = new Text({ text: "LINES", style: labelStyle });
    linesLabel.y = 270;
    holdContainer.addChild(linesLabel);
    this.linesText = new Text({ text: "0", style: statStyle });
    this.linesText.y = 292;
    holdContainer.addChild(this.linesText);

    this.comboText = new Text({
      text: "",
      style: new TextStyle({ fill: 0xffd54a, fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: "700" }),
    });
    this.comboText.y = 330;
    holdContainer.addChild(this.comboText);

    // Next 패널 (오른쪽)
    const nextContainer = new Container();
    nextContainer.x = SIDE_PANEL_W + MARGIN + BOARD_W + MARGIN;
    nextContainer.y = 0;
    root.addChild(nextContainer);

    this.nextLabel = new Text({ text: "NEXT", style: labelStyle });
    nextContainer.addChild(this.nextLabel);

    this.nextBox.roundRect(0, 28, SIDE_PANEL_W - 20, 5 * 84 + 10, 8).fill({ color: 0x15151f }).stroke({ color: 0x33334a, width: 2 });
    nextContainer.addChild(this.nextBox);
    this.nextGfx.x = 0;
    this.nextGfx.y = 28;
    nextContainer.addChild(this.nextGfx);

    // 클리어 메시지 (보드 위)
    this.clearMsgText = new Text({
      text: "",
      style: new TextStyle({
        fill: 0xffe066,
        fontFamily: "Arial, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        letterSpacing: 1,
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.8 },
      }),
    });
    this.clearMsgText.anchor.set(0.5, 0);
    this.clearMsgText.x = BOARD_W / 2;
    this.clearMsgText.y = 12;
    this.clearMsgText.alpha = 0;
    this.boardLayer.addChild(this.clearMsgText);

    // 오버레이 (일시정지/게임오버)
    this.overlayBg.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x000000, alpha: 0.7 });
    this.overlayContainer.addChild(this.overlayBg);
    this.overlayText = new Text({
      text: "",
      style: new TextStyle({ fill: 0xffffff, fontFamily: "Arial, sans-serif", fontSize: 32, fontWeight: "800" }),
    });
    this.overlayText.anchor.set(0.5);
    this.overlayText.x = BOARD_W / 2;
    this.overlayText.y = BOARD_H / 2 - 20;
    this.overlayContainer.addChild(this.overlayText);
    this.overlaySubText = new Text({
      text: "",
      style: new TextStyle({ fill: 0xc0c0d0, fontFamily: "Arial, sans-serif", fontSize: 16 }),
    });
    this.overlaySubText.anchor.set(0.5);
    this.overlaySubText.x = BOARD_W / 2;
    this.overlaySubText.y = BOARD_H / 2 + 24;
    this.overlayContainer.addChild(this.overlaySubText);
    this.overlayContainer.visible = false;
    this.boardLayer.addChild(this.overlayContainer);
  }

  private drawMiniPiece(g: Graphics, type: PieceType | null, boxW: number) {
    g.clear();
    if (!type) return;
    const shape = PIECE_SHAPES[type][0];
    const cell = 20;
    const rows = shape.map((c) => c[0]);
    const cols = shape.map((c) => c[1]);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    const w = (maxC - minC + 1) * cell;
    const h = (maxR - minR + 1) * cell;
    const offsetX = (boxW - w) / 2;
    const offsetY = (90 - h) / 2;
    for (const [r, c] of shape) {
      drawCell(g, offsetX + (c - minC) * cell, offsetY + (r - minR) * cell, cell, PIECE_COLORS[type]);
    }
  }

  render(engine: GameEngine, deltaMS: number) {
    // 보드 고정된 셀
    this.boardGfx.clear();
    for (let row = BUFFER_ROWS; row < BUFFER_ROWS + VISIBLE_ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = engine.board.grid[row][col];
        if (cell) {
          drawCell(this.boardGfx, col * CELL_SIZE, (row - BUFFER_ROWS) * CELL_SIZE, CELL_SIZE, PIECE_COLORS[cell]);
        }
      }
    }

    // 고스트 피스
    if (engine.active && !engine.gameOver) {
      const ghostCells = engine.getGhostCells();
      const color = PIECE_COLORS[engine.active.type];
      for (const [r, c] of ghostCells) {
        const vr = r - BUFFER_ROWS;
        if (vr >= 0) drawCell(this.boardGfx, c * CELL_SIZE, vr * CELL_SIZE, CELL_SIZE, color, GHOST_ALPHA);
      }

      // 현재 피스
      const activeCells = engine.getActiveCells();
      for (const [r, c] of activeCells) {
        const vr = r - BUFFER_ROWS;
        if (vr >= 0) drawCell(this.boardGfx, c * CELL_SIZE, vr * CELL_SIZE, CELL_SIZE, color);
      }
    }

    // Hold
    this.drawMiniPiece(this.holdGfx, engine.holdType, SIDE_PANEL_W - 20);
    this.holdGfx.alpha = engine.canHold ? 1 : 0.4;

    // Next queue
    this.nextGfx.clear();
    const next = engine.nextQueue;
    next.forEach((type, i) => {
      const shape = PIECE_SHAPES[type][0];
      const cell = 18;
      const rows = shape.map((c) => c[0]);
      const cols = shape.map((c) => c[1]);
      const minR = Math.min(...rows), maxR = Math.max(...rows);
      const minC = Math.min(...cols), maxC = Math.max(...cols);
      const w = (maxC - minC + 1) * cell;
      const h = (maxR - minR + 1) * cell;
      const boxTop = i * 84;
      const offsetX = (SIDE_PANEL_W - 20 - w) / 2;
      const offsetY = boxTop + (84 - h) / 2;
      for (const [r, c] of shape) {
        drawCell(this.nextGfx, offsetX + (c - minC) * cell, offsetY + (r - minR) * cell, cell, PIECE_COLORS[type]);
      }
    });

    // 텍스트 업데이트
    this.scoreText.text = engine.score.toLocaleString();
    this.levelText.text = String(engine.level);
    this.linesText.text = String(engine.lines);
    this.comboText.text = engine.combo > 0 ? `${engine.combo} COMBO` : "";

    // 클리어 메시지 애니메이션
    if (engine.lastClear && engine.lastClear.id !== this.lastClearId) {
      this.lastClearId = engine.lastClear.id;
      const label = CLEAR_LABELS[engine.lastClear.type];
      this.clearMsgText.text = engine.lastClear.backToBack ? `B2B ${label}` : label;
      this.clearMsgText.alpha = 1;
      this.clearMsgTimer = 1100;
    }
    if (this.clearMsgTimer > 0) {
      this.clearMsgTimer -= deltaMS;
      this.clearMsgText.alpha = Math.max(0, this.clearMsgTimer / 1100);
    }

    // 오버레이
    if (engine.gameOver) {
      this.overlayContainer.visible = true;
      this.overlayText.text = "GAME OVER";
      this.overlaySubText.text = "R 키를 눌러 재시작";
    } else if (engine.paused) {
      this.overlayContainer.visible = true;
      this.overlayText.text = "PAUSED";
      this.overlaySubText.text = "ESC 또는 P 키를 눌러 계속하기";
    } else {
      this.overlayContainer.visible = false;
    }
  }
}
