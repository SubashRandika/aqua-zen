import { Color, type Texture } from "three"
import { TANK } from "@/config/tank"

/**
 * Uniforms shared by reference across every AquaZen material. Updated once
 * per frame by the scene driver; materials never copy them.
 */
export const sharedUniforms = {
	uTime: { value: 0 },
	uCausticIntensity: { value: 1 },
	uDaylight: { value: 1 },
	uWaterColor: { value: new Color(0.1, 0.2, 0.2) },
	uSurfaceY: { value: TANK.waterLevel },
	/** Tileable caustic pattern, rendered once per frame (see CausticsTexture). */
	uCausticMap: { value: null as Texture | null },
}
