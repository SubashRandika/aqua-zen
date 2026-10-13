import type { ShaderPatch } from "./shaderPatch"

/**
 * Fine surface relief for hardscape — the pitting of stone, the grain of
 * wood — without textures: 3D gradient noise in world space, turned into a
 * normal perturbation with screen-space derivatives. Gradient noise has no
 * visible lattice, so the relief never reads as a grid of blocks up close.
 * Requires the caustics patch, which provides the world-position varying.
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
			vec3 azGradient3(vec3 cell) {
				float angle = azHash31(cell) * 6.2831853;
				float z = azHash31(cell + 17.31) * 2.0 - 1.0;
				float r = sqrt(1.0 - z * z);
				return vec3(r * cos(angle), r * sin(angle), z);
			}
			float azCorner(vec3 i, vec3 f, vec3 o) {
				return dot(azGradient3(i + o), f - o);
			}
			// Gradient noise in [0, 1].
			float azNoise3(vec3 p) {
				vec3 i = floor(p);
				vec3 f = fract(p);
				// Quintic fade: its derivative is continuous, so bump normals show no seams.
				vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
				float n = mix(
					mix(
						mix(azCorner(i, f, vec3(0, 0, 0)), azCorner(i, f, vec3(1, 0, 0)), u.x),
						mix(azCorner(i, f, vec3(0, 1, 0)), azCorner(i, f, vec3(1, 1, 0)), u.x),
						u.y
					),
					mix(
						mix(azCorner(i, f, vec3(0, 0, 1)), azCorner(i, f, vec3(1, 0, 1)), u.x),
						mix(azCorner(i, f, vec3(0, 1, 1)), azCorner(i, f, vec3(1, 1, 1)), u.x),
						u.y
					),
					u.z
				);
				return clamp(0.5 + n * 0.9, 0.0, 1.0);
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
