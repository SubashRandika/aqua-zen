export const TAU = Math.PI * 2

export function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value
}

export function clamp01(value: number): number {
	return clamp(value, 0, 1)
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

export function inverseLerp(a: number, b: number, value: number): number {
	if (a === b) return 0
	return (value - a) / (b - a)
}

export function remap(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number,
): number {
	return lerp(outMin, outMax, clamp01(inverseLerp(inMin, inMax, value)))
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01(inverseLerp(edge0, edge1, value))
	return t * t * (3 - 2 * t)
}

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is the decay rate per second; higher values converge faster.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
	return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
	if (Math.abs(target - current) <= maxDelta) return target
	return current + Math.sign(target - current) * maxDelta
}

/** Wraps an angle to the range (-PI, PI]. */
export function wrapAngle(angle: number): number {
	let a = angle % TAU
	if (a <= -Math.PI) a += TAU
	if (a > Math.PI) a -= TAU
	return a
}

/** Positive modulo, e.g. for wrapping clock hours. */
export function mod(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor
}
