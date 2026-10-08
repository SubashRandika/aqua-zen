import { Color, MeshStandardMaterial, Vector4 } from "three"
import { SUBSTRATE } from "@/config/scape"
import { causticsPatch } from "./causticsPatch"
import { applyShaderPatches, type ShaderPatch } from "./shaderPatch"

const NOISE_GLSL = /* glsl */ `
	float azHash12(vec2 p) {
		vec3 p3 = fract(vec3(p.xyx) * 0.1031);
		p3 += dot(p3, p3.yzx + 33.33);
		return fract((p3.x + p3.y) * p3.z);
	}
	float azValueNoise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		f = f * f * (3.0 - 2.0 * f);
		float a = azHash12(i);
		float b = azHash12(i + vec2(1.0, 0.0));
		float c = azHash12(i + vec2(0.0, 1.0));
		float d = azHash12(i + vec2(1.0, 1.0));
		return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
	}
`

/**
 * Natural sand and fine gravel: millimetre grains, scattered pebbles and
 * broad colour patches, with grain-scale bump from screen-space derivatives.
 * Requires the caustics patch, which provides the world-position varying.
 */
function gravelPatch(skirt: boolean): ShaderPatch {
	return {
		key: `gravel:${skirt}`,
		uniforms: {
			uSandLight: { value: new Color("#cdbd9c") },
			uSandDark: { value: new Color("#8a7b63") },
			uPebble: { value: new Color("#4d4a45") },
			uSoil: { value: new Color("#2b221a") },
			uSoilLight: { value: new Color("#57473a") },
			// The sandy path: centre (x, z) and radii, slightly larger than the valley it follows.
			uPath: {
				value: new Vector4(
					SUBSTRATE.valley.center[0],
					SUBSTRATE.valley.center[1] + 0.04,
					SUBSTRATE.valley.radius[0] * 1.25,
					SUBSTRATE.valley.radius[1] * 1.9,
				),
			},
		},
		fragmentHeader: /* glsl */ `
			uniform vec3 uSandLight;
			uniform vec3 uSandDark;
			uniform vec3 uPebble;
			uniform vec3 uSoil;
			uniform vec3 uSoilLight;
			uniform vec4 uPath;
			${NOISE_GLSL}
		`,
		fragmentAfter: {
			"#include <color_fragment>": /* glsl */ `
				${skirt ? "vec2 azGrainCoord = vec2(vAzWorldPosition.x + vAzWorldPosition.z, vAzWorldPosition.y);" : "vec2 azGrainCoord = vAzWorldPosition.xz;"}
				// Two rotated octaves so grains don't line up on a grid when seen up close.
				vec2 azRotated = mat2(0.8, -0.6, 0.6, 0.8) * azGrainCoord;
				float azGrain = azValueNoise(azGrainCoord * 900.0) * 0.6 + azValueNoise(azRotated * 1530.0 + 7.3) * 0.4;
				float azPebble = azValueNoise(azGrainCoord * 240.0 + 17.0);
				float azPatch = azValueNoise(azGrainCoord * 14.0 + 3.0);
				vec3 azSand = mix(uSandDark, uSandLight, azGrain * 0.55 + azPatch * 0.45);
				azSand = mix(azSand, uPebble, smoothstep(0.7, 0.82, azPebble) * 0.55);
				// Dark aquasoil granules everywhere except the sandy foreground path.
				vec3 azAquasoil = mix(uSoil, uSoilLight, azGrain * 0.7 + azPatch * 0.3);
				azAquasoil = mix(azAquasoil, uPebble * 0.8, smoothstep(0.75, 0.85, azPebble) * 0.4);
				vec2 azPathDelta = (vAzWorldPosition.xz - uPath.xy) / uPath.zw;
				float azPathEdge = length(azPathDelta) + (azPatch - 0.5) * 0.45;
				float azSandMask = 1.0 - smoothstep(0.75, 1.05, azPathEdge);
				${skirt ? "azSandMask *= smoothstep(0.02, 0.03, vAzWorldPosition.y);" : ""}
				vec3 azGround = mix(azAquasoil, azSand, azSandMask);
				${skirt ? "azGround = mix(uSoil * 0.7, azGround, smoothstep(0.006, 0.02, vAzWorldPosition.y)); azGround *= 0.85;" : ""}
				diffuseColor.rgb = azGround;
			`,
			"#include <roughnessmap_fragment>": /* glsl */ `
				roughnessFactor = 0.9 - azPebble * 0.25;
			`,
			"#include <normal_fragment_maps>": /* glsl */ `
				float azBumpHeight = (azGrain * 0.45 + smoothstep(0.6, 0.85, azPebble) * 0.55) * 0.0012;
				vec3 azSigmaX = dFdx(-vViewPosition);
				vec3 azSigmaY = dFdy(-vViewPosition);
				vec3 azR1 = cross(azSigmaY, normal);
				vec3 azR2 = cross(normal, azSigmaX);
				float azDet = dot(azSigmaX, azR1);
				vec2 azDH = vec2(dFdx(azBumpHeight), dFdy(azBumpHeight));
				vec3 azGrad = sign(azDet) * (azDH.x * azR1 + azDH.y * azR2);
				normal = normalize(abs(azDet) * normal - azGrad);
			`,
		},
	}
}

export function createSubstrateMaterial(causticLayers: 1 | 2, skirt = false): MeshStandardMaterial {
	return applyShaderPatches(
		new MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.25 }),
		[causticsPatch(skirt ? 0.25 : 1), gravelPatch(skirt)],
		{ CAUSTIC_LAYERS: causticLayers },
	)
}
