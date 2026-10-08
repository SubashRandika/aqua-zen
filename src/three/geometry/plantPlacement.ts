import { Color, Euler, Matrix4, Quaternion, Vector3, Vector4 } from "three"
import { PLANT_GROUPS, type PlantGroupDefinition, type PlantKind } from "@/config/scape"
import { TANK_INTERIOR } from "@/config/tank"
import { clamp } from "@/simulation/core/math"
import { createNoise3D } from "@/simulation/core/noise"
import { createRandom, gaussian, randomRange, type RandomSource } from "@/simulation/core/random"
import { substrateHeight } from "@/simulation/environment/substrate"

/** One instanced plant part. `anchor.xyz` is the base it sways about; `anchor.w` its sway phase. */
export interface PlantInstance {
	matrix: Matrix4
	anchor: Vector4
	color: Color
}

export interface PlantInstances {
	vallisneria: PlantInstance[]
	hairgrass: PlantInstance[]
	rosetteLeaves: PlantInstance[]
	stems: PlantInstance[]
	stemLeaves: PlantInstance[]
}

const euler = new Euler()
const quaternion = new Quaternion()
const scale = new Vector3()
const position = new Vector3()

function compose(
	x: number,
	y: number,
	z: number,
	rx: number,
	ry: number,
	rz: number,
	sx: number,
	sy: number,
	sz: number,
): Matrix4 {
	euler.set(rx, ry, rz, "YXZ")
	quaternion.setFromEuler(euler)
	return new Matrix4().compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz))
}

function scatter(group: PlantGroupDefinition, random: RandomSource): [number, number] {
	const x = group.center[0] + clamp(gaussian(random) * 0.5, -1, 1) * group.radius[0]
	const z = group.center[1] + clamp(gaussian(random) * 0.5, -1, 1) * group.radius[1]
	return [
		clamp(x, TANK_INTERIOR.minX + 0.01, TANK_INTERIOR.maxX - 0.01),
		clamp(z, TANK_INTERIOR.minZ + 0.008, TANK_INTERIOR.maxZ - 0.01),
	]
}

function tint(random: RandomSource, variance: number): Color {
	const v = 1 + randomRange(random, -variance, variance)
	return new Color(v, v * (1 + randomRange(random, -0.04, 0.04)), v)
}

function addVallisneria(
	group: PlantGroupDefinition,
	count: number,
	random: RandomSource,
	out: PlantInstance[],
): void {
	for (let i = 0; i < count; i++) {
		const [x, z] = scatter(group, random)
		const y = substrateHeight(x, z) - 0.004
		const height = randomRange(random, group.height[0], group.height[1])
		const maxHeight = TANK_INTERIOR.surfaceY - y - 0.012
		out.push({
			matrix: compose(
				x,
				y,
				z,
				randomRange(random, -0.12, 0.12),
				random() * Math.PI,
				randomRange(random, -0.12, 0.12),
				randomRange(random, 0.008, 0.013),
				Math.min(height, maxHeight),
				1,
			),
			anchor: new Vector4(x, y, z, random() * Math.PI * 2),
			color: tint(random, 0.14),
		})
	}
}

function addHairgrass(
	group: PlantGroupDefinition,
	count: number,
	random: RandomSource,
	out: PlantInstance[],
): void {
	const density = createNoise3D(group.seed)
	let placed = 0
	let attempts = 0
	while (placed < count && attempts < count * 6) {
		attempts++
		const x = group.center[0] + randomRange(random, -1, 1) * group.radius[0]
		const z = group.center[1] + randomRange(random, -1, 1) * group.radius[1]
		const ellipse =
			((x - group.center[0]) / group.radius[0]) ** 2 +
			((z - group.center[1]) / group.radius[1]) ** 2
		if (ellipse > 1) continue
		// Patchy coverage, thinning towards the group's edge.
		const patch = density(x * 14, 0.3, z * 14) * 0.5 + 0.5
		if (random() > patch * (1 - ellipse * 0.7)) continue
		if (z > TANK_INTERIOR.maxZ - 0.006 || z < TANK_INTERIOR.minZ + 0.006) continue
		const y = substrateHeight(x, z) - 0.002
		const height = randomRange(random, group.height[0], group.height[1]) * (0.6 + patch * 0.5)
		out.push({
			matrix: compose(
				x,
				y,
				z,
				randomRange(random, -0.4, 0.4),
				random() * Math.PI,
				randomRange(random, -0.4, 0.4),
				randomRange(random, 0.0014, 0.0022),
				height,
				1,
			),
			anchor: new Vector4(x, y, z, random() * Math.PI * 2),
			color: tint(random, 0.18),
		})
		placed++
	}
}

function addRosettes(
	group: PlantGroupDefinition,
	count: number,
	random: RandomSource,
	out: PlantInstance[],
): void {
	for (let p = 0; p < count; p++) {
		const [x, z] = scatter(group, random)
		const y = substrateHeight(x, z) - 0.003
		const height = randomRange(random, group.height[0], group.height[1])
		const leaves = Math.round(randomRange(random, 9, 14))
		const phase = random() * Math.PI * 2
		const plantTint = tint(random, 0.08)
		for (let i = 0; i < leaves; i++) {
			const inner = i / leaves
			// Golden-angle spiral; inner leaves are younger, shorter and more upright.
			const yaw = i * 2.39996 + randomRange(random, -0.2, 0.2)
			const tilt = 0.08 + (1 - inner) * 0.42 + randomRange(random, -0.08, 0.08)
			const length = height * (0.55 + 0.45 * (1 - inner * 0.6)) * randomRange(random, 0.85, 1.1)
			out.push({
				matrix: compose(x, y, z, tilt, yaw, 0, length, length, length),
				anchor: new Vector4(x, y, z, phase + i * 0.3),
				color: plantTint.clone().multiplyScalar(0.9 + inner * 0.2),
			})
		}
	}
}

function addStems(
	group: PlantGroupDefinition,
	count: number,
	random: RandomSource,
	stems: PlantInstance[],
	leaves: PlantInstance[],
): void {
	const green = new Color(1, 1, 1)
	const red = new Color(1.9, 0.55, 0.42)
	const direction = new Vector3()
	for (let s = 0; s < count; s++) {
		const [x, z] = scatter(group, random)
		const y = substrateHeight(x, z) - 0.004
		const height = Math.min(
			randomRange(random, group.height[0], group.height[1]),
			TANK_INTERIOR.surfaceY - y - 0.02,
		)
		const leanX = randomRange(random, -0.08, 0.08)
		const leanZ = randomRange(random, -0.06, 0.06)
		const phase = random() * Math.PI * 2
		const anchor = new Vector4(x, y, z, phase)
		stems.push({
			matrix: compose(x, y, z, leanZ, 0, -leanX, 0.0018, height, 0.0018),
			anchor,
			color: new Color(0.8, 0.85, 0.7),
		})
		direction.set(Math.sin(leanX), Math.cos(leanX) * Math.cos(leanZ), Math.sin(leanZ)).normalize()
		let along = 0.02
		let pairYaw = random() * Math.PI
		while (along < height) {
			const fraction = along / height
			const leafLength = (0.03 - fraction * 0.012) * randomRange(random, 0.85, 1.15)
			const color = green.clone().lerp(red, clamp((fraction - 0.6) / 0.4, 0, 1) ** 1.3)
			for (const side of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
				leaves.push({
					matrix: compose(
						x + direction.x * along,
						y + direction.y * along,
						z + direction.z * along,
						0,
						pairYaw + side,
						0.35 - fraction * 0.5,
						leafLength,
						leafLength,
						leafLength,
					),
					anchor,
					color,
				})
			}
			pairYaw += Math.PI / 3 + randomRange(random, -0.2, 0.2)
			along += randomRange(random, 0.007, 0.01)
		}
	}
}

/** Lays out every plant in the aquascape at the given density (0..1). */
export function placePlants(density: number): PlantInstances {
	const result: PlantInstances = {
		vallisneria: [],
		hairgrass: [],
		rosetteLeaves: [],
		stems: [],
		stemLeaves: [],
	}
	const handlers: Record<
		PlantKind,
		(group: PlantGroupDefinition, count: number, random: RandomSource) => void
	> = {
		vallisneria: (g, c, r) => addVallisneria(g, c, r, result.vallisneria),
		hairgrass: (g, c, r) => addHairgrass(g, c, r, result.hairgrass),
		rosette: (g, c, r) => addRosettes(g, c, r, result.rosetteLeaves),
		stem: (g, c, r) => addStems(g, c, r, result.stems, result.stemLeaves),
	}
	for (const group of PLANT_GROUPS) {
		const random = createRandom(group.seed)
		// Individual plants (rosettes, stems) are few and matter compositionally; keep them all.
		const scaled =
			group.kind === "rosette" || group.kind === "stem"
				? group.count
				: Math.max(1, Math.round(group.count * density))
		handlers[group.kind](group, scaled, random)
	}
	return result
}
