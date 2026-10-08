/**
 * A synthetic room impulse response: decaying stereo noise, darkened over
 * time as real rooms absorb high frequencies first.
 */
export function createImpulseResponse(
	context: BaseAudioContext,
	seconds: number,
	decay: number,
): AudioBuffer {
	const length = Math.floor(context.sampleRate * seconds)
	const buffer = context.createBuffer(2, length, context.sampleRate)
	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel)
		let smoothed = 0
		for (let i = 0; i < length; i++) {
			const t = i / length
			const envelope = (1 - t) ** decay
			// One-pole low-pass whose cutoff falls as the tail decays.
			const darkness = 0.15 + t * 0.8
			smoothed += (Math.random() * 2 - 1 - smoothed) * (1 - darkness)
			data[i] = smoothed * envelope
		}
	}
	return buffer
}

/** A looping buffer of pink-ish noise, used as raw material for water sounds. */
export function createNoiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
	const length = Math.floor(context.sampleRate * seconds)
	const buffer = context.createBuffer(2, length, context.sampleRate)
	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel)
		// Paul Kellet's economical pink noise filter.
		let b0 = 0
		let b1 = 0
		let b2 = 0
		for (let i = 0; i < length; i++) {
			const white = Math.random() * 2 - 1
			b0 = 0.99765 * b0 + white * 0.099046
			b1 = 0.963 * b1 + white * 0.2965164
			b2 = 0.57 * b2 + white * 1.0526913
			data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18
		}
	}
	return buffer
}
