"use client"

import { Environment, Lightformer } from "@react-three/drei"

/**
 * The dark room around the tank, captured once into an environment map.
 * It exists only to be reflected: soft window and lamp shapes that slide
 * across the glass as the camera moves.
 */
export function RoomEnvironment() {
	return (
		<Environment resolution={128} frames={1} background={false}>
			<color attach="background" args={["#040506"]} />
			{/* Ceiling softbox above the tank. */}
			<Lightformer
				form="rect"
				intensity={1.6}
				color="#f6efe4"
				position={[0, 3, 0.6]}
				rotation-x={Math.PI / 2}
				scale={[3, 0.8, 1]}
			/>
			{/* A tall window behind and to the left of the viewer. */}
			<Lightformer
				form="rect"
				intensity={0.9}
				color="#c9d8ea"
				position={[-1.6, 1.1, 3.2]}
				rotation-y={Math.PI * 0.85}
				scale={[0.7, 1.9, 1]}
			/>
			{/* A warm lamp on the right. */}
			<Lightformer
				form="circle"
				intensity={0.6}
				color="#ffd2a1"
				position={[2.4, 0.6, 2]}
				rotation-y={-Math.PI / 2}
				scale={0.5}
			/>
			{/* Faint fill so dark surfaces still read as glossy. */}
			<Lightformer
				form="rect"
				intensity={0.15}
				color="#9fb3b8"
				position={[0, 0.2, -3]}
				scale={[6, 2, 1]}
			/>
		</Environment>
	)
}
