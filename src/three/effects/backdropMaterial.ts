import { Color, ShaderMaterial } from "three"
import { sharedUniforms } from "../materials/sharedUniforms"

/**
 * A frosted, back-lit background film — the classic premium aquascape
 * backdrop. A soft luminous gradient gives the scene its depth and
 * silhouettes the plants in front of it.
 */
export function createBackdropMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTop: { value: new Color(0.5, 0.6, 0.6) },
			uBottom: { value: new Color(0.04, 0.07, 0.07) },
			uTime: sharedUniforms.uTime,
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uTop;
			uniform vec3 uBottom;
			uniform float uTime;
			varying vec2 vUv;

			float hash(vec2 p) {
				return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
			}

			void main() {
				float height = smoothstep(0.02, 1.0, vUv.y);
				vec3 color = mix(uBottom, uTop, pow(height, 1.6));
				// The light behind the film is brightest near the top centre-right.
				float bloom = exp(-pow((vUv.x - 0.58) / 0.45, 2.0)) * smoothstep(0.35, 1.0, vUv.y);
				color *= 0.75 + bloom * 0.5;
				// Slow, barely perceptible breathing of the light through moving water.
				color *= 1.0 + 0.025 * sin(uTime * 0.21 + vUv.x * 3.0);
				// Dither to avoid banding in the dark gradient.
				color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
				gl_FragColor = vec4(color, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		fog: false,
	})
}
