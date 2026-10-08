export interface SoundEffects {
	foodDrop(pan: number): void
	glassTap(pan: number, strength: number): void
}

/** Small interaction sounds: kept soft and short so they never startle the listener. */
export function createSoundEffects(
	context: AudioContext,
	destination: AudioNode,
	reverb: AudioNode,
): SoundEffects {
	const panner = (pan: number) => {
		const node = context.createStereoPanner()
		node.pan.value = Math.max(-1, Math.min(1, pan))
		node.connect(destination)
		const send = context.createGain()
		send.gain.value = 0.25
		node.connect(send).connect(reverb)
		return node
	}

	return {
		/** A tiny "plip" as flakes touch the surface. */
		foodDrop(pan: number) {
			const now = context.currentTime
			const out = panner(pan)
			for (let i = 0; i < 3; i++) {
				const start = now + i * (0.03 + Math.random() * 0.05)
				const osc = context.createOscillator()
				const gain = context.createGain()
				const base = 1100 + Math.random() * 700
				osc.frequency.setValueAtTime(base, start)
				osc.frequency.exponentialRampToValueAtTime(base * 1.9, start + 0.03)
				gain.gain.setValueAtTime(0, start)
				gain.gain.linearRampToValueAtTime(0.02, start + 0.003)
				gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07)
				osc.connect(gain).connect(out)
				osc.start(start)
				osc.stop(start + 0.1)
			}
		},
		/** A muted knock on thick glass: a low thump with a little glassy ring. */
		glassTap(pan: number, strength: number) {
			const now = context.currentTime
			const out = panner(pan)
			const level = 0.05 * Math.max(0.3, strength)
			const thump = context.createOscillator()
			const thumpGain = context.createGain()
			thump.frequency.setValueAtTime(190, now)
			thump.frequency.exponentialRampToValueAtTime(110, now + 0.08)
			thumpGain.gain.setValueAtTime(level, now)
			thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
			thump.connect(thumpGain).connect(out)
			thump.start(now)
			thump.stop(now + 0.15)

			const ring = context.createOscillator()
			const ringGain = context.createGain()
			ring.frequency.value = 1740 + Math.random() * 120
			ringGain.gain.setValueAtTime(level * 0.12, now)
			ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
			ring.connect(ringGain).connect(out)
			ring.start(now)
			ring.stop(now + 0.3)
		},
	}
}
