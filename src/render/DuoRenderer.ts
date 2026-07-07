import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { BUFFER_ROWS, CELL_SIZE, COLS, GHOST_ALPHA, PIECE_COLORS, VISIBLE_ROWS } from "../game/constants";
import type { DuoPlayerState, DuoStateMessage } from "../net/DuoClient";
import type { ActivePiece } from "../game/GameEngine";
import { PIECE_SHAPES } from "../game/pieces";
import { colorForCell, drawCell } from "./cellDraw";
import { OpponentBoardView } from "./OpponentBoardView";

const TEAM_COLS = COLS * 2;
const BOARD_W = TEAM_COLS * CELL_SIZE;
const BOARD_H = VISIBLE_ROWS * CELL_SIZE;
const SIDE_PANEL_W = 170;
const MARGIN = 24;

function pieceCells(active: ActivePiece, rowOverride?: number): [number, number][] {
  const shape = PIECE_SHAPES[active.type][active.rotation];
  const row = rowOverride ?? active.row;
  return shape.map(([r, c]) => [r + row, c + active.col] as [number, number]);
}

// 2v2 "합체 보드" 화면: 20칸 폭 공유 보드 하나(가운데 구분선으로 절반 표시) + 내 스탯
// 패널(왼쪽) + 팀원 요약(왼쪽 아래) + 상대팀 보드 미리보기(오른쪽, OpponentBoardView 재사용).
export class DuoRenderer {
  app: Application;
  // main.ts가 메뉴로 돌아갈 때 app.stage에서 떼어낼 수 있도록 루트 컨테이너를 노출한다.
  container: Container;
  // 상대팀 보드 미리보기. 예전엔 DuoSession이 app.stage에 절대 좌표로 따로 붙였는데,
  // 그러면 화면 크기에 따라 root가 가운데 정렬되면서 왼쪽 스탯 패널과 겹치는 버그가
  // 있었다. 이 렌더러의 레이아웃(오른쪽 사이드 패널 자리)에 직접 포함시켜서 고침.
  enemyView: OpponentBoardView;
  private boardLayer = new Container();
  private boardBg = new Graphics();
  private boardGfx = new Graphics();

  private scoreText: Text;
  private levelText: Text;
  private linesText: Text;
  private ppsText: Text;
  private apmText: Text;
  private mateText: Text;
  private overlayContainer = new Container();
  private overlayBg = new Graphics();
  private overlayText: Text;
  private overlaySubText: Text;

  constructor(app: Application) {
    this.app = app;

    const root = new Container();
    this.container = root;
    app.stage.addChild(root);

    const totalW = SIDE_PANEL_W + MARGIN + BOARD_W + MARGIN + SIDE_PANEL_W;
    root.x = Math.max(0, (app.screen.width - totalW) / 2);
    root.y = Math.max(0, (app.screen.height - BOARD_H) / 2);

    this.boardLayer.x = SIDE_PANEL_W + MARGIN;
    root.addChild(this.boardLayer);

    this.boardBg.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x0a0a12 });
    for (let c = 1; c < TEAM_COLS; c++) {
      this.boardBg.moveTo(c * CELL_SIZE, 0).lineTo(c * CELL_SIZE, BOARD_H);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      this.boardBg.moveTo(0, r * CELL_SIZE).lineTo(BOARD_W, r * CELL_SIZE);
    }
    this.boardBg.stroke({ color: 0x24243a, width: 1 });
    this.boardBg.rect(0, 0, BOARD_W, BOARD_H).stroke({ color: 0x4a4a6a, width: 2 });
    // 팀원 두 명의 절반을 가르는 구분선 (가운데)
    this.boardBg.moveTo(COLS * CELL_SIZE, 0).lineTo(COLS * CELL_SIZE, BOARD_H).stroke({ color: 0xffd54a, width: 2 });
    this.boardLayer.addChild(this.boardBg);
    this.boardLayer.addChild(this.boardGfx);

    const labelStyle = new TextStyle({
      fill: 0x9090b0,
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 2,
    });
    const statStyle = new TextStyle({
      fill: 0xd0d0e8,
      fontFamily: "Arial, sans-serif",
      fontSize: 15,
      fontWeight: "600",
    });

    const statsContainer = new Container();
    root.addChild(statsContainer);

    // 상대팀 미리보기는 오른쪽 사이드 패널 자리에 배치 (왼쪽 스탯 패널과 겹치지 않게)
    this.enemyView = new OpponentBoardView(10, TEAM_COLS);
    this.enemyView.container.x = SIDE_PANEL_W + MARGIN + BOARD_W + MARGIN;
    root.addChild(this.enemyView.container);

    const scoreLabel = new Text({ text: "SCORE", style: labelStyle });
    statsContainer.addChild(scoreLabel);
    this.scoreText = new Text({ text: "0", style: statStyle });
    this.scoreText.y = 22;
    statsContainer.addChild(this.scoreText);

    const levelLabel = new Text({ text: "LEVEL", style: labelStyle });
    levelLabel.y = 60;
    statsContainer.addChild(levelLabel);
    this.levelText = new Text({ text: "1", style: statStyle });
    this.levelText.y = 82;
    statsContainer.addChild(this.levelText);

    const linesLabel = new Text({ text: "LINES", style: labelStyle });
    linesLabel.y = 120;
    statsContainer.addChild(linesLabel);
    this.linesText = new Text({ text: "0", style: statStyle });
    this.linesText.y = 142;
    statsContainer.addChild(this.linesText);

    const ppsLabel = new Text({ text: "PPS", style: labelStyle });
    ppsLabel.y = 180;
    statsContainer.addChild(ppsLabel);
    this.ppsText = new Text({ text: "0.00", style: statStyle });
    this.ppsText.y = 202;
    statsContainer.addChild(this.ppsText);

    const apmLabel = new Text({ text: "APM", style: labelStyle });
    apmLabel.y = 240;
    statsContainer.addChild(apmLabel);
    this.apmText = new Text({ text: "0.0", style: statStyle });
    this.apmText.y = 262;
    statsContainer.addChild(this.apmText);

    const mateLabel = new Text({ text: "팀원", style: labelStyle });
    mateLabel.y = 310;
    statsContainer.addChild(mateLabel);
    this.mateText = new Text({
      text: "",
      style: new TextStyle({ fill: 0x8fd3ff, fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: "600" }),
    });
    this.mateText.y = 332;
    statsContainer.addChild(this.mateText);

    this.overlayBg.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x000000, alpha: 0.7 });
    this.overlayContainer.addChild(this.overlayBg);
    this.overlayText = new Text({
      text: "",
      style: new TextStyle({ fill: 0xffffff, fontFamily: "Arial, sans-serif", fontSize: 32, fontWeight: "800" }),
    });
    this.overlayText.anchor.set(0.5);
    this.overlayText.x = BOARD_W / 2;
    this.overlayText.y = BOARD_H / 2;
    this.overlayContainer.addChild(this.overlayText);
    this.overlaySubText = new Text({
      text: "",
      style: new TextStyle({ fill: 0xc0c0d0, fontFamily: "Arial, sans-serif", fontSize: 16 }),
    });
    this.overlaySubText.anchor.set(0.5);
    this.overlaySubText.x = BOARD_W / 2;
    this.overlaySubText.y = BOARD_H / 2 + 32;
    this.overlayContainer.addChild(this.overlaySubText);
    this.overlayContainer.visible = false;
    this.boardLayer.addChild(this.overlayContainer);
  }

  private drawPiece(player: DuoPlayerState) {
    if (!player.active) return;
    const color = PIECE_COLORS[player.active.type];
    if (player.ghostRow !== null) {
      for (const [r, c] of pieceCells(player.active, player.ghostRow)) {
        if (r < BUFFER_ROWS) continue;
        drawCell(this.boardGfx, c * CELL_SIZE, (r - BUFFER_ROWS) * CELL_SIZE, CELL_SIZE, color, GHOST_ALPHA);
      }
    }
    for (const [r, c] of pieceCells(player.active)) {
      if (r < BUFFER_ROWS) continue;
      drawCell(this.boardGfx, c * CELL_SIZE, (r - BUFFER_ROWS) * CELL_SIZE, CELL_SIZE, color);
    }
  }

  render(state: DuoStateMessage, mySlot: 0 | 1) {
    this.boardGfx.clear();
    for (let row = BUFFER_ROWS; row < BUFFER_ROWS + VISIBLE_ROWS; row++) {
      const gridRow = state.grid[row];
      if (!gridRow) continue;
      for (let col = 0; col < TEAM_COLS; col++) {
        const cell = gridRow[col];
        if (cell) {
          drawCell(this.boardGfx, col * CELL_SIZE, (row - BUFFER_ROWS) * CELL_SIZE, CELL_SIZE, colorForCell(cell));
        }
      }
    }

    for (const player of state.players) {
      this.drawPiece(player);
    }

    const me = state.players[mySlot];
    const mate = state.players[mySlot === 0 ? 1 : 0];

    this.scoreText.text = me.score.toLocaleString();
    this.levelText.text = String(me.level);
    this.linesText.text = String(me.lines);
    this.ppsText.text = me.pps.toFixed(2);
    this.apmText.text = me.apm.toFixed(1);
    this.mateText.text = `점수 ${mate.score.toLocaleString()}${mate.gameOver ? " (탈락)" : ""}`;

    // "나만" 블록아웃된 상태는 화면을 가리지 않는다 - 팀원이 계속 플레이하며 내 잔해를
    // 지워서 구제할 수도 있으니 계속 지켜볼 수 있어야 함. 둘 다 아웃된 "팀 전멸"만
    // 여기서 잠깐 표시하고, 실제 매치 종료 화면은 DuoSession의 teamOver 처리가 담당한다.
    this.overlayContainer.visible = me.gameOver && mate.gameOver;
    if (this.overlayContainer.visible) {
      this.overlayText.text = "팀 전멸";
      this.overlaySubText.text = "";
    }

    this.enemyView.render();
  }
}
