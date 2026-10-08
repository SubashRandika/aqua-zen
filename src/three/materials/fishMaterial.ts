import { Color, DoubleSide, FrontSide, MeshStandardMaterial } from "three"
import type { FishSpeciesDefinition, PatternKind } from "@/simulation/fish/types"
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
}

/** Radians of travelling-wave phase from nose to tail. */
const WAVE_NUMBER = 5.2

const FISH_VERTEX_HEADER = /* glsl */ `
	attribute vec4 aSwim;   // tail phase, tail amplitude, turn bend, fin phase
	attribute vec4 aLook;   // colour intensity, hue shift, fin flare, speed (0..1)
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
		} else if (aRegion < 4.5) {
			// Pectoral fins scull.
			float flap = sin(aSwim.w + aFlex * 1.2);
			transformed.z += aSide * aFlex * 0.03 * (0.4 + 0.6 * flap);
			transformed.x += aFlex * 0.01 * cos(aSwim.w);
		} else if (aRegion < 5.5) {
			// Pelvic fins and gourami feelers wave slowly.
			transformed.z += aSide * aFlex * 0.012 * sin(aSwim.w * 0.7 + 1.0);
			transformed.y += aFlex * 0.014 * sin(aSwim.w * 0.45 + aFlex * 2.0);
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
	uniform float uIridescence;
	uniform float uSilver;
	uniform float uFinOpacity;
	uniform vec3 uEye;
	uniform float uBodyEnd;
	uniform float uDaylight;
	varying vec3 vFishLocal;
	varying vec3 vFishNormal;
	varying float vRegion;
	varying float vFlex;
	varying vec2 vFinUv;
	varying vec4 vLook;

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
`

const FISH_FRAGMENT_CODE = /* glsl */ `
	vec3 p = vFishLocal;
	float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
	float lightLevel = mix(0.12, 1.0, uDaylight);
	vec3 accent = azHueShift(uAccent, vLook.y);
	vec3 accent2 = azHueShift(uAccent2, vLook.y * 0.5);
	vec3 color;
	vec3 glow = vec3(0.0);
	float rough = 0.42;
	float metal = 0.05;
	float alpha = 1.0;

	#ifdef FISH_FINS
		color = azHueShift(uFin, vLook.y);
		float rays = 0.86 + 0.14 * sin(vFinUv.x * 70.0);
		alpha = uFinOpacity * mix(1.0, 0.7, vFlex);
		bool caudal = vRegion > 2.5 && vRegion < 3.5;
		bool median = vRegion > 0.5 && vRegion < 2.5;
		if (uPattern == 3 && (caudal || vRegion < 2.5)) {
			float stripes = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(p.y * 120.0 + 1.0));
			color = mix(color, accent, stripes * 0.75);
		} else if (uPattern == 4) {
			float bars = max(azBand(p.x, 0.18, 0.025, 0.01), azBand(p.x, -0.02, 0.022, 0.01));
			color = mix(color, accent, bars * 0.75 + smoothstep(0.75, 1.0, vFlex) * 0.35);
			alpha = max(alpha, bars * 0.75);
		} else if (uPattern == 5) {
			color = mix(color, accent, smoothstep(0.3, 1.0, vFlex) * 0.85);
			color *= 0.75 + 0.25 * sin(vFinUv.x * 90.0);
			glow += color * fresnel * uIridescence * 0.25;
		} else if (uPattern == 6 && (caudal || vRegion < 1.5)) {
			float spots = smoothstep(0.55, 0.85, sin(p.x * 70.0 + vLook.y * 40.0) * sin(p.y * 80.0 + vLook.y * 20.0));
			color = mix(color, accent, smoothstep(0.2, 0.8, vFlex) * 0.6);
			color = mix(color, accent2, spots * 0.85);
			glow += color * fresnel * uIridescence * 0.2;
		} else if (uPattern == 7) {
			color = mix(color, accent, smoothstep(0.7, 1.0, vFlex) * 0.7);
		} else if (uPattern == 8 && vRegion > 0.5 && vRegion < 1.5) {
			color = mix(color, accent, 0.9);
			alpha = max(alpha, 0.85);
		} else if (uPattern == 1 && median) {
			color = mix(color, accent2, (1.0 - vFlex) * 0.25);
		}
		color *= rays;
		rough = 0.55;
	#else
		float up = vFishNormal.y;
		float countershade = smoothstep(-0.45, 0.55, up);
		color = mix(uBelly, uBack, countershade);
		float flank = 1.0 - abs(up);
		float silver = uSilver * flank;
		metal = mix(0.05, 0.7, silver);
		rough = mix(0.5, 0.24, silver);
		float scales = sin(p.x * 260.0 + sin(p.y * 240.0) * 1.5) * sin(p.y * 260.0);
		rough = clamp(rough + scales * 0.06, 0.08, 1.0);

		if (uPattern == 1) {
			// Neon tetra: iridescent lateral stripe over a red lower rear half.
			float center = 0.012 + (p.x - 0.1) * 0.05;
			float span = smoothstep(0.44, 0.38, p.x) * smoothstep(-0.22, -0.13, p.x);
			float stripe = azBand(p.y, center, 0.011, 0.006) * span;
			float red = smoothstep(center - 0.01, center - 0.024, p.y) * smoothstep(0.13, 0.03, p.x) * step(uBodyEnd - 0.01, p.x);
			color = mix(color, accent2, red * 0.95);
			color = mix(color, accent * (0.55 + 0.9 * fresnel), stripe);
			glow += accent * stripe * (0.25 + 0.75 * fresnel) * uIridescence * 0.7;
			glow += accent2 * red * 0.06;
		} else if (uPattern == 2) {
			// Harlequin rasbora: black wedge tapering to the tail.
			float t = clamp((0.13 - p.x) / 0.43, 0.0, 1.0);
			float top = mix(0.082, 0.014, t);
			float bottom = mix(-0.075, -0.01, t * t);
			float inX = smoothstep(0.16, 0.11, p.x) * smoothstep(uBodyEnd - 0.02, uBodyEnd + 0.03, p.x);
			float wedge = inX * smoothstep(top + 0.008, top - 0.008, p.y) * smoothstep(bottom - 0.008, bottom + 0.008, p.y);
			color = mix(color, accent2, 0.3 * smoothstep(0.0, 0.08, p.y) * (1.0 - wedge));
			color = mix(color, accent, wedge * 0.95);
		} else if (uPattern == 3) {
			// Zebra danio: horizontal blue stripes.
			float stripes = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(p.y * 120.0 + 1.0));
			float span = smoothstep(0.38, 0.3, p.x);
			color = mix(mix(color, accent2, 0.35), accent, stripes * span * 0.9);
			glow += accent * stripes * span * fresnel * uIridescence * 0.25;
		} else if (uPattern == 4) {
			// Angelfish: vertical bars, the first through the eye.
			float bars = max(max(azBand(p.x, uEye.x, 0.016, 0.008), azBand(p.x, 0.18, 0.026, 0.01)), azBand(p.x, -0.02, 0.023, 0.01));
			bars = max(bars, azBand(p.x, -0.2, 0.012, 0.01) * 0.6);
			color = mix(color, accent, bars * 0.9);
			color = mix(color, accent2, smoothstep(0.08, 0.16, p.y) * 0.25 * (1.0 - bars));
		} else if (uPattern == 5) {
			// Betta: deep iridescent colour with a red wash.
			color = mix(color, accent, smoothstep(0.0, -0.08, p.y) * 0.35);
			glow += mix(color, vec3(0.4, 0.7, 1.0), 0.35) * fresnel * uIridescence * 0.4;
			rough = clamp(rough - 0.1, 0.08, 1.0);
		} else if (uPattern == 6) {
			// Guppy: plain body with iridescent spots towards the tail.
			float spots = smoothstep(0.7, 0.9, sin(p.x * 90.0 + vLook.y * 30.0) * sin(p.y * 110.0));
			float rear = smoothstep(0.1, -0.05, p.x);
			color = mix(color, accent, spots * rear * 0.8);
			glow += accent * spots * rear * fresnel * uIridescence * 0.4;
		} else if (uPattern == 7) {
			// Dwarf gourami: slanted red and blue bars.
			float bars = smoothstep(-0.25, 0.25, sin((p.x - p.y * 0.45) * 95.0));
			float span = smoothstep(0.42, 0.34, p.x);
			color = mix(color, accent, bars * span * 0.85);
			color = mix(color, accent, smoothstep(-0.02, -0.1, p.y) * smoothstep(0.2, 0.42, p.x) * 0.8);
			glow += accent * bars * span * fresnel * uIridescence * 0.3;
		} else if (uPattern == 8) {
			// Panda corydoras: dark eye mask and tail spot.
			float mask = azBand(p.x, uEye.x, 0.045, 0.012) * smoothstep(-0.05, -0.01, p.y);
			vec2 spot = vec2(p.x - (uBodyEnd + 0.05), p.y - 0.005);
			float tailSpot = 1.0 - smoothstep(0.03, 0.045, length(spot));
			color = mix(color, accent2, smoothstep(0.02, -0.06, p.y) * 0.25);
			color = mix(color, accent, max(mask, tailSpot) * 0.95);
		} else {
			// Countershaded (black molly): a faint blue-green sheen.
			glow += accent * fresnel * uIridescence * 0.15;
			rough = 0.32;
		}

		// Eye: silver iris, dark pupil, glossy cornea.
		float sideFacing = smoothstep(0.35, 0.6, abs(vFishNormal.z));
		float eyeDistance = length(vec2(p.x - uEye.x, p.y - uEye.y));
		float iris = (1.0 - smoothstep(uEye.z * 0.88, uEye.z, eyeDistance)) * sideFacing;
		float pupil = (1.0 - smoothstep(uEye.z * 0.46, uEye.z * 0.56, eyeDistance)) * sideFacing;
		color = mix(color, vec3(0.62, 0.58, 0.5), iris);
		color = mix(color, vec3(0.008), pupil);
		rough = mix(rough, 0.06, iris);
		metal = mix(metal, 0.3, iris - pupil);
	#endif

	// Colour fades in many fish while they rest at night.
	float luminance = dot(color, vec3(0.299, 0.587, 0.114));
	color = mix(vec3(luminance) * 0.8, color, vLook.x);
	glow *= vLook.x * lightLevel;

	diffuseColor.rgb = color;
	diffuseColor.a = alpha;
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
			uIridescence: { value: pattern.iridescence },
			uSilver: { value: pattern.silver },
			uFinOpacity: { value: pattern.finOpacity },
			uEye: { value: [0.5 - shape.eye.t * shape.bodyLength, shape.eye.y, shape.eye.radius] },
			uBodyEnd: { value: 0.5 - shape.bodyLength },
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
			roughness: 0.4,
			metalness: 0.05,
			side: FrontSide,
			envMapIntensity: 0.8,
		}),
		[fishPatch(species, false), causticsPatch(0.5)],
		{ CAUSTIC_LAYERS: causticLayers },
	)
	const fins = applyShaderPatches(
		new MeshStandardMaterial({
			roughness: 0.55,
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
