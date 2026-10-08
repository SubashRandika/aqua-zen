import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	{
		// Scene components drive three.js imperatively: materials, uniforms and the
		// camera are mutated inside useFrame by design (the React Three Fiber model).
		// This rule targets the React Compiler, which AquaZen does not use.
		files: ["src/components/aquarium/**/*.tsx"],
		rules: { "react-hooks/immutability": "off" },
	},
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
	]),
])

export default eslintConfig
