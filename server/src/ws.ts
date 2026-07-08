import { WebSocket } from "ws";

export function send(ws: WebSocket, message: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// 같은 메시지를 여러 소켓에 보낼 때(팀 브로드캐스트 등) JSON.stringify를 소켓 수만큼
// 반복하지 않고 한 번만 직렬화해서 재사용한다.
export function sendAll(sockets: (WebSocket | null)[], message: unknown) {
  const raw = JSON.stringify(message);
  for (const ws of sockets) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}
