export interface SonicCoreFrame {
  time: number
  bass: number
  middle: number
  treble: number
  pulseAge: number
  orbitAngle: number
  pointerX: number
  pointerY: number
  isDark: boolean
  isCompact: boolean
}

export interface SonicCoreRenderer {
  draw: (frame: SonicCoreFrame) => void
  destroy: () => void
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// AI modified: one soft core and source orbit make real frequency bands visible without a particle simulation.
const fragmentShaderSource = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform vec3 u_bands;
uniform float u_pulseAge;
uniform float u_orbitAngle;
uniform float u_dark;
uniform int u_steps;
out vec4 outputColor;

mat2 turn(float angle) {
  return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
}

vec2 sceneDistance(vec3 point) {
  vec3 corePoint = point;
  corePoint.xz *= turn(u_time * 0.09);
  vec3 direction = normalize(corePoint + vec3(0.00001));
  float flow = sin(direction.x * 5.5 + u_time * 0.7) * sin(direction.y * 4.5 - u_time * 0.5);
  flow += sin(direction.z * 6.0 + direction.x * 2.0 - u_time * 0.4) * 0.45;
  float breath = sin(u_time * 0.6) * 0.005;
  float radius = 0.68 + breath + u_bands.x * 0.18;
  float core = length(corePoint) - radius + flow * (0.018 + u_bands.x * 0.07 + u_bands.y * 0.035);

  vec3 orbitPoint = point;
  orbitPoint.xy *= turn(-0.32 + u_orbitAngle);
  orbitPoint.yz *= turn(0.58 + sin(u_orbitAngle) * 0.22);
  float angle = atan(orbitPoint.z, orbitPoint.x);
  float orbitRadius = 1.12 + u_bands.y * 0.07;
  float orbitWave = sin(angle * 18.0 + u_time * 0.7) * u_bands.y * 0.016;
  vec2 orbitSection = vec2(length(orbitPoint.xz) - orbitRadius - orbitWave, orbitPoint.y);
  float orbit = length(orbitSection) - (0.011 + u_bands.z * 0.013);
  return core < orbit ? vec2(core, 1.0) : vec2(orbit, 2.0);
}

vec3 surfaceNormal(vec3 point) {
  vec2 offset = vec2(0.0017, 0.0);
  float centerDistance = sceneDistance(point).x;
  return normalize(vec3(
    sceneDistance(point + offset.xyy).x - centerDistance,
    sceneDistance(point + offset.yxy).x - centerDistance,
    sceneDistance(point + offset.yyx).x - centerDistance
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec3 backdrop = mix(vec3(0.965, 0.955, 0.993), vec3(0.052, 0.043, 0.079), u_dark);
  float aura = exp(-dot(uv * vec2(0.7, 1.0), uv * vec2(0.7, 1.0)) * 1.6);
  vec3 violetGlow = mix(vec3(0.61, 0.49, 0.91), vec3(0.43, 0.22, 0.77), u_dark);
  vec3 color = mix(backdrop, violetGlow, aura * (0.10 + u_bands.x * 0.10));

  float pulseRadius = 0.55 + u_pulseAge * 0.82;
  float pulseDistance = abs(length(uv * vec2(0.85, 1.0)) - pulseRadius);
  float pulse = (1.0 - smoothstep(0.006, 0.035, pulseDistance)) * pow(1.0 - u_pulseAge, 2.0);
  color += violetGlow * pulse * 0.25;

  vec3 rayOrigin = vec3(u_pointer.x * 0.16, u_pointer.y * 0.10, 3.55);
  vec3 rayDirection = normalize(vec3(uv * 1.12 - u_pointer * 0.07, -2.28));
  float travel = 0.0;
  float material = 0.0;
  float nearOrbit = 1.0;
  for (int stepIndex = 0; stepIndex < 72; stepIndex++) {
    if (stepIndex >= u_steps) break;
    vec3 point = rayOrigin + rayDirection * travel;
    vec2 surface = sceneDistance(point);
    if (surface.y > 1.5) nearOrbit = min(nearOrbit, surface.x);
    if (surface.x < 0.0018) {
      material = surface.y;
      break;
    }
    travel += surface.x * 0.8;
    if (travel > 6.0) break;
  }

  color += violetGlow * exp(-max(0.0, nearOrbit) * 70.0) * 0.045;
  if (material > 0.0) {
    vec3 point = rayOrigin + rayDirection * travel;
    vec3 normal = surfaceNormal(point);
    vec3 view = normalize(rayOrigin - point);
    vec3 light = normalize(vec3(-0.55, 0.75, 1.0));
    float diffuse = max(dot(normal, light), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.4);
    float highlight = pow(max(dot(reflect(-light, normal), view), 0.0), 65.0);
    float softLight = pow(max(dot(normal, normalize(vec3(0.65, -0.4, 0.65))), 0.0), 7.0);
    vec3 violet = mix(vec3(0.39, 0.21, 0.76), vec3(0.31, 0.14, 0.64), u_dark);
    vec3 pearl = mix(vec3(0.90, 0.84, 1.0), vec3(0.72, 0.57, 1.0), u_dark);
    vec3 core = mix(violet, pearl, diffuse * 0.64);
    float internalFlow = sin(point.y * 7.0 + point.x * 5.0 + u_time * 0.32) * 0.5 + 0.5;
    core = mix(core, backdrop, 0.17 + (1.0 - fresnel) * 0.14);
    core += violetGlow * internalFlow * (0.08 + u_bands.y * 0.12);
    core += vec3(0.63, 0.40, 1.0) * fresnel * (0.6 + u_bands.z * 0.65);
    core += vec3(0.45, 0.62, 0.96) * softLight * 0.22;
    core += vec3(0.97, 0.92, 1.0) * highlight * 0.8;
    vec3 orbit = mix(violet * 0.8, pearl, diffuse * 0.7 + fresnel * 0.3);
    float orbitLight = pow(max(sin(atan(point.y, point.x) * 2.0 - u_time * (0.18 + u_bands.y * 0.7)), 0.0), 8.0);
    orbit += pearl * orbitLight * (0.28 + u_bands.z * 0.8);
    color = material < 1.5 ? core : orbit;
  }

  // A little grain softens glass highlights without a post-processing pass.
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color += grain * 0.006;
  outputColor = vec4(max(color, vec3(0.0)), 1.0);
}`

function compileShader(context: WebGL2RenderingContext, shaderType: number, source: string): WebGLShader {
  const shader = context.createShader(shaderType)
  if (!shader)
    throw new Error('Unable to create Sonic Core shader')
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) ?? 'Unable to compile Sonic Core shader'
    context.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

export function createSonicCore(canvas: HTMLCanvasElement): SonicCoreRenderer | undefined {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' })
  if (!context)
    return

  let vertexShader: WebGLShader | undefined
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | null = null
  let vertices: WebGLBuffer | null = null

  // AI modified: every allocation is released on compilation failure, context replacement, and unmount.
  function destroy(): void {
    context?.deleteBuffer(vertices)
    context?.deleteProgram(program)
    if (vertexShader)
      context?.deleteShader(vertexShader)
    if (fragmentShader)
      context?.deleteShader(fragmentShader)
  }

  try {
    vertexShader = compileShader(context, context.VERTEX_SHADER, vertexShaderSource)
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, fragmentShaderSource)
    program = context.createProgram()
    vertices = context.createBuffer()
    if (!program || !vertices)
      throw new Error('Unable to allocate Sonic Core renderer')
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS))
      throw new Error(context.getProgramInfoLog(program) ?? 'Unable to link Sonic Core shader')
    context.useProgram(program)
    context.bindBuffer(context.ARRAY_BUFFER, vertices)
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW)
    const position = context.getAttribLocation(program, 'a_position')
    context.enableVertexAttribArray(position)
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0)

    const uniforms = {
      resolution: context.getUniformLocation(program, 'u_resolution'),
      pointer: context.getUniformLocation(program, 'u_pointer'),
      time: context.getUniformLocation(program, 'u_time'),
      bands: context.getUniformLocation(program, 'u_bands'),
      pulseAge: context.getUniformLocation(program, 'u_pulseAge'),
      orbitAngle: context.getUniformLocation(program, 'u_orbitAngle'),
      dark: context.getUniformLocation(program, 'u_dark'),
      steps: context.getUniformLocation(program, 'u_steps'),
    }

    return {
      draw(frame) {
        context.viewport(0, 0, canvas.width, canvas.height)
        context.uniform2f(uniforms.resolution, canvas.width, canvas.height)
        context.uniform2f(uniforms.pointer, frame.pointerX, frame.pointerY)
        context.uniform1f(uniforms.time, frame.time)
        context.uniform3f(uniforms.bands, frame.bass, frame.middle, frame.treble)
        context.uniform1f(uniforms.pulseAge, frame.pulseAge)
        context.uniform1f(uniforms.orbitAngle, frame.orbitAngle)
        context.uniform1f(uniforms.dark, frame.isDark ? 1 : 0)
        context.uniform1i(uniforms.steps, frame.isCompact ? 48 : 72)
        context.drawArrays(context.TRIANGLES, 0, 3)
      },
      destroy,
    }
  }
  catch (error) {
    destroy()
    throw error
  }
}
