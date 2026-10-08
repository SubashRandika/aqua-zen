import { AdditiveBlending, Color, NormalBlending, ShaderMaterial, Vector3 } from "three"
import { TANK_INTERIOR } from "@/config/tank"
import { sharedUniforms } from "../materials/sharedUniforms"

/**
 * Pixels per metre at unit distance: drawing-buffer height / (2·tan(fov/2)).
 * Updated on resize so point sprites keep their physical size.
 */
export const sharedPointScale = { value: 1000 }

/**
 * Suspended particles — the fine motes that make water read as a volume.
 * Motion is computed entirely on the GPU from per-particle seeds, so the
 * CPU never touches them after creation.
 */
export function createSuspendedParticleMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTime: sharedUniforms.uTime,
			uColor: { value: new Color(1, 1, 1) },
			uBrightness: { value: 1 },
			uPointScale: sharedPointScale,
			uMin: {
				value: new Vector3(TANK_INTERIOR.minX, TANK_INTERIOR.floorY + 0.03, TANK_INTERIOR.minZ),
			},
			uSize: {
				value: new Vector3(
					TANK_INTERIOR.maxX - TANK_INTERIOR.minX,
					TANK_INTERIOR.surfaceY - TANK_INTERIOR.floorY - 0.04,
					TANK_INTERIOR.maxZ - TANK_INTERIOR.minZ,
				),
			},
		},
		vertexShader: /* glsl */ `
			attribute vec4 aSeed;
			uniform float uTime;
			uniform float uPointScale;
			uniform vec3 uMin;
			uniform vec3 uSize;
			varying float vTwinkle;
			varying float vFade;
			void main() {
				vec3 drift = vec3(
					uTime * (0.0015 + aSeed.w * 0.002) - sin(uTime * 0.07 + aSeed.w * 30.0) * 0.004,
					sin(uTime * 0.11 + aSeed.w * 12.0) * 0.006 - uTime * 0.0006,
					cos(uTime * 0.09 + aSeed.w * 21.0) * 0.005
				);
				vec3 unit = fract(aSeed.xyz + drift / uSize);
				vec3 world = uMin + unit * uSize;
				vec4 mv = modelViewMatrix * vec4(world, 1.0);
				gl_Position = projectionMatrix * mv;
				float size = mix(0.0005, 0.0014, fract(aSeed.w * 7.31));
				gl_PointSize = max(1.0, size * uPointScale / -mv.z);
				// Particles glint as they turn in the light.
				vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed.w) + aSeed.w * 40.0), 4.0);
				// Brighter near the lit surface.
				vFade = mix(0.45, 1.0, unit.y) * smoothstep(0.0, 0.05, unit.x) * smoothstep(1.0, 0.95, unit.x);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uBrightness;
			varying float vTwinkle;
			varying float vFade;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				float disc = smoothstep(0.5, 0.0, d);
				gl_FragColor = vec4(uColor * disc * vTwinkle * vFade * uBrightness * 0.22, 1.0);
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
	})
}

/**
 * Rising bubbles. Each bubble's height loops over time; wobble grows as it
 * rises, and it swells slightly as pressure drops.
 */
export function createBubbleMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTime: sharedUniforms.uTime,
			uPointScale: sharedPointScale,
			uSurface: { value: TANK_INTERIOR.surfaceY - 0.004 },
			uLight: { value: new Color(1, 1, 1) },
			uVisibility: { value: 1 },
		},
		vertexShader: /* glsl */ `
			attribute vec3 aOrigin;
			attribute vec4 aBubble; // speed, size, phase, wobble
			uniform float uTime;
			uniform float uPointScale;
			uniform float uSurface;
			varying float vAlpha;
			void main() {
				float travel = uSurface - aOrigin.y;
				float progress = fract(uTime * aBubble.x / travel + aBubble.z);
				float y = aOrigin.y + progress * travel;
				float wobble = aBubble.w * (0.3 + progress);
				vec3 world = vec3(
					aOrigin.x + sin(uTime * 7.0 + aBubble.z * 50.0) * 0.0025 * wobble + progress * 0.01 * sin(aBubble.z * 20.0),
					y,
					aOrigin.z + cos(uTime * 6.0 + aBubble.z * 40.0) * 0.002 * wobble
				);
				vec4 mv = modelViewMatrix * vec4(world, 1.0);
				gl_Position = projectionMatrix * mv;
				float size = aBubble.y * (1.0 + progress * 0.35);
				gl_PointSize = size * uPointScale / -mv.z;
				vAlpha = smoothstep(0.0, 0.04, progress) * smoothstep(1.0, 0.97, progress);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uLight;
			uniform float uVisibility;
			varying float vAlpha;
			void main() {
				vec2 p = gl_PointCoord - 0.5;
				float d = length(p);
				if (d > 0.5) discard;
				float rim = smoothstep(0.32, 0.47, d) * smoothstep(0.5, 0.46, d);
				float highlight = smoothstep(0.14, 0.0, length(p - vec2(-0.14, -0.16)));
				float body = 0.12 * smoothstep(0.5, 0.0, d);
				float alpha = (rim * 0.75 + highlight + body) * vAlpha * uVisibility;
				gl_FragColor = vec4(uLight * (0.6 + highlight), alpha);
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: NormalBlending,
	})
}

/** Soft vertical shafts of light from the fixture, swaying with the surface. */
export function createLightShaftMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTime: sharedUniforms.uTime,
			uColor: { value: new Color(1, 1, 1) },
			uIntensity: { value: 1 },
		},
		vertexShader: /* glsl */ `
			attribute vec4 aShaft; // x, z, width, phase
			uniform float uTime;
			varying vec2 vUv;
			varying float vPhase;
			void main() {
				vUv = uv;
				vPhase = aShaft.w;
				// Billboard around the vertical axis so shafts always face the viewer.
				vec3 toCamera = normalize(vec3(cameraPosition.x - aShaft.x, 0.0, cameraPosition.z - aShaft.y));
				vec3 right = vec3(toCamera.z, 0.0, -toCamera.x);
				float sway = sin(uTime * 0.3 + aShaft.w * 6.0) * 0.02 * (1.0 - uv.y);
				vec3 world = vec3(aShaft.x, 0.0, aShaft.y) + right * (position.x * aShaft.z + sway) + vec3(0.0, position.y, 0.0);
				gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uColor;
			uniform float uIntensity;
			varying vec2 vUv;
			varying float vPhase;
			void main() {
				float edges = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
				float fall = pow(vUv.y, 1.8);
				float flicker = 0.6 + 0.4 * sin(uTime * 0.7 + vPhase * 9.0 + vUv.x * 4.0) * sin(uTime * 0.43 + vPhase * 3.0);
				float streaks = 0.75 + 0.25 * sin(vUv.x * 18.0 + vPhase * 5.0 + uTime * 0.2);
				float alpha = edges * fall * flicker * streaks * uIntensity * 0.06;
				gl_FragColor = vec4(uColor * alpha, 1.0);
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
	})
}
