import type { Cell } from "../game/Board";
import type { ActivePiece } from "../game/GameEngine";
import type { PieceType } from "../game/constants";
import type { EngineSettings } from "../game/Settings";

export type DuoJoinErrorReason = "not_found" | "full";
export type DuoTeam = "A" | "B";

export interface DuoPlayerState {
  active: ActivePiece | null;
  ghostRow: number | null;
  hold: PieceType | null;
  canHold: boolean;
  next: PieceType[];
  score: number;
  level: number;
  lines: number;
  combo: number;
  gameOver: boolean;
  pps: number;
  apm: number;
  garbageQueueLines: number;
}

// 보드(그리드)는 무겁고 락이 일어날 때만 바뀌므로 별도 메시지로 분리되어 있다 - 매 틱은
// 가벼운 "live"(피스 위치 등)만 오고, "board"(그리드)는 실제로 바뀔 때만 온다.
export interface DuoLiveMessage {
  team: DuoTeam;
  players: [DuoPlayerState, DuoPlayerState];
}

export interface DuoBoardMessage {
  team: DuoTeam;
  grid: Cell[][];
}

// 네트워크로 오는 실제 메시지는 아니고, DuoSession이 최신 DuoLiveMessage/DuoBoardMessage를
// 합쳐서 DuoRenderer에 넘기는 용도의 타입.
export interface DuoStateMessage {
  team: DuoTeam;
  grid: Cell[][];
  players: [DuoPlayerState, DuoPlayerState];
}

// 2v2 "합체 보드" 모드용 클라이언트. 1v1의 PvpClient와 달리 이쪽은 서버가 권위형이라
// 보드/공격을 보내는 게 아니라 **입력만 보내고, 서버가 매 틱 계산한 상태를 받기만** 한다.
export class DuoClient {
  private ws: WebSocket | null = null;
  // 연결이 아직 OPEN 상태가 되기 전에 방 생성/참가 버튼을 눌러버리면(특히 터널처럼
  // 핸드셰이크에 시간이 걸리는 환경) 메시지가 조용히 씹혀서 아무 반응 없이 멈춰버렸다.
  // OPEN 전에는 큐에 쌓아뒀다가 연결되는 즉시 순서대로 흘려보낸다.
  private sendQueue: unknown[] = [];

  onCreated: ((code: string) => void) | null = null;
  onJoinError: ((reason: DuoJoinErrorReason) => void) | null = null;
  onWaiting: ((filled: number, total: number) => void) | null = null;
  onMatchStart: ((team: DuoTeam, slot: 0 | 1) => void) | null = null;
  onLive: ((msg: DuoLiveMessage) => void) | null = null;
  onBoard: ((msg: DuoBoardMessage) => void) | null = null;
  onEnemyBoard: ((grid: Cell[][]) => void) | null = null;
  onTeamOver: ((result: "win" | "lose") => void) | null = null;
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
        reject(new Error("듀오 서버에 연결할 수 없습니다."));
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
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
      case "duo:created":
        this.onCreated?.(msg.code);
        break;
      case "duo:joinError":
        this.onJoinError?.(msg.reason);
        break;
      case "duo:waiting":
        this.onWaiting?.(msg.filled, msg.total);
        break;
      case "duo:matchStart":
        this.onMatchStart?.(msg.team, msg.slot);
        break;
      case "duo:live":
        this.onLive?.(msg as DuoLiveMessage);
        break;
      case "duo:board":
        this.onBoard?.(msg as DuoBoardMessage);
        break;
      case "duo:enemyBoard":
        this.onEnemyBoard?.(msg.grid);
        break;
      case "duo:teamOver":
        this.onTeamOver?.(msg.result);
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
    this.send({ type: "duo:create" });
  }

  joinRoom(code: string) {
    this.send({ type: "duo:join", code: code.toUpperCase() });
  }

  move(dir: "left" | "right" | null) {
    this.send({ type: "duo:input", action: "move", dir });
  }

  softDrop(active: boolean) {
    this.send({ type: "duo:input", action: "softDrop", active });
  }

  rotate(dir: 1 | -1) {
    this.send({ type: "duo:input", action: "rotate", dir });
  }

  rotate180() {
    this.send({ type: "duo:input", action: "rotate180" });
  }

  hardDrop() {
    this.send({ type: "duo:input", action: "hardDrop" });
  }

  hold() {
    this.send({ type: "duo:input", action: "hold" });
  }

  // 서버 권위형 모드라 DAS/ARR/SDF/DCD 설정이 서버 쪽 엔진에 적용돼야 함 - 매치 시작 후
  // 한 번 보내서 내 슬롯의 엔진에 반영시킨다.
  sendSettings(settings: EngineSettings) {
    this.send({ type: "duo:settings", settings });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
