import { Application } from "pixi.js";
import { GameEngine } from "./game/GameEngine";
import { InputHandler } from "./game/InputHandler";
import { GameRenderer } from "./render/GameRenderer";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type EngineSettings } from "./game/Settings";
import { PvpSession } from "./pvp/PvpSession";
import { DuoSession } from "./duo/DuoSession";
import "./style.css";

function setupSettingsPanel(getEngine: () => GameEngine | null, input: InputHandler) {
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
    getEngine()?.applySettings(settings);
    saveSettings(settings);
  }

  function open() {
    const engine = getEngine();
    if (!engine) return;
    isOpen = true;
    wasPaused = engine.paused;
    engine.paused = true;
    input.setSettingsOpen(true);
    panel.classList.remove("hidden");
  }

  function close() {
    const engine = getEngine();
    isOpen = false;
    if (engine) engine.paused = wasPaused;
    input.setSettingsOpen(false);
    panel.classList.add("hidden");
  }

  populateInputs(loadSettings());
  getEngine()?.applySettings(loadSettings());

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

  const menuScreen = document.querySelector<HTMLDivElement>("#menu-screen")!;
  const menuSingleBtn = document.querySelector<HTMLButtonElement>("#menu-single")!;
  const menuPvpBtn = document.querySelector<HTMLButtonElement>("#menu-pvp")!;
  const menuDuoBtn = document.querySelector<HTMLButtonElement>("#menu-duo")!;

  const pvpLobby = document.querySelector<HTMLDivElement>("#pvp-lobby")!;
  const pvpServerUrlInput = document.querySelector<HTMLInputElement>("#pvp-server-url")!;
  const pvpCreateBtn = document.querySelector<HTMLButtonElement>("#pvp-create")!;
  const pvpRoomCodeText = document.querySelector<HTMLParagraphElement>("#pvp-room-code")!;
  const pvpCodeInput = document.querySelector<HTMLInputElement>("#pvp-code-input")!;
  const pvpJoinBtn = document.querySelector<HTMLButtonElement>("#pvp-join")!;
  const pvpStatusText = document.querySelector<HTMLParagraphElement>("#pvp-status")!;
  const pvpBackBtn = document.querySelector<HTMLButtonElement>("#pvp-back")!;

  const duoLobby = document.querySelector<HTMLDivElement>("#duo-lobby")!;
  const duoServerUrlInput = document.querySelector<HTMLInputElement>("#duo-server-url")!;
  const duoCreateBtn = document.querySelector<HTMLButtonElement>("#duo-create")!;
  const duoRoomCodeText = document.querySelector<HTMLParagraphElement>("#duo-room-code")!;
  const duoCodeInput = document.querySelector<HTMLInputElement>("#duo-code-input")!;
  const duoJoinBtn = document.querySelector<HTMLButtonElement>("#duo-join")!;
  const duoStatusText = document.querySelector<HTMLParagraphElement>("#duo-status")!;
  const duoBackBtn = document.querySelector<HTMLButtonElement>("#duo-back")!;

  const pvpResultScreen = document.querySelector<HTMLDivElement>("#pvp-result")!;
  const pvpResultText = document.querySelector<HTMLHeadingElement>("#pvp-result-text")!;
  const pvpResultMenuBtn = document.querySelector<HTMLButtonElement>("#pvp-result-menu")!;

  pvpServerUrlInput.value = `ws://${location.hostname}:8080`;
  duoServerUrlInput.value = `ws://${location.hostname}:8080`;

  const renderer = new GameRenderer(app);

  let mode: "menu" | "single" | "pvp" | "duo" = "menu";
  let singleEngine: GameEngine | null = null;
  let singleInput: InputHandler | null = null;
  let pvpSession: PvpSession | null = null;
  let pvpInput: InputHandler | null = null;
  let duoSession: DuoSession | null = null;
  let duoInput: InputHandler | null = null;

  function showOnly(el: HTMLElement | null) {
    [menuScreen, pvpLobby, duoLobby, pvpResultScreen].forEach((s) => s.classList.add("hidden"));
    el?.classList.remove("hidden");
  }

  function returnToMenu() {
    mode = "menu";
    renderer.container.visible = true;
    if (pvpSession) {
      pvpSession.disconnect();
      app.stage.removeChild(pvpSession.opponentView.container);
      pvpSession = null;
    }
    pvpInput?.dispose();
    pvpInput = null;
    pvpStatusText.textContent = "";
    pvpRoomCodeText.textContent = "";
    pvpCodeInput.value = "";
    if (duoSession) {
      duoSession.disconnect();
      app.stage.removeChild(duoSession.renderer.container);
      duoSession = null;
    }
    duoInput?.dispose();
    duoInput = null;
    duoStatusText.textContent = "";
    duoRoomCodeText.textContent = "";
    duoCodeInput.value = "";
    showOnly(menuScreen);
  }

  function startSingle() {
    mode = "single";
    showOnly(null);
    singleEngine = new GameEngine();
    singleInput = new InputHandler(singleEngine);
    singleInput.onPause = () => {
      if (!singleEngine!.gameOver) singleEngine!.paused = !singleEngine!.paused;
    };
    singleInput.onRestart = () => singleEngine!.reset();
    setupSettingsPanel(() => singleEngine, singleInput);
  }

  function startPvpLobby() {
    mode = "menu"; // 아직 매치는 시작 안 함, 로비 화면일 뿐
    showOnly(pvpLobby);
    pvpSession = new PvpSession(app);
    pvpSession.opponentView.container.position.set(20, 20);

    pvpSession.onRoomCreated = (code) => {
      pvpRoomCodeText.textContent = `방 코드: ${code}`;
      pvpStatusText.textContent = "상대방을 기다리는 중...";
    };
    pvpSession.onJoinError = (reason) => {
      pvpStatusText.textContent = reason === "full" ? "이미 꽉 찬 방이에요." : "방을 찾을 수 없어요.";
    };
    pvpSession.onMatchStart = () => {
      mode = "pvp";
      showOnly(null);
      pvpInput = new InputHandler(pvpSession!.engine!);
      pvpInput.onPause = () => {
        const engine = pvpSession!.engine!;
        if (!engine.gameOver) engine.paused = !engine.paused;
      };
      pvpInput.onRestart = () => {};
      setupSettingsPanel(() => pvpSession?.engine ?? null, pvpInput);
    };
    pvpSession.onMatchEnd = (result) => {
      pvpResultText.textContent = result === "win" ? "승리!" : "패배";
      showOnly(pvpResultScreen);
    };

    pvpStatusText.textContent = "서버에 연결하는 중...";
    pvpSession.connect(pvpServerUrlInput.value).catch(() => {
      pvpStatusText.textContent = "서버에 연결할 수 없어요. 주소를 확인해주세요.";
    });
  }

  function startDuoLobby() {
    mode = "menu"; // 아직 매치는 시작 안 함, 로비 화면일 뿐
    showOnly(duoLobby);
    renderer.container.visible = false; // GameRenderer(싱글/1v1용)와 화면이 겹치지 않게 숨김
    duoSession = new DuoSession(app);

    duoSession.onRoomCreated = (code) => {
      duoRoomCodeText.textContent = `방 코드: ${code}`;
    };
    duoSession.onWaiting = (filled, total) => {
      duoStatusText.textContent = `${filled}/${total}명 대기 중...`;
    };
    duoSession.onJoinError = (reason) => {
      duoStatusText.textContent = reason === "full" ? "이미 꽉 찬 방이에요." : "방을 찾을 수 없어요.";
    };
    duoSession.onMatchStart = () => {
      mode = "duo";
      showOnly(null);
      duoInput = new InputHandler(duoSession!.controls);
      duoInput.onPause = () => {};
      duoInput.onRestart = () => {};
    };
    duoSession.onMatchEnd = (result) => {
      pvpResultText.textContent = result === "win" ? "승리!" : "패배";
      showOnly(pvpResultScreen);
    };

    duoStatusText.textContent = "서버에 연결하는 중...";
    duoSession.connect(duoServerUrlInput.value).catch(() => {
      duoStatusText.textContent = "서버에 연결할 수 없어요. 주소를 확인해주세요.";
    });
  }

  menuSingleBtn.addEventListener("click", startSingle);
  menuPvpBtn.addEventListener("click", startPvpLobby);
  menuDuoBtn.addEventListener("click", startDuoLobby);
  pvpCreateBtn.addEventListener("click", () => {
    pvpStatusText.textContent = "방 만드는 중...";
    pvpSession?.createRoom();
  });
  pvpJoinBtn.addEventListener("click", () => {
    const code = pvpCodeInput.value.trim();
    if (!code) return;
    pvpStatusText.textContent = "참가하는 중...";
    pvpSession?.joinRoom(code);
  });
  pvpBackBtn.addEventListener("click", returnToMenu);
  pvpResultMenuBtn.addEventListener("click", returnToMenu);

  duoCreateBtn.addEventListener("click", () => {
    duoStatusText.textContent = "방 만드는 중...";
    duoSession?.createRoom();
  });
  duoJoinBtn.addEventListener("click", () => {
    const code = duoCodeInput.value.trim();
    if (!code) return;
    duoStatusText.textContent = "참가하는 중...";
    duoSession?.joinRoom(code);
  });
  duoBackBtn.addEventListener("click", returnToMenu);

  app.ticker.add((ticker) => {
    const deltaMS = ticker.deltaMS;
    if (mode === "single" && singleEngine) {
      singleEngine.update(deltaMS);
      renderer.render(singleEngine, deltaMS);
    } else if (mode === "pvp" && pvpSession) {
      pvpSession.update(deltaMS);
      pvpSession.render(deltaMS, renderer);
    } else if (mode === "duo" && duoSession) {
      duoSession.render();
    }
  });
}

bootstrap();
