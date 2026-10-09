export type FishState =
	| "wandering"
	| "cruising"
	| "schooling"
	| "seekingFood"
	| "feeding"
	| "avoiding"
	| "startled"
	| "curious"
	| "resting"
	| "territorial"
	| "hiding"
	/** Picking over the substrate, or grazing algae while clinging to a surface. */
	| "foraging"

export interface Range {
	min: number
	max: number
}

/** How a species propels itself. */
export type SwimStyle =
	/** Steady fin-driven swimming (angelfish, gourami, betta). */
	| "continuous"
	/** Short tail kicks followed by glides (tetras, danios, rasboras). */
	| "burstGlide"
	/** Hops along the substrate with pauses (corydoras). */
	| "bottomHop"

export type PatternKind =
	| "countershade"
	| "neon"
	| "harlequin"
	| "zebra"
	| "angelfish"
	| "betta"
	| "guppy"
	| "gourami"
	| "pandaCory"
	| "goldfish"
	| "koi"
	| "pleco"

/** A point on the body outline. `t` runs from the nose (0) to the tail peduncle (1). */
export interface BodyProfilePoint {
	t: number
	/** Height above the centre line, as a fraction of total fish length. */
	top: number
	/** Depth below the centre line, as a fraction of total fish length. */
	bottom: number
	/** Half-width, as a fraction of total fish length. */
	width: number
}

/** `twin` is the split, splayed double tail of fancy goldfish. */
export type CaudalKind = "forked" | "rounded" | "fan" | "veil" | "truncate" | "twin"

export interface FinSpan {
	/** Start and end along the body (0 nose → 1 peduncle). */
	start: number
	end: number
	/** Fin height as a fraction of total length. */
	height: number
	/** How far the fin tip trails backwards, as a fraction of total length. */
	sweep: number
	/** Where along its base the fin is tallest (0 front … 1 back). Defaults to 0.35. */
	peak?: number
}

export interface PairedFin {
	/** Attachment along the body (0 nose → 1 peduncle). */
	t: number
	length: number
	width: number
	/** Long thread-like fins (gourami feelers). */
	filament?: boolean
	/** 0 = held against the flank, 1 = spread flat like a bottom dweller's. */
	splay?: number
}

/** Whiskers around the mouth (corydoras, koi) or the fleshy bristles of a bristlenose pleco. */
export interface BarbelSet {
	/** Number of barbels on each side. */
	pairs: number
	length: number
	/** Attachment height on the snout, as a fraction of total length (negative = below the centre line). */
	y: number
	/** How far each successive pair is set back along the head (0 nose → 1 peduncle). */
	spacing: number
	/** Bristles point up and forward from the top of the snout instead of down from the mouth. */
	bristles?: boolean
}

/** Where the mouth opens: forward, upturned for surface feeders, or underslung for grazers. */
export type MouthPosition = "terminal" | "superior" | "inferior"

export interface FishShapeDefinition {
	/** Fraction of total length taken by the body; the caudal fin fills the rest. */
	bodyLength: number
	profile: readonly BodyProfilePoint[]
	/** Exponent of the superellipse cross-section (2 = ellipse, higher = boxier). */
	crossSection: number
	/** Exponent for the lower half, for flat-bellied bottom dwellers. Defaults to `crossSection`. */
	bellyCrossSection?: number
	/** How much the flanks narrow towards the ridge of the back (0 = not at all). Defaults to 0.3. */
	keel?: number
	mouth?: MouthPosition
	barbels?: BarbelSet
	eye: { t: number; y: number; radius: number }
	caudal: { kind: CaudalKind; spread: number; fork: number }
	dorsal?: FinSpan
	anal?: FinSpan
	pectoral: PairedFin
	pelvic?: PairedFin
	adipose?: { t: number; height: number }
}

export interface FishPatternDefinition {
	kind: PatternKind
	/** Colours as hex strings. */
	back: string
	belly: string
	fin: string
	accent: string
	accent2: string
	finOpacity: number
	/** 0..1 strength of view-dependent shimmer. */
	iridescence: number
	/** 0..1 how silvery (metallic) the flanks are. */
	silver: number
	/** Random hue jitter per individual, in turns (0..1). */
	hueVariation: number
	/** How much colour fades while resting at night (neon tetras famously pale). */
	nightFade: number
	/** Iris colour. */
	iris: string
	/** Scale size as a fraction of total length, and how visible the scales are (0..1). */
	scales: { size: number; contrast: number }
	/**
	 * Number of distinct colour varieties among individuals (koi varieties,
	 * goldfish colourings). Each fish also gets its own placement of markings.
	 */
	varieties?: number
}

export interface FishSpeciesDefinition {
	id: string
	name: string
	scientificName: string
	/** Procedural model identifier (all AquaZen fish are generated from `visual.shape`). */
	model: string
	/** Total length (nose to tail tip) in metres. */
	scale: number
	/** ± fraction of size variation between individuals. */
	sizeVariation: number
	/** Normalised depth band: 0 = substrate, 1 = surface. */
	preferredDepth: Range
	movement: {
		minSpeed: number
		cruiseSpeed: number
		maxSpeed: number
		burstSpeed: number
		/** m/s² */
		acceleration: number
		/** Maximum yaw rate in rad/s at cruising speed. */
		turnRate: number
		swimStyle: SwimStyle
		/** Maximum pitch in radians. */
		maxPitch: number
		tailBeat: {
			/** Tail beats per second when hovering. */
			baseFrequency: number
			/** Additional beats per second per body length per second of speed. */
			frequencyPerBodyLength: number
			amplitude: number
		}
		/** Seconds between kicks for burst-and-glide / hop swimmers. */
		kickInterval?: Range
	}
	behavior: {
		schooling: number
		curiosity: number
		shyness: number
		territoriality: number
		aggressiveness: number
		sociability: number
		energy: number
		/** 0 = strictly diurnal, 1 = strongly nocturnal. */
		nocturnal: number
		/** Spread used when randomising individual personality traits. */
		personalityVariance: number
	}
	schooling: {
		neighborRadius: number
		separationDistance: number
		alignment: number
		cohesion: number
		/** Fish only track this many nearest schoolmates, like real shoaling fish. */
		maxNeighbors: number
	}
	feeding: {
		attractionRadius: number
		/** Bites per second while feeding. */
		feedingSpeed: number
		/** Preference for food in each layer of the water column. */
		zones: { surface: number; midwater: number; bottom: number }
		/** Hunger gained per minute of activity. */
		appetite: number
		/**
		 * Foraging between meals: `peck` picks over the substrate nose-down
		 * (goldfish, koi, corydoras); `cling` grazes algae while holding on to
		 * glass, stone and wood with a sucker mouth (plecos).
		 */
		forage?: { style: "peck" | "cling"; tendency: number }
	}
	population: {
		/** Number of fish at "high" quality. */
		count: number
		/** Never fewer than this, so schooling species still school. */
		minCount: number
	}
	visual: {
		/** Camera distances at which to switch to lower-detail geometry. */
		lodDistances: number[]
		shape: FishShapeDefinition
		pattern: FishPatternDefinition
	}
}

export interface FishPersonality {
	curiosity: number
	energy: number
	sociability: number
	shyness: number
	territoriality: number
	aggressiveness: number
	schoolingStrength: number
	/** Normalised preferred depth (0 = substrate, 1 = surface). */
	preferredDepth: number
	/** Preferred cruising speed in m/s. */
	preferredSpeed: number
	/** Seconds before reacting to new stimuli. */
	reactionTime: number
	/** How restless the fish's wandering is. */
	wanderlust: number
}
