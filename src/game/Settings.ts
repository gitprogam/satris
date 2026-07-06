export interface EngineSettings {
  das: number; // Delayed Auto Shift (ms)
  arr: number; // Auto Repeat Rate (ms)
  sdf: number; // Soft Drop Factor (5~41, 41=즉시 바닥까지)
  dcd: number; // DAS Cancel Delay (ms)
}

export const DEFAULT_SETTINGS: EngineSettings = {
  das: 133,
  arr: 2,
  sdf: 20,
  dcd: 0,
};

export const SETTINGS_LIMITS = {
  das: { min: 0, max: 500 },
  arr: { min: 0, max: 100 },
  sdf: { min: 5, max: 41 },
  dcd: { min: 0, max: 300 },
};

const STORAGE_KEY = "satris-settings";

export function loadSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: EngineSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage를 쓸 수 없는 환경(예: 프라이빗 모드)은 저장을 건너뜀
  }
}
