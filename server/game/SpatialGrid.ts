/**
 * KHAAOS RUN — Spatial Interest Management
 * ========================================
 * Uniform grid for O(1) neighborhood queries.
 *
 * Used by:
 *  - Interest management (only send nearby players/loot to each client)
 *  - PvP range checks
 *  - Loot proximity validation (already had distance; this scales)
 *
 * Grid is over the normalized 0-100 map space.
 */

export interface SpatialEntity {
  id: string | number;
  posX: number; // 0-100
  posY: number;
}

export class SpatialGrid<T extends SpatialEntity> {
  private cellSize: number;
  private cells = new Map<string, Set<T>>();
  private entityCell = new Map<string | number, string>(); // entity id → cell key

  constructor(cellSize = 15) {
    // 15% of map ≈ good for BR interest + PvP range
    this.cellSize = cellSize;
  }

  private key(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx}:${cy}`;
  }

  clear() {
    this.cells.clear();
    this.entityCell.clear();
  }

  insert(entity: T) {
    this.remove(entity.id);
    const k = this.key(entity.posX, entity.posY);
    if (!this.cells.has(k)) this.cells.set(k, new Set());
    this.cells.get(k)!.add(entity);
    this.entityCell.set(entity.id, k);
  }

  remove(id: string | number) {
    const prev = this.entityCell.get(id);
    if (!prev) return;
    const set = this.cells.get(prev);
    if (set) {
      for (const e of set) {
        if (e.id === id) {
          set.delete(e);
          break;
        }
      }
      if (set.size === 0) this.cells.delete(prev);
    }
    this.entityCell.delete(id);
  }

  update(entity: T) {
    this.insert(entity);
  }

  /** Entities in the same cell and the 8 neighbors (3×3). */
  queryNeighbors(x: number, y: number): T[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: T[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const set = this.cells.get(`${cx + dx}:${cy + dy}`);
        if (set) result.push(...set);
      }
    }
    return result;
  }

  /** Entities within euclidean radius (post-filter on neighbors). */
  queryRadius(x: number, y: number, radius: number): T[] {
    return this.queryNeighbors(x, y).filter((e) => {
      const dx = e.posX - x;
      const dy = e.posY - y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }
}
