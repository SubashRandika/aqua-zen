import { Color, DoubleSide, FrontSide, MeshStandardMaterial } from "three"
import type { FishSpeciesDefinition, MouthPosition, PatternKind } from "@/simulation/fish/types"
import { causticsPatch } from "./causticsPatch"
import { applyShaderPatches, type ShaderPatch } from "./shaderPatch"
import { sharedUniforms } from "./sharedUniforms"

const PATTERN_IDS: Record<PatternKind, number> = {
	countershade: 0,
	neon: 1,
	harlequin: 2,
	zebra: 3,
	angelfish: 4,
	betta: 5,
	guppy: 6,
	gourami: 7,
	pandaCory: 8,
	goldfish: 9,
	koi: 10,
	pleco: 11,
	rummyNose: 12,
	tigerBarb: 13,
	swordtail: 14,
	discus: 15,
	clownLoach: 16,
	otocinclus: 17,
}

/** Height of the mouth within the outline (-1 belly … 1 back), for drawing the lips. */
const MOUTH_V: Record<MouthPosition, number> = {
	terminal: -0.05,
	superior: 0.55,
	inferior: -0.85,
}

/** Radians of travelling-wave phase from nose to tail. */
const WAVE_NUMBER = 5.2

const FISH_VERTEX_HEADER = /* glsl */ `
	attribute vec4 aSwim;   // tail phase, tail amplitude, turn bend, fin phase
	attribute vec4 aLook;   // colour intensity, hue shift, fin flare, speed (0..1)
	attribute vec3 aIdentity; // individual seed, colour variety, presence (fading in or out)
	attribute vec2 aBody;   // along the body (0 nose → 1 peduncle), height in outline (-1 → 1)
	attribute float aRegion;
	attribute float aFlex;
	attribute float aSide;
	uniform float uVeil;
	varying vec3 vFishLocal;
	varying vec3 vFishNormal;
	varying float vRegion;
	varying float vFlex;
	varying vec2 vFinUv;
	varying vec4 vLook;
	varying vec2 vBody;
	varying vec3 vIdentity;

	float azFishWave(float s, float phase, float amplitude, float bend) {
		float envelope = 0.06 + 0.3 * s + 0.85 * s * s;
		return amplitude * envelope * sin(phase - s * ${WAVE_NUMBER.toFixed(2)}) + bend * 0.3 * s * s;
	}
`

const FISH_NORMAL_CODE = /* glsl */ `
	float azS = clamp(0.5 - position.x, 0.0, 1.0);
	float azLateral = azFishWave(azS, aSwim.x, aSwim.y, aSwim.z);
	float azSlope = (azFishWave(azS + 0.01, aSwim.x, aSwim.y, aSwim.z) - azLateral) / 0.01;
	// z' = z + f(x) with dx = -ds, so n'x = nx + f'(s) * nz.
	objectNormal.x += azSlope * objectNormal.z;
	objectNormal = normalize(objectNormal);
	vFishNormal = normal;
`

const FISH_DEFORM_CODE = /* glsl */ `
	vFishLocal = position;
	vRegion = aRegion;
	vFlex = aFlex;
	vFinUv = uv;
	vLook = aLook;
	vBody = aBody;
	vIdentity = aIdentity;
	transformed.z += azLateral;
	float azFlare = aLook.z;
	if (aRegion > 0.5) {
		if (aRegion < 2.5) {
			// Dorsal and anal fins ripple and spread when flaring.
			transformed.z += aFlex * 0.016 * sin(aSwim.w * 0.8 + position.x * 30.0) * (0.5 + aSwim.y * 6.0);
			transformed.y += sign(position.y) * aFlex * azFlare * 0.035;
		} else if (aRegion < 3.5) {
			// Caudal fin lags the body wave; long fins droop when the fish is slow.
			transformed.z += aFlex * aSwim.y * 0.45 * sin(aSwim.x - azS * ${WAVE_NUMBER.toFixed(2)} - 1.1);
			transformed.y -= aFlex * aFlex * uVeil * 0.07 * (1.0 - aLook.w);
			transformed.y *= 1.0 + azFlare * 0.12 * aFlex;
			// Twin tails open and close a little with each beat.
			transformed.z += aSide * aFlex * 0.012 * (0.5 + 0.5 * sin(aSwim.x));
			// The trailing edge ripples on its own.
			transformed.z += aFlex * aFlex * 0.006 * sin(aSwim.w * 1.3 + uv.x * 9.0);
		} else if (aRegion < 4.5) {
			// Pectoral fins scull.
			float flap = sin(aSwim.w + aFlex * 1.2);
			transformed.z += aSide * aFlex * 0.03 * (0.4 + 0.6 * flap);
			transformed.x += aFlex * 0.01 * cos(aSwim.w);
		} else if (aRegion < 5.5) {
			// Pelvic fins and gourami feelers wave slowly.
			transformed.z += aSide * aFlex * 0.012 * sin(aSwim.w * 0.7 + 1.0);
			transformed.y += aFlex * 0.014 * sin(aSwim.w * 0.45 + aFlex * 2.0);
		} else if (aRegion > 6.5) {
			// Barbels sway as the fish feels its way.
			transformed.y += aFlex * aFlex * 0.005 * sin(aSwim.w * 0.6 + aSide);
			transformed.z += aSide * aFlex * 0.004 * sin(aSwim.w * 0.5 + 1.3);
		}
	}
`

const FISH_FRAGMENT_HEADER = /* glsl */ `
	uniform int uPattern;
	uniform vec3 uBack;
	uniform vec3 uBelly;
	uniform vec3 uFin;
	uniform vec3 uAccent;
	uniform vec3 uAccent2;
	uniform vec3 uIris;
	uniform float uIridescence;
	uniform float uSilver;
	uniform float uFinOpacity;
	uniform vec3 uEye;      // x, y, radius in local space
	uniform float uEyeT;
	uniform float uBodyEnd;
	uniform float uMouthV;
	uniform vec2 uScales;   // size, contrast
	uniform float uDaylight;
	varying vec3 vFishLocal;
	varying vec3 vFishNormal;
	varying float vRegion;
	varying float vFlex;
	varying vec2 vFinUv;
	varying vec4 vLook;
	varying vec2 vBody;
	varying vec3 vIdentity;

	vec3 azHueShift(vec3 color, float shift) {
		const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
		const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
		vec3 yiq = toYIQ * color;
		float angle = shift * 6.2831853;
		float c = cos(angle);
		float s = sin(angle);
		yiq.yz = mat2(c, -s, s, c) * yiq.yz;
		return max(toRGB * yiq, 0.0);
	}

	float azBand(float value, float center, float halfWidth, float softness) {
		return 1.0 - smoothstep(halfWidth, halfWidth + softness, abs(value - center));
	}

	float azfHash(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
	}

	float azfNoise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(
			mix(azfHash(i), azfHash(i + vec2(1.0, 0.0)), u.x),
			mix(azfHash(i + vec2(0.0, 1.0)), azfHash(i + vec2(1.0, 1.0)), u.x),
			u.y
		);
	}

	float azfFbm(vec2 p) {
		return 0.55 * azfNoise(p) + 0.3 * azfNoise(p * 2.07 + 7.3) + 0.15 * azfNoise(p * 4.13 + 1.7);
	}

	// Overlapping scales on two staggered lattices. Returns the scale edge
	// (x), a random value per scale (y) and the position from the front of
	// the scale to its free rear edge (z).
	vec3 azfScales(vec2 q) {
		vec2 a = q;
		vec2 b = q + vec2(0.5, 0.5);
		vec2 ca = fract(a) - 0.5;
		vec2 cb = fract(b) - 0.5;
		float da = length(ca * vec2(1.1, 0.95));
		float db = length(cb * vec2(1.1, 0.95));
		bool first = da < db;
		vec2 c = first ? ca : cb;
		vec2 id = first ? floor(a) : floor(b) + 0.5;
		float edge = 1.0 - smoothstep(0.0, 0.06, abs(da - db));
		return vec3(edge, azfHash(id), clamp(c.x + 0.5, 0.0, 1.0));
	}

	// Position along the body (0 nose → 1 peduncle) from local x, for fins.
	float azfAlong(float x) {
		return (0.5 - x) / max(0.5 - uBodyEnd, 0.01);
	}
`

const FISH_FRAGMENT_CODE = /* glsl */ `
	vec3 p = vFishLocal;
	float seed = vIdentity.x;
	float variety = vIdentity.y;
	float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
	float lightLevel = mix(0.12, 1.0, uDaylight);
	vec3 accent = azHueShift(uAccent, vLook.y);
	vec3 accent2 = azHueShift(uAccent2, vLook.y * 0.5);
	vec3 color;
	vec3 glow = vec3(0.0);
	float rough = 0.36;
	float metal = 0.05;
	float alpha = 1.0;
	float presence = vIdentity.z;

	#ifndef FISH_FINS
		// A fish joining or leaving the tank dissolves in and out through a
		// fine, stable dither, so the opaque body needs no sorting.
		if (presence < 0.999) {
			float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
			if (dither >= presence) discard;
		}
	#endif

	#ifdef FISH_FINS
		float along = azfAlong(p.x);
		bool caudal = vRegion > 2.5 && vRegion < 3.5;
		bool median = vRegion > 0.5 && vRegion < 2.5;
		bool barbel = vRegion > 6.5;
		color = azHueShift(uFin, vLook.y);

		// Fin rays: bony struts run from the base to the edge, the membrane
		// between them is thinner and frays slightly at the margin.
		float rayCount = caudal ? 16.0 : median ? 12.0 : 7.0;
		float rayCoord = vFinUv.x * rayCount;
		float between = min(fract(rayCoord), 1.0 - fract(rayCoord)) * 2.0;
		float ray = 1.0 - smoothstep(0.0, 0.32 + vFlex * 0.25, between);
		alpha = uFinOpacity * (mix(1.25, 0.45, smoothstep(0.0, 1.0, vFlex)) + ray * 0.3);
		alpha = max(alpha, (1.0 - smoothstep(0.0, 0.14, vFlex)) * 0.8);
		float fray = vFlex + (1.0 - ray) * 0.07 + azfNoise(vec2(rayCoord * 2.3, seed * 40.0)) * 0.05;
		alpha *= 1.0 - smoothstep(0.93, 1.0, fray);

		if (uPattern == 3 && (caudal || vRegion < 2.5)) {
			// Zebra danio: the stripes run on into the tail and anal fin.
			float stripes = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(p.y * 120.0 + 1.0));
			color = mix(color, accent, stripes * 0.75);
		} else if (uPattern == 4) {
			// Angelfish: the body bars continue through the tall fins.
			float bars = max(azBand(along, 0.42, 0.06, 0.03), azBand(along, 0.74, 0.07, 0.03));
			color = mix(color, accent, bars * 0.85 + smoothstep(0.75, 1.0, vFlex) * 0.3);
			alpha = max(alpha, bars * 0.8);
		} else if (uPattern == 5) {
			// Betta: colour deepens towards the edge, with a paler margin on some.
			color = mix(color, accent, smoothstep(0.3, 1.0, vFlex) * 0.85);
			color = mix(color, vec3(0.85, 0.8, 0.85), smoothstep(0.86, 0.97, vFlex) * step(0.5, fract(seed * 3.7)) * 0.6);
			glow += color * fresnel * uIridescence * 0.25;
		} else if (uPattern == 6 && (caudal || vRegion < 1.5)) {
			// Guppy: every male's tail is its own: spots and a colour wash.
			float spots = smoothstep(0.62, 0.75, azfNoise(vec2(vFinUv.x * 9.0, vFlex * 7.0) + seed * 37.0));
			color = mix(color, accent, smoothstep(0.2, 0.8, vFlex) * 0.6);
			color = mix(color, accent2, spots * 0.85);
			glow += color * fresnel * uIridescence * 0.2;
		} else if (uPattern == 7) {
			// Dwarf gourami: turquoise spots on the fins, a red margin.
			float spots = smoothstep(0.6, 0.7, azfNoise(vec2(vFinUv.x * 12.0, vFlex * 6.0)));
			color = mix(color, accent, spots * 0.7 + smoothstep(0.75, 1.0, vFlex) * 0.4);
		} else if (uPattern == 8 && vRegion > 0.5 && vRegion < 1.5) {
			// Panda corydoras: a black dorsal fin.
			color = mix(color, accent, 0.9);
			alpha = max(alpha, 0.85);
		} else if (uPattern == 9) {
			// Goldfish: some have pale fin edges.
			color = mix(color, uBelly, smoothstep(0.55, 1.0, vFlex) * step(0.45, fract(seed * 5.3)) * 0.7);
		} else if (uPattern == 10) {
			// Koi: pale fins; showa have black at the pectoral base, ogon are gold.
			if (variety > 2.5) {
				color = uAccent2;
				metal = 0.5;
			} else if (variety > 1.5 && vRegion > 3.5 && vRegion < 4.5) {
				color = mix(color, accent, (1.0 - smoothstep(0.2, 0.5, vFlex)) * 0.9);
			}
		} else if (uPattern == 11) {
			// Bristlenose pleco: dark fins with pale spots on the rays.
			float spots = smoothstep(0.7, 0.78, azfNoise(vec2(rayCoord * 1.4, vFlex * 9.0) + seed * 13.0));
			color = mix(color, uBelly, spots * 0.8);
			alpha = max(alpha, 0.75 * (1.0 - vFlex * 0.4));
		} else if (uPattern == 12 && caudal) {
			// Rummy-nose tetra: the black-and-white striped tail.
			float black = max(azBand(vFinUv.x, 0.5, 0.07, 0.03), max(azBand(vFinUv.x, 0.15, 0.06, 0.03), azBand(vFinUv.x, 0.85, 0.06, 0.03)));
			black *= smoothstep(0.02, 0.2, vFlex);
			float white = (1.0 - black) * smoothstep(0.15, 0.5, vFlex);
			color = mix(color, vec3(0.94), white * 0.75);
			color = mix(color, accent2, black);
			alpha = max(alpha, black * 0.85 + white * 0.45);
		} else if (uPattern == 13) {
			// Tiger barb: a black dorsal with a red edge, red pelvic fins, red-tipped tail lobes.
			float edge = smoothstep(0.55, 0.95, vFlex);
			if (vRegion > 0.5 && vRegion < 1.5) {
				color = mix(accent, accent2, edge);
				alpha = max(alpha, 0.85);
			} else if (vRegion > 4.5 && vRegion < 5.5) {
				color = mix(color, accent2, 0.8);
				alpha = max(alpha, 0.7);
			} else if (caudal) {
				color = mix(color, accent2, edge * smoothstep(0.2, 0.45, abs(vFinUv.x - 0.5)) * 0.85);
			}
		} else if (uPattern == 14) {
			// Swordtail: the sword is yellow-orange between black edges; the red form has red fins.
			if (variety > 0.5) color = mix(color, accent, 0.75);
			if (caudal) {
				float sword = 1.0 - smoothstep(0.24, 0.3, vFinUv.x);
				float rim = max(1.0 - smoothstep(0.0, 0.06, vFinUv.x), azBand(vFinUv.x, 0.25, 0.03, 0.025));
				vec3 blade = variety > 0.5 ? accent * 1.1 : vec3(0.95, 0.7, 0.22);
				color = mix(color, mix(blade, accent2, rim), sword * smoothstep(0.05, 0.25, vFlex));
				alpha = max(alpha, sword * 0.9);
			}
		} else if (uPattern == 15 && (median || caudal)) {
			// Discus: the body's turquoise lines run on into the fins, which end in a red-orange margin.
			float lines = smoothstep(0.6, 0.9, 0.5 + 0.5 * sin(p.y * 110.0 + azfNoise(vec2(vFinUv.x * 6.0, seed * 9.0)) * 2.0));
			color = mix(color, accent, lines * 0.55 * (1.0 - smoothstep(0.65, 0.85, vFlex)));
			color = mix(color, accent2, smoothstep(0.75, 0.9, vFlex) * 0.85);
		} else if (uPattern == 16) {
			// Clown loach: dorsal and anal fins black at the base, red beyond; the tail red with a black base.
			if (median) color = mix(accent, color, smoothstep(0.3, 0.55, vFlex));
			else if (caudal) color = mix(accent, color, smoothstep(0.04, 0.18, vFlex));
			alpha = max(alpha, 0.6);
		} else if (uPattern == 17) {
			// Otocinclus: clear fins with dark spots on the rays.
			float spots = smoothstep(0.72, 0.8, azfNoise(vec2(rayCoord * 1.3, vFlex * 8.0) + seed * 11.0));
			color = mix(color, accent, spots * ray * 0.7);
			alpha = max(alpha, spots * ray * 0.6);
		} else if (uPattern == 1 && median) {
			color = mix(color, accent2, (1.0 - vFlex) * 0.25);
		}
		color *= mix(1.0, 0.82, ray);
		if (barbel) {
			color = mix(uBelly, uBack, 0.35);
			alpha = 1.0;
		}
		rough = 0.5;
	#else
		float t = vBody.x;
		float v = vBody.y;
		// Countershading: dark back, pale belly, a brighter flank between.
		float back = smoothstep(0.05, 0.7, v);
		float belly = smoothstep(0.0, -0.65, v);
		color = mix(mix(uBelly, uBack, 0.45), uBack, back);
		color = mix(color, uBelly, belly);
		color *= 0.9 + 0.12 * smoothstep(-0.45, 0.6, vFishNormal.y);
		float flank = 1.0 - abs(v);
		float silver = uSilver * flank;
		metal = mix(0.05, 0.75, silver);
		rough = mix(0.4, 0.22, silver);

		// Behind the gill cover the body is scaled; the head is smooth skin.
		float gillT = uEyeT + 0.11 + 0.035 * (1.0 - v * v);
		float scaled = smoothstep(gillT, gillT + 0.03, t);
		vec2 scaleUv = vec2(-p.x, p.y) / uScales.x;
		vec3 scale = azfScales(scaleUv);
		float resolve = clamp(1.0 - max(fwidth(scaleUv.x), fwidth(scaleUv.y)) * 1.2, 0.0, 1.0);
		float scaleDetail = uScales.y * resolve * scaled;
		// A fine net where scales overlap, each a little darker at its free rear edge.
		color *= 1.0 - scaleDetail * (scale.x * 0.32 + scale.z * scale.z * 0.1);
		// Each scale sits at a slightly different angle, so the flank glitters as the fish turns.
		vec2 tilt = vec2(scale.y, fract(scale.y * 7.13)) - 0.5;
		normal = normalize(normal + vec3(tilt * 0.07 * silver * resolve * scaled, 0.0));
		rough = clamp(rough + (scale.y - 0.5) * 0.1 * scaleDetail, 0.08, 1.0);

		// Gill cover edge, lateral line and lips.
		float gill = azBand(t, gillT, 0.004, 0.008) * (1.0 - smoothstep(0.75, 0.95, abs(v)));
		color *= 1.0 - gill * 0.35;
		float lateralV = 0.22 - 0.18 * t;
		float pores = 0.6 + 0.4 * step(0.5, fract(t * 48.0));
		float lateral = azBand(v, lateralV, 0.015, 0.02) * smoothstep(gillT, gillT + 0.05, t) * smoothstep(1.0, 0.85, t);
		color *= 1.0 - lateral * pores * 0.18 * (0.4 + uScales.y);
		float lips = azBand(v, uMouthV, 0.07, 0.06) * (1.0 - smoothstep(0.012, 0.04, t));
		color *= 1.0 - lips * 0.5;

		if (uPattern == 1) {
			// Neon tetra: an electric stripe from eye to adipose fin, red below it at the rear.
			float stripeV = 0.3 - 0.12 * t;
			float span = smoothstep(uEyeT + 0.02, uEyeT + 0.09, t) * (1.0 - smoothstep(0.82, 0.9, t));
			float stripe = azBand(v, stripeV, 0.1, 0.06) * span;
			float red = smoothstep(stripeV - 0.12, stripeV - 0.22, v) * smoothstep(-0.95, -0.6, v) * smoothstep(0.42, 0.55, t);
			color = mix(color, accent2 * 0.9, red * 0.95);
			vec3 electric = mix(accent, vec3(0.35, 0.3, 1.0), fresnel * 0.6);
			color = mix(color, electric * (0.5 + 0.9 * fresnel), stripe);
			glow += electric * stripe * (0.25 + 0.75 * fresnel) * uIridescence * 0.6;
			glow += accent2 * red * 0.05;
			metal = mix(metal, 0.2, stripe);
		} else if (uPattern == 2) {
			// Harlequin rasbora: the black "pork chop" wedge tapering to the tail.
			float wedgeT = smoothstep(0.4, 0.46, t + 0.06 * v);
			float top = mix(0.72, 0.08, smoothstep(0.42, 1.0, t));
			float bottom = mix(-0.62, -0.06, smoothstep(0.42, 1.0, t) * smoothstep(0.42, 1.0, t));
			float wedge = wedgeT * smoothstep(top + 0.05, top - 0.05, v) * smoothstep(bottom - 0.05, bottom + 0.05, v);
			color = mix(color, accent2, smoothstep(0.55, 0.85, v) * (1.0 - wedge) * 0.35);
			color = mix(color, accent, wedge * 0.95);
			metal = mix(metal, 0.05, wedge);
		} else if (uPattern == 3) {
			// Zebra danio: blue stripes between gold lines, converging towards the tail.
			float wobble = (azfNoise(vec2(t * 6.0, seed * 20.0)) - 0.5) * 0.12;
			float stripes = smoothstep(0.2, 0.55, sin((v + 0.08 + wobble) * 3.14159 * 4.3));
			float span = smoothstep(gillT, gillT + 0.06, t) * azBand(v, -0.05, 0.62, 0.15);
			color = mix(mix(color, accent2, 0.45 * span), accent, stripes * span * 0.9);
			glow += accent * stripes * span * fresnel * uIridescence * 0.25;
		} else if (uPattern == 4) {
			// Angelfish: dark bars through the eye, mid-body and tail base, faintly wavy.
			float wave = (azfNoise(vec2(v * 3.0, seed * 10.0)) - 0.5) * 0.04;
			float bars = max(azBand(t + wave, uEyeT, 0.035, 0.02), azBand(t + wave, 0.42, 0.06, 0.03));
			bars = max(bars, azBand(t + wave, 0.74, 0.065, 0.03));
			bars = max(bars, azBand(t, 0.95, 0.025, 0.02) * 0.6);
			color = mix(color, accent, bars * 0.88);
			color = mix(color, accent2, smoothstep(0.55, 0.85, v) * smoothstep(0.35, 0.1, t) * 0.5 * (1.0 - bars));
			metal = mix(metal, 0.1, bars);
		} else if (uPattern == 5) {
			// Betta: deep colour, with iridescent scales and a red wash below.
			color = mix(color, accent, smoothstep(0.0, -0.6, v) * 0.35);
			glow += mix(color, vec3(0.4, 0.7, 1.0), 0.35) * fresnel * uIridescence * (0.3 + scale.y * 0.4) * scaled;
		} else if (uPattern == 6) {
			// Guppy: irregular iridescent patches towards the tail.
			float n = azfFbm(vec2(t * 7.0, v * 3.0) + seed * 23.0);
			float rear = smoothstep(0.35, 0.65, t);
			float patches = smoothstep(0.55, 0.65, n) * rear;
			float dark = smoothstep(0.72, 0.8, azfNoise(vec2(t * 11.0, v * 5.0) + seed * 51.0)) * rear;
			color = mix(color, accent, patches * 0.8);
			color = mix(color, accent2, dark * 0.7);
			glow += accent * patches * fresnel * uIridescence * 0.4;
		} else if (uPattern == 7) {
			// Dwarf gourami: slanted turquoise bars on red-orange, never quite regular.
			float warp = azfNoise(vec2(t * 5.0, v * 2.5) + seed * 9.0) * 1.6;
			float bars = smoothstep(0.35, 0.65, sin((t * 10.5 - v * 1.3) * 3.14159 + warp));
			float span = smoothstep(gillT - 0.02, gillT + 0.04, t) * (1.0 - smoothstep(0.9, 1.0, t));
			color = mix(color, accent, bars * span * 0.8);
			color = mix(color, accent, smoothstep(-0.2, -0.65, v) * smoothstep(0.42, 0.15, t) * 0.75);
			glow += accent * bars * span * fresnel * uIridescence * 0.3;
		} else if (uPattern == 8) {
			// Panda corydoras: dark eye patch, tail spot and the seams of the armour plates.
			float mask = azBand(t, uEyeT, 0.05, 0.015) * smoothstep(-0.55, -0.25, v);
			float spot = 1.0 - smoothstep(0.07, 0.11, length(vec2((t - 0.9) * 1.6, v - 0.1)));
			color = mix(color, accent2, smoothstep(0.0, -0.7, v) * 0.25);
			color = mix(color, accent, max(mask, spot) * 0.92);
			float plates = azBand(fract(t * 22.0), 0.0, 0.05, 0.05) + azBand(fract(t * 22.0), 1.0, 0.05, 0.05);
			float seam = azBand(v, 0.02, 0.025, 0.03);
			color *= 1.0 - (plates * 0.12 + seam * 0.15) * scaled;
		} else if (uPattern == 9) {
			// Goldfish: deep orange back, golden flanks; some red-and-white, some lemon.
			color = mix(color, uAccent, smoothstep(0.1, 0.8, v) * 0.5);
			if (variety > 0.5 && variety < 1.5) {
				float white = smoothstep(0.5, 0.6, azfFbm(vec2(t * 3.5, v * 2.0) + seed * 17.0));
				color = mix(color, vec3(0.92, 0.88, 0.8), white);
			} else if (variety > 1.5 && variety < 2.5) {
				color = mix(color, accent2, 0.7);
			}
			metal = mix(metal, 0.3, flank);
			rough = mix(rough, 0.25, flank);
		} else if (uPattern == 10) {
			// Koi: every fish's markings are its own.
			vec2 q = vec2(t * 4.2, v * 2.1) + seed * 31.0;
			float hi = smoothstep(0.5, 0.56, azfFbm(q)) * smoothstep(-0.45, -0.1, v);
			float sumi = smoothstep(0.7, 0.74, azfFbm(q * 1.9 + 5.0)) * smoothstep(-0.2, 0.2, v);
			vec3 white = vec3(0.93, 0.91, 0.86);
			if (variety < 0.5) {
				// Kohaku: red on white.
				color = mix(white, uAccent, hi);
			} else if (variety < 1.5) {
				// Taisho sanke: red on white with small black spots.
				color = mix(mix(white, uAccent, hi), uBack, sumi * 0.95);
			} else if (variety < 2.5) {
				// Showa: black with red and white.
				float black = smoothstep(0.42, 0.5, azfFbm(q * 1.3 + 9.0)) * smoothstep(-0.7, -0.2, v);
				color = mix(mix(white, uAccent, hi), uBack, black);
			} else {
				// Ogon: plain metallic gold.
				color = mix(uAccent2, uAccent2 * 1.15, back);
				metal = 0.7;
				rough = 0.25;
			}
			color = mix(color, white, belly * (variety > 2.5 ? 0.2 : 0.6));
		} else if (uPattern == 11) {
			// Bristlenose pleco: dark mottled armour scattered with pale spots.
			float mottle = azfFbm(vec2(t * 9.0, v * 4.0) + seed * 7.0);
			color *= 0.75 + 0.5 * mottle;
			float spots = smoothstep(0.74, 0.8, azfNoise(vec2(-p.x, p.y) * 90.0 + seed * 19.0));
			color = mix(color, uBelly * 1.25, spots * 0.7 * (1.0 - belly * 0.6));
			// The underside is paler but still mottled grey.
			color = mix(color, uBelly * (0.7 + 0.5 * mottle), belly * 0.7);
			float plates = azBand(fract(t * 18.0), 0.0, 0.06, 0.06) + azBand(fract(t * 18.0), 1.0, 0.06, 0.06);
			color *= 1.0 - plates * 0.1 * scaled;
			// The sucker-mouth disc under the snout: a pale fleshy rim around a dark mouth.
			float discR = length(vec2(t * 7.0, (abs(p.z) / 0.05)));
			float underside = smoothstep(-0.35, -0.75, v);
			color = mix(color, vec3(0.62, 0.56, 0.48), azBand(discR, 0.55, 0.18, 0.12) * underside);
			color = mix(color, vec3(0.08, 0.06, 0.05), (1.0 - smoothstep(0.2, 0.35, discR)) * underside);
			rough = 0.55;
		} else if (uPattern == 12) {
			// Rummy-nose tetra: a blood-red head on a silvery body.
			float edge = (azfNoise(vec2(v * 3.0, seed * 11.0)) - 0.5) * 0.05;
			float head = 1.0 - smoothstep(gillT - 0.03, gillT + 0.07, t + edge);
			color = mix(color, accent * (0.8 + 0.35 * fresnel), head * 0.9);
			glow += accent * head * fresnel * 0.08;
			metal = mix(metal, 0.12, head);
			// A dark spot at the tail base, where the tail stripes begin.
			float base = azBand(t, 0.97, 0.03, 0.02) * azBand(v, 0.0, 0.22, 0.12);
			color = mix(color, accent2, base * 0.7);
		} else if (uPattern == 13) {
			// Tiger barb: four black bands over gold, and a red snout.
			float s = t + v * 0.025 + (azfNoise(vec2(v * 2.5, seed * 13.0)) - 0.5) * 0.025;
			float bands = azBand(s, uEyeT, 0.028, 0.012);
			bands = max(bands, azBand(s, 0.34, 0.045, 0.015));
			bands = max(bands, azBand(s, 0.63, 0.045, 0.015) * smoothstep(-0.95, -0.7, v));
			bands = max(bands, azBand(t, 0.95, 0.028, 0.015) * azBand(v, 0.0, 0.55, 0.2));
			color = mix(color, accent, bands * 0.92);
			float snout = (1.0 - smoothstep(0.015, 0.06, t)) * smoothstep(-0.7, 0.0, v);
			color = mix(color, accent2, snout * 0.75);
			// The bands carry a faint green sheen.
			glow += vec3(0.05, 0.12, 0.08) * bands * fresnel * uIridescence;
			metal = mix(metal, 0.05, bands);
		} else if (uPattern == 14) {
			// Swordtail: wild green with a red zigzag along the flank, or the red form.
			float zig = (abs(fract(t * 6.0 + seed) - 0.5) - 0.25) * 0.1;
			float stripeV = 0.06 - 0.06 * t + zig;
			float stripe = azBand(v, stripeV, 0.05, 0.035) * smoothstep(0.02, 0.1, t) * (1.0 - smoothstep(0.92, 1.0, t));
			if (variety > 0.5) {
				color = mix(accent * 0.7, accent * 1.08, smoothstep(0.7, -0.3, v));
				color = mix(color, mix(accent, uBelly, 0.5), belly * 0.6);
				color = mix(color, accent * 0.55, stripe * 0.5);
			} else {
				color = mix(color, accent, stripe * 0.9);
				glow += vec3(0.2, 0.5, 0.4) * flank * fresnel * uIridescence * 0.25;
			}
		} else if (uPattern == 15) {
			// Discus: fine turquoise lines wandering across red-brown, level rather than
			// following the round outline, and broken up towards the middle of the flank.
			float warp = (azfFbm(vec2(t * 3.0, p.y * 9.0) + seed * 17.0) - 0.5) * 0.05;
			float wave = (p.y + warp + 0.008 * sin(t * 15.0 + seed * 5.0)) * 110.0;
			float lines = smoothstep(0.6, 0.9, 0.5 + 0.5 * sin(wave));
			float coverage = mix(0.3, 1.0, smoothstep(0.2, 0.75, abs(v))) * smoothstep(0.03, 0.12, t);
			coverage *= smoothstep(0.28, 0.55, azfFbm(vec2(t * 5.0, p.y * 16.0) + seed * 3.0));
			vec3 turquoise = mix(accent, vec3(0.5, 0.72, 0.68), 0.3);
			color = mix(color, turquoise * (0.7 + 0.4 * fresnel), lines * coverage * 0.8);
			// Nine faint bars, which darken when the fish is uneasy.
			float bars = smoothstep(0.82, 0.98, 0.5 + 0.5 * cos(t * 6.2831853 * 8.0 - 1.0));
			color *= 1.0 - bars * 0.12;
			float eyeBar = azBand(t, uEyeT, 0.028, 0.02);
			color = mix(color, color * 0.3, eyeBar * 0.75);
			glow += accent * lines * fresnel * uIridescence * 0.3;
			metal = mix(metal, 0.2, lines);
		} else if (uPattern == 16) {
			// Clown loach: three broad black bands on orange, yellower towards the belly.
			float curve = v * v * 0.03;
			float bands = azBand(t - curve, uEyeT + 0.005, 0.04, 0.012);
			bands = max(bands, azBand(t + curve, 0.37, 0.07, 0.015));
			bands = max(bands, azBand(t + curve * 1.5, 0.78, 0.085, 0.015) * smoothstep(-1.0, -0.7, v));
			color = mix(color, accent, bands * 0.95);
			metal = mix(metal, 0.02, bands);
			rough = mix(rough, 0.5, bands);
		} else if (uPattern == 17) {
			// Otocinclus: a dark stripe from snout to tail over sandy, mottled armour.
			float mottle = azfFbm(vec2(t * 10.0, v * 4.0) + seed * 5.0);
			color = mix(color, uAccent2, smoothstep(0.45, 0.7, mottle) * smoothstep(0.2, 0.6, v) * 0.6);
			float stripeV = 0.1 - 0.08 * t;
			float stripe = azBand(v, stripeV, 0.13, 0.06) * smoothstep(0.0, 0.05, t);
			float spot = 1.0 - smoothstep(0.05, 0.08, length(vec2((t - 0.97) * 1.4, v - stripeV)));
			color = mix(color, accent, max(stripe, spot) * 0.85);
			color = mix(color, uBelly, belly * 0.6);
			float plates = azBand(fract(t * 20.0), 0.0, 0.05, 0.05) + azBand(fract(t * 20.0), 1.0, 0.05, 0.05);
			color *= 1.0 - plates * 0.1 * scaled;
			rough = 0.5;
		} else {
			// Black molly: velvety black with a faint blue-green sheen.
			glow += accent * fresnel * uIridescence * 0.15;
			rough = 0.42;
		}

		// Eye: a dark pupil filling most of it, a coloured iris and a glossy cornea.
		float sideFacing = smoothstep(0.3, 0.6, abs(vFishNormal.z));
		vec2 toEye = vec2(p.x - uEye.x, p.y - uEye.y);
		float eyeR = length(toEye) / uEye.z;
		float socket = (1.0 - smoothstep(1.0, 1.35, eyeR)) * sideFacing;
		float iris = (1.0 - smoothstep(0.9, 1.0, eyeR)) * sideFacing;
		float pupil = (1.0 - smoothstep(0.56, 0.64, length(toEye - vec2(uEye.z * 0.06, 0.0)) / uEye.z)) * sideFacing;
		float striation = 0.75 + 0.35 * azfNoise(vec2(atan(toEye.y, toEye.x) * 6.0, eyeR * 3.0));
		color *= 1.0 - socket * 0.25;
		color = mix(color, uIris * striation * mix(0.7, 1.1, smoothstep(0.6, 0.95, eyeR)), iris);
		color = mix(color, vec3(0.006), pupil);
		rough = mix(rough, 0.05, iris);
		metal = mix(metal, 0.25, iris - pupil);
	#endif

	// Colour fades in many fish while they rest at night.
	float luminance = dot(color, vec3(0.299, 0.587, 0.114));
	color = mix(vec3(luminance) * 0.8, color, vLook.x);
	glow *= vLook.x * lightLevel;

	diffuseColor.rgb = color;
	diffuseColor.a = alpha * presence;
	roughnessFactor = rough;
	metalnessFactor = metal;
	totalEmissiveRadiance += glow;
`

function fishPatch(species: FishSpeciesDefinition, fins: boolean): ShaderPatch {
	const pattern = species.visual.pattern
	const shape = species.visual.shape
	const veil = shape.caudal.kind === "veil" || shape.caudal.kind === "fan" ? 1 : 0
	return {
		key: `fish:${fins ? "fins" : "body"}`,
		uniforms: {
			uVeil: { value: veil },
			uPattern: { value: PATTERN_IDS[pattern.kind] },
			uBack: { value: new Color(pattern.back) },
			uBelly: { value: new Color(pattern.belly) },
			uFin: { value: new Color(pattern.fin) },
			uAccent: { value: new Color(pattern.accent) },
			uAccent2: { value: new Color(pattern.accent2) },
			uIris: { value: new Color(pattern.iris) },
			uIridescence: { value: pattern.iridescence },
			uSilver: { value: pattern.silver },
			uFinOpacity: { value: pattern.finOpacity },
			uEye: { value: [0.5 - shape.eye.t * shape.bodyLength, shape.eye.y, shape.eye.radius] },
			uEyeT: { value: shape.eye.t },
			uBodyEnd: { value: 0.5 - shape.bodyLength },
			uMouthV: { value: MOUTH_V[shape.mouth ?? "terminal"] },
			uScales: { value: [pattern.scales.size, pattern.scales.contrast] },
			uDaylight: sharedUniforms.uDaylight,
		},
		vertexHeader: FISH_VERTEX_HEADER,
		vertexAfter: {
			"#include <beginnormal_vertex>": FISH_NORMAL_CODE,
			"#include <begin_vertex>": FISH_DEFORM_CODE,
		},
		fragmentHeader: FISH_FRAGMENT_HEADER,
		fragmentAfter: {
			"#include <emissivemap_fragment>": FISH_FRAGMENT_CODE,
		},
	}
}

export interface FishMaterials {
	body: MeshStandardMaterial
	fins: MeshStandardMaterial
}

export function createFishMaterials(
	species: FishSpeciesDefinition,
	causticLayers: 1 | 2,
): FishMaterials {
	const body = applyShaderPatches(
		new MeshStandardMaterial({
			roughness: 0.36,
			metalness: 0.05,
			side: FrontSide,
			envMapIntensity: 0.9,
		}),
		[fishPatch(species, false), causticsPatch(0.5)],
		{ CAUSTIC_LAYERS: causticLayers },
	)
	const fins = applyShaderPatches(
		new MeshStandardMaterial({
			roughness: 0.5,
			metalness: 0,
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			envMapIntensity: 0.5,
		}),
		[fishPatch(species, true)],
		{ FISH_FINS: 1 },
	)
	return { body, fins }
}
