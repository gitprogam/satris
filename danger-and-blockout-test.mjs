import { GameEngine } from "./src/game/GameEngine.ts";
import { COLS, TOTAL_ROWS, BUFFER_ROWS } from "./src/game/constants.ts";

const SPAWN_ROW = BUFFER_ROWS - 2; // 18
const SPAWN_COL = 3;

// 1) 스폰 모양 일부만 막혔을 때 -> 나머지 "빈 칸"만 위험 표시로 나와야 함
{
  const engine = new GameEngine(1);
  engine.board.reset();
  // 다음 피스 확인
  const nextType = engine.nextQueue[0];
  console.log("다음 피스:", nextType);
  // 그 스폰 모양의 셀 중 하나만 미리 막아둠
  const { PIECE_SHAPES } = await import("./src/game/pieces.ts");
  const shape = PIECE_SHAPES[nextType][0];
  const cells = shape.map(([r, c]) => [r + SPAWN_ROW, c + SPAWN_COL]);
  const [blockedR, blockedC] = cells[0];
  engine.board.grid[blockedR][blockedC] = "L";

  const danger = engine.getSpawnDangerCells();
  console.log("일부만 막힌 상태의 danger cells:", JSON.stringify(danger));
  // 하나라도 막히면 스폰 모양 전체(막힌 칸 + 빈 칸 모두)가 danger로 나와야 함
  const dangerSet = new Set(danger.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of cells) {
    if (!dangerSet.has(`${r},${c}`)) {
      throw new Error(`스폰 모양의 칸 (${r},${c})이 danger에 빠짐 (전체가 나와야 함)`);
    }
  }
  if (danger.length !== cells.length) {
    throw new Error("danger 칸 수가 스폰 모양 전체 칸 수와 다름");
  }
  console.log("OK: 하나라도 막히면 스폰 모양 전체(막힌 칸+빈 칸)가 danger로 나옴");
}

// 2) 스폰 모양이 완전히 안 막혔을 때 -> danger 없음
{
  const engine = new GameEngine(2);
  engine.board.reset();
  const danger = engine.getSpawnDangerCells();
  console.log("빈 보드 danger cells:", JSON.stringify(danger));
  if (danger.length !== 0) throw new Error("빈 보드인데 danger가 나옴");
  console.log("OK: 완전히 안전하면 danger 없음");
}

// 3) 스폰 모양이 완전히 다 막혔을 때 -> danger 없음 (표시할 빈 칸이 없으므로), 대신 실제로 Block Out
{
  const engine = new GameEngine(3);
  engine.board.reset();
  for (let r = SPAWN_ROW - 1; r <= SPAWN_ROW + 1; r++) {
    for (let c = 0; c < COLS; c++) {
      engine.board.grid[r][c] = "L";
    }
  }
  const danger = engine.getSpawnDangerCells();
  console.log("완전히 막힌 상태의 danger cells:", JSON.stringify(danger));
  if (danger.length !== 0) throw new Error("완전히 막혔는데 danger가 나옴 (표시할 빈칸이 없어야 함)");
  console.log("OK: 완전히 막히면 표시할 빈 칸이 없어서 danger도 비어있음");
}

// 4) Block Out 회귀 검증: 줄을 안 지웠는데 스폰 자리가 막히면 진짜로 죽어야 함 (더 이상 위로 안 밀림)
{
  const engine = new GameEngine(4);
  engine.board.reset();
  for (let r = SPAWN_ROW - 2; r <= SPAWN_ROW + 4; r++) {
    for (let c = 0; c < COLS; c++) {
      engine.board.grid[r][c] = "L";
    }
  }
  engine["spawnNext"]();
  console.log("완전 봉쇄 상태에서 spawnNext 후 - gameOver:", engine.gameOver, "active row:", engine.active?.row);
  if (!engine.gameOver) {
    throw new Error("스폰 자리가 막혔는데 게임오버가 안 됨 (Clutch Clear 버그 재현됨)");
  }
  console.log("OK: 줄 클리어 없이 스폰이 막히면 즉시 Block Out으로 게임오버");
}

// 5) 회귀: 줄을 지워서 실제로 자리가 난 경우엔 정상적으로 스폰돼야 함 (자연스러운 Clutch Clear)
{
  const engine = new GameEngine(5);
  engine.board.reset();
  // 스폰 자리 바로 아래(그 줄들)를 꽉 채워서, lockPiece가 이 줄들을 지우면 스폰 자리가 자연히 열리게 함.
  // 9번 컬럼 아래쪽엔 바닥을 깔아서 세로 I피스가 이 4줄에 정확히 멈추게 함.
  for (let r = SPAWN_ROW; r <= SPAWN_ROW + 3; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c !== 9) engine.board.grid[r][c] = "L";
    }
  }
  for (let r = SPAWN_ROW + 4; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) engine.board.grid[r][c] = "L";
  }
  // 세로 I피스로 9번 컬럼을 채워서 4줄 클리어(테트리스) 유도 -> 스폰 자리가 비워짐
  engine.active = { type: "I", rotation: 1, row: SPAWN_ROW - 4, col: 7 };
  engine.hardDrop();
  console.log("클리어 직후 gameOver:", engine.gameOver, "active:", JSON.stringify(engine.active));
  if (engine.gameOver) {
    throw new Error("줄을 지워서 자리가 났는데도 게임오버가 됨 (자연스러운 Clutch Clear가 안 됨)");
  }
  console.log("OK: 줄 클리어로 자리가 나면 정상적으로 이어서 스폰됨");
}

console.log("ALL OK");
