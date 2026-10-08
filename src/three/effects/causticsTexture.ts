import {
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RepeatWrapping,
	Scene,
	ShaderMaterial,
	WebGLRenderTarget,
	type WebGLRenderer,
} from "three"

/** Voronoi cells across one tile of the caustic texture. */
const CELLS_PER_TILE = 8

/**
 * Renders the animated caustic pattern into a small tileable texture once
 * per frame. Every lit surface then samples this texture instead of
 * evaluating the pattern itself — a few hundred thousand pixels of work
 * per frame instead of millions.
 *
 * Red and green hold two independent layers for richer interference.
 */
export class CausticsTexture {
	readonly target: WebGLRenderTarget
	private readonly scene = new Scene()
	private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
	private readonly material: ShaderMaterial
	private readonly quad: Mesh

	constructor(size = 512) {
		this.target = new WebGLRenderTarget(size, size, {
			wrapS: RepeatWrapping,
			wrapT: RepeatWrapping,
			minFilter: LinearMipmapLinearFilter,
			magFilter: LinearFilter,
			generateMipmaps: true,
			depthBuffer: false,
		})
		this.material = new ShaderMaterial({
			uniforms: { uTime: { value: 0 } },
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = vec4(position.xy, 0.0, 1.0);
				}
			`,
			fragmentShader: /* glsl */ `
				uniform float uTime;
				varying vec2 vUv;
				const float CELLS = ${CELLS_PER_TILE.toFixed(1)};

				vec2 hash22(vec2 p) {
					p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
					return fract(sin(p) * 43758.5453);
				}

				// Voronoi edge brightness with cell indices wrapped, so the tile repeats seamlessly.
				float layer(vec2 uv, float t, float seed) {
					vec2 p = uv * CELLS;
					vec2 cell = floor(p);
					vec2 f = fract(p);
					float d1 = 8.0;
					float d2 = 8.0;
					for (int j = -1; j <= 1; j++) {
						for (int i = -1; i <= 1; i++) {
							vec2 g = vec2(float(i), float(j));
							vec2 wrapped = mod(cell + g, CELLS);
							vec2 o = hash22(wrapped + seed);
							o = 0.5 + 0.4 * sin(t + 6.2831 * o);
							vec2 r = g + o - f;
							float d = dot(r, r);
							if (d < d1) { d2 = d1; d1 = d; }
							else if (d < d2) { d2 = d; }
						}
					}
					float edge = sqrt(d2) - sqrt(d1);
					return 1.0 - smoothstep(0.0, 0.22, edge);
				}

				void main() {
					gl_FragColor = vec4(layer(vUv, uTime * 0.8, 0.0), layer(vUv, uTime * 0.63 + 2.1, 17.0), 0.0, 1.0);
				}
			`,
			depthTest: false,
			depthWrite: false,
		})
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
		this.quad.frustumCulled = false
		this.scene.add(this.quad)
	}

	update(renderer: WebGLRenderer, time: number): void {
		this.material.uniforms.uTime!.value = time
		const previous = renderer.getRenderTarget()
		renderer.setRenderTarget(this.target)
		renderer.render(this.scene, this.camera)
		renderer.setRenderTarget(previous)
	}

	dispose(): void {
		this.target.dispose()
		this.material.dispose()
		this.quad.geometry.dispose()
	}
}
