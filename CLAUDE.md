# AquaZen — Master Development Prompt

## 1. Role

You are the lead engineer, 3D graphics engineer, simulation engineer, UI/UX designer, technical architect, QA engineer, and performance engineer responsible for building **AquaZen** from scratch into a polished, production-quality web application.

Do not merely provide code snippets or tutorials.

**Build the application yourself, step by step, inside the project.**

You are expected to:

- Make appropriate technical decisions autonomously.
- Create the project structure.
- Install and configure dependencies.
- Implement features incrementally.
- Create the simulation architecture.
- Integrate and optimize 3D assets.
- Run and inspect the application frequently.
- Test functionality.
- Fix errors before proceeding.
- Refactor poor implementations.
- Optimize rendering performance.
- Ensure responsive behavior.
- Complete the application to a production-ready state.

Do not repeatedly ask me to implement code manually.

You may ask for clarification only when a decision cannot reasonably be made from this specification.

For all reasonable technical decisions, **choose the best implementation yourself**.

---

# 2. Product Vision

Build **AquaZen**, a highly realistic, cinematic, immersive virtual aquarium designed primarily to create a feeling of:

- Calm
- Relaxation
- Presence
- Natural movement
- Visual beauty
- Peacefulness

The user should feel like they are sitting in front of a real premium aquarium.

This must NOT feel like:

- A game
- A fish screensaver with repetitive paths
- A collection of animated 3D models
- A dashboard
- A toy-like aquarium
- A deterministic animation demo

The central experience should be:

> "I can sit here and watch these fish live their own lives."

Fish must have autonomous, unpredictable, natural-looking behavior.

---

# 3. Product Name

Application name:

**AquaZen**

Use the name consistently throughout:

- Browser title
- Metadata
- Loading screen
- UI
- Documentation
- README
- Deployment configuration
- Social preview metadata

Create a subtle premium visual identity around the name.

Do not make the branding visually dominant.

---

# 4. Technology Stack

Use the following stack unless a superior technical reason requires a change:

### Application

- Next.js
- React
- TypeScript

Use the modern Next.js architecture and prefer the App Router.

### 3D

- Three.js
- React Three Fiber
- @react-three/drei

Use Three.js directly when React Three Fiber abstraction becomes limiting.

### Animation

- GSAP where timeline-based cinematic UI/scene transitions are appropriate.
- Framer Motion where React UI animation is appropriate.

Do NOT use GSAP or Framer Motion to drive every fish.

Fish movement must be controlled by the simulation system.

### State

Use Zustand for global application state where appropriate.

Do not create unnecessary global state.

### Styling

- Tailwind CSS

Use CSS modules or regular CSS where a specialized visual effect is easier to maintain.

### 3D Assets

Prefer:

- GLB/GLTF
- PBR materials
- optimized textures
- skeletal animation where appropriate

### Audio

Use the Web Audio API or a lightweight suitable abstraction.

### Persistence

Use localStorage initially.

If structured persistence becomes necessary, consider IndexedDB.

Do NOT introduce a backend unless it becomes genuinely necessary.

---

# 5. Core Architecture

Design the application around clearly separated systems.

Suggested high-level architecture:

```text
AquaZen
│
├── Presentation
│   ├── UI
│   ├── HUD
│   ├── Controls
│   └── Cinematic transitions
│
├── 3D Scene
│   ├── Aquarium
│   ├── Water
│   ├── Environment
│   ├── Lighting
│   ├── Plants
│   ├── Rocks
│   ├── Driftwood
│   ├── Bubbles
│   └── Fish
│
├── Simulation
│   ├── Fish Manager
│   ├── Fish Agent
│   ├── Steering
│   ├── Wander
│   ├── Schooling
│   ├── Avoidance
│   ├── Food Seeking
│   ├── Curiosity
│   ├── Fear
│   ├── Resting
│   ├── Territorial behavior
│   └── Day/Night behavior
│
├── Interaction
│   ├── Glass interaction
│   ├── Feeding
│   ├── Lighting
│   ├── Camera
│   └── Touch / Pointer interaction
│
├── Audio
│   ├── Water ambience
│   ├── Bubbles
│   └── Optional relaxation music
│
├── Persistence
│   ├── Settings
│   ├── Aquarium state
│   ├── Camera
│   └── Preferences
│
└── Performance
    ├── Quality levels
    ├── Device detection
    ├── LOD
    ├── Instancing
    └── Adaptive rendering
```

Keep these responsibilities separated.

---

# 6. Most Important Requirement — Natural Fish Simulation

This is the most important technical requirement of AquaZen.

Do NOT create predefined swimming paths.

Do NOT make fish follow Bezier curves continuously.

Do NOT use looping animation paths.

Do NOT make every fish perform synchronized movements.

Fish should behave as autonomous agents.

Each fish should have its own state.

Example:

```ts
type FishState =
	| "wandering"
	| "cruising"
	| "schooling"
	| "seekingFood"
	| "feeding"
	| "avoiding"
	| "startled"
	| "curious"
	| "resting"
	| "territorial"
	| "hiding"
```

The behavior system should continuously evaluate:

- Current position
- Velocity
- Acceleration
- Preferred depth
- Species
- Personality
- Hunger
- Energy
- Nearby fish
- Nearby obstacles
- Food
- User interaction
- Time of day
- Light intensity
- Aquarium boundaries

The resulting movement should be emergent.

---

# 7. Fish Movement System

Implement steering behaviors such as:

### Wander

Fish should continuously make small unpredictable directional changes.

Avoid obvious random jitter.

Use smooth stochastic steering.

### Seek

Used when approaching:

- Food
- Interesting locations
- Other fish
- User interaction

### Flee

Used when:

- User taps glass
- Sudden disturbance occurs
- Larger fish approach aggressively

### Arrive

Fish should slow naturally when approaching:

- Food
- Resting location
- Desired area

### Separation

Prevent fish from unrealistically overlapping.

### Alignment

Useful for schooling species.

### Cohesion

Useful for schooling behavior.

### Obstacle avoidance

Fish should avoid:

- Rocks
- Plants
- Aquarium walls
- Driftwood
- Other large obstacles

### Boundary steering

Fish should remain naturally inside the aquarium without visibly bouncing against the walls.

---

# 8. Fish Personalities

Every fish should have a personality profile.

Example:

```ts
interface FishPersonality {
	curiosity: number
	energy: number
	sociability: number
	shyness: number
	territoriality: number
	aggressiveness: number
	schoolingStrength: number
	preferredDepth: number
	preferredSpeed: number
}
```

Randomize personality within sensible species-specific ranges.

This means two fish of the same species should not behave identically.

Example:

```text
Fish #1
Curious + energetic

Fish #2
Shy + slow

Fish #3
Social + schooling

Fish #4
Territorial + independent
```

This is important for making the aquarium feel alive.

---

# 9. Species System

The architecture must support adding additional species later without rewriting the simulation.

Create a species configuration system.

Example:

```ts
interface FishSpeciesDefinition {
	id: string
	name: string
	model: string
	scale: number

	preferredDepth: {
		min: number
		max: number
	}

	movement: {
		minSpeed: number
		maxSpeed: number
		acceleration: number
		turnRate: number
	}

	behavior: {
		schooling: number
		curiosity: number
		shyness: number
		territoriality: number
	}

	feeding: {
		attractionRadius: number
		feedingSpeed: number
	}

	visual: {
		lodDistances: number[]
	}
}
```

New fish species should ideally be added through configuration rather than rewriting core logic.

---

# 10. Initial Fish Population

Start with approximately 8–10 visually distinct species.

Choose species that provide different behaviors and swimming styles.

For example:

- Neon Tetra
- Guppy
- Angelfish
- Betta
- Goldfish
- Zebra Danio
- Molly
- Corydoras
- Dwarf Gourami
- Harlequin Rasbora

However, verify that the selected 3D assets and licensing permit use in the project.

Do not use copyrighted assets without appropriate rights.

Create the architecture so more species can later be enabled.

---

# 11. Schooling Behavior

Some species should form loose schools.

The school must NOT behave like a single object.

Each fish remains an independent agent.

Use:

```text
Separation
+
Alignment
+
Cohesion
+
Species affinity
+
Individual personality
+
Environmental influence
```

The school should occasionally:

- spread apart
- regroup
- change direction
- split temporarily
- merge
- react collectively to disturbances
- respond to food

Avoid perfect synchronized movement.

---

# 12. Feeding System

Implement interactive feeding.

The user should be able to click/tap inside the aquarium.

When feeding:

1. Determine the 3D position corresponding to the user interaction.
2. Create food particles.
3. Food should fall naturally through the water.
4. Water movement should subtly affect particles.
5. Nearby fish detect food.
6. Fish transition into food-seeking behavior.
7. Fish approach from different directions.
8. Fish compete naturally.
9. Fish slow down when approaching food.
10. Fish consume food.
11. Food disappears after consumption or timeout.
12. Fish gradually return to normal behavior.

Do NOT make every fish suddenly rush toward the same point.

Different fish should respond based on:

- Species
- Distance
- Hunger
- Personality
- Energy
- Current state

Add a subtle feeding cooldown to prevent excessive particle creation.

---

# 13. Glass Interaction

The user should be able to interact with the aquarium glass.

Support:

### Desktop

- Mouse movement
- Mouse hover
- Click
- Click and hold

### Mobile

- Touch
- Tap
- Drag

When the user touches/taps the glass:

1. Convert screen coordinates into aquarium/world coordinates.
2. Determine nearby fish.
3. Generate an interaction event.
4. Fish should respond according to personality.

Example reactions:

```text
Shy fish
→ quickly swim away

Curious fish
→ approach the location cautiously

Schooling fish
→ school temporarily moves away

Territorial fish
→ investigate

Calm fish
→ slow approach
```

Add a subtle ripple/reflection effect on the glass.

Do not make the reaction cartoonish.

---

# 14. Day/Night Simulation

Support both:

### Automatic mode

Simulated aquarium time:

```text
Morning
↓
Day
↓
Afternoon
↓
Sunset
↓
Night
↓
Morning
```

The cycle should be configurable.

### Manual mode

Allow the user to switch:

```text
☀ Day
🌙 Night
Auto
```

Lighting should smoothly transition.

Do NOT instantly switch lighting.

Use cinematic transitions.

---

# 15. Day/Night Behavior

Lighting should influence fish behavior.

During daytime:

- higher activity
- more exploration
- normal feeding behavior

During evening:

- slower movement
- reduced activity

During nighttime:

- reduced movement
- some fish rest
- nocturnal species can become more active

The aquarium should feel biologically different rather than merely changing the light color.

---

# 16. Aquarium Environment

Initial environment:

- Minimal premium standalone aquarium
- Dark/neutral surrounding environment
- Glass tank
- Realistic water
- Natural gravel/sand
- Rocks
- Aquatic plants
- Driftwood
- Subtle bubbles
- Water movement

Do not overcrowd the scene.

The underwater environment must have visual depth.

Use:

- foreground
- midground
- background

to create cinematic composition.

---

# 17. Water Rendering

Water is a major visual element.

Create realistic but performance-conscious water.

Consider:

- transparent/refraction effects
- subtle distortion
- caustic-like lighting
- floating particles
- underwater fog
- surface movement
- volumetric-looking depth
- subtle suspended particles

Avoid expensive effects if they destroy mobile performance.

Create quality tiers.

---

# 18. Fish Animation

Fish should not simply translate through space.

Each fish should have believable body motion.

Where suitable, support:

- tail movement
- body oscillation
- fin movement
- subtle acceleration/deceleration
- turning animation
- feeding animation
- startled animation
- resting animation

Swimming speed should influence animation speed.

Turning should influence body orientation naturally.

---

# 19. Aquarium Lighting

Create cinematic aquarium lighting.

Support:

- main aquarium light
- subtle environment light
- underwater light
- plant illumination
- nighttime illumination
- soft shadows where affordable

Avoid excessive bloom.

The aesthetic should be:

**premium + realistic + calming**

not:

**gaming RGB aquarium**.

---

# 20. Camera

Implement a cinematic camera system.

Default:

- beautiful aquarium composition
- subtle slow movement
- slight parallax
- gentle cinematic motion

Allow users to:

- orbit
- zoom
- inspect
- reset camera

Do not make camera movement nauseating.

Never constantly rotate around the aquarium.

The default camera should feel almost stationary with extremely subtle cinematic movement.

---

# 21. Audio

Create optional ambient audio.

Include:

- subtle water ambience
- occasional bubbles
- extremely subtle environmental sound
- optional relaxing background music

Provide:

```text
Sound On/Off
Music On/Off
Volume
```

Do not autoplay audio if browser restrictions prevent it.

Respect browser autoplay policies.

Persist audio preference.

---

# 22. UI Design

The UI should be minimal.

Do NOT build a dashboard.

The aquarium should occupy almost the entire screen.

Controls should be discreet.

Suggested controls:

```text
                     AquaZen

              [ Auto ] [ Day ] [ Night ]

       [ Feed ]     [ Sound ]     [ Camera ]
```

Controls should:

- use glassmorphism sparingly
- have subtle transparency
- fade when inactive
- reappear on interaction
- never obscure the aquarium

Use smooth animation.

---

# 23. Calm UX

The user should never feel pressured.

Avoid:

- excessive notifications
- badges
- bright colors
- large buttons
- gamification
- timers
- points
- achievements
- distracting menus

AquaZen is an experience, not a game.

---

# 24. Responsive Design

Support:

- Desktop
- Laptop
- Tablet
- Mobile

Do not simply scale the desktop scene down.

Adapt the experience.

Mobile should use:

- fewer fish
- lower shadow quality
- lower particle counts
- lower post-processing
- reduced environment complexity
- simplified reflections/refraction

But the aquarium should remain visually beautiful.

---

# 25. Adaptive Performance System

Implement quality levels:

```text
Ultra
High
Medium
Low
Auto
```

Auto should consider:

- device capability
- screen resolution
- approximate frame rate
- GPU limitations
- memory constraints

Adapt:

```text
Fish count
Shadow quality
Texture resolution
Particle count
Water effects
Post-processing
Reflection quality
LOD
```

Target:

### Desktop

Prefer:

**60 FPS**

### Mobile

Prefer:

**30–60 FPS**, depending on hardware.

Never sacrifice application stability for visual effects.

---

# 26. Performance Architecture

Performance is a first-class requirement.

Implement:

### Instancing

Use instanced rendering where appropriate for:

- repeated plants
- particles
- bubbles
- repeated environmental objects

### LOD

Use different model detail levels based on distance.

### Culling

Do not render expensive objects unnecessarily.

### Texture optimization

Compress and resize textures appropriately.

### Simulation optimization

Do not update every expensive behavior at maximum frequency.

For example:

```text
Rendering
60 FPS

Fish movement
30–60 FPS

Far-away fish behavior
lower update frequency

Very distant fish
simplified simulation
```

Use time-based simulation rather than frame-dependent movement.

---

# 27. Fish Simulation Performance

The fish system should be designed to support many fish.

Do not run unnecessarily expensive React state updates for every fish every frame.

Avoid:

```text
React setState()
for every fish
for every frame
```

Instead:

- keep simulation state outside React where appropriate
- use refs
- use centralized simulation updates
- update transforms efficiently
- synchronize only necessary data with React

React should control UI/state.

The simulation should control fish movement.

---

# 28. Architecture Rule

Separate:

```text
React State
```

from:

```text
Real-time Simulation State
```

This is extremely important.

The simulation should not cause the entire React tree to re-render every frame.

---

# 29. Interaction Architecture

Create an event-driven interaction system.

Example:

```ts
type AquariumEvent =
	| GlassInteractionEvent
	| FoodReleasedEvent
	| LightChangedEvent
	| TimeChangedEvent
	| CameraInteractionEvent
```

Fish agents can subscribe/respond to relevant environmental events.

Avoid tightly coupling fish logic to UI components.

---

# 30. Persistence

Persist appropriate user preferences:

- Audio settings
- Music setting
- Volume
- Day/night mode
- Automatic/manual mode
- Aquarium time
- Quality setting
- Camera preferences

Use localStorage initially.

Create a versioned persistence structure so future schema changes can be migrated.

---

# 31. Accessibility

Even though AquaZen is a 3D experience, provide appropriate accessibility.

Support:

- keyboard navigation for controls
- visible focus states
- ARIA labels
- screen-reader-friendly controls
- reduced motion preference
- reduced effects option
- mute controls

Respect:

```text
prefers-reduced-motion
```

When reduced motion is enabled:

- disable cinematic camera movement
- reduce UI animation
- reduce unnecessary motion effects

Do not disable necessary aquarium simulation.

---

# 32. Loading Experience

Create a beautiful minimal loading screen.

Example:

```text
             AquaZen

        Preparing your aquarium...

              ◌
```

Optionally show:

```text
Preparing environment
Loading fish
Preparing water
```

Avoid fake loading progress.

Only show meaningful progress when possible.

Transition smoothly into the aquarium.

---

# 33. Error Handling

Handle gracefully:

- WebGL unavailable
- WebGL context lost
- asset loading failure
- audio failure
- unsupported device
- low-memory situations

If WebGL is unavailable, show a beautiful fallback message.

Do not crash the entire application.

---

# 34. 3D Asset Strategy

Do not blindly download random models from the internet.

Every external asset must have a compatible license.

Prefer:

1. Open-source assets with clear licenses.
2. Procedurally generated simple assets where appropriate.
3. Custom-created assets if necessary.
4. Properly licensed commercial assets only when permitted.

Document asset licenses in the repository.

Create:

```text
/docs/assets.md
```

containing:

- asset
- source
- author
- license
- usage restrictions

---

# 35. Development Phases

Build AquaZen in the following phases.

Do NOT attempt to implement everything in one giant step.

After each phase:

1. Run the application.
2. Check for errors.
3. Test the feature.
4. Fix issues.
5. Refactor if necessary.
6. Confirm the phase is stable.
7. Continue.

---

## Phase 0 — Project Foundation

Create:

- Next.js project
- TypeScript
- Tailwind
- ESLint
- formatting
- basic architecture
- environment configuration
- Git configuration

Create initial README.

Verify:

```bash
npm run dev
npm run build
```

---

# Phase 1 — 3D Aquarium Foundation

Create:

- full-screen scene
- camera
- renderer
- aquarium glass
- floor
- basic environment
- lighting
- camera controls

At the end of this phase, there must be a visually convincing empty aquarium.

---

# Phase 2 — Water Environment

Implement:

- water appearance
- underwater fog/depth
- particles
- bubbles
- lighting
- subtle environmental movement

Focus heavily on visual quality.

---

# Phase 3 — Environment Assets

Add:

- rocks
- gravel
- aquatic plants
- driftwood
- background elements

Arrange them procedurally or through configuration.

Avoid a perfectly symmetrical environment.

---

# Phase 4 — First Fish

Introduce the first fish species.

Implement:

- model loading
- animation
- movement
- orientation
- speed
- boundaries
- basic wandering

At this stage, prove that fish movement looks natural.

Do not proceed until movement feels convincing.

---

# Phase 5 — Fish Simulation Engine

Implement:

- FishAgent
- FishManager
- steering
- wander
- separation
- obstacle avoidance
- boundary avoidance
- preferred depth
- speed variation

The aquarium should now feel alive.

---

# Phase 6 — Personality System

Add:

- curiosity
- shyness
- energy
- sociability
- territoriality
- individual behavioral variation

Verify that fish of the same species do not behave identically.

---

# Phase 7 — Multiple Species

Add the remaining initial species.

Create species configuration.

Verify that each species:

- moves differently
- has different preferred depth
- has different speed
- has different personality distribution
- behaves appropriately

---

# Phase 8 — Schooling

Implement flocking behavior.

Test:

- school formation
- separation
- alignment
- cohesion
- disturbance
- food response

Avoid robotic synchronization.

---

# Phase 9 — Feeding

Implement:

- feed interaction
- food particles
- food physics
- food detection
- seeking
- feeding
- competition
- return-to-normal behavior

---

# Phase 10 — Glass Interaction

Implement:

- pointer detection
- touch detection
- glass interaction
- startle behavior
- curiosity behavior
- species/personality-dependent responses
- glass ripple/reflection

---

# Phase 11 — Day/Night

Implement:

- simulated clock
- automatic cycle
- manual controls
- sunrise
- sunset
- night
- lighting transition
- behavior changes

---

# Phase 12 — Audio

Implement:

- water ambience
- bubbles
- optional music
- volume controls
- mute
- browser autoplay handling

---

# Phase 13 — Cinematic Experience

Add:

- subtle camera motion
- scene transitions
- UI transitions
- lighting transitions
- loading transition
- interaction animations

Keep everything subtle.

---

# Phase 14 — UI

Implement the final minimal UI.

Include:

- Day
- Night
- Auto
- Feed
- Sound
- Camera
- Settings
- quality control if appropriate

Hide controls automatically when inactive.

---

# Phase 15 — Persistence

Implement local persistence.

Verify:

- refresh
- close browser
- reopen application

Settings should remain.

---

# Phase 16 — Responsive Optimization

Test:

- desktop
- laptop
- tablet
- mobile

Implement adaptive quality.

---

# Phase 17 — Performance Optimization

Measure actual performance.

Optimize:

- draw calls
- triangles
- textures
- shadows
- post-processing
- simulation updates
- React renders
- memory
- asset loading

Do not optimize based solely on assumptions.

---

# Phase 18 — Accessibility

Implement:

- keyboard support
- ARIA
- reduced motion
- focus handling
- accessible controls

---

# Phase 19 — Testing

Create tests for important non-visual systems.

Test:

### Unit

- steering behavior
- fish state transitions
- species configuration
- feeding logic
- personality generation
- time/day-night logic
- persistence
- quality settings

### Integration

- feeding interaction
- glass interaction
- day/night
- settings persistence

Do not attempt to unit-test Three.js internals unnecessarily.

---

# Phase 20 — Production Hardening

Verify:

```bash
npm run lint
npm run build
```

Fix all:

- TypeScript errors
- ESLint errors
- runtime errors
- console warnings
- asset loading errors

Ensure no development-only debugging remains.

---

# 36. Code Quality Rules

Use:

- strict TypeScript
- meaningful names
- small focused modules
- reusable hooks
- reusable components
- clear interfaces
- minimal coupling
- composition over inheritance where appropriate

Avoid:

- giant components
- giant hooks
- magic numbers
- duplicated behavior
- unnecessary abstractions
- unnecessary dependencies
- excessive context providers
- global state for everything

---

# 37. Simulation Code Organization

Prefer a structure similar to:

```text
src/
├── app/
├── components/
│   ├── aquarium/
│   ├── controls/
│   └── ui/
│
├── simulation/
│   ├── core/
│   ├── fish/
│   ├── behaviors/
│   ├── steering/
│   ├── environment/
│   ├── feeding/
│   └── interaction/
│
├── three/
│   ├── materials/
│   ├── loaders/
│   ├── effects/
│   └── utilities/
│
├── store/
├── hooks/
├── lib/
├── config/
├── types/
└── assets/
```

Adjust this structure if a better architecture emerges.

Do not fol
