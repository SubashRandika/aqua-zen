import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute } from "three"

function build(positions: number[], colors: number[], indices: number[]): BufferGeometry {
	const geometry = new BufferGeometry()
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
	geometry.setIndex(indices)
	geometry.computeVertexNormals()
	geometry.computeBoundingSphere()
	return geometry
}

/**
 * A ribbon-like blade (Vallisneria, hairgrass): unit height along +y,
 * unit width, tapering to a point and slightly cupped.
 */
export function createBladeGeometry(segments: number, base: Color, tip: Color): BufferGeometry {
	const positions: number[] = []
	const colors: number[] = []
	const indices: number[] = []
	const color = new Color()
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const halfWidth = 0.5 * (1 - t ** 3) * (0.85 + 0.15 * Math.sin(t * Math.PI))
		const cup = 0.12
		color.copy(base).lerp(tip, t ** 0.8)
		positions.push(-halfWidth, t, cup * halfWidth, halfWidth, t, cup * halfWidth)
		// A faint darker midrib.
		colors.push(color.r, color.g, color.b, color.r * 0.92, color.g * 0.95, color.b * 0.92)
		if (i < segments) {
			const a = i * 2
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
		}
	}
	return build(positions, colors, indices)
}

/**
 * An arching lanceolate leaf (Amazon sword, Cryptocoryne). Unit length;
 * rises along +y and curves outwards towards +z, with a folded midrib.
 */
export function createLeafGeometry(
	segments: number,
	arch: number,
	base: Color,
	tip: Color,
): BufferGeometry {
	const positions: number[] = []
	const colors: number[] = []
	const indices: number[] = []
	const color = new Color()
	const across = [-1, -0.5, 0, 0.5, 1]
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const y = Math.sin(t * arch) / arch
		const z = (1 - Math.cos(t * arch)) / arch
		// Narrow petiole, then a broad blade tapering to a point.
		const blade =
			t < 0.18 ? 0.014 : 0.21 * Math.max(0, Math.sin((Math.PI * (t - 0.18)) / 0.82)) ** 0.7 + 0.004
		color.copy(base).lerp(tip, t)
		// Leaf surface normal direction in the y/z plane, used to fold the midrib.
		const ny = -Math.sin(t * arch)
		const nz = Math.cos(t * arch)
		for (const a of across) {
			const fold = Math.abs(a) * blade * 0.25
			positions.push(a * blade, y + ny * fold, z + nz * fold)
			const vein = a === 0 ? 1.12 : 1
			colors.push(color.r * vein, color.g * vein, color.b * vein)
		}
		if (i < segments) {
			const row = i * across.length
			for (let k = 0; k < across.length - 1; k++) {
				const a = row + k
				const b = a + across.length
				indices.push(a, a + 1, b, a + 1, b + 1, b)
			}
		}
	}
	return build(positions, colors, indices)
}

/** A small oval leaf for stem plants, unit length along +x, drooping slightly. */
export function createStemLeafGeometry(base: Color, tip: Color): BufferGeometry {
	const positions: number[] = []
	const colors: number[] = []
	const indices: number[] = []
	const segments = 4
	const color = new Color()
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const halfWidth = 0.22 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)) + 0.01
		const droop = -t * t * 0.25
		color.copy(base).lerp(tip, t)
		positions.push(t, droop, -halfWidth, t, droop + 0.04, 0, t, droop, halfWidth)
		colors.push(
			color.r,
			color.g,
			color.b,
			color.r * 1.1,
			color.g * 1.1,
			color.b * 1.1,
			color.r,
			color.g,
			color.b,
		)
		if (i < segments) {
			const a = i * 3
			indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4)
		}
	}
	return build(positions, colors, indices)
}

/** A thin unit-height stem with its base at the origin. */
export function createStemGeometry(color: Color): BufferGeometry {
	const geometry = new CylinderGeometry(1, 1, 1, 5, 6, true)
	geometry.translate(0, 0.5, 0)
	const count = geometry.attributes.position!.count
	const colors = new Float32Array(count * 3)
	for (let i = 0; i < count; i++) {
		colors[i * 3] = color.r
		colors[i * 3 + 1] = color.g
		colors[i * 3 + 2] = color.b
	}
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
	return geometry
}
