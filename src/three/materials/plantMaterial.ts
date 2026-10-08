import { DoubleSide, MeshStandardMaterial, Vector3 } from "three"
import { causticsPatch, declareTime } from "./causticsPatch"
import { applyShaderPatches, type ShaderPatch } from "./shaderPatch"
import { sharedUniforms } from "./sharedUniforms"

export interface PlantMaterialOptions {
	/** Sway amplitude in metres at the reference height. */
	sway: number
	/** Height (m) at which the sway reaches its full amplitude; sway grows with height². */
	swayHeight: number
	/** Constant lean from the water current, metres at the reference height. */
	current?: Vector3
	/** Faux light transmission through thin leaves. */
	translucency?: number
	roughness?: number
	causticLayers: 1 | 2
}

function plantSwayPatch(options: PlantMaterialOptions): ShaderPatch {
	return {
		key: "plant-sway",
		uniforms: {
			uTime: sharedUniforms.uTime,
			uDaylight: sharedUniforms.uDaylight,
			uSway: { value: options.sway },
			uSwayHeight: { value: options.swayHeight },
			uCurrent: { value: options.current ?? new Vector3() },
			uTranslucency: { value: options.translucency ?? 0.08 },
		},
		vertexHeader: /* glsl */ `
			${declareTime}
			attribute vec4 aAnchor;
			uniform float uSway;
			uniform float uSwayHeight;
			uniform vec3 uCurrent;
		`,
		vertexReplace: {
			// Sway is applied in world space so every blade bends about its own base.
			"#include <project_vertex>": /* glsl */ `
				vec4 azPlantWorld = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					azPlantWorld = instanceMatrix * azPlantWorld;
				#endif
				azPlantWorld = modelMatrix * azPlantWorld;
				float azHeight = max(azPlantWorld.y - aAnchor.y, 0.0);
				float azBend = (azHeight * azHeight) / (uSwayHeight * uSwayHeight);
				vec2 azSway = vec2(
					sin(uTime * 0.62 + aAnchor.w + aAnchor.x * 4.0) + 0.45 * sin(uTime * 1.37 + aAnchor.w * 1.7),
					0.7 * cos(uTime * 0.51 + aAnchor.w * 1.3 + aAnchor.z * 5.0)
				) * uSway;
				vec2 azOffset = (azSway + uCurrent.xz) * azBend;
				azPlantWorld.xz += azOffset;
				// Keep blade length roughly constant as it bends.
				azPlantWorld.y -= dot(azOffset, azOffset) / max(azHeight, 0.02) * 0.5;
				vec4 mvPosition = viewMatrix * azPlantWorld;
				gl_Position = projectionMatrix * mvPosition;
			`,
		},
		fragmentHeader: /* glsl */ `
			uniform float uTranslucency;
			uniform float uDaylight;
		`,
		fragmentAfter: {
			"#include <emissivemap_fragment>": /* glsl */ `
				totalEmissiveRadiance += diffuseColor.rgb * uTranslucency * mix(0.1, 1.0, uDaylight);
			`,
		},
	}
}

export function createPlantMaterial(options: PlantMaterialOptions): MeshStandardMaterial {
	return applyShaderPatches(
		new MeshStandardMaterial({
			vertexColors: true,
			side: DoubleSide,
			roughness: options.roughness ?? 0.62,
			metalness: 0,
			envMapIntensity: 0.4,
		}),
		// Caustics first: the sway patch replaces the chunk caustics hooks after.
		[causticsPatch(0.7), plantSwayPatch(options)],
		{ CAUSTIC_LAYERS: options.causticLayers },
	)
}
