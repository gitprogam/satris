import type { WebSocket } from "ws";
import { send, sendAll } from "./ws";
import { generateRoomCode } from "./roomCode";
import { Board } from "../../src/game/Board";
import { GameEngine } from "../../src/game/GameEngine";
import { COLS } from "../../src/game/constants";
import type { EngineSettings } from "../../src/game/Settings";

// 2v2 "합체 보드" 모드: 팀원 두 명이 폭 20짜리 Board 하나를 공유한다(src/game/GameEngine.ts의
// colOffset 옵션 참고). 기존 1v1(index.ts)과 달리 여기는 서버가 정답 상태를 들고 매 틱
// 직접 시뮬레이션하는 "서버 권위형"이다 - 클라이언트는 입력만 보내고 상태를 그대로 그린다.

const TICK_MS = 16;
// 게임 시뮬레이션(중력/락딜레이 타이밍 정확도)은 매 틱(60Hz) 그대로 돌리지만, 네트워크로
// 실제 방송하는 "live"(활성 피스 위치)는 이보다 훨씬 낮은 빈도면 충분하다 - 3틱에 한 번
// = 약 20Hz. 터널을 거치는 실사용 환경에서는 페이로드 크기보다 메시지 개수 자체가
// 지연에 더 크게 기여해서, 빈도를 줄이는 게 렉 완화에 제일 효과적이었다.
const LIVE_BROADCAST_EVERY_N_TICKS = 3;

type TeamIndex = 0 | 1; // 0 = A팀, 1 = B팀
type SlotIndex = 0 | 1;

interface DuoRoom {
  code: string;
  // 입장 순서 그대로: 0,1번째 입장 = A팀(슬롯 0,1) / 2,3번째 입장 = B팀(슬롯 0,1)
  sockets: (WebSocket | null)[];
  started: boolean;
  boards?: [Board, Board];
  engines?: [[GameEngine, GameEngine], [GameEngine, GameEngine]];
  tickTimer?: ReturnType<typeof setInterval>;
  tickCounter: number;
}

interface SocketInfo {
  code: string;
  team: TeamIndex;
  slot: SlotIndex;
}

const rooms = new Map<string, DuoRoom>();
const socketInfo = new Map<WebSocket, SocketInfo>();

function teamLabel(team: TeamIndex): "A" | "B" {
  return team === 0 ? "A" : "B";
}

function teamSockets(room: DuoRoom, team: TeamIndex): (WebSocket | null)[] {
  return team === 0 ? room.sockets.slice(0, 2) : room.sockets.slice(2, 4);
}

function broadcastWaiting(room: DuoRoom) {
  const filled = room.sockets.filter((s) => s !== null).length;
  sendAll(room.sockets, { type: "duo:waiting", filled, total: 4 });
}

// "live"(활성 피스 위치)는 매 틱 바뀌므로 이것만 자주 보낸다.
function livePlayerState(engine: GameEngine) {
  return {
    active: engine.active,
    ghostRow: engine.active ? engine.getGhostRow() : null,
  };
}

// 나머지(홀드/다음/점수/콤보 등)는 사실상 락이 일어날 때만 바뀌므로 duo:board와
// 같은 타이밍(GameEngine.onBoardChanged)에만 보낸다 - 매 틱 보낼 필요가 없었음.
function statsPlayerState(engine: GameEngine) {
  return {
    hold: engine.holdType,
    canHold: engine.canHold,
    next: engine.nextQueue,
    score: engine.score,
    level: engine.level,
    lines: engine.lines,
    combo: engine.combo,
    gameOver: engine.gameOver,
    pps: engine.getPPS(),
    apm: engine.getAPM(),
    garbageQueueLines: engine.garbageQueue.reduce((sum, chunk) => sum + chunk.lines, 0),
  };
}

function routeAttack(room: DuoRoom, sourceTeam: TeamIndex, lines: number) {
  if (!room.engines) return;
  const targetTeam: TeamIndex = sourceTeam === 0 ? 1 : 0;
  const [e0, e1] = room.engines[targetTeam];
  const q0 = e0.garbageQueue.reduce((s, c) => s + c.lines, 0);
  const q1 = e1.garbageQueue.reduce((s, c) => s + c.lines, 0);
  const target = q0 <= q1 ? e0 : e1;
  target.queueGarbage(lines);
}

function endMatch(room: DuoRoom, losingTeam: TeamIndex) {
  if (room.tickTimer) clearInterval(room.tickTimer);
  const winningTeam: TeamIndex = losingTeam === 0 ? 1 : 0;
  sendAll(teamSockets(room, losingTeam), { type: "duo:teamOver", result: "lose" });
  sendAll(teamSockets(room, winningTeam), { type: "duo:teamOver", result: "win" });
  for (const s of room.sockets) {
    if (s) socketInfo.delete(s);
  }
  rooms.delete(room.code);
}

function checkTeamOver(room: DuoRoom, team: TeamIndex) {
  if (!room.engines) return;
  const [e0, e1] = room.engines[team];
  if (e0.gameOver && e1.gameOver) {
    endMatch(room, team);
  }
}

// 보드(그리드)는 무겁고(20x40칸) 락이 일어날 때만 실제로 바뀌므로, 매 틱 통째로
// 보내지 않고 GameEngine.onBoardChanged 훅에서 바뀔 때만 보낸다. 매 틱 보내는 건
// 활성 피스 위치 등 가벼운 "live" 정보뿐 - 이게 렉의 주 원인이었음.
function broadcastBoard(room: DuoRoom, team: TeamIndex) {
  if (!room.boards || !room.engines) return;
  const board = room.boards[team];
  const [e0, e1] = room.engines[team];
  const ownMsg = {
    type: "duo:board",
    team: teamLabel(team),
    grid: board.grid,
    players: [statsPlayerState(e0), statsPlayerState(e1)],
  };
  sendAll(teamSockets(room, team), ownMsg);
  const enemyTeam: TeamIndex = team === 0 ? 1 : 0;
  sendAll(teamSockets(room, enemyTeam), { type: "duo:enemyBoard", grid: board.grid });
}

function tick(room: DuoRoom) {
  if (!room.engines || !room.boards) return;
  for (const team of [0, 1] as TeamIndex[]) {
    for (const engine of room.engines[team]) {
      engine.update(TICK_MS);
    }
  }

  room.tickCounter = (room.tickCounter + 1) % LIVE_BROADCAST_EVERY_N_TICKS;
  if (room.tickCounter !== 0) return;

  for (const team of [0, 1] as TeamIndex[]) {
    const [e0, e1] = room.engines[team];
    const live = {
      type: "duo:live",
      team: teamLabel(team),
      players: [livePlayerState(e0), livePlayerState(e1)],
    };
    sendAll(teamSockets(room, team), live);
  }
}

function startMatch(room: DuoRoom) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const boardA = new Board(COLS * 2);
  const boardB = new Board(COLS * 2);
  room.boards = [boardA, boardB];
  room.engines = [
    [new GameEngine(seed, { board: boardA, colOffset: 0 }), new GameEngine(seed, { board: boardA, colOffset: COLS })],
    [new GameEngine(seed, { board: boardB, colOffset: 0 }), new GameEngine(seed, { board: boardB, colOffset: COLS })],
  ];

  for (const team of [0, 1] as TeamIndex[]) {
    for (const engine of room.engines[team]) {
      engine.onAttackSent = (lines) => routeAttack(room, team, lines);
      engine.onGameOver = () => checkTeamOver(room, team);
      engine.onBoardChanged = () => broadcastBoard(room, team);
    }
  }

  room.started = true;
  room.sockets.forEach((s, idx) => {
    if (!s) return;
    const team: TeamIndex = idx < 2 ? 0 : 1;
    const slot: SlotIndex = (idx % 2) as SlotIndex;
    send(s, { type: "duo:matchStart", team: teamLabel(team), slot });
  });

  // 첫 락이 나기 전까지 클라이언트가 빈 보드조차 못 받는 일이 없도록 시작 상태를 한 번 보냄
  broadcastBoard(room, 0);
  broadcastBoard(room, 1);

  room.tickTimer = setInterval(() => tick(room), TICK_MS);
}

function handleCreate(ws: WebSocket) {
  const code = generateRoomCode((c) => rooms.has(c));
  const room: DuoRoom = { code, sockets: [ws, null, null, null], started: false, tickCounter: 0 };
  rooms.set(code, room);
  socketInfo.set(ws, { code, team: 0, slot: 0 });
  send(ws, { type: "duo:created", code });
  broadcastWaiting(room);
}

function handleJoin(ws: WebSocket, rawCode: unknown) {
  const code = String(rawCode || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: "duo:joinError", reason: "not_found" });
    return;
  }
  const idx = room.sockets.findIndex((s) => s === null);
  if (room.started || idx === -1) {
    send(ws, { type: "duo:joinError", reason: "full" });
    return;
  }
  room.sockets[idx] = ws;
  const team: TeamIndex = idx < 2 ? 0 : 1;
  const slot: SlotIndex = (idx % 2) as SlotIndex;
  socketInfo.set(ws, { code, team, slot });
  broadcastWaiting(room);

  if (room.sockets.every((s) => s !== null)) {
    startMatch(room);
  }
}

function handleSettings(ws: WebSocket, settings: unknown) {
  const info = socketInfo.get(ws);
  if (!info || !settings || typeof settings !== "object") return;
  const room = rooms.get(info.code);
  if (!room || !room.engines) return;
  room.engines[info.team][info.slot].applySettings(settings as Partial<EngineSettings>);
}

function handleInput(ws: WebSocket, msg: any) {
  const info = socketInfo.get(ws);
  if (!info) return;
  const room = rooms.get(info.code);
  if (!room || !room.started || !room.engines) return;
  const engine = room.engines[info.team][info.slot];

  switch (msg.action) {
    case "move":
      engine.setInput(msg.dir === "left" || msg.dir === "right" ? msg.dir : null);
      break;
    case "softDrop":
      engine.softDrop(!!msg.active);
      break;
    case "rotate":
      engine.rotate(msg.dir === -1 ? -1 : 1);
      break;
    case "rotate180":
      engine.rotate180();
      break;
    case "hardDrop":
      engine.hardDrop();
      break;
    case "hold":
      engine.hold();
      break;
  }
}

export function handleDuoMessage(ws: WebSocket, msg: any) {
  switch (msg.type) {
    case "duo:create":
      handleCreate(ws);
      break;
    case "duo:join":
      handleJoin(ws, msg.code);
      break;
    case "duo:input":
      handleInput(ws, msg);
      break;
    case "duo:settings":
      handleSettings(ws, msg.settings);
      break;
  }
}

export function handleDuoClose(ws: WebSocket) {
  const info = socketInfo.get(ws);
  socketInfo.delete(ws);
  if (!info) return;
  const room = rooms.get(info.code);
  if (!room) return;

  if (!room.started) {
    const idx = room.sockets.indexOf(ws);
    if (idx !== -1) room.sockets[idx] = null;
    if (room.sockets.every((s) => s === null)) {
      rooms.delete(room.code);
    } else {
      broadcastWaiting(room);
    }
    return;
  }

  // 매치 도중 접속 종료 -> 그 팀원이 속한 팀의 패배로 처리
  endMatch(room, info.team);
}
