import { createRandom } from "./random"

/**
 * Seeded 3D gradient noise (improved Perlin). Output is roughly in [-1, 1].
 * Used for smooth stochastic steering, water currents and procedural geometry.
 */
export interface Noise3D {
	(x: number, y: number, z: number): number
}

const GRADIENTS: ReadonlyArray<readonly [number, number, number]> = [
	[1, 1, 0],
	[-1, 1, 0],
	[1, -1, 0],
	[-1, -1, 0],
	[1, 0, 1],
	[-1, 0, 1],
	[1, 0, -1],
	[-1, 0, -1],
	[0, 1, 1],
	[0, -1, 1],
	[0, 1, -1],
	[0, -1, -1],
]

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10)
}

export function createNoise3D(seed: number): Noise3D {
	const random = createRandom(seed)
	const permutation = new Uint8Array(512)
	const base = new Uint8Array(256)
	for (let i = 0; i < 256; i++) base[i] = i
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		const tmp = base[i] as number
		base[i] = base[j] as number
		base[j] = tmp
	}
	for (let i = 0; i < 512; i++) permutation[i] = base[i & 255] as number

	const gradientDot = (hash: number, x: number, y: number, z: number): number => {
		const g = GRADIENTS[hash % 12] as readonly [number, number, number]
		return g[0] * x + g[1] * y + g[2] * z
	}

	return (x: number, y: number, z: number): number => {
		const xi = Math.floor(x)
		const yi = Math.floor(y)
		const zi = Math.floor(z)
		const xf = x - xi
		const yf = y - yi
		const zf = z - zi
		const X = xi & 255
		const Y = yi & 255
		const Z = zi & 255
		const p = permutation
		const A = (p[X] as number) + Y
		const AA = (p[A] as number) + Z
		const AB = (p[A + 1] as number) + Z
		const B = (p[X + 1] as number) + Y
		const BA = (p[B] as number) + Z
		const BB = (p[B + 1] as number) + Z

		const u = fade(xf)
		const v = fade(yf)
		const w = fade(zf)

		const lerp = (a: number, b: number, t: number) => a + (b - a) * t

		const x1 = lerp(
			gradientDot(p[AA] as number, xf, yf, zf),
			gradientDot(p[BA] as number, xf - 1, yf, zf),
			u,
		)
		const x2 = lerp(
			gradientDot(p[AB] as number, xf, yf - 1, zf),
			gradientDot(p[BB] as number, xf - 1, yf - 1, zf),
			u,
		)
		const x3 = lerp(
			gradientDot(p[AA + 1] as number, xf, yf, zf - 1),
			gradientDot(p[BA + 1] as number, xf - 1, yf, zf - 1),
			u,
		)
		const x4 = lerp(
			gradientDot(p[AB + 1] as number, xf, yf - 1, zf - 1),
			gradientDot(p[BB + 1] as number, xf - 1, yf - 1, zf - 1),
			u,
		)
		return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w)
	}
}

/** Fractal Brownian motion built from a base noise function. */
export function fbm3(
	noise: Noise3D,
	x: number,
	y: number,
	z: number,
	octaves = 4,
	lacunarity = 2,
	gain = 0.5,
): number {
	let amplitude = 1
	let frequency = 1
	let sum = 0
	let normalization = 0
	for (let i = 0; i < octaves; i++) {
		sum += noise(x * frequency, y * frequency, z * frequency) * amplitude
		normalization += amplitude
		amplitude *= gain
		frequency *= lacunarity
	}
	return sum / normalization
}
