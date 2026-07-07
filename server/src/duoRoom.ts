import type { WebSocket } from "ws";
import { send } from "./ws";
import { generateRoomCode } from "./roomCode";
import { Board } from "../../src/game/Board";
import { GameEngine } from "../../src/game/GameEngine";
import { COLS } from "../../src/game/constants";
import type { EngineSettings } from "../../src/game/Settings";

// 2v2 "합체 보드" 모드: 팀원 두 명이 폭 20짜리 Board 하나를 공유한다(src/game/GameEngine.ts의
// colOffset 옵션 참고). 기존 1v1(index.ts)과 달리 여기는 서버가 정답 상태를 들고 매 틱
// 직접 시뮬레이션하는 "서버 권위형"이다 - 클라이언트는 입력만 보내고 상태를 그대로 그린다.

const TICK_MS = 16;
const ENEMY_BOARD_EVERY_N_TICKS = 5;

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
  enemyTickCounter: number;
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
  for (const s of room.sockets) {
    if (s) send(s, { type: "duo:waiting", filled, total: 4 });
  }
}

function playerState(engine: GameEngine) {
  return {
    active: engine.active,
    ghostRow: engine.active ? engine.getGhostRow() : null,
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
  for (const s of teamSockets(room, losingTeam)) {
    if (s) send(s, { type: "duo:teamOver", result: "lose" });
  }
  for (const s of teamSockets(room, winningTeam)) {
    if (s) send(s, { type: "duo:teamOver", result: "win" });
  }
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

function tick(room: DuoRoom) {
  if (!room.engines || !room.boards) return;
  for (const team of [0, 1] as TeamIndex[]) {
    for (const engine of room.engines[team]) {
      engine.update(TICK_MS);
    }
  }

  room.enemyTickCounter++;
  const sendEnemyBoard = room.enemyTickCounter % ENEMY_BOARD_EVERY_N_TICKS === 0;

  for (const team of [0, 1] as TeamIndex[]) {
    const board = room.boards[team];
    const [e0, e1] = room.engines[team];
    const state = {
      type: "duo:state",
      team: teamLabel(team),
      grid: board.grid,
      players: [playerState(e0), playerState(e1)],
    };
    for (const s of teamSockets(room, team)) {
      if (s) send(s, state);
    }

    if (sendEnemyBoard) {
      const enemyTeam: TeamIndex = team === 0 ? 1 : 0;
      const msg = { type: "duo:enemyBoard", grid: board.grid };
      for (const s of teamSockets(room, enemyTeam)) {
        if (s) send(s, msg);
      }
    }
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
    }
  }

  room.started = true;
  room.sockets.forEach((s, idx) => {
    if (!s) return;
    const team: TeamIndex = idx < 2 ? 0 : 1;
    const slot: SlotIndex = (idx % 2) as SlotIndex;
    send(s, { type: "duo:matchStart", team: teamLabel(team), slot });
  });

  room.tickTimer = setInterval(() => tick(room), TICK_MS);
}

function handleCreate(ws: WebSocket) {
  const code = generateRoomCode((c) => rooms.has(c));
  const room: DuoRoom = { code, sockets: [ws, null, null, null], started: false, enemyTickCounter: 0 };
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
