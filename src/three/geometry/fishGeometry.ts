import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three"
import type {
	BarbelSet,
	BodyProfilePoint,
	FinSpan,
	FishShapeDefinition,
	PairedFin,
} from "@/simulation/fish/types"

/**
 * Procedural fish geometry. The fish is built in a normalised space where
 * its total length (nose to tail tip) is 1: the nose sits at x = +0.5 and
 * the tail tip near x = -0.5, with +y up. Instances are scaled to real size.
 *
 * Every vertex carries:
 * - `aRegion`: 0 body, 1 dorsal, 2 anal, 3 caudal, 4 pectoral, 5 pelvic, 6 adipose, 7 barbel
 * - `aFlex`: 0 at a fin's attachment, 1 at its free edge (drives flutter)
 * - `aSide`: -1 / +1 for paired fins, twin tail lobes and body sides, 0 on the mid-plane
 * - `uv`: along-the-base and base-to-edge coordinates for fin rays
 * - `aBody` (body only): position along the body (0 nose → 1 peduncle) and
 *   height within the outline (-1 belly → 1 back), so markings follow the
 *   body's contours the way real ones do
 */

export const FISH_REGION = {
	body: 0,
	dorsal: 1,
	anal: 2,
	caudal: 3,
	pectoral: 4,
	pelvic: 5,
	adipose: 6,
	barbel: 7,
} as const

export interface FishGeometryDetail {
	radial: number
	lengthwise: number
}

export interface FishGeometrySet {
	body: BufferGeometry
	fins: BufferGeometry
}

class MeshBuilder {
	readonly positions: number[] = []
	readonly uvs: number[] = []
	readonly regions: number[] = []
	readonly flex: number[] = []
	readonly sides: number[] = []
	readonly body: number[] = []
	readonly indices: number[] = []

	get vertexCount(): number {
		return this.positions.length / 3
	}

	add(
		p: Vector3,
		region: number,
		flex: number,
		side: number,
		u = 0,
		v = 0,
		bodyT = 0,
		bodyV = 0,
	): number {
		this.positions.push(p.x, p.y, p.z)
		this.uvs.push(u, v)
		this.regions.push(region)
		this.flex.push(flex)
		this.sides.push(side)
		this.body.push(bodyT, bodyV)
		return this.vertexCount - 1
	}

	triangle(a: number, b: number, c: number): void {
		this.indices.push(a, b, c)
	}

	quad(a: number, b: number, c: number, d: number): void {
		this.indices.push(a, b, c, a, c, d)
	}

	build(): BufferGeometry {
		const geometry = new BufferGeometry()
		geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3))
		geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2))
		geometry.setAttribute("aRegion", new Float32BufferAttribute(this.regions, 1))
		geometry.setAttribute("aFlex", new Float32BufferAttribute(this.flex, 1))
		geometry.setAttribute("aSide", new Float32BufferAttribute(this.sides, 1))
		geometry.setAttribute("aBody", new Float32BufferAttribute(this.body, 2))
		geometry.setIndex(this.indices)
		geometry.computeVertexNormals()
		geometry.computeBoundingSphere()
		return geometry
	}
}

/** Catmull–Rom interpolation of the body profile at `t` (0 nose → 1 peduncle). */
export function sampleProfile(profile: readonly BodyProfilePoint[], t: number): BodyProfilePoint {
	const points = profile
	if (t <= points[0]!.t) return { ...points[0]!, t }
	const last = points[points.length - 1]!
	if (t >= last.t) return { ...last, t }
	let i = 0
	while (i < points.length - 2 && points[i + 1]!.t < t) i++
	const p1 = points[i]!
	const p2 = points[i + 1]!
	const p0 = points[i - 1] ?? p1
	const p3 = points[i + 2] ?? p2
	const local = (t - p1.t) / (p2.t - p1.t)
	const cr = (a: number, b: number, c: number, d: number) => {
		const t2 = local * local
		const t3 = t2 * local
		return (
			0.5 *
			(2 * b + (-a + c) * local + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
		)
	}
	return {
		t,
		top: Math.max(0.002, cr(p0.top, p1.top, p2.top, p3.top)),
		bottom: Math.max(0.002, cr(p0.bottom, p1.bottom, p2.bottom, p3.bottom)),
		width: Math.max(0.002, cr(p0.width, p1.width, p2.width, p3.width)),
	}
}

function bodyX(shape: FishShapeDefinition, t: number): number {
	return 0.5 - t * shape.bodyLength
}

/**
 * A point on the body's cross-section: a superellipse (boxier for a flat
 * belly) whose flanks narrow towards the ridge of the back, as real fish do.
 */
function crossSection(angle: number, shape: FishShapeDefinition): { y: number; z: number } {
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	const exponent = c < 0 ? (shape.bellyCrossSection ?? shape.crossSection) : shape.crossSection
	const power = 2 / exponent
	const y = Math.sign(c) * Math.abs(c) ** power
	const keel = shape.keel ?? 0.3
	const z = Math.sign(s) * Math.abs(s) ** power * (1 - keel * Math.max(0, y) ** 2)
	return { y, z }
}

function mouthHeight(shape: FishShapeDefinition): number {
	const first = shape.profile[0]!
	switch (shape.mouth ?? "terminal") {
		case "superior":
			return first.top * 0.7
		case "inferior":
			return -first.bottom * 0.85
		default:
			return -0.002
	}
}

function buildBody(shape: FishShapeDefinition, detail: FishGeometryDetail): BufferGeometry {
	const builder = new MeshBuilder()
	const rings = detail.lengthwise
	const around = detail.radial
	const point = new Vector3()
	const eyeX = bodyX(shape, shape.eye.t)
	const eyeRadius = shape.eye.radius

	// Nose tip, at the mouth.
	const noseY = mouthHeight(shape)
	const first = shape.profile[0]!
	const noseV = noseY >= 0 ? noseY / first.top : noseY / first.bottom
	const nose = builder.add(
		point.set(0.5 + 0.004, noseY, 0),
		FISH_REGION.body,
		0,
		0,
		0,
		0,
		0,
		Math.max(-1, Math.min(1, noseV)),
	)
	const ringStart: number[] = []
	for (let i = 0; i < rings; i++) {
		// Denser rings towards the head, where the shape changes fastest.
		const linear = (i + 1) / rings
		const t = linear ** 1.15 * 1
		const profile = sampleProfile(shape.profile, t)
		const x = bodyX(shape, t)
		ringStart.push(builder.vertexCount)
		for (let j = 0; j < around; j++) {
			const angle = (j / around) * Math.PI * 2
			const { y, z } = crossSection(angle, shape)
			const height = y >= 0 ? profile.top : profile.bottom
			point.set(x, y * height, z * profile.width)
			// The eye bulges slightly from the head.
			const dx = x - eyeX
			const dy = point.y - shape.eye.y
			const eyeDistance = Math.sqrt(dx * dx + dy * dy)
			if (eyeDistance < eyeRadius * 1.3 && Math.abs(z) > 0.3) {
				const bulge = Math.cos((eyeDistance / (eyeRadius * 1.3)) * Math.PI * 0.5) * eyeRadius * 0.35
				point.z += Math.sign(z) * bulge
			}
			builder.add(point, FISH_REGION.body, 0, Math.sign(z), t, j / around, t, y)
		}
	}
	// Close the peduncle with a small cap; the caudal fin covers it.
	const tailProfile = sampleProfile(shape.profile, 1)
	const tail = builder.add(
		point.set(bodyX(shape, 1) - 0.004, (tailProfile.top - tailProfile.bottom) * 0.3, 0),
		FISH_REGION.body,
		0,
		0,
		1,
		0,
		1,
		0,
	)

	for (let j = 0; j < around; j++) {
		const next = (j + 1) % around
		builder.triangle(nose, ringStart[0]! + j, ringStart[0]! + next)
	}
	for (let i = 0; i < rings - 1; i++) {
		const a = ringStart[i]!
		const b = ringStart[i + 1]!
		for (let j = 0; j < around; j++) {
			const next = (j + 1) % around
			builder.quad(a + j, b + j, b + next, a + next)
		}
	}
	const lastRing = ringStart[rings - 1]!
	for (let j = 0; j < around; j++) {
		const next = (j + 1) % around
		builder.triangle(tail, lastRing + next, lastRing + j)
	}
	return builder.build()
}

/** A flat fin strip between a base curve and a free edge, subdivided for smooth bending. */
function addFinStrip(
	builder: MeshBuilder,
	region: number,
	columns: number,
	rows: number,
	sample: (u: number, flex: number, out: Vector3) => Vector3,
	side = 0,
): void {
	const start = builder.vertexCount
	const point = new Vector3()
	for (let c = 0; c <= columns; c++) {
		const u = c / columns
		for (let r = 0; r <= rows; r++) {
			const flex = r / rows
			builder.add(sample(u, flex, point), region, flex, side, u, flex)
		}
	}
	const stride = rows + 1
	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const a = start + c * stride + r
			builder.quad(a, a + stride, a + stride + 1, a + 1)
		}
	}
}

/**
 * A point on a dorsal (`direction` 1) or anal (-1) fin: `u` runs along its
 * base from front to back, `flex` from the base to the free edge.
 */
export function medianFinPoint(
	shape: FishShapeDefinition,
	span: FinSpan,
	direction: 1 | -1,
	u: number,
	flex: number,
	out: Vector3,
): Vector3 {
	const t = span.start + (span.end - span.start) * u
	const profile = sampleProfile(shape.profile, t)
	const baseY = (direction > 0 ? profile.top : -profile.bottom) * 0.92
	// Fins rise to a peak, then taper away towards the rear, swept backwards.
	const peak = span.peak ?? 0.35
	const lift =
		u < peak
			? 0.12 + 0.88 * Math.sin((Math.PI / 2) * (u / peak)) ** 0.7
			: Math.cos((Math.PI / 2) * ((u - peak) / (1 - peak)) * 0.92) ** 0.8
	const height = span.height * lift
	const x = bodyX(shape, t) - span.sweep * flex * (0.35 + 0.65 * u)
	return out.set(x, baseY + direction * height * flex, 0)
}

function addMedianFin(
	builder: MeshBuilder,
	shape: FishShapeDefinition,
	region: number,
	span: FinSpan,
	direction: 1 | -1,
	detail: number,
): void {
	addFinStrip(
		builder,
		region,
		Math.max(4, Math.round(detail * 0.5)),
		Math.max(2, Math.round(detail * 0.25)),
		(u, flex, out) => medianFinPoint(shape, span, direction, u, flex, out),
	)
}

function caudalEdge(
	kind: FishShapeDefinition["caudal"]["kind"],
	v: number,
	length: number,
	spread: number,
	fork: number,
): { length: number; y: number } {
	const av = Math.abs(v)
	let edgeY = v * spread * 0.5
	let edgeLength: number
	switch (kind) {
		case "forked":
			edgeLength = length * (1 - fork * (1 - av) ** 1.6)
			break
		case "rounded":
			edgeLength = length * (0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - v * v)))
			break
		case "fan":
		case "twin":
			edgeLength = length * (0.86 + 0.14 * Math.sqrt(Math.max(0, 1 - v * v)))
			if (kind === "twin") edgeLength *= 1 - fork * 0.5 * (1 - av) ** 2
			break
		case "veil":
			edgeLength = length * (0.78 + 0.22 * Math.cos(v * 1.3))
			edgeY -= length * 0.18 * (1 - av * 0.3)
			break
		case "truncate":
			edgeLength = length * (0.8 + 0.2 * av * av) + fork * length * Math.max(0, av - 0.75) * 2.4
			break
		case "sword": {
			// A squared-off tail whose lowest rays run on into a long blade (`fork` = its
			// length). Rays further up the blade end sooner, so it tapers to a point.
			const x = Math.min(1, Math.max(0, (-v - 0.4) / 0.5))
			const sword = x * x * (3 - 2 * x)
			edgeLength = length * (0.78 + 0.2 * av * av) + fork * length * sword
			// It angles slightly down.
			edgeY -= sword * fork * length * 0.08
			break
		}
	}
	return { length: edgeLength, y: edgeY }
}

/**
 * A point on the tail fin as seen from the side: `u` runs from the lower
 * lobe (0) to the upper (1), `flex` from the base to the free edge.
 */
export function caudalPoint(
	shape: FishShapeDefinition,
	u: number,
	flex: number,
	out: Vector3,
): Vector3 {
	const baseX = bodyX(shape, 1) + 0.012
	const profile = sampleProfile(shape.profile, 1)
	const baseHalf = (profile.top + profile.bottom) * 0.5 * 0.95
	const baseCenter = (profile.top - profile.bottom) * 0.5
	const length = 1 - shape.bodyLength + 0.012
	const { kind, spread, fork } = shape.caudal
	const v = u * 2 - 1 // -1 bottom lobe … +1 top lobe
	const edge = caudalEdge(kind, v, length, spread, fork)
	const baseY = baseCenter + v * baseHalf
	// A gentle curve so the fin isn't a flat trapezoid.
	const bow = Math.sin(flex * Math.PI) * 0.04 * length * v
	return out.set(baseX - edge.length * flex, baseY + (edge.y - baseY) * flex ** 0.9 + bow, 0)
}

function addCaudalFin(builder: MeshBuilder, shape: FishShapeDefinition, detail: number): void {
	const profile = sampleProfile(shape.profile, 1)
	const baseHalf = (profile.top + profile.bottom) * 0.5 * 0.95
	const baseCenter = (profile.top - profile.bottom) * 0.5
	const kind = shape.caudal.kind
	const columns = Math.max(6, Math.round(detail * 0.6))
	const rows = Math.max(3, Math.round(detail * 0.3))
	const lobe = (u: number, flex: number, out: Vector3) => caudalPoint(shape, u, flex, out)

	if (kind !== "twin") {
		addFinStrip(builder, FISH_REGION.caudal, columns, rows, lobe)
		return
	}
	// Fancy goldfish: two tails joined along the top and splayed apart below,
	// like an open book seen from behind.
	const hinge = baseCenter + baseHalf
	const splay = 0.55
	for (const side of [-1, 1] as const) {
		addFinStrip(
			builder,
			FISH_REGION.caudal,
			columns,
			rows,
			(u, flex, out) => {
				lobe(u, flex, out)
				const below = hinge - out.y
				out.y = hinge - below * Math.cos(splay * (0.4 + 0.6 * flex))
				out.z = side * below * Math.sin(splay * (0.4 + 0.6 * flex))
				return out
			},
			side,
		)
	}
}

function addPairedFin(
	builder: MeshBuilder,
	shape: FishShapeDefinition,
	fin: PairedFin,
	region: number,
	detail: number,
): void {
	const profile = sampleProfile(shape.profile, fin.t)
	const x = bodyX(shape, fin.t)
	const isPelvic = region === FISH_REGION.pelvic
	const splay = fin.splay ?? 0
	const attachY =
		-profile.bottom * (isPelvic ? 0.85 : 0.35 + 0.5 * splay) * (shape.bellyCrossSection ? 0.95 : 1)
	for (const side of [-1, 1] as const) {
		const attachZ = side * profile.width * (isPelvic ? 0.45 + 0.4 * splay : 0.92)
		// Fins point backwards, angled away from the body and (pelvics) downwards.
		// Bottom dwellers spread them flat, like props to rest on.
		const direction = new Vector3(-1, isPelvic ? -0.55 : -0.25, side * (isPelvic ? 0.25 : 0.55))
			.normalize()
			.lerp(new Vector3(-0.6, -0.12, side * 1).normalize(), splay)
			.normalize()
		const flatSpan = new Vector3(direction.z, 0, -direction.x).normalize()
		const spanDirection = new Vector3(0, 1, isPelvic ? 0 : -side * 0.2)
			.normalize()
			.lerp(flatSpan, splay)
			.normalize()
		const columns = fin.filament ? 1 : Math.max(2, Math.round(detail * 0.2))
		const rows = fin.filament
			? Math.max(4, Math.round(detail * 0.3))
			: Math.max(2, Math.round(detail * 0.2))
		addFinStrip(
			builder,
			region,
			columns,
			rows,
			(u, flex, out) => {
				const width =
					fin.width *
					(fin.filament ? 1 - flex * 0.6 : Math.sqrt(Math.max(0, 1 - (flex * 0.9) ** 2)))
				const along = fin.length * flex
				const droop = fin.filament ? flex * flex * fin.length * 0.25 : 0
				return out
					.set(x, attachY, attachZ)
					.addScaledVector(direction, along)
					.addScaledVector(spanDirection, (u - 0.5) * width)
					.setY(out.y - droop)
			},
			side,
		)
	}
}

function addAdipose(builder: MeshBuilder, shape: FishShapeDefinition): void {
	const adipose = shape.adipose
	if (!adipose) return
	addFinStrip(builder, FISH_REGION.adipose, 3, 2, (u, flex, out) => {
		const t = adipose.t + u * 0.05
		const profile = sampleProfile(shape.profile, t)
		return out.set(
			bodyX(shape, t) - flex * 0.01,
			profile.top * 0.9 + adipose.height * flex * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.8)),
			0,
		)
	})
}

/** Whiskers trailing down from the mouth, or bristles standing up from the snout. */
function addBarbels(builder: MeshBuilder, shape: FishShapeDefinition, barbels: BarbelSet): void {
	for (let pair = 0; pair < barbels.pairs; pair++) {
		const t = 0.015 + barbels.spacing * pair
		const profile = sampleProfile(shape.profile, t)
		const x = bodyX(shape, t) + 0.004
		for (const side of [-1, 1] as const) {
			const fan = pair / Math.max(1, barbels.pairs - 1)
			const direction = barbels.bristles
				? new Vector3(0.35 - fan * 0.4, 0.75, side * (0.25 + fan * 0.3)).normalize()
				: new Vector3(0.45 - fan * 0.5, -0.7, side * (0.45 + fan * 0.25)).normalize()
			const spanDirection = new Vector3(1, 0, 0).cross(direction).normalize()
			const attachZ = side * profile.width * (barbels.bristles ? 0.35 + fan * 0.4 : 0.55)
			const length = barbels.length * (barbels.bristles ? 0.7 + 0.3 * (1 - fan) : 1 - fan * 0.25)
			addFinStrip(
				builder,
				FISH_REGION.barbel,
				1,
				4,
				(u, flex, out) =>
					out
						.set(x, barbels.y, attachZ)
						.addScaledVector(direction, length * flex)
						.addScaledVector(spanDirection, (u - 0.5) * 0.007 * (1 - flex * 0.7))
						// Barbels curl slightly back at the tips.
						.setX(out.x - flex * flex * length * 0.25),
				side,
			)
		}
	}
}

export function createFishGeometry(
	shape: FishShapeDefinition,
	detail: FishGeometryDetail,
): FishGeometrySet {
	const fins = new MeshBuilder()
	const finDetail = detail.lengthwise
	if (shape.dorsal) addMedianFin(fins, shape, FISH_REGION.dorsal, shape.dorsal, 1, finDetail)
	if (shape.anal) addMedianFin(fins, shape, FISH_REGION.anal, shape.anal, -1, finDetail)
	addCaudalFin(fins, shape, finDetail)
	addPairedFin(fins, shape, shape.pectoral, FISH_REGION.pectoral, finDetail)
	if (shape.pelvic) addPairedFin(fins, shape, shape.pelvic, FISH_REGION.pelvic, finDetail)
	addAdipose(fins, shape)
	if (shape.barbels) addBarbels(fins, shape, shape.barbels)
	return { body: buildBody(shape, detail), fins: fins.build() }
}

/** Lower-detail variant for distant fish. */
export function lowDetail(detail: FishGeometryDetail): FishGeometryDetail {
	return {
		radial: Math.max(6, Math.round(detail.radial * 0.55)),
		lengthwise: Math.max(8, Math.round(detail.lengthwise * 0.5)),
	}
}
