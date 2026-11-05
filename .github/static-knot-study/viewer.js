// Shader geometry and lighting preserved from the frozen delivery HTML.
const ROPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 start;
layout(location=1) in vec3 end;
layout(location=2) in float radius;
layout(location=3) in vec3 color;
uniform mat3 rotation;uniform vec2 extent;uniform vec2 pan;
flat out vec3 A;flat out vec3 B;flat out vec3 C;flat out float rad;out vec2 xy;
void main(){A=rotation*start;B=rotation*end;C=color;rad=radius;
 vec2 lo=min(A.xy,B.xy)-radius,hi=max(A.xy,B.xy)+radius;
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,0),vec2(1,1),vec2(0,1));
 xy=mix(lo,hi,corners[gl_VertexID]);gl_Position=vec4((xy+pan)/extent,0,1);
}`;
const ROPE_FS = `#version 300 es
precision highp float;
flat in vec3 A;flat in vec3 B;flat in vec3 C;flat in float rad;in vec2 xy;
uniform float farZ;uniform bool mono;out vec4 frag;
float sphere(vec3 ro,vec3 p){vec3 q=ro-p;float h=rad*rad-dot(q.xy,q.xy);return h<0.?1e20:q.z-sqrt(h);}
void main(){vec3 ro=vec3(xy,A.z);vec3 ba=B-A,oa=ro-A;float baba=dot(ba,ba),bard=-ba.z,baoa=dot(ba,oa),rdoa=-oa.z;
 float aa=baba-bard*bard,bb=baba*rdoa-baoa*bard,cc=baba*dot(oa,oa)-baoa*baoa-rad*rad*baba;
 float h=bb*bb-aa*cc,t=min(sphere(ro,A),sphere(ro,B));
 if(h>=0.&&aa>1e-7){float u=(-bb-sqrt(h))/aa,y=baoa+u*bard;if(y>=0.&&y<=baba)t=min(t,u);}
 if(t>1e19)discard;
 vec3 p=ro+vec3(0,0,-t),nearP=A+ba*clamp(dot(p-A,ba)/max(baba,1e-12),0.,1.),n=normalize(p-nearP);
 float key=max(dot(n,normalize(vec3(-.45,.65,1.))),0.),fill=max(dot(n,normalize(vec3(.7,-.2,.4))),0.);
 float shine=pow(max(dot(n,normalize(vec3(-.22,.3,1.))),0.),34.);
 vec3 base=mono?vec3(.60,.64,.65):C;
 frag=vec4(base*(.44+.49*key+.14*fill)+.09*shine,1.);
 gl_FragDepth=.5-p.z/(2.*farZ);
}`;
const SCENE_FS = `#version 300 es
precision highp float;in vec3 N;in vec3 C;uniform bool mono;out vec4 frag;
void main(){vec3 n=normalize(N);if(!gl_FrontFacing)n=-n;float key=max(dot(n,normalize(vec3(-.45,.65,1.))),0.),fill=max(dot(n,normalize(vec3(.7,-.2,.4))),0.);float shine=pow(max(dot(n,normalize(vec3(-.22,.3,1.))),0.),34.);vec3 base=mono?vec3(.60,.64,.65):C;frag=vec4(base*(.44+.49*key+.14*fill)+.09*shine,1.);}`;
const MESH_VS = `#version 300 es
precision highp float;layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in vec3 color;
uniform mat3 rotation;uniform vec2 extent;uniform float farZ;out vec3 N;out vec3 C;
void main(){vec3 p=rotation*position;N=rotation*normal;C=color;gl_Position=vec4(p.xy/extent,-p.z/farZ,1.);}`;
const RING_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 A;layout(location=1) in vec3 NA;layout(location=2) in vec3 BA;layout(location=3) in float RA;
layout(location=4) in vec3 B;layout(location=5) in vec3 NB;layout(location=6) in vec3 BB;layout(location=7) in float RB;
uniform mat3 rotation;uniform vec2 extent;uniform float farZ;uniform vec3 color;out vec3 N;out vec3 C;
void main(){int side=gl_VertexID/6,j=gl_VertexID%6;int corner[6]=int[6](0,1,0,1,1,0);float f[6]=float[6](0.,0.,1.,0.,1.,1.);float t=f[j],theta=float((side+corner[j])%8)*.7853981633974483;vec3 n=mix(NA,NB,t)*cos(theta)+mix(BA,BB,t)*sin(theta);vec3 p=mix(A,B,t)+mix(RA,RB,t)*n;if(RA==0.)n=-cross(NB,BB);if(RB==0.)n=cross(NA,BA);p=rotation*p;N=rotation*n;C=color;gl_Position=vec4(p.xy/extent,-p.z/farZ,1.);}`;
// One live scene per canvas; no decoded scene cache is retained.
const mounted = new WeakMap();
const frontPose = () => ({ yaw: 0, pitch: 0, zoom: 1 });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function rotation(yaw, pitch) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  return new Float32Array([c, sp * s, -cp * s, 0, cp, sp, s, -sp * c, cp * c]);
}
function program(gl, vs, fs) {
  const shaders = [];
  const out = gl.createProgram();
  try {
    for (const [type, text] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ]) {
      const sh = gl.createShader(type);
      shaders.push(sh);
      gl.shaderSource(sh, text);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw Error("三维着色器启动失败");
      gl.attachShader(out, sh);
    }
    gl.linkProgram(out);
    if (!gl.getProgramParameter(out, gl.LINK_STATUS)) throw Error("三维显示程序启动失败");
    const u = {};
    for (const k of ["rotation", "extent", "pan", "farZ", "mono", "color"]) u[k] = gl.getUniformLocation(out, k);
    return { program: out, u };
  } catch (e) {
    gl.deleteProgram(out);
    throw e;
  } finally {
    for (const sh of shaders) gl.deleteShader(sh);
  }
}
class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!this.gl || this.gl.isContextLost()) throw Error("当前浏览器无法显示三维模型，请使用支持 WebGL 2 的浏览器后重试。");
    this.programs = [];
    this.resources = [];
    this.rings = [];
    try {
      this.rope = program(this.gl, ROPE_VS, ROPE_FS);
      this.programs.push(this.rope);
      this.meshProgram = program(this.gl, MESH_VS, SCENE_FS);
      this.programs.push(this.meshProgram);
      this.ringProgram = program(this.gl, RING_VS, SCENE_FS);
      this.programs.push(this.ringProgram);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }
  buffer(data, stride, attributes, instanced) {
    const g = this.gl,
      vao = g.createVertexArray(),
      buf = g.createBuffer();
    this.resources.push({ vao, buf });
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, data, g.STATIC_DRAW);
    for (const [location, size, offset] of attributes) {
      g.enableVertexAttribArray(location);
      g.vertexAttribPointer(location, size, g.FLOAT, false, stride, offset);
      if (instanced) g.vertexAttribDivisor(location, 1);
    }
    return vao;
  }
  setScene(scene) {
    this.dimensions = scene.meta.dimensionsMm;
    this.ropeCount = scene.segments.length / 10;
    this.ropeVAO = this.buffer(
      scene.segments,
      40,
      [
        [0, 3, 0],
        [1, 3, 12],
        [2, 1, 24],
        [3, 3, 28],
      ],
      true
    );
    if (scene.triangles) {
      this.meshCount = scene.triangles.length / 9;
      this.meshVAO = this.buffer(
        scene.triangles,
        36,
        [
          [0, 3, 0],
          [1, 3, 12],
          [2, 3, 24],
        ],
        false
      );
    }
    for (const ring of scene.rings) {
      const vao = this.buffer(
        ring.data,
        40,
        [
          [0, 3, 0],
          [1, 3, 12],
          [2, 3, 24],
          [3, 1, 36],
          [4, 3, 40],
          [5, 3, 52],
          [6, 3, 64],
          [7, 1, 76],
        ],
        true
      );
      this.rings.push({ vao, count: ring.meta.count - 1, color: ring.meta.color.map((v) => v / 255) });
    }
  }
  draw(pose) {
    if (!this.dimensions) return false;
    const c = this.canvas,
      g = this.gl,
      dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const w = Math.round(c.clientWidth * dpr),
      h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return false;
    if (g.isContextLost()) throw Error("三维显示已中断，请重新加载当前模型。");
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.viewport(0, 0, w, h);
    g.clearColor(0.957, 0.953, 0.937, 1);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.enable(g.DEPTH_TEST);
    g.disable(g.CULL_FACE);
    g.disable(g.BLEND);
    const span = Math.max(...this.dimensions),
      size = (span * 1.19) / pose.zoom,
      mat = rotation(pose.yaw, pose.pitch);
    const use = (p) => {
      g.useProgram(p.program);
      g.uniformMatrix3fv(p.u.rotation, false, mat);
      g.uniform2f(p.u.extent, (size / 2) * Math.max(1, w / h), (size / 2) * Math.max(1, h / w));
      g.uniform1f(p.u.farZ, Math.max(span * 3, 1000));
      g.uniform1i(p.u.mono, 0);
    };
    use(this.rope);
    g.uniform2f(this.rope.u.pan, 0, 0);
    g.bindVertexArray(this.ropeVAO);
    g.drawArraysInstanced(g.TRIANGLES, 0, 6, this.ropeCount);
    if (this.meshVAO) {
      use(this.meshProgram);
      g.bindVertexArray(this.meshVAO);
      g.drawArrays(g.TRIANGLES, 0, this.meshCount);
    }
    if (this.rings.length) {
      use(this.ringProgram);
      for (const r of this.rings) {
        g.bindVertexArray(r.vao);
        g.uniform3fv(this.ringProgram.u.color, r.color);
        g.drawArraysInstanced(g.TRIANGLES, 0, 48, r.count);
      }
    }
    const error = g.getError();
    if (error !== g.NO_ERROR) throw Error("三维绘制失败，请重新加载当前模型。");
    return true;
  }
  dispose() {
    const g = this.gl;
    if (!g) return;
    for (const { vao, buf } of this.resources || []) {
      g.deleteVertexArray(vao);
      g.deleteBuffer(buf);
    }
    for (const p of this.programs || []) g.deleteProgram(p.program);
    this.resources = [];
    this.programs = [];
    this.rings = [];
    this.dimensions = null;
    // Keep the canvas context usable for the next question; do not loseContext().
  }
}
async function fetchBytes(url, desc, signal, progress) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error("模型下载失败，请检查网络并重试。");
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
      progress(value.length);
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    progress(bytes.length);
  }
  if (bytes.length !== desc.bytes) throw Error("模型文件下载不完整，请重试。");
  if (globalThis.crypto?.subtle) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    if (Array.from(hash, (x) => x.toString(16).padStart(2, "0")).join("") !== desc.sha256) throw Error("模型文件校验失败，请重试。");
  }
  signal.throwIfAborted?.();
  let raw;
  if (globalThis.DecompressionStream) {
    try {
      raw = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  if (!raw) {
    const { gunzipSync } = await import("./lib/fflate.min.js");
    const out = gunzipSync(bytes);
    raw = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  }
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return raw;
}
async function decodeScene(meta, base, signal, progress) {
  let raw = await fetchBytes(new URL(meta.curves.file, base), meta.curves, signal, progress);
  const hdr = new Uint32Array(raw, 0, 2),
    n = hdr[1];
  if (hdr[0] !== 0x544f4e4b || raw.byteLength !== 8 + n * 15) throw Error("模型数据校验失败");
  const p = new Int32Array(raw, 8, n * 3),
    c = new Uint8Array(raw, 8 + n * 12, n * 3);
  let count = (meta.spheres || []).length;
  for (const path of meta.paths) {
    if (path.count < 1 || path.first < 0 || path.first + path.count > n) throw Error("模型路径校验失败");
    count += path.count - 1;
  }
  const segments = new Float32Array(count * 10);
  let j = 0;
  for (const path of meta.paths)
    for (let i = path.first; i < path.first + path.count - 1; i++) {
      for (let k = 0; k < 3; k++) segments[j++] = p[i * 3 + k] / 1000;
      for (let k = 0; k < 3; k++) segments[j++] = p[(i + 1) * 3 + k] / 1000;
      segments[j++] = path.radius;
      for (let k = 0; k < 3; k++) segments[j++] = c[i * 3 + k] / 255;
    }
  for (const b of meta.spheres || []) {
    segments.set([...b.center, ...b.center, b.radius, ...b.color.map((v) => v / 255)], j);
    j += 10;
  }
  const scene = { meta, segments, rings: [], triangles: null };
  // Tubes remain exact source eight-sided rings. Do not make duplicate capsule copies.
  for (const r of meta.ringTubes || []) {
    raw = await fetchBytes(new URL(r.file, base), r, signal, progress);
    if (raw.byteLength !== r.count * 40) throw Error("管线数据长度不符");
    scene.rings.push({ data: new Float32Array(raw), meta: r });
  }
  if (meta.mesh) {
    raw = await fetchBytes(new URL(meta.mesh.file, base), meta.mesh, signal, progress);
    const h = new Uint32Array(raw, 0, 3),
      nv = h[1],
      nt = h[2];
    if (h[0] !== 0x4853454d || nv !== meta.mesh.vertexCount || nt !== meta.mesh.triangleCount) throw Error("饰件数据校验失败");
    const points = new Int32Array(raw, 12, nv * 3),
      indices = new Uint32Array(raw, 12 + nv * 12, nt * 3);
    const colors = new Uint8Array(raw, 12 + nv * 12 + nt * 12, (meta.mesh.vertexColors ? nv : nt) * 3);
    const normals = meta.mesh.vertexNormals ? new Float32Array(raw, meta.mesh.normalByteOffset, nv * 3) : null;
    const triangles = new Float32Array(nt * 27);
    for (let i = 0; i < nt; i++) {
      const a = indices[i * 3] * 3,
        b = indices[i * 3 + 1] * 3,
        d = indices[i * 3 + 2] * 3;
      const ux = points[b] - points[a],
        uy = points[b + 1] - points[a + 1],
        uz = points[b + 2] - points[a + 2];
      const vx = points[d] - points[a],
        vy = points[d + 1] - points[a + 1],
        vz = points[d + 2] - points[a + 2];
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx,
        len = Math.hypot(nx, ny, nz) || 1;
      for (let corner = 0; corner < 3; corner++) {
        const vi = indices[i * 3 + corner],
          ci = (meta.mesh.vertexColors ? vi : i) * 3,
          o = i * 27 + corner * 9;
        triangles[o] = points[vi * 3] / 1000;
        triangles[o + 1] = points[vi * 3 + 1] / 1000;
        triangles[o + 2] = points[vi * 3 + 2] / 1000;
        triangles[o + 3] = normals ? normals[vi * 3] : nx / len;
        triangles[o + 4] = normals ? normals[vi * 3 + 1] : ny / len;
        triangles[o + 5] = normals ? normals[vi * 3 + 2] : nz / len;
        triangles[o + 6] = colors[ci] / 255;
        triangles[o + 7] = colors[ci + 1] / 255;
        triangles[o + 8] = colors[ci + 2] / 255;
      }
    }
    scene.triangles = triangles;
  }
  return scene;
}
/** Load a single anonymous manifest. Resolves only after the complete 3D scene draws.
 * options: {signal, onProgress({loaded,total}), onError(error)}
 * result: {reset(), dispose(), getPose()}.
 */
export async function mountViewer(canvas, manifestURL, options = {}) {
  mounted.get(canvas)?.dispose();
  const controller = new AbortController(),
    signal = controller.signal;
  let renderer = null,
    observer = null,
    frame = 0,
    disposed = false,
    pose = frontPose();
  const isCurrent = () => mounted.get(canvas) === entry;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    cancelAnimationFrame(frame);
    observer?.disconnect();
    renderer?.dispose();
    renderer = null;
    options.signal?.removeEventListener("abort", dispose);
    if (isCurrent()) {
      canvas.dataset.viewerReady = "false";
      mounted.delete(canvas);
    }
  };
  const entry = { dispose };
  mounted.set(canvas, entry);
  canvas.dataset.viewerReady = "false";
  options.signal?.addEventListener("abort", dispose, { once: true });
  if (options.signal?.aborted) dispose();
  const fail = (error) => {
    if (isCurrent()) canvas.dataset.viewerReady = "false";
    options.onError?.(error);
    canvas.dispatchEvent(new CustomEvent("viewererror", { bubbles: true, detail: { message: error.message } }));
  };
  const draw = () => {
    if (disposed) return;
    try {
      if (renderer.draw(pose)) canvas.dataset.viewerReady = "true";
    } catch (error) {
      fail(error);
    }
  };
  const queue = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };
  const reset = () => {
    pose = frontPose();
    queue();
  };
  try {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    renderer = new SceneRenderer(canvas);
    const base = new URL(manifestURL, document.baseURI);
    const response = await fetch(base, { signal });
    if (!response.ok) throw Error("模型信息下载失败，请检查网络并重试。");
    const meta = await response.json();
    if (meta.schema !== 1 || !Array.isArray(meta.paths) || !meta.curves) throw Error("模型信息不完整");
    let loaded = 0;
    const progress = (n) => {
      loaded += n;
      options.onProgress?.({ loaded, total: meta.totalBytes });
    };
    options.onProgress?.({ loaded: 0, total: meta.totalBytes });
    const scene = await decodeScene(meta, base, signal, progress);
    if (disposed || signal.aborted) throw new DOMException("Aborted", "AbortError");
    renderer.setScene(scene);
    if (!renderer.draw(pose)) throw Error("三维显示区域尚未就绪，请重试。");
    canvas.dataset.viewerReady = "true";
    const touches = new Map();
    let previous = null;
    canvas.style.touchAction = "none";
    const listen = (name, fn, extra = {}) => canvas.addEventListener(name, fn, { ...extra, signal });
    listen("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      previous = [...touches.values()].map((p) => p.slice());
    });
    listen("pointermove", (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      const now = [...touches.values()];
      if (previous && now.length === previous.length) {
        if (now.length === 1) {
          pose.yaw += (now[0][0] - previous[0][0]) * 0.008;
          pose.pitch = clamp(pose.pitch + (now[0][1] - previous[0][1]) * 0.008, -1.5, 1.5);
        }
        if (now.length === 2) {
          const distance = (a) => Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
          pose.zoom = clamp((pose.zoom * distance(now)) / Math.max(2, distance(previous)), 0.35, 6);
        }
        queue();
      }
      previous = now.map((p) => p.slice());
    });
    const end = (e) => {
      touches.delete(e.pointerId);
      previous = [...touches.values()].map((p) => p.slice());
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) listen(event, end);
    listen(
      "wheel",
      (e) => {
        e.preventDefault();
        pose.zoom = clamp(pose.zoom * Math.exp(-e.deltaY * 0.001), 0.35, 6);
        queue();
      },
      { passive: false }
    );
    listen("dblclick", reset);
    listen("keydown", (e) => {
      if (e.key === "ArrowLeft") pose.yaw -= 0.15;
      else if (e.key === "ArrowRight") pose.yaw += 0.15;
      else if (e.key === "ArrowUp") pose.pitch = clamp(pose.pitch - 0.15, -1.5, 1.5);
      else if (e.key === "ArrowDown") pose.pitch = clamp(pose.pitch + 0.15, -1.5, 1.5);
      else if (e.key === "+" || e.key === "=") pose.zoom = clamp(pose.zoom * 1.15, 0.35, 6);
      else if (e.key === "-") pose.zoom = clamp(pose.zoom / 1.15, 0.35, 6);
      else if (e.key === "Home") pose = frontPose();
      else return;
      e.preventDefault();
      queue();
    });
    listen("webglcontextlost", (e) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      fail(Error("三维显示已中断，请重新加载当前模型。"));
    });
    observer = new ResizeObserver(queue);
    observer.observe(canvas);
    return { reset, dispose, getPose: () => ({ ...pose }) };
  } catch (error) {
    dispose();
    throw error;
  }
}
