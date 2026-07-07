import { WebSocketServer, WebSocket } from "ws";
import { generateRoomCode } from "./roomCode";
import { send } from "./ws";
import { handleDuoClose, handleDuoMessage } from "./duoRoom";

const PORT = Number(process.env.PORT) || 8080;

interface Room {
  code: string;
  sockets: [WebSocket, WebSocket | null];
}

const rooms = new Map<string, Room>();
const socketRoom = new Map<WebSocket, string>();

function otherSocket(room: Room, ws: WebSocket): WebSocket | null {
  const [a, b] = room.sockets;
  if (a === ws) return b;
  if (b === ws) return a;
  return null;
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (typeof msg.type === "string" && msg.type.startsWith("duo:")) {
      handleDuoMessage(ws, msg);
      return;
    }

    if (msg.type === "create") {
      const code = generateRoomCode((c) => rooms.has(c));
      rooms.set(code, { code, sockets: [ws, null] });
      socketRoom.set(ws, code);
      send(ws, { type: "created", code });
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: "joinError", reason: "not_found" });
        return;
      }
      if (room.sockets[1] !== null) {
        send(ws, { type: "joinError", reason: "full" });
        return;
      }
      room.sockets[1] = ws;
      socketRoom.set(ws, code);

      const seed = Math.floor(Math.random() * 2 ** 31);
      send(room.sockets[0], { type: "matchFound", seed });
      send(room.sockets[1], { type: "matchFound", seed });
      return;
    }

    // 나머지 메시지 타입은 같은 방의 상대에게 그대로 중계
    const roomCode = socketRoom.get(ws);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const opponent = otherSocket(room, ws);
    if (!opponent) return;

    if (msg.type === "board") {
      send(opponent, { type: "board", grid: msg.grid });
    } else if (msg.type === "attack") {
      send(opponent, { type: "attack", lines: msg.lines });
    } else if (msg.type === "gameOver") {
      send(opponent, { type: "opponentGameOver" });
    }
  });

  ws.on("close", () => {
    handleDuoClose(ws);

    const roomCode = socketRoom.get(ws);
    socketRoom.delete(ws);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const opponent = otherSocket(room, ws);
    if (opponent) {
      send(opponent, { type: "opponentLeft" });
      socketRoom.delete(opponent);
    }
    rooms.delete(roomCode);
  });
});

console.log(`사트리스 PvP 서버가 ws://localhost:${PORT} 에서 대기 중입니다.`);
