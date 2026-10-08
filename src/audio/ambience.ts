import { AIR_STONE } from "@/config/scape"
import { TANK } from "@/config/tank"
import { createNoiseBuffer } from "./reverb"

export interface Ambience {
	start(): void
	stop(fadeSeconds: number): void
	setDaylight(daylight: number): void
}

/** Stereo position of the air stone (-1 left … 1 right). */
const AIR_STONE_PAN = (AIR_STONE[0] / (TANK.width / 2)) * 0.8

/**
 * The sound of a quiet aquarium: a soft bed of moving water, the trickle of
 * the filter, a barely-there room tone, and the air stone's bubbles at
 * irregular, natural intervals.
 */
export function createAmbience(context: AudioContext, destination: AudioNode): Ambience {
	const noise = createNoiseBuffer(context, 6)
	const output = context.createGain()
	output.gain.value = 0
	output.connect(destination)

	let sources: AudioScheduledSourceNode[] = []
	let bubbleTimer: number | null = null
	let running = false
	let activity = 1

	const startWater = () => {
		// Low, slow water movement.
		const bed = context.createBufferSource()
		bed.buffer = noise
		bed.loop = true
		const bedFilter = context.createBiquadFilter()
		bedFilter.type = "lowpass"
		bedFilter.frequency.value = 520
		bedFilter.Q.value = 0.4
		const bedGain = context.createGain()
		bedGain.gain.value = 0.32
		// A slow LFO opens and closes the filter like a breath.
		const lfo = context.createOscillator()
		lfo.frequency.value = 0.07
		const lfoDepth = context.createGain()
		lfoDepth.gain.value = 180
		lfo.connect(lfoDepth).connect(bedFilter.frequency)
		bed.connect(bedFilter).connect(bedGain).connect(output)

		// The filter outflow: a quiet, brighter trickle with irregular movement.
		const trickle = context.createBufferSource()
		trickle.buffer = noise
		trickle.loop = true
		trickle.playbackRate.value = 1.37
		const trickleFilter = context.createBiquadFilter()
		trickleFilter.type = "bandpass"
		trickleFilter.frequency.value = 2400
		trickleFilter.Q.value = 0.9
		const trickleGain = context.createGain()
		trickleGain.gain.value = 0.035
		const trickleLfo = context.createOscillator()
		trickleLfo.type = "triangle"
		trickleLfo.frequency.value = 0.23
		const trickleDepth = context.createGain()
		trickleDepth.gain.value = 0.02
		trickleLfo.connect(trickleDepth).connect(trickleGain.gain)
		const pan = context.createStereoPanner()
		pan.pan.value = 0.6
		trickle.connect(trickleFilter).connect(trickleGain).connect(pan).connect(output)

		// Room tone: the faintest low hum of a filter motor.
		const hum = context.createOscillator()
		hum.frequency.value = 49
		const humGain = context.createGain()
		humGain.gain.value = 0.006
		hum.connect(humGain).connect(output)

		sources = [bed, lfo, trickle, trickleLfo, hum]
		const offset = Math.random() * 5
		for (const source of sources) {
			if (source instanceof AudioBufferSourceNode) source.start(0, offset)
			else source.start()
		}
	}

	const bubble = () => {
		const now = context.currentTime
		const osc = context.createOscillator()
		const gain = context.createGain()
		const filter = context.createBiquadFilter()
		const pan = context.createStereoPanner()
		// A bubble's pitch rises quickly as it forms and detaches.
		const base = 520 + Math.random() * 900
		osc.type = "sine"
		osc.frequency.setValueAtTime(base, now)
		osc.frequency.exponentialRampToValueAtTime(base * (1.6 + Math.random() * 0.8), now + 0.05)
		filter.type = "lowpass"
		filter.frequency.value = 2600
		const level = 0.018 + Math.random() * 0.02
		gain.gain.setValueAtTime(0, now)
		gain.gain.linearRampToValueAtTime(level, now + 0.004)
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.05)
		pan.pan.value = Math.max(-1, Math.min(1, AIR_STONE_PAN + (Math.random() - 0.5) * 0.2))
		osc.connect(filter).connect(gain).connect(pan).connect(output)
		osc.start(now)
		osc.stop(now + 0.15)
	}

	const scheduleBubbles = () => {
		if (!running) return
		// Bursts of a few bubbles separated by irregular pauses — a Poisson-like rhythm.
		const burst = 1 + Math.floor(Math.random() * 4)
		for (let i = 0; i < burst; i++) window.setTimeout(bubble, i * (40 + Math.random() * 90))
		const pause = (-Math.log(1 - Math.random()) * 900 + 250) / Math.max(0.35, activity)
		bubbleTimer = window.setTimeout(scheduleBubbles, pause)
	}

	return {
		start() {
			if (running) return
			running = true
			startWater()
			const now = context.currentTime
			output.gain.cancelScheduledValues(now)
			output.gain.setValueAtTime(output.gain.value, now)
			output.gain.linearRampToValueAtTime(1, now + 2.5)
			scheduleBubbles()
		},
		stop(fadeSeconds: number) {
			if (!running) return
			running = false
			if (bubbleTimer !== null) window.clearTimeout(bubbleTimer)
			const now = context.currentTime
			output.gain.cancelScheduledValues(now)
			output.gain.setValueAtTime(output.gain.value, now)
			output.gain.linearRampToValueAtTime(0, now + fadeSeconds)
			const stopping = sources
			sources = []
			for (const source of stopping) source.stop(now + fadeSeconds + 0.05)
		},
		setDaylight(daylight: number) {
			activity = 0.5 + daylight * 0.5
		},
	}
}
