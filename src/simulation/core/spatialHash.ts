import type { Vector3Like } from "three"

export interface SpatialItem {
	readonly id: number
	readonly position: Vector3Like
}

/**
 * Uniform grid for neighbour queries. Rebuilt once per simulation step, so
 * neighbour lookups stay close to O(n) as the population grows.
 */
export class SpatialHash<T extends SpatialItem> {
	private readonly cells = new Map<number, T[]>()
	private readonly pool: T[][] = []

	constructor(private readonly cellSize: number) {}

	private key(ix: number, iy: number, iz: number): number {
		// Offsets keep indices positive for any realistic tank size.
		return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512)
	}

	rebuild(items: readonly T[]): void {
		for (const bucket of this.cells.values()) {
			bucket.length = 0
			this.pool.push(bucket)
		}
		this.cells.clear()
		for (const item of items) {
			const k = this.key(
				Math.floor(item.position.x / this.cellSize),
				Math.floor(item.position.y / this.cellSize),
				Math.floor(item.position.z / this.cellSize),
			)
			let bucket = this.cells.get(k)
			if (!bucket) {
				bucket = this.pool.pop() ?? []
				this.cells.set(k, bucket)
			}
			bucket.push(item)
		}
	}

	/** Collects items within `radius` of `point` into `out` (cleared first). */
	query(point: Vector3Like, radius: number, out: T[]): T[] {
		out.length = 0
		const r2 = radius * radius
		const minX = Math.floor((point.x - radius) / this.cellSize)
		const maxX = Math.floor((point.x + radius) / this.cellSize)
		const minY = Math.floor((point.y - radius) / this.cellSize)
		const maxY = Math.floor((point.y + radius) / this.cellSize)
		const minZ = Math.floor((point.z - radius) / this.cellSize)
		const maxZ = Math.floor((point.z + radius) / this.cellSize)
		for (let ix = minX; ix <= maxX; ix++) {
			for (let iy = minY; iy <= maxY; iy++) {
				for (let iz = minZ; iz <= maxZ; iz++) {
					const bucket = this.cells.get(this.key(ix, iy, iz))
					if (!bucket) continue
					for (const item of bucket) {
						const dx = item.position.x - point.x
						const dy = item.position.y - point.y
						const dz = item.position.z - point.z
						if (dx * dx + dy * dy + dz * dz <= r2) out.push(item)
					}
				}
			}
		}
		return out
	}
}
