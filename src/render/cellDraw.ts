import type { Graphics } from "pixi.js";
import { GARBAGE_COLOR, PIECE_COLORS } from "../game/constants";
import type { PieceType } from "../game/constants";
import type { Cell } from "../game/Board";

export function drawCell(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1) {
  const pad = 1.5;
  g.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 4);
  g.fill({ color, alpha });
  g.roundRect(x + pad * 2, y + pad * 2, size - pad * 4, size * 0.32, 3);
  g.fill({ color: 0xffffff, alpha: alpha * 0.18 });
}

export function colorForCell(cell: Cell): number {
  return cell === "GARBAGE" ? GARBAGE_COLOR : PIECE_COLORS[cell as PieceType];
}
