import { GameEngine } from "./GameEngine";

export class InputHandler {
  private heldKeys = new Set<string>();
  private dirStack: ("left" | "right")[] = [];

  onPause: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  private engine: GameEngine;

  constructor(engine: GameEngine) {
    this.engine = engine;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Shift"].includes(key)) {
      e.preventDefault();
    }

    if (this.heldKeys.has(key)) return; // 키 반복 이벤트 무시 (자체 DAS 사용)
    this.heldKeys.add(key);

    switch (key) {
      case "ArrowLeft":
      case "a":
      case "A":
        this.pushDir("left");
        break;
      case "ArrowRight":
      case "d":
      case "D":
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

    switch (key) {
      case "ArrowLeft":
      case "a":
      case "A":
        this.popDir("left");
        break;
      case "ArrowRight":
      case "d":
      case "D":
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
