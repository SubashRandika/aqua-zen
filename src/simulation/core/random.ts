import { clamp } from "./math"

/** A source of uniformly distributed numbers in [0, 1). */
export type RandomSource = () => number

/** Mulberry32 — a tiny, fast, seedable PRNG with good statistical quality for simulation use. */
export function createRandom(seed: number): RandomSource {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Hashes a string into a 32-bit seed so configuration ids can drive deterministic generation. */
export function hashString(value: string): number {
	let hash = 2166136261
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

export function randomRange(random: RandomSource, min: number, max: number): number {
	return min + (max - min) * random()
}

export function randomInt(random: RandomSource, min: number, maxInclusive: number): number {
	return Math.floor(randomRange(random, min, maxInclusive + 1))
}

export function randomSign(random: RandomSource): number {
	return random() < 0.5 ? -1 : 1
}

export function pick<T>(random: RandomSource, items: readonly T[]): T {
	if (items.length === 0) throw new Error("Cannot pick from an empty list")
	return items[Math.floor(random() * items.length)] as T
}

/** Standard normal sample via Box–Muller. */
export function gaussian(random: RandomSource): number {
	let u = 0
	while (u === 0) u = random()
	const v = random()
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Normal sample with the given mean and deviation, clamped to [min, max]. */
export function truncatedGaussian(
	random: RandomSource,
	mean: number,
	deviation: number,
	min: number,
	max: number,
): number {
	return clamp(mean + gaussian(random) * deviation, min, max)
}

/** Exponentially distributed interval — the waiting time of a Poisson process. */
export function exponential(random: RandomSource, mean: number): number {
	return -Math.log(1 - random()) * mean
}

/** Chooses an index with probability proportional to its weight. Returns -1 when all weights are 0. */
export function weightedIndex(random: RandomSource, weights: readonly number[]): number {
	let total = 0
	for (const weight of weights) total += Math.max(0, weight)
	if (total <= 0) return -1
	let threshold = random() * total
	for (let i = 0; i < weights.length; i++) {
		threshold -= Math.max(0, weights[i] as number)
		if (threshold <= 0) return i
	}
	return weights.length - 1
}
