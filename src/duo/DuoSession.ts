import type { Application } from "pixi.js";
import type { GameControls } from "../game/InputHandler";
import { loadSettings } from "../game/Settings";
import { DuoClient, type DuoJoinErrorReason, type DuoStateMessage, type DuoTeam } from "../net/DuoClient";
import { DuoRenderer } from "../render/DuoRenderer";

export type DuoResult = "win" | "lose";

// InputHandler는 GameControls 인터페이스만 알면 되므로, 로컬 엔진 대신 서버로 입력을
// 그대로 전송하는 얇은 어댑터로 감싼다 (서버 권위형 - src/net/DuoClient.ts 참고).
class DuoControlsAdapter implements GameControls {
  private client: DuoClient;
  private isGameOver: () => boolean;

  constructor(client: DuoClient, isGameOver: () => boolean) {
    this.client = client;
    this.isGameOver = isGameOver;
  }

  setInput(dir: "left" | "right" | null) {
    this.client.move(dir);
  }
  softDrop(active: boolean) {
    this.client.softDrop(active);
  }
  rotate(dir: 1 | -1) {
    this.client.rotate(dir);
  }
  rotate180() {
    this.client.rotate180();
  }
  hardDrop() {
    this.client.hardDrop();
  }
  hold() {
    this.client.hold();
  }
  get gameOver() {
    return this.isGameOver();
  }
}

// GameEngine <-> DuoClient <-> UI 배선 담당 오케스트레이션 클래스. PvpSession과 같은
// 역할이지만, 이쪽은 로컬 GameEngine을 만들지 않고(서버가 정답 상태를 들고 있음)
// 서버가 보내주는 상태를 그대로 저장했다가 DuoRenderer에 넘기기만 한다.
export class DuoSession {
  client = new DuoClient();
  controls: GameControls;
  renderer: DuoRenderer;

  team: DuoTeam | null = null;
  slot: 0 | 1 | null = null;
  private latestState: DuoStateMessage | null = null;

  onRoomCreated: ((code: string) => void) | null = null;
  onJoinError: ((reason: DuoJoinErrorReason) => void) | null = null;
  onWaiting: ((filled: number, total: number) => void) | null = null;
  onMatchStart: (() => void) | null = null;
  onMatchEnd: ((result: DuoResult) => void) | null = null;

  private ended = false;

  constructor(app: Application) {
    this.renderer = new DuoRenderer(app);

    this.controls = new DuoControlsAdapter(this.client, () => {
      if (!this.latestState || this.slot === null) return false;
      return this.latestState.players[this.slot].gameOver;
    });

    this.client.onCreated = (code) => this.onRoomCreated?.(code);
    this.client.onJoinError = (reason) => this.onJoinError?.(reason);
    this.client.onWaiting = (filled, total) => this.onWaiting?.(filled, total);
    this.client.onMatchStart = (team, slot) => {
      this.ended = false;
      this.team = team;
      this.slot = slot;
      this.renderer.enemyView.setConnected(true);
      this.client.sendSettings(loadSettings());
      this.onMatchStart?.();
    };
    this.client.onState = (state) => {
      this.latestState = state;
    };
    this.client.onEnemyBoard = (grid) => {
      this.renderer.enemyView.setGrid(grid);
    };
    this.client.onTeamOver = (result) => this.endMatch(result);
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

  private endMatch(result: DuoResult) {
    if (this.ended) return;
    this.ended = true;
    this.onMatchEnd?.(result);
  }

  render() {
    if (this.latestState && this.slot !== null) {
      this.renderer.render(this.latestState, this.slot);
    }
  }

  disconnect() {
    this.client.disconnect();
  }
}
