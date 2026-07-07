import type { Cell } from "../game/Board";

export type JoinErrorReason = "not_found" | "full";

export class PvpClient {
  private ws: WebSocket | null = null;

  onCreated: ((code: string) => void) | null = null;
  onJoinError: ((reason: JoinErrorReason) => void) | null = null;
  onMatchFound: ((seed: number) => void) | null = null;
  onOpponentBoard: ((grid: Cell[][]) => void) | null = null;
  onOpponentAttack: ((lines: number) => void) | null = null;
  onOpponentGameOver: (() => void) | null = null;
  onOpponentLeft: (() => void) | null = null;
  onConnectError: (() => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => {
        this.onConnectError?.();
        reject(new Error("PvP 서버에 연결할 수 없습니다."));
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
      ws.onclose = () => {
        this.onOpponentLeft?.();
      };
    });
  }

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "created":
        this.onCreated?.(msg.code);
        break;
      case "joinError":
        this.onJoinError?.(msg.reason);
        break;
      case "matchFound":
        this.onMatchFound?.(msg.seed);
        break;
      case "board":
        this.onOpponentBoard?.(msg.grid);
        break;
      case "attack":
        this.onOpponentAttack?.(msg.lines);
        break;
      case "opponentGameOver":
        this.onOpponentGameOver?.();
        break;
      case "opponentLeft":
        this.onOpponentLeft?.();
        break;
    }
  }

  private send(message: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  createRoom() {
    this.send({ type: "create" });
  }

  joinRoom(code: string) {
    this.send({ type: "join", code: code.toUpperCase() });
  }

  sendBoard(grid: Cell[][]) {
    this.send({ type: "board", grid });
  }

  sendAttack(lines: number) {
    this.send({ type: "attack", lines });
  }

  sendGameOver() {
    this.send({ type: "gameOver" });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
