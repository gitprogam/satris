import { ALL_PIECES } from "./pieces";
import type { PieceType } from "./constants";

// 7-bag 랜덤 생성기: 7개 피스를 한 세트로 섞어서 순서대로 제공
export class SevenBag {
  private queue: PieceType[] = [];

  private refill() {
    const bag = [...ALL_PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  next(): PieceType {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift()!;
  }

  peek(count: number): PieceType[] {
    while (this.queue.length < count) this.refill();
    return this.queue.slice(0, count);
  }
}
