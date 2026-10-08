"use client"

import { CameraRig } from "./CameraRig"
import { Caustics } from "./Caustics"
import { Effects } from "./Effects"
import { Fish } from "./Fish"
import { Food } from "./Food"
import { GlassInteraction } from "./GlassInteraction"
import { Lighting } from "./Lighting"
import { Plants } from "./Plants"
import { RoomEnvironment } from "./RoomEnvironment"
import { Scape } from "./Scape"
import { SceneReady } from "./SceneReady"
import { SimulationDriver } from "./SimulationDriver"
import { Tank } from "./Tank"
import { WaterVolume } from "./WaterVolume"

/** The complete 3D aquarium. */
export function AquariumScene() {
	return (
		<>
			<color attach="background" args={["#040506"]} />
			<SimulationDriver />
			<Caustics />
			<RoomEnvironment />
			<Lighting />
			<Tank />
			<Scape />
			<Plants />
			<Fish />
			<Food />
			<WaterVolume />
			<GlassInteraction />
			<CameraRig />
			<Effects />
			<SceneReady />
		</>
	)
}
