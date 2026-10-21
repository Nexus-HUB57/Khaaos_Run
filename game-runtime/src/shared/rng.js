export function hashSeed(seed) {
  const text = String(seed ?? 'CIGKV-DEFAULT');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

export class SeededRng {
  constructor(seed = 'CIGKV-DEFAULT') { this.seed = String(seed); this.state = hashSeed(seed); }
  next() { let x = this.state >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
  fork(label) { return new SeededRng(`${this.seed}:${label}:${this.state}`); }
}
