"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { AquariumWorld } from "@/simulation/core/World"

const WorldContext = createContext<AquariumWorld | null>(null)

/** Makes the simulation available to scene components. The world itself is never React state. */
export function WorldProvider({ world, children }: { world: AquariumWorld; children: ReactNode }) {
	return <WorldContext.Provider value={world}>{children}</WorldContext.Provider>
}

export function useWorld(): AquariumWorld {
	const world = useContext(WorldContext)
	if (!world) throw new Error("useWorld must be used inside <WorldProvider>")
	return world
}
