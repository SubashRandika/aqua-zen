import type { IUniform, Material, WebGLProgramParametersWithUniforms } from "three"

/**
 * A composable modification to a built-in three.js material. Patches add
 * uniforms and splice GLSL around the standard shader chunks, so materials
 * keep three's lighting, shadows and fog while gaining custom behaviour.
 */
export interface ShaderPatch {
	/** Identifies the patch in the program cache key. */
	key: string
	uniforms?: Record<string, IUniform>
	vertexHeader?: string
	fragmentHeader?: string
	/** Code inserted after a chunk include, e.g. `{ "#include <begin_vertex>": "..." }`. */
	vertexAfter?: Record<string, string>
	vertexBefore?: Record<string, string>
	fragmentAfter?: Record<string, string>
	fragmentBefore?: Record<string, string>
	/** Replaces a chunk include entirely. Applied after insertions from the same patch. */
	vertexReplace?: Record<string, string>
}

function splice(
	source: string,
	after: Record<string, string> = {},
	before: Record<string, string> = {},
): string {
	let result = source
	for (const [chunk, code] of Object.entries(after)) {
		if (!result.includes(chunk)) throw new Error(`Shader chunk not found: ${chunk}`)
		result = result.replace(chunk, `${chunk}\n${code}`)
	}
	for (const [chunk, code] of Object.entries(before)) {
		if (!result.includes(chunk)) throw new Error(`Shader chunk not found: ${chunk}`)
		result = result.replace(chunk, `${code}\n${chunk}`)
	}
	return result
}

export function applyShaderPatches<T extends Material>(
	material: T,
	patches: readonly ShaderPatch[],
	defines: Record<string, string | number> = {},
): T {
	material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
		for (const patch of patches) {
			Object.assign(shader.uniforms, patch.uniforms)
			shader.vertexShader = splice(shader.vertexShader, patch.vertexAfter, patch.vertexBefore)
			shader.fragmentShader = splice(
				shader.fragmentShader,
				patch.fragmentAfter,
				patch.fragmentBefore,
			)
			for (const [chunk, code] of Object.entries(patch.vertexReplace ?? {})) {
				if (!shader.vertexShader.includes(chunk))
					throw new Error(`Shader chunk not found: ${chunk}`)
				shader.vertexShader = shader.vertexShader.replace(chunk, code)
			}
		}
		const defineLines = Object.entries(defines)
			.map(([name, value]) => `#define ${name} ${value}`)
			.join("\n")
		const vertexHeaders = patches.map((p) => p.vertexHeader ?? "").join("\n")
		const fragmentHeaders = patches.map((p) => p.fragmentHeader ?? "").join("\n")
		shader.vertexShader = `${defineLines}\n${vertexHeaders}\n${shader.vertexShader}`
		shader.fragmentShader = `${defineLines}\n${fragmentHeaders}\n${shader.fragmentShader}`
	}
	const cacheKey = [
		...patches.map((p) => p.key),
		...Object.entries(defines).map(([k, v]) => `${k}=${v}`),
	].join("|")
	material.customProgramCacheKey = () => cacheKey
	material.needsUpdate = true
	return material
}
