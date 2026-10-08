import {
	AdditiveBlending,
	CanvasTexture,
	Color,
	LinearFilter,
	NormalBlending,
	ShaderMaterial,
	SRGBColorSpace,
	Vector4,
} from "three"
import { sharedUniforms } from "../materials/sharedUniforms"

export const MAX_RIPPLES = 6

/**
 * Faint expanding rings and a soft contact bloom where the glass is
 * touched. Deliberately quiet: light catching disturbed glass, not a
 * cartoon splash.
 */
export function createGlassRippleMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uTime: sharedUniforms.uTime,
			uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 0, -100, 0)) },
			uTouch: { value: new Vector4(0, 0, 0, 0) },
			uColor: { value: new Color(0.85, 0.95, 1) },
		},
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			void main() {
				vec4 world = modelMatrix * vec4(position, 1.0);
				vWorld = world.xyz;
				gl_Position = projectionMatrix * viewMatrix * world;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec4 uRipples[${MAX_RIPPLES}];
			uniform vec4 uTouch;
			uniform vec3 uColor;
			varying vec3 vWorld;
			void main() {
				float light = 0.0;
				for (int i = 0; i < ${MAX_RIPPLES}; i++) {
					vec4 ripple = uRipples[i];
					float age = uTime - ripple.z;
					if (age < 0.0 || age > 2.5) continue;
					float d = distance(vWorld.xy, ripple.xy);
					float radius = 0.008 + age * 0.09;
					float ring = exp(-pow((d - radius) / (0.004 + age * 0.004), 2.0));
					float inner = exp(-pow((d - radius * 0.62) / (0.003 + age * 0.003), 2.0)) * 0.4;
					light += (ring + inner) * exp(-age * 2.2) * ripple.w;
				}
				float touchDistance = distance(vWorld.xy, uTouch.xy);
				light += exp(-touchDistance * touchDistance / 0.00035) * uTouch.z * 0.22;
				light += exp(-pow((touchDistance - 0.022) / 0.003, 2.0)) * uTouch.z * 0.12;
				gl_FragColor = vec4(uColor * light * 0.35, 1.0);
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
	})
}

/**
 * Renders the AquaZen wordmark as if etched into the front glass: small,
 * letter-spaced, frosted, catching the room light rather than glowing.
 */
export function createEtchedMarkTexture(fontFamily: string): CanvasTexture {
	const canvas = document.createElement("canvas")
	canvas.width = 1024
	canvas.height = 256
	const context = canvas.getContext("2d")
	if (context) {
		context.clearRect(0, 0, canvas.width, canvas.height)
		context.fillStyle = "rgba(255,255,255,1)"
		context.textAlign = "center"
		context.textBaseline = "middle"
		context.font = `400 132px ${fontFamily}`
		if ("letterSpacing" in context)
			(context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "26px"
		context.fillText("AquaZen", canvas.width / 2, canvas.height / 2 + 6)
	}
	const texture = new CanvasTexture(canvas)
	texture.colorSpace = SRGBColorSpace
	texture.minFilter = LinearFilter
	texture.anisotropy = 4
	return texture
}

export function createEtchedMarkMaterial(texture: CanvasTexture): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: {
			uMap: { value: texture },
			uLight: { value: 0.5 },
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMap;
			uniform float uLight;
			varying vec2 vUv;
			void main() {
				float mask = texture2D(uMap, vUv).a;
				// Frosted etching scatters light: brighter when the room is lit.
				gl_FragColor = vec4(vec3(0.82, 0.9, 0.88), mask * (0.05 + uLight * 0.13));
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: NormalBlending,
	})
}
