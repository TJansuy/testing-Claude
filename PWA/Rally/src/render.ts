// A small WebGL renderer: every shape is a quad, and one fragment shader draws
// it as a signed-distance shape (rounded box, ellipse, the ball with its seam,
// a strung racket head, net mesh, soft glow, gradient), with smooth edges.
// Shapes are batched into one buffer and drawn in a single call per frame.

export const Kind = { Box: 0, Ellipse: 1, Ball: 2, Racket: 3, Net: 4, Glow: 5, Gradient: 6 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export type RGBA = [number, number, number, number];

const VERT = `
attribute vec2 a_pos; attribute vec2 a_uv; attribute vec2 a_size; attribute vec4 a_col; attribute vec4 a_par; attribute float a_kind;
uniform vec3 u_view; // scale x, scale y (world → clip), x offset; y offset below
uniform float u_vy;
varying vec2 v_uv; varying vec2 v_size; varying vec4 v_col; varying vec4 v_par; varying float v_kind;
void main() {
  v_uv = a_uv; v_size = a_size; v_col = a_col; v_par = a_par; v_kind = a_kind;
  gl_Position = vec4(a_pos.x * u_view.x + u_view.z, a_pos.y * u_view.y + u_vy, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv; varying vec2 v_size; varying vec4 v_col; varying vec4 v_par; varying float v_kind;
uniform float u_px; // world units per pixel
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float ellipse(vec2 p, vec2 r) { float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
void main() {
  vec2 p = v_uv * v_size; // position inside the shape, in world units
  float aa = u_px * 1.2;
  vec4 col = v_col;
  float d;
  if (v_kind < 0.5) {               // rounded box
    d = box(p, v_size, v_par.x);
  } else if (v_kind < 1.5) {        // ellipse
    d = ellipse(p, v_size);
  } else if (v_kind < 2.5) {        // ball: felt, shading and a turning seam
    d = ellipse(p, v_size);
    float a = v_par.x; vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p / v_size.x);
    float seam = abs(length(q - vec2(0.95, 0.0)) - 0.62);
    seam = min(seam, abs(length(q + vec2(0.95, 0.0)) - 0.62));
    col.rgb = mix(col.rgb, vec3(1.0), (1.0 - smoothstep(0.05, 0.11, seam)) * 0.9);
    col.rgb *= 0.75 + 0.35 * clamp(1.0 - length(p / v_size - vec2(-0.35, 0.4)), 0.0, 1.0);
  } else if (v_kind < 3.5) {        // racket head: a rim, with strings inside
    float outer = ellipse(p, v_size);
    float inner = ellipse(p, v_size - vec2(v_par.x));
    d = outer;
    if (inner < 0.0) {
      vec2 g = abs(fract(p / v_par.y + 0.5) - 0.5) * v_par.y;
      float s = min(g.x, g.y);
      col = mix(vec4(v_par.zzz, 0.55), vec4(col.rgb, 0.0), smoothstep(u_px * 0.6, u_px * 1.6, s));
      if (col.a < 0.01) discard;
    }
  } else if (v_kind < 4.5) {        // net mesh
    d = box(p, v_size, 0.0);
    vec2 g = abs(fract(p / v_par.x + 0.5) - 0.5) * v_par.x;
    float s = min(g.x, g.y);
    col.a *= 1.0 - smoothstep(u_px * 0.4, u_px * 1.4, s);
  } else if (v_kind < 5.5) {        // soft glow
    float k = length(v_uv);
    col.a *= pow(max(0.0, 1.0 - k), v_par.x);
    d = -1.0;
  } else {                          // vertical gradient (v_par is the top colour)
    col = mix(v_col, v_par, v_uv.y * 0.5 + 0.5);
    d = -1.0;
  }
  col.a *= 1.0 - smoothstep(-aa * 0.5, aa * 0.5, d);
  if (col.a <= 0.002) discard;
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

const FLOATS = 2 + 2 + 2 + 4 + 4 + 1; // per vertex
const MAX_QUADS = 4096;

export class Renderer {
  readonly gl: WebGLRenderingContext;
  private data = new Float32Array(MAX_QUADS * 6 * FLOATS);
  private n = 0;
  private buf: WebGLBuffer;
  private u: Record<string, WebGLUniformLocation | null> = {};
  /** World units per pixel, after layout. */
  px = 0.01;

  constructor(private canvas: HTMLCanvasElement) {
    const opts = { antialias: false, alpha: false, premultipliedAlpha: true };
    const gl = (canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const prog = gl.createProgram() as WebGLProgram;
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
      const sh = gl.createShader(type) as WebGLShader;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader error');
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    gl.useProgram(prog);
    this.buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    let off = 0;
    for (const [name, size] of [['a_pos', 2], ['a_uv', 2], ['a_size', 2], ['a_col', 4], ['a_par', 4], ['a_kind', 1]] as const) {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, FLOATS * 4, off * 4);
      off += size;
    }
    for (const name of ['u_view', 'u_vy', 'u_px']) this.u[name] = gl.getUniformLocation(prog, name);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Sizes the canvas and maps the world rectangle [x0, x1] × [y0, …] onto it (mirrored if asked). */
  begin(x0: number, x1: number, y0: number, mirror: boolean): { w: number; h: number; top: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    const unitsPerPx = (x1 - x0) / w;
    this.px = unitsPerPx;
    const sx = 2 / (x1 - x0), sy = 2 / (h * unitsPerPx);
    const cx = -(x0 + x1) / 2 * sx;
    gl.uniform3f(this.u.u_view, mirror ? -sx : sx, sy, mirror ? -cx : cx);
    gl.uniform1f(this.u.u_vy, -1 - y0 * sy);
    gl.uniform1f(this.u.u_px, unitsPerPx);
    this.n = 0;
    return { w, h, top: y0 + h * unitsPerPx };
  }

  /** Adds a shape centred at (x, y), half-size (hw, hh), turned by angle radians. */
  quad(kind: Kind, x: number, y: number, hw: number, hh: number, col: RGBA, par: RGBA = [0, 0, 0, 0], angle = 0): void {
    if (this.n >= MAX_QUADS) return;
    const pad = this.px * 2; // room for the smooth edge
    const ew = hw + pad, eh = hh + pad, uw = ew / hw, uh = eh / hh;
    const c = Math.cos(angle), s = Math.sin(angle);
    const corner = (u: number, v: number, o: number): void => {
      const lx = u * ew, ly = v * eh, d = this.data;
      d.set([x + lx * c - ly * s, y + lx * s + ly * c, u * uw, v * uh, hw, hh, col[0], col[1], col[2], col[3], par[0], par[1], par[2], par[3], kind], o);
    };
    const o = this.n * 6 * FLOATS;
    corner(-1, -1, o); corner(1, -1, o + FLOATS); corner(1, 1, o + 2 * FLOATS);
    corner(-1, -1, o + 3 * FLOATS); corner(1, 1, o + 4 * FLOATS); corner(-1, 1, o + 5 * FLOATS);
    this.n++;
  }

  end(): void {
    const gl = this.gl;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.n * 6 * FLOATS));
    gl.drawArrays(gl.TRIANGLES, 0, this.n * 6);
  }
}
