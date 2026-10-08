import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from "three"
import { CAUSTICS_GLSL } from "../materials/causticsPatch"
import { sharedUniforms } from "../materials/sharedUniforms"

/**
 * The water surface, mostly seen from below through the front glass. Beyond
 * the critical angle (~48.6°) water reflects totally, so at the grazing
 * angles of a seated viewer the surface becomes a rippling silver ceiling;
 * steeper views look through Snell's window towards the light.
 */
export function createWaterSurfaceMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTime: sharedUniforms.uTime,
			uDeep: { value: new Color(0.06, 0.12, 0.12) },
			uLight: { value: new Color(1, 1, 1) },
			uSky: { value: new Color(0.5, 0.6, 0.6) },
			uWaveAmplitude: { value: 0.0016 },
		},
		vertexShader: /* glsl */ `
			uniform float uTime;
			uniform float uWaveAmplitude;
			varying vec3 vWorld;
			varying vec3 vNormal;

			// Sum of directional waves; returns height and writes its gradient.
			float waves(vec2 p, out vec2 grad) {
				grad = vec2(0.0);
				float h = 0.0;
				vec2 dirs[4];
				dirs[0] = normalize(vec2(1.0, 0.3));
				dirs[1] = normalize(vec2(-0.6, 1.0));
				dirs[2] = normalize(vec2(0.2, -1.0));
				dirs[3] = normalize(vec2(-1.0, -0.4));
				float freqs[4];
				freqs[0] = 38.0; freqs[1] = 57.0; freqs[2] = 83.0; freqs[3] = 121.0;
				for (int i = 0; i < 4; i++) {
					float f = freqs[i];
					float amp = uWaveAmplitude / (1.0 + float(i) * 0.9);
					float phase = dot(dirs[i], p) * f + uTime * sqrt(f) * 0.32;
					h += sin(phase) * amp;
					grad += dirs[i] * cos(phase) * amp * f;
				}
				return h;
			}

			void main() {
				vec3 pos = position;
				vec4 world = modelMatrix * vec4(pos, 1.0);
				vec2 grad;
				float h = waves(world.xz, grad);
				world.y += h;
				vWorld = world.xyz;
				vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
				gl_Position = projectionMatrix * viewMatrix * world;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uDeep;
			uniform vec3 uLight;
			uniform vec3 uSky;
			varying vec3 vWorld;
			varying vec3 vNormal;
			${CAUSTICS_GLSL.replace(/#if CAUSTIC_LAYERS > 1[\s\S]*?#endif/, "")}

			void main() {
				vec3 viewDir = normalize(cameraPosition - vWorld);
				bool below = cameraPosition.y < vWorld.y;
				vec3 n = below ? -vNormal : vNormal;
				float cosine = abs(dot(viewDir, n));
				float ripple = azCausticLayer(vWorld.xz * 34.0 + n.xz * 6.0, uTime * 1.1);
				vec3 color;
				float alpha;
				if (below) {
					float snellWindow = smoothstep(0.56, 0.74, cosine);
					// Total internal reflection mirrors the dim tank interior, broken by bright ripples.
					// Mostly a dim mirror of the tank interior, with soft moving glints.
					float glint = ripple * ripple;
					vec3 reflected = mix(uDeep * 1.6, uSky * 0.3, 0.3 + 0.25 * n.x) + uLight * glint * 0.07;
					vec3 transmitted = uLight * (0.45 + glint * 0.25);
					color = mix(reflected, transmitted, snellWindow);
					alpha = mix(0.62, 0.5, snellWindow);
				} else {
					float fresnel = pow(1.0 - cosine, 4.0);
					color = mix(uDeep, uSky, 0.6) + uLight * ripple * 0.08;
					alpha = mix(0.12, 0.55, fresnel);
				}
				gl_FragColor = vec4(color, alpha);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		blending: NormalBlending,
	})
}

/** A thin bright line where the water meets the front glass. */
export function createMeniscusMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: { uLight: { value: new Color(1, 1, 1) }, uTime: sharedUniforms.uTime },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uLight;
			uniform float uTime;
			varying vec2 vUv;
			void main() {
				float line = exp(-pow((vUv.y - 0.55) / 0.12, 2.0));
				float shimmer = 0.75 + 0.25 * sin(vUv.x * 140.0 + uTime * 1.3) * sin(vUv.x * 37.0 - uTime * 0.7);
				gl_FragColor = vec4(uLight * line * shimmer * 0.5, line * 0.6);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
	})
}
