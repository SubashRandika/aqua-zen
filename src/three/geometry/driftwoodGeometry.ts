import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Vector3 } from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { DriftwoodBranch, DriftwoodDefinition } from "@/config/scape"
import { createNoise3D, type Noise3D } from "@/simulation/core/noise"

const BARK = new Color("#43362b")
const BARK_DARK = new Color("#1d1611")
const WORN = new Color("#776553")

function createBranchGeometry(
	branch: DriftwoodBranch,
	noise: Noise3D,
	seed: number,
	radialSegments: number,
): BufferGeometry {
	const curve = new CatmullRomCurve3(
		branch.points.map((p) => new Vector3(...p)),
		false,
		"centripetal",
	)
	const length = curve.getLength()
	const segments = Math.max(8, Math.round(length * 160))
	const frames = curve.computeFrenetFrames(segments, false)
	const positions: number[] = []
	const colors: number[] = []
	const indices: number[] = []
	const center = new Vector3()
	const offset = new Vector3()
	const color = new Color()

	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		curve.getPointAt(t, center)
		const normal = frames.normals[i]!
		const binormal = frames.binormals[i]!
		// Taper towards the tip, closing it to a point.
		const taper = branch.radiusStart + (branch.radiusEnd - branch.radiusStart) * t ** 0.8
		const tip = i === segments ? 0.15 : 1
		for (let j = 0; j < radialSegments; j++) {
			const angle = (j / radialSegments) * Math.PI * 2
			// Grooves running along the grain, plus knotty irregularity.
			const groove = Math.sin(angle * 5 + t * 6 + seed) * 0.1 + Math.sin(angle * 11 - t * 9) * 0.04
			const knot = noise(center.x * 25, center.y * 25, center.z * 25 + angle * 0.3) * 0.22
			const radius = taper * tip * (1 + groove + knot)
			offset
				.copy(normal)
				.multiplyScalar(Math.cos(angle) * radius)
				.addScaledVector(binormal, Math.sin(angle) * radius)
			positions.push(center.x + offset.x, center.y + offset.y, center.z + offset.z)
			const shade = Math.max(
				0,
				Math.min(1, 0.5 + groove * 3 + noise(center.x * 60, angle, center.z * 60) * 0.6),
			)
			color.copy(BARK_DARK).lerp(BARK, shade)
			if (shade > 0.8) color.lerp(WORN, (shade - 0.8) * 3)
			colors.push(color.r, color.g, color.b)
		}
	}
	// Close both ends so no open tube is ever visible.
	for (const [ring, flip] of [
		[0, true],
		[segments, false],
	] as const) {
		const centerIndex = positions.length / 3
		curve.getPointAt(ring / segments, center)
		positions.push(center.x, center.y, center.z)
		colors.push(BARK_DARK.r, BARK_DARK.g, BARK_DARK.b)
		for (let j = 0; j < radialSegments; j++) {
			const a = ring * radialSegments + j
			const b = ring * radialSegments + ((j + 1) % radialSegments)
			if (flip) indices.push(centerIndex, b, a)
			else indices.push(centerIndex, a, b)
		}
	}
	for (let i = 0; i < segments; i++) {
		for (let j = 0; j < radialSegments; j++) {
			const a = i * radialSegments + j
			const b = i * radialSegments + ((j + 1) % radialSegments)
			const c = (i + 1) * radialSegments + j
			const d = (i + 1) * radialSegments + ((j + 1) % radialSegments)
			indices.push(a, b, c, b, d, c)
		}
	}
	const geometry = new BufferGeometry()
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
	geometry.setIndex(indices)
	geometry.computeVertexNormals()
	return geometry
}

export function createDriftwoodGeometry(
	definition: DriftwoodDefinition,
	radialSegments: number,
): BufferGeometry {
	const noise = createNoise3D(definition.seed)
	const parts = definition.branches.map((branch, index) =>
		createBranchGeometry(branch, noise, definition.seed + index * 7, radialSegments),
	)
	const merged = mergeGeometries(parts, false)
	for (const part of parts) part.dispose()
	if (!merged) throw new Error(`Failed to build driftwood ${definition.id}`)
	merged.computeBoundingSphere()
	return merged
}
