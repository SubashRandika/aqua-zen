import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from "three"
import { TANK_INTERIOR } from "@/config/tank"
import { substrateHeight } from "@/simulation/environment/substrate"

/** The top surface of the substrate, displaced to the shared height field. */
export function createSubstrateGeometry(segmentsX: number, segmentsZ: number): BufferGeometry {
	const width = TANK_INTERIOR.maxX - TANK_INTERIOR.minX
	const depth = TANK_INTERIOR.maxZ - TANK_INTERIOR.minZ
	const geometry = new PlaneGeometry(width, depth, segmentsX, segmentsZ)
	geometry.rotateX(-Math.PI / 2)
	const position = geometry.attributes.position!
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i)
		const z = position.getZ(i)
		position.setY(i, substrateHeight(x, z))
	}
	geometry.computeVertexNormals()
	return geometry
}

/**
 * The cross-section of substrate visible through the front and side glass —
 * a detail that immediately reads as "real aquarium".
 */
export function createSubstrateSkirtGeometry(segments: number): BufferGeometry {
	const positions: number[] = []
	const uvs: number[] = []
	const normals: number[] = []
	const indices: number[] = []
	const floor = TANK_INTERIOR.floorY
	const inset = 0.0005

	const addWall = (
		from: [number, number],
		to: [number, number],
		normal: [number, number, number],
	) => {
		const start = positions.length / 3
		for (let i = 0; i <= segments; i++) {
			const t = i / segments
			const x = from[0] + (to[0] - from[0]) * t
			const z = from[1] + (to[1] - from[1]) * t
			const top = substrateHeight(x, z)
			positions.push(x, floor, z, x, top, z)
			uvs.push(t, 0, t, 1)
			normals.push(...normal, ...normal)
		}
		for (let i = 0; i < segments; i++) {
			const a = start + i * 2
			indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
		}
	}

	const { minX, maxX, minZ, maxZ } = TANK_INTERIOR
	addWall([minX, maxZ - inset], [maxX, maxZ - inset], [0, 0, 1])
	addWall([maxX - inset, maxZ], [maxX - inset, minZ], [1, 0, 0])
	addWall([minX + inset, minZ], [minX + inset, maxZ], [-1, 0, 0])

	const geometry = new BufferGeometry()
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
	geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3))
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2))
	geometry.setIndex(indices)
	return geometry
}
