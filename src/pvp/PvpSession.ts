import type { Application } from "pixi.js";
import { GameEngine } from "../game/GameEngine";
import { PvpClient, type JoinErrorReason } from "../net/PvpClient";
import { GameRenderer } from "../render/GameRenderer";
import { OpponentBoardView } from "../render/OpponentBoardView";

export type PvpResult = "win" | "lose";

// GameEngine <-> PvpClient <-> UI 배선을 담당하는 오케스트레이션 클래스.
// main.ts가 비대해지지 않도록 PvP 관련 상태/흐름을 여기 모아둔다.
export class PvpSession {
  client = new PvpClient();
  engine: GameEngine | null = null;
  opponentView: OpponentBoardView;

  onRoomCreated: ((code: string) => void) | null = null;
  onJoinError: ((reason: JoinErrorReason) => void) | null = null;
  onMatchStart: (() => void) | null = null;
  onMatchEnd: ((result: PvpResult) => void) | null = null;

  private ended = false;

  constructor(app: Application) {
    this.opponentView = new OpponentBoardView();
    app.stage.addChild(this.opponentView.container);

    this.client.onCreated = (code) => this.onRoomCreated?.(code);
    this.client.onJoinError = (reason) => this.onJoinError?.(reason);
    this.client.onMatchFound = (seed) => this.startMatch(seed);
    this.client.onOpponentBoard = (grid) => {
      this.opponentView.setConnected(true);
      this.opponentView.setGrid(grid);
    };
    this.client.onOpponentAttack = (lines) => {
      this.engine?.queueGarbage(lines);
    };
    this.client.onOpponentGameOver = () => this.endMatch("win");
    this.client.onOpponentLeft = () => this.endMatch("win");
  }

  connect(url: string): Promise<void> {
    return this.client.connect(url);
  }

  createRoom() {
    this.client.createRoom();
  }

  joinRoom(code: string) {
    this.client.joinRoom(code);
  }

  private startMatch(seed: number) {
    this.ended = false;
    const engine = new GameEngine(seed);
    engine.onAttackSent = (lines) => this.client.sendAttack(lines);
    engine.onBoardChanged = () => this.client.sendBoard(engine.board.grid);
    engine.onGameOver = () => {
      this.client.sendGameOver();
      this.endMatch("lose");
    };
    this.engine = engine;
    this.opponentView.setConnected(true);
    this.onMatchStart?.();
  }

  private endMatch(result: PvpResult) {
    if (this.ended) return;
    this.ended = true;
    this.onMatchEnd?.(result);
  }

  update(deltaMs: number) {
    this.engine?.update(deltaMs);
  }

  render(deltaMs: number, renderer: GameRenderer) {
    if (this.engine) {
      renderer.render(this.engine, deltaMs);
    }
    this.opponentView.render();
  }

  disconnect() {
    this.client.disconnect();
  }
}
