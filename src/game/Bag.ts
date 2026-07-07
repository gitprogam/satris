import { ALL_PIECES } from "./pieces";
import type { PieceType } from "./constants";

// mulberry32: 아주 작은 시드 가능 PRNG (0~1 사이 실수 반환)
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 7-bag 랜덤 생성기: 7개 피스를 한 세트로 섞어서 순서대로 제공
// seed를 주면 결정적으로(같은 시드 -> 같은 피스 순서) 동작 - PvP에서 양쪽에 동일한 피스를 주기 위함
export class SevenBag {
  private queue: PieceType[] = [];
  private rng: () => number;

  constructor(seed?: number) {
    this.rng = seed !== undefined ? mulberry32(seed) : Math.random;
  }

  private refill() {
    const bag = [...ALL_PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
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
