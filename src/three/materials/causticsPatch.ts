import type { ShaderPatch } from "./shaderPatch"
import { sharedUniforms } from "./sharedUniforms"

/** Declares uTime once, however many patches use it. */
export const declareTime = /* glsl */ `
#ifndef AZ_TIME_DECLARED
#define AZ_TIME_DECLARED
uniform float uTime;
#endif
`

/**
 * Caustic light pattern: the bright, shifting web of light focused by the
 * rippling water surface, built from the edges of an animated Voronoi
 * diagram (light gathers along cell boundaries). Used directly by the water
 * surface; lit materials sample the pre-rendered CausticsTexture instead.
 */
export const CAUSTICS_GLSL = /* glsl */ `
vec2 azHash22(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return fract(sin(p) * 43758.5453);
}

float azCausticLayer(vec2 uv, float t) {
	vec2 cell = floor(uv);
	vec2 f = fract(uv);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 g = vec2(float(i), float(j));
			vec2 o = azHash22(cell + g);
			o = 0.5 + 0.4 * sin(t + 6.2831 * o);
			vec2 r = g + o - f;
			float d = dot(r, r);
			if (d < d1) { d2 = d1; d1 = d; }
			else if (d < d2) { d2 = d; }
		}
	}
	float edge = sqrt(d2) - sqrt(d1);
	return 1.0 - smoothstep(0.0, 0.22, edge);
}

`

/** Samples the shared caustic texture. 3.25 tiles per metre ≈ the old 26 cells per metre. */
const CAUSTIC_SAMPLE_GLSL = /* glsl */ `
uniform sampler2D uCausticMap;
float azCaustics(vec3 worldPos) {
	vec2 uv = worldPos.xz * 3.25 + vec2(worldPos.y * 0.5, worldPos.y * 0.31);
	vec4 layers = texture2D(uCausticMap, uv);
	float c = layers.r;
	#if CAUSTIC_LAYERS > 1
		c = c * 0.55 + c * texture2D(uCausticMap, uv * 0.73 + vec2(0.66, 0.21)).g * 0.9;
	#endif
	return c * c;
}
`

/**
 * Adds caustics to a standard material. Caustics are modulated by the
 * material's direct diffuse lighting, so they respect light colour,
 * intensity, surface orientation and shadows automatically.
 */
export function causticsPatch(strength = 1): ShaderPatch {
	return {
		key: `caustics:${strength}`,
		uniforms: {
			uCausticIntensity: sharedUniforms.uCausticIntensity,
			uSurfaceY: sharedUniforms.uSurfaceY,
			uCausticStrength: { value: strength },
			uCausticMap: sharedUniforms.uCausticMap,
		},
		vertexHeader: /* glsl */ `varying vec3 vAzWorldPosition;`,
		vertexAfter: {
			"#include <project_vertex>": /* glsl */ `
				vec4 azWorld = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					azWorld = instanceMatrix * azWorld;
				#endif
				vAzWorldPosition = (modelMatrix * azWorld).xyz;
			`,
		},
		fragmentHeader: /* glsl */ `
			uniform float uCausticIntensity;
			uniform float uCausticStrength;
			uniform float uSurfaceY;
			varying vec3 vAzWorldPosition;
			${CAUSTIC_SAMPLE_GLSL}
		`,
		fragmentBefore: {
			"#include <opaque_fragment>": /* glsl */ `
				float azCaustic = azCaustics(vAzWorldPosition);
				// Caustics are sharper and brighter nearer the surface.
				float azDepth = mix(0.6, 1.25, smoothstep(0.0, uSurfaceY, vAzWorldPosition.y));
				outgoingLight += reflectedLight.directDiffuse * azCaustic * uCausticIntensity * uCausticStrength * azDepth * 1.6;
			`,
		},
	}
}
