import type { Cell } from "../game/Board";

export type JoinErrorReason = "not_found" | "full";

export class PvpClient {
  private ws: WebSocket | null = null;
  // 연결이 OPEN되기 전에 방 생성/참가를 누르면(특히 터널처럼 핸드셰이크가 느린 환경)
  // 메시지가 조용히 씹혀서 아무 반응 없이 멈춰버렸다. OPEN 전에는 큐에 쌓아뒀다가
  // 연결되는 즉시 순서대로 흘려보낸다.
  private sendQueue: unknown[] = [];

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

      ws.onopen = () => {
        for (const message of this.sendQueue) {
          ws.send(JSON.stringify(message));
        }
        this.sendQueue = [];
        resolve();
      };
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
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      this.sendQueue.push(message);
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
