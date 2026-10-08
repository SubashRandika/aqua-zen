export interface Music {
	start(): void
	stop(): void
	setDaylight(daylight: number): void
}

/** MIDI note to frequency. */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/**
 * Chords from D major in open voicings that drift between neighbours
 * without resolving, so the music never pulls attention.
 */
const CHORDS: readonly (readonly number[])[] = [
	[50, 57, 62, 66, 69], // D major
	[55, 62, 66, 69, 74], // G major 7 (add 9)
	[47, 54, 59, 62, 66], // B minor
	[52, 59, 64, 66, 71], // E minor (add 9)
	[45, 52, 57, 61, 64], // A major
]
/** D major pentatonic, for sparse bell-like notes. */
const BELL_NOTES = [74, 76, 78, 81, 83, 86, 88]

/**
 * Generative ambient music: slow pads that change every 10–16 seconds,
 * with occasional soft bell notes. Nothing loops, so nothing repeats.
 */
export function createMusic(context: AudioContext, destination: AudioNode): Music {
	const output = context.createGain()
	output.gain.value = 0
	const tone = context.createBiquadFilter()
	tone.type = "lowpass"
	tone.frequency.value = 1400
	tone.Q.value = 0.3
	output.connect(tone).connect(destination)

	let running = false
	let chordTimer: number | null = null
	let bellTimer: number | null = null
	let chordIndex = Math.floor(Math.random() * CHORDS.length)
	let brightness = 1

	const pad = (chord: readonly number[], duration: number) => {
		const now = context.currentTime
		const attack = 3.5
		const release = 5
		for (const note of chord) {
			if (Math.random() < 0.2) continue // leave space: not every chord tone sounds
			for (const detune of [-5, 6]) {
				const osc = context.createOscillator()
				osc.type = "triangle"
				osc.frequency.value = hz(note)
				osc.detune.value = detune + (Math.random() - 0.5) * 4
				const gain = context.createGain()
				const level = (note < 52 ? 0.05 : 0.028) * (0.8 + Math.random() * 0.4)
				gain.gain.setValueAtTime(0, now)
				gain.gain.linearRampToValueAtTime(level, now + attack)
				gain.gain.setValueAtTime(level, now + duration)
				gain.gain.linearRampToValueAtTime(0, now + duration + release)
				osc.connect(gain).connect(output)
				osc.start(now)
				osc.stop(now + duration + release + 0.1)
			}
		}
	}

	const bell = () => {
		const now = context.currentTime
		const note = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)]!
		// Two partials with an inharmonic ratio give a soft, glassy bell.
		for (const [ratio, level, decay] of [
			[1, 0.03, 3.2],
			[2.76, 0.008, 1.4],
		] as const) {
			const osc = context.createOscillator()
			osc.type = "sine"
			osc.frequency.value = hz(note) * ratio
			const gain = context.createGain()
			gain.gain.setValueAtTime(0, now)
			gain.gain.linearRampToValueAtTime(level * brightness, now + 0.02)
			gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
			osc.connect(gain).connect(output)
			osc.start(now)
			osc.stop(now + decay + 0.1)
		}
	}

	const nextChord = () => {
		if (!running) return
		// Move to a neighbouring chord most of the time; jump occasionally.
		const step = Math.random() < 0.75 ? (Math.random() < 0.5 ? 1 : -1) : 2
		chordIndex = (chordIndex + step + CHORDS.length) % CHORDS.length
		const duration = 10 + Math.random() * 6
		pad(CHORDS[chordIndex]!, duration)
		chordTimer = window.setTimeout(nextChord, (duration + 1.5) * 1000)
	}

	const nextBell = () => {
		if (!running) return
		if (Math.random() < 0.7) bell()
		bellTimer = window.setTimeout(
			nextBell,
			((3 + Math.random() * 8) * 1000) / Math.max(0.5, brightness),
		)
	}

	return {
		start() {
			if (running) return
			running = true
			const now = context.currentTime
			output.gain.cancelScheduledValues(now)
			output.gain.setValueAtTime(output.gain.value, now)
			output.gain.linearRampToValueAtTime(1, now + 4)
			nextChord()
			bellTimer = window.setTimeout(nextBell, 4000)
		},
		stop() {
			if (!running) return
			running = false
			if (chordTimer !== null) window.clearTimeout(chordTimer)
			if (bellTimer !== null) window.clearTimeout(bellTimer)
			const now = context.currentTime
			output.gain.cancelScheduledValues(now)
			output.gain.setValueAtTime(output.gain.value, now)
			output.gain.linearRampToValueAtTime(0, now + 3)
		},
		setDaylight(daylight: number) {
			// Darker, sparser music at night.
			brightness = 0.6 + daylight * 0.4
			tone.frequency.setTargetAtTime(700 + daylight * 900, context.currentTime, 4)
		},
	}
}
