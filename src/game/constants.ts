// 보드 크기 (tetr.io와 동일: 10x40, 위쪽 20줄은 화면 밖 버퍼)
export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 20;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;

export const CELL_SIZE = 32;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const PIECE_COLORS: Record<PieceType, number> = {
  I: 0x31c7ef,
  O: 0xf7d308,
  T: 0xad4d9c,
  S: 0x42b642,
  Z: 0xef2029,
  J: 0x5a65ad,
  L: 0xef7921,
};

export const GHOST_ALPHA = 0.25;

// PvP 가비지 줄 색상 (특정 피스 색과 겹치지 않는 회색 계열)
export const GARBAGE_COLOR = 0x6b6b76;

// 타이밍 (ms) - DAS/ARR/SDF/DCD는 game/Settings.ts에서 사용자가 커스텀 설정
export const LOCK_DELAY = 500; // 락 딜레이
export const MAX_LOCK_RESETS = 15; // 락 딜레이 리셋 최대 횟수
export const ARE_DELAY = 100; // 라인 클리어 후 다음 피스 등장까지 딜레이

// 레벨별 중력 (한 칸 내려가는데 걸리는 ms) - Guideline 근사 공식
export function gravityForLevel(level: number): number {
  const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(seconds * 1000, 16.67);
}

export const LINES_PER_LEVEL = 10;
