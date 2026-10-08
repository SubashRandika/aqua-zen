import { createAmbience, type Ambience } from "./ambience"
import { createMusic, type Music } from "./music"
import { createImpulseResponse } from "./reverb"
import { createSoundEffects, type SoundEffects } from "./effects"

export type AudioEngineState = "idle" | "running" | "suspended" | "unavailable"

/** Overall loudness at volume 1 — the experience should never be loud. */
const MASTER_LEVEL = 0.7
const FADE_SECONDS = 1.8

/**
 * All of AquaZen's sound, synthesised with the Web Audio API — no audio
 * files. The context is only created after a user gesture, respecting
 * browser autoplay policies, and everything fades in and out gently.
 */
export class AudioEngine {
	private context: AudioContext | null = null
	private master: GainNode | null = null
	private soundBus: GainNode | null = null
	private musicBus: GainNode | null = null
	private ambience: Ambience | null = null
	private music: Music | null = null
	private effects: SoundEffects | null = null
	private volume = 0.6
	private soundEnabled = false
	private musicEnabled = false
	state: AudioEngineState = "idle"

	/** Creates (or resumes) the audio context. Must be called from a user gesture. */
	async unlock(): Promise<AudioEngineState> {
		if (this.state === "unavailable") return this.state
		try {
			if (!this.context) this.build()
			if (this.context && this.context.state !== "running") await this.context.resume()
			this.state = this.context?.state === "running" ? "running" : "suspended"
		} catch {
			this.state = "unavailable"
		}
		return this.state
	}

	private build(): void {
		const AudioContextClass =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
		if (!AudioContextClass) {
			this.state = "unavailable"
			return
		}
		const context = new AudioContextClass({ latencyHint: "playback" })
		const master = context.createGain()
		master.gain.value = 0
		// A gentle limiter keeps overlapping sounds from ever getting harsh.
		const limiter = context.createDynamicsCompressor()
		limiter.threshold.value = -18
		limiter.knee.value = 12
		limiter.ratio.value = 4
		master.connect(limiter).connect(context.destination)

		const reverb = context.createConvolver()
		reverb.buffer = createImpulseResponse(context, 4.2, 2.6)
		const reverbReturn = context.createGain()
		reverbReturn.gain.value = 0.55
		reverb.connect(reverbReturn).connect(master)

		const soundBus = context.createGain()
		soundBus.gain.value = 0
		soundBus.connect(master)
		const musicBus = context.createGain()
		musicBus.gain.value = 0
		musicBus.connect(master)
		musicBus.connect(reverb)

		this.context = context
		this.master = master
		this.soundBus = soundBus
		this.musicBus = musicBus
		this.ambience = createAmbience(context, soundBus)
		this.effects = createSoundEffects(context, soundBus, reverb)
		this.music = createMusic(context, musicBus)
		this.applyLevels()
	}

	private ramp(param: AudioParam | undefined, value: number, seconds = FADE_SECONDS): void {
		if (!param || !this.context) return
		const now = this.context.currentTime
		param.cancelScheduledValues(now)
		param.setValueAtTime(param.value, now)
		param.linearRampToValueAtTime(value, now + seconds)
	}

	private applyLevels(): void {
		this.ramp(this.master?.gain, this.volume * MASTER_LEVEL, 0.4)
		this.ramp(this.soundBus?.gain, this.soundEnabled ? 1 : 0)
		this.ramp(this.musicBus?.gain, this.musicEnabled ? 0.55 : 0, 3)
		if (this.soundEnabled) this.ambience?.start()
		else this.ambience?.stop(FADE_SECONDS)
		if (this.musicEnabled) this.music?.start()
		else this.music?.stop()
	}

	configure(options: { sound: boolean; music: boolean; volume: number }): void {
		this.soundEnabled = options.sound
		this.musicEnabled = options.music
		this.volume = options.volume
		this.applyLevels()
	}

	/** Sets how much the aquarium is "awake" (0 night … 1 day), shaping ambience and music. */
	setDaylight(daylight: number): void {
		this.ambience?.setDaylight(daylight)
		this.music?.setDaylight(daylight)
	}

	playFoodDrop(pan: number): void {
		if (this.soundEnabled) this.effects?.foodDrop(pan)
	}

	playGlassTap(pan: number, strength: number): void {
		if (this.soundEnabled) this.effects?.glassTap(pan, strength)
	}

	/** Pause while the page is hidden to save power; resume when visible. */
	async setPageVisible(visible: boolean): Promise<void> {
		if (!this.context) return
		try {
			if (visible && this.context.state === "suspended" && (this.soundEnabled || this.musicEnabled))
				await this.context.resume()
			if (!visible && this.context.state === "running") await this.context.suspend()
			this.state = this.context.state === "running" ? "running" : "suspended"
		} catch {
			// Ignore: the browser may refuse to resume without a gesture; the next one will.
		}
	}

	dispose(): void {
		this.ambience?.stop(0)
		this.music?.stop()
		void this.context?.close().catch(() => undefined)
		this.context = null
		this.state = "idle"
	}
}
