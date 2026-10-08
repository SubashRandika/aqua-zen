import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from "three"
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { RockDefinition } from "@/config/scape"
import { createNoise3D, fbm3 } from "@/simulation/core/noise"
import { createRandom, randomRange } from "@/simulation/core/random"
import { ROCK_BURY_FRACTION } from "@/simulation/environment/scapeLayout"

const STONE = new Color("#8d949a")
const STONE_DARK = new Color("#4a5157")
const VEIN = new Color("#d4d7d2")
const MOSS = new Color("#56703f")

interface FracturePlane {
	normal: Vector3
	offset: number
}

/**
 * A procedural stone in the style of Seiryu rock: angular and fractured,
 * narrowing to a crown, grey-blue with pale veins. A displaced icosphere is
 * cut by random fracture planes, which leaves the flat faces and crisp
 * edges that make real aquascaping stone read as stone.
 */
export function createRockGeometry(rock: RockDefinition, detail: number): BufferGeometry {
	const noise = createNoise3D(rock.seed)
	const ridges = createNoise3D(rock.seed + 1)
	const random = createRandom(rock.seed)
	let geometry: BufferGeometry = new IcosahedronGeometry(1, detail)
	geometry.deleteAttribute("normal")
	geometry.deleteAttribute("uv")
	geometry = mergeVertices(geometry)

	// Fracture planes, mostly steep, so faces read as split rock rather than facets of a gem.
	const planes: FracturePlane[] = []
	const planeCount = 7 + Math.floor(random() * 4)
	for (let i = 0; i < planeCount; i++) {
		const theta = random() * Math.PI * 2
		const elevation = randomRange(random, -0.25, 0.75)
		const normal = new Vector3(
			Math.cos(theta) * Math.cos(elevation),
			Math.sin(elevation),
			Math.sin(theta) * Math.cos(elevation),
		).normalize()
		planes.push({ normal, offset: randomRange(random, 0.62, 0.86) })
	}

	const position = geometry.attributes.position!
	const direction = new Vector3()
	const point = new Vector3()
	for (let i = 0; i < position.count; i++) {
		direction.fromBufferAttribute(position, i).normalize()
		let radius = 1 + fbm3(noise, direction.x * 1.3, direction.y * 1.3, direction.z * 1.3, 3) * 0.38
		radius +=
			(1 - Math.abs(ridges(direction.x * 2.4, direction.y * 2.4, direction.z * 2.4))) ** 5 * 0.08
		point.copy(direction).multiplyScalar(radius)
		for (const plane of planes) {
			const excess = point.dot(plane.normal) - plane.offset
			if (excess > 0) point.addScaledVector(plane.normal, -excess)
		}
		// Narrow towards the crown, as weathered stones do.
		const crown = Math.max(0, point.y) ** 1.5
		point.x *= 1 - crown * 0.38
		point.z *= 1 - crown * 0.32
		// Fine roughness and horizontal strata on top of the fractures.
		const grain = fbm3(noise, point.x * 9, point.y * 9, point.z * 9, 2) * 0.018
		const strata = Math.sin(point.y * 26 + noise(point.x * 2, 0, point.z * 2) * 3) * 0.008
		point.multiplyScalar(1 + grain + strata)
		if (point.y < -0.6) point.y = -0.6 + (point.y + 0.6) * 0.2
		position.setXYZ(
			i,
			point.x * rock.size[0] * 0.5,
			point.y * rock.size[1] * 0.5,
			point.z * rock.size[2] * 0.5,
		)
	}
	geometry.computeVertexNormals()

	// Vertex colours: tonal variation, pale veins, darker hollows and a hint of moss on top.
	const colors = new Float32Array(position.count * 3)
	const normal = geometry.attributes.normal!
	const color = new Color()
	for (let i = 0; i < position.count; i++) {
		point.fromBufferAttribute(position, i)
		const up = normal.getY(i)
		const shade = 0.55 + fbm3(noise, point.x * 22, point.y * 22, point.z * 22, 3) * 0.9
		color.copy(STONE_DARK).lerp(STONE, Math.min(1, Math.max(0, shade)))
		const vein = Math.abs(ridges(point.x * 26 + 5, point.y * 40, point.z * 26))
		if (vein < 0.045) color.lerp(VEIN, (1 - vein / 0.045) * 0.75)
		// Underhangs stay darker.
		if (up < -0.2) color.multiplyScalar(0.75 + (up + 1) * 0.3)
		if (up > 0.7)
			color.lerp(
				MOSS,
				(up - 0.7) * 1.2 * Math.max(0, fbm3(noise, point.x * 14, 3, point.z * 14, 2) + 0.25),
			)
		colors[i * 3] = color.r
		colors[i * 3 + 1] = color.g
		colors[i * 3 + 2] = color.b
	}
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))

	geometry.rotateZ(rock.tilt)
	geometry.rotateY(rock.rotationY)
	geometry.translate(0, rock.size[1] * (0.5 - ROCK_BURY_FRACTION), 0)
	geometry.computeBoundingSphere()
	return geometry
}
