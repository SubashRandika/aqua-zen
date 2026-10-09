# Architecture

AquaZen is split into a simulation that knows nothing about rendering or React, a rendering layer that draws whatever the simulation contains, and a thin React layer for the interface and settings. They communicate through a typed event bus and a few explicit sync points. They do not call into each other's internals.

```text
           user input                               settings (Zustand, persisted)
               │                                              │
               ▼                                              ▼
  ┌────────────────────────┐  events   ┌───────────────────────────────────┐
  │ Interaction            │──────────▶│ AquariumWorld  (src/simulation)   │
  │ GlassInteraction, dock │           │ clock · lighting · fish · food ·  │
  │ keyboard shortcuts     │           │ glass stimuli · event bus         │
  └────────────────────────┘           └───────────────┬───────────────────┘
                                                       │ read every frame
                     ┌─────────────────────────────────┼──────────────────────┐
                     ▼                                 ▼                      ▼
           R3F scene (src/components/aquarium)   Audio engine          UI (rare updates)
           instanced fish, plants, water…        (src/audio)           phase, clock label
```

## The simulation (`src/simulation`)

`AquariumWorld` owns everything alive and advances it with `update(frameDelta)`. Frames are split into steps of at most 1/30 s, and anything longer than 0.25 s (a background tab, say) is dropped, so behaviour doesn't depend on frame rate.

Each step:

1. The **clock** advances. It runs an accelerated day, or follows the local time.
2. The **lighting controller** eases natural light (the room's daylight or moonlight) towards the target for the light mode, then adds the **tank light** on top. Its `daylight` value, not the clock, is what fish respond to, so manual Day/Night changes behaviour too, and so does switching the tank light on at night.
   - The tank light is switched by the user, by a change of light mode (Day turns it on, Night off, Auto hands it to its timer), or by its timer in Auto mode. A switch by hand holds until the timer next changes.
   - Each switch fades like an LED driver: quickly by hand, slowly on the timer.
3. **Glass stimuli** age, and **food** floats, sinks, settles and expires.
4. The **fish manager** runs each agent through its pipeline:
   - **Perception:** neighbours come from a spatial hash, and only the nearest few schoolmates count (topological schooling). Distant fish refresh less often.
   - **Drives:** hunger rises with activity, stamina falls with exertion, fear decays. Food is noticed after a personal delay, sooner when neighbours are already eating.
   - **Scheduled reactions:** startles, flinches and curiosity arrive after per-fish delays, so a school ripples instead of reacting in unison.
   - **Decision**, at irregular intervals: every voluntary state gets a utility from species, personality, drives, light and stimuli. The fish then chooses among the strongest few at random, weighted by appeal, with a bias towards continuing what it is doing.
   - **Steering:** the current state's desire is layered with wander noise, depth keeping, separation, alignment and cohesion, larger-fish avoidance, obstacle sliding and wall containment.
   - **Integration:** the heading turns towards the desire with angular momentum: the turn rate builds up and eases off at a limited angular acceleration, so there are no instant changes of direction. How fast a fish can turn depends on its speed, and burst-and-glide swimmers turn mostly during a kick (a sharp change of direction triggers one). Pitch is limited, except for bottom foragers tipping nose-down. Propulsion follows the species' swim style (continuous, burst-and-glide or bottom hopping; bottom dwellers swim steadily when travelling and sink when they stop). Animation values (tail phase and amplitude, a body bend that leads the turn, fin flare, colour fade) come out of the motion itself.
   - **Constraints:** walls, substrate, surface and stone hold the body's position only; steering turns the fish away, so the heading never snaps. Overlapping fish are separated.
   - **Foraging** (`behaviors/forage.ts`): pecking species choose a patch of substrate and nibble at it nose-down. A clinging grazer (the pleco) chooses a spot on the glass, a stone, a branch or the substrate, swims there and attaches. While attached it crawls in the surface plane, its back eased to face away from the surface, and after a stint it lets go and moves on.

Everything random draws from a seeded generator, so a seeded world is reproducible. The tests rely on this.

### Events

`EventBus` carries `glass:tap`, `glass:hold`, `glass:hover`, `food:released`, `food:consumed`, `light:changed`, `tank-light:changed`, `time:phase`, `fish:startled` and `camera:interaction`. The world subscribes to interaction events; audio and UI subscribe to world events.

## Rendering (`src/components/aquarium`, `src/three`)

Scene components read the world inside `useFrame` and write directly to GPU buffers. No React state changes per frame.

- **Fish:** for each species, two levels of detail, each with an opaque body and translucent fins, are drawn as instanced meshes that share one transform buffer. Per-instance attributes carry the swim phase, amplitude, bend, fin phase, colour intensity, hue shift, flare, speed, and the individual's seed and colour variety. The vertex shader bends the body as a travelling wave and flutters the fins and barbels. Geometry carries each vertex's position along the body and height within its outline, so markings follow the contours. The fragment shader adds overlapping scales, gill covers, the lateral line, lips, eyes and fin rays. Each fish is oriented by its own "up", which is world up except for a grazer clinging to a surface.
- **Materials** extend three's `MeshStandardMaterial` through small composable shader patches (`src/three/materials/shaderPatch.ts`), so lighting, shadows and fog keep working. Patches add caustics, plant sway, gravel, surface relief and fish patterns.
- **Caustics** are drawn once per frame into a tileable 512² texture (`CausticsTexture`) and sampled by every lit surface. The sample is modulated by direct diffuse light, so caustics respect shadows and light colour.
- **Procedural assets** are generated once per quality level by `src/three/assets.ts`. The loading screen reports each real stage, and the final stage compiles every shader before the lights come on.

## React and state (`src/store`, `src/hooks`)

- `settingsStore` holds user preferences, persisted to `localStorage` with a version number. Stored data is validated field by field and upgraded through `MIGRATIONS` in `src/lib/persistence.ts`.
- `sessionStore` holds transient UI state: loading stage, active quality, open panel, feeding mode, which fish is being followed, context loss and announcements. It changes on user actions, never per frame.
- `useWorldSync` pushes settings into the world through store subscriptions, and the world reports phase changes back. `useAudio` connects the audio engine to settings and world events, and only starts audio after a user gesture.

## Adding a species

1. Add a `FishSpeciesDefinition` to `src/config/species.ts`: size, speeds, swim style, depth band, behaviour tendencies, schooling parameters, feeding zones and foraging style, population, a body shape with fins (optionally barbels, a twin tail, mouth position, flat belly) and a pattern with iris colour, scale size and colour varieties.
2. Reuse a pattern kind, or add one: extend `PatternKind` in `src/simulation/fish/types.ts` and add a branch in `FISH_FRAGMENT_CODE` in `src/three/materials/fishMaterial.ts`.
3. Run `npm test`. The species tests check the new entry for internal consistency.

Nothing in the simulation or renderer is species-specific apart from these data-driven patterns.

## Quality tiers (`src/config/quality.ts`)

A preset sets pixel ratio range, fish density, geometry detail, shadows, plant density, particle and bubble counts, caustic layers, light shafts, water surface resolution, post-processing and LOD distances. **Auto** starts from `recommendQuality(detectDevice())` and then follows drei's `PerformanceMonitor`: first it adapts resolution, then it steps the tier.
