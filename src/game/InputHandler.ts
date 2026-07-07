// InputHandler가 실제로 필요로 하는 GameEngine의 부분 집합. 이렇게 인터페이스로
// 뽑아두면 2v2 듀오 모드처럼 로컬 GameEngine이 아니라 서버로 입력을 전송하는
// 얇은 어댑터(DuoControlsAdapter)도 동일한 키 입력 로직을 그대로 재사용할 수 있다.
export interface GameControls {
  setInput(dir: "left" | "right" | null): void;
  softDrop(active: boolean): void;
  rotate(dir: 1 | -1): void;
  rotate180(): void;
  hardDrop(): void;
  hold(): void;
  readonly gameOver: boolean;
}

export class InputHandler {
  private heldKeys = new Set<string>();
  private dirStack: ("left" | "right")[] = [];

  onPause: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onToggleSettings: (() => void) | null = null;
  private engine: GameControls;
  private settingsOpen = false;

  constructor(engine: GameControls) {
    this.engine = engine;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  setSettingsOpen(open: boolean) {
    this.settingsOpen = open;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key;

    if (key === "Tab") {
      e.preventDefault();
      if (!this.heldKeys.has(key)) {
        this.heldKeys.add(key);
        this.onToggleSettings?.();
      }
      return;
    }

    if (this.settingsOpen) return; // 설정 창이 열려있으면 게임 입력 무시 (입력 필드에 그대로 타이핑)

    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Shift"].includes(key)) {
      e.preventDefault();
    }

    if (this.heldKeys.has(key)) return; // 키 반복 이벤트 무시 (자체 DAS 사용)
    this.heldKeys.add(key);

    switch (key) {
      case "ArrowLeft":
        this.pushDir("left");
        break;
      case "ArrowRight":
        this.pushDir("right");
        break;
      case "ArrowDown":
      case "s":
      case "S":
        this.engine.softDrop(true);
        break;
      case "ArrowUp":
      case "x":
      case "X":
        this.engine.rotate(1);
        break;
      case "z":
      case "Z":
      case "Control":
        this.engine.rotate(-1);
        break;
      case "a":
      case "A":
      case "f":
      case "F":
        this.engine.rotate180();
        break;
      case " ":
        this.engine.hardDrop();
        break;
      case "c":
      case "C":
      case "Shift":
        this.engine.hold();
        break;
      case "Escape":
      case "p":
      case "P":
        this.onPause?.();
        break;
      case "r":
      case "R":
        if (this.engine.gameOver) this.onRestart?.();
        break;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key;
    this.heldKeys.delete(key);

    if (this.settingsOpen) return;

    switch (key) {
      case "ArrowLeft":
        this.popDir("left");
        break;
      case "ArrowRight":
        this.popDir("right");
        break;
      case "ArrowDown":
      case "s":
      case "S":
        this.engine.softDrop(false);
        break;
    }
  };

  private pushDir(dir: "left" | "right") {
    this.dirStack = this.dirStack.filter((d) => d !== dir);
    this.dirStack.push(dir);
    this.engine.setInput(dir);
  }

  private popDir(dir: "left" | "right") {
    this.dirStack = this.dirStack.filter((d) => d !== dir);
    const top = this.dirStack[this.dirStack.length - 1] ?? null;
    this.engine.setInput(top);
  }
}
