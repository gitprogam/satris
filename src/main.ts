import { Application } from "pixi.js";
import { GameEngine } from "./game/GameEngine";
import { InputHandler } from "./game/InputHandler";
import { GameRenderer } from "./render/GameRenderer";
import "./style.css";

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

  app.ticker.add((ticker) => {
    const deltaMS = ticker.deltaMS;
    engine.update(deltaMS);
    renderer.render(engine, deltaMS);
  });
}

bootstrap();
