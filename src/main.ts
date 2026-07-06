import { Application } from "pixi.js";
import { GameEngine } from "./game/GameEngine";
import { InputHandler } from "./game/InputHandler";
import { GameRenderer } from "./render/GameRenderer";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type EngineSettings } from "./game/Settings";
import "./style.css";

function setupSettingsPanel(engine: GameEngine, input: InputHandler) {
  const panel = document.querySelector<HTMLDivElement>("#settings-panel")!;
  const dasInput = document.querySelector<HTMLInputElement>("#set-das")!;
  const arrInput = document.querySelector<HTMLInputElement>("#set-arr")!;
  const sdfInput = document.querySelector<HTMLInputElement>("#set-sdf")!;
  const dcdInput = document.querySelector<HTMLInputElement>("#set-dcd")!;
  const resetBtn = document.querySelector<HTMLButtonElement>("#settings-reset")!;
  const closeBtn = document.querySelector<HTMLButtonElement>("#settings-close")!;

  let wasPaused = false;
  let isOpen = false;

  function populateInputs(settings: EngineSettings) {
    dasInput.value = String(settings.das);
    arrInput.value = String(settings.arr);
    sdfInput.value = String(settings.sdf);
    dcdInput.value = String(settings.dcd);
  }

  function readAndApply() {
    const settings: EngineSettings = {
      das: Number(dasInput.value) || 0,
      arr: Number(arrInput.value) || 0,
      sdf: Math.min(41, Math.max(5, Number(sdfInput.value) || DEFAULT_SETTINGS.sdf)),
      dcd: Number(dcdInput.value) || 0,
    };
    engine.applySettings(settings);
    saveSettings(settings);
  }

  function open() {
    isOpen = true;
    wasPaused = engine.paused;
    engine.paused = true;
    input.setSettingsOpen(true);
    panel.classList.remove("hidden");
  }

  function close() {
    isOpen = false;
    engine.paused = wasPaused;
    input.setSettingsOpen(false);
    panel.classList.add("hidden");
  }

  populateInputs(loadSettings());
  engine.applySettings(loadSettings());

  [dasInput, arrInput, sdfInput, dcdInput].forEach((el) => {
    el.addEventListener("input", readAndApply);
  });
  resetBtn.addEventListener("click", () => {
    populateInputs(DEFAULT_SETTINGS);
    readAndApply();
  });
  closeBtn.addEventListener("click", close);

  input.onToggleSettings = () => {
    if (isOpen) close();
    else open();
  };
}

async function bootstrap() {
  const app = new Application();
  await app.init({
    background: 0x08080d,
    resizeTo: window,
    antialias: true,
  });

  const appEl = document.querySelector<HTMLDivElement>("#app")!;
  appEl.appendChild(app.canvas);

  const engine = new GameEngine();
  const renderer = new GameRenderer(app);

  const input = new InputHandler(engine);
  input.onPause = () => {
    if (!engine.gameOver) engine.paused = !engine.paused;
  };
  input.onRestart = () => {
    engine.reset();
  };

  setupSettingsPanel(engine, input);

  app.ticker.add((ticker) => {
    const deltaMS = ticker.deltaMS;
    engine.update(deltaMS);
    renderer.render(engine, deltaMS);
  });
}

bootstrap();
