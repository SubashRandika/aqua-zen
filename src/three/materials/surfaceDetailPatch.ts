import type { ShaderPatch } from "./shaderPatch"

/**
 * Fine surface relief for hardscape — the pitting of stone, the grain of
 * wood — without textures: 3D value noise in world space, turned into a
 * normal perturbation with screen-space derivatives. Requires the caustics
 * patch, which provides the world-position varying.
 */
export function surfaceDetailPatch(scale: number, strength: number, tint: number): ShaderPatch {
	return {
		key: `surface-detail:${scale}:${strength}:${tint}`,
		uniforms: {
			uDetailScale: { value: scale },
			uDetailStrength: { value: strength },
			uDetailTint: { value: tint },
		},
		fragmentHeader: /* glsl */ `
			uniform float uDetailScale;
			uniform float uDetailStrength;
			uniform float uDetailTint;
			float azHash31(vec3 p) {
				p = fract(p * 0.1031);
				p += dot(p, p.zyx + 31.32);
				return fract((p.x + p.y) * p.z);
			}
			float azNoise3(vec3 p) {
				vec3 i = floor(p);
				vec3 f = fract(p);
				// Quintic fade: its derivative is continuous, so bump normals show no grid.
				f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
				return mix(
					mix(mix(azHash31(i), azHash31(i + vec3(1, 0, 0)), f.x), mix(azHash31(i + vec3(0, 1, 0)), azHash31(i + vec3(1, 1, 0)), f.x), f.y),
					mix(mix(azHash31(i + vec3(0, 0, 1)), azHash31(i + vec3(1, 0, 1)), f.x), mix(azHash31(i + vec3(0, 1, 1)), azHash31(i + vec3(1, 1, 1)), f.x), f.y),
					f.z
				);
			}
		`,
		fragmentAfter: {
			"#include <color_fragment>": /* glsl */ `
				vec3 azDetailP = vAzWorldPosition * uDetailScale;
				// Two octaves: finer detail would alias into visible blocks on high-DPR screens.
				const mat3 azDetailRotation = mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6);
				float azDetail = azNoise3(azDetailP) * 0.65 + azNoise3(azDetailRotation * azDetailP * 2.7) * 0.35;
				diffuseColor.rgb *= 1.0 + (azDetail - 0.5) * uDetailTint;
			`,
			"#include <normal_fragment_maps>": /* glsl */ `
				float azDetailHeight = azDetail * uDetailStrength;
				vec3 azDSigmaX = dFdx(-vViewPosition);
				vec3 azDSigmaY = dFdy(-vViewPosition);
				vec3 azDR1 = cross(azDSigmaY, normal);
				vec3 azDR2 = cross(normal, azDSigmaX);
				float azDDet = dot(azDSigmaX, azDR1);
				vec2 azDH = vec2(dFdx(azDetailHeight), dFdy(azDetailHeight));
				normal = normalize(abs(azDDet) * normal - sign(azDDet) * (azDH.x * azDR1 + azDH.y * azDR2));
			`,
		},
	}
}
