#version 100
precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Motion
 * @range 0,1
 * @default 1
 */
uniform float u_motion;

/**
 * @label Audio energy
 * @range 0,1
 * @default 0.5
 */
uniform float u_energy;

/**
 * @label Dark mode
 * @range 0,1
 * @default 1
 */
uniform float u_dark;

/**
 * @label Media source
 * @range 0,2
 * @default 0
 */
uniform float u_source;

// AI modified: reduced-motion mode freezes every animated channel at a composed preview pose.
float animationTime() {
  return mix(2.3, u_time, clamp(u_motion, 0.0, 1.0));
}

// AI modified: this Pen preview uses a clock-driven audio surrogate; production supplies real frequency bands.
vec3 previewBands() {
  float time = animationTime();
  float bass = 0.5 + 0.5 * sin(time * 2.05);
  float middle = 0.5 + 0.5 * sin(time * 1.31 + 0.9);
  float treble = 0.5 + 0.5 * sin(time * 2.73 + 1.8);
  return clamp(u_energy, 0.0, 1.0) * vec3(bass, middle, treble);
}

mat2 turn(float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return mat2(cosine, -sine, sine, cosine);
}

vec2 surfaceDistance(vec3 position) {
  float time = animationTime();
  vec3 bands = previewBands();
  vec3 corePosition = position;
  corePosition.xz *= turn(time * 0.075);
  vec3 direction = corePosition / max(length(corePosition), 0.0001);
  float broadFlow = sin(direction.x * 3.4 + time * 0.32)
    * sin(direction.y * 2.8 - time * 0.25);
  broadFlow += sin(direction.z * 3.5 + direction.x * 1.5 + time * 0.28) * 0.45;
  float radius = 0.76 + bands.x * 0.085;
  float core = length(corePosition) - radius + broadFlow * (0.023 + bands.x * 0.043);

  vec3 orbitPosition = position;
  orbitPosition.xy *= turn(-0.32 + u_source * 0.095);
  orbitPosition.yz *= turn(0.62 + sin(u_source * 0.65) * 0.12);
  float orbitAngle = atan(orbitPosition.z, orbitPosition.x);
  float orbitRadius = 1.10 + bands.y * 0.025;
  float orbitWave = sin(orbitAngle * 3.0 + time * 0.32) * bands.y * 0.013;
  float orbit = length(vec2(length(orbitPosition.xz) - orbitRadius - orbitWave, orbitPosition.y)) - 0.009;

  vec3 echoPosition = position;
  echoPosition.xy *= turn(0.24 - u_source * 0.055);
  echoPosition.yz *= turn(0.89);
  float echo = length(vec2(length(echoPosition.xz) - 1.24, echoPosition.y)) - 0.0045;
  vec2 nearestOrbit = orbit < echo ? vec2(orbit, 2.0) : vec2(echo, 3.0);
  return core < nearestOrbit.x ? vec2(core, 1.0) : nearestOrbit;
}

vec3 surfaceNormal(vec3 position) {
  vec2 offset = vec2(0.0018, -0.0018);
  return normalize(
    offset.xyy * surfaceDistance(position + offset.xyy).x
    + offset.yyx * surfaceDistance(position + offset.yyx).x
    + offset.yxy * surfaceDistance(position + offset.yxy).x
    + offset.xxx * surfaceDistance(position + offset.xxx).x
  );
}

void main() {
  float time = animationTime();
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / max(u_resolution.y, 1.0);
  float dark = clamp(u_dark, 0.0, 1.0);
  vec3 bands = previewBands();
  vec3 backdrop = mix(vec3(0.977, 0.967, 0.993), vec3(0.047, 0.035, 0.074), dark);
  vec3 purple = mix(vec3(0.57, 0.34, 0.84), vec3(0.46, 0.22, 0.78), dark);
  vec2 auraPosition = uv * vec2(0.8, 1.15) - vec2(0.0, -0.08);
  float aura = exp(-dot(auraPosition, auraPosition) * 1.6);
  vec3 color = mix(backdrop, purple, aura * mix(0.065, 0.12, dark));

  float shadow = exp(-pow(uv.x * 1.75, 2.0) - pow((uv.y + 0.70) * 12.0, 2.0));
  color *= 1.0 - shadow * mix(0.065, 0.25, dark);

  vec3 rayOrigin = vec3(0.0, 0.035, 3.70);
  vec3 rayDirection = normalize(vec3(uv * 1.13, -2.70));
  float travel = 1.8;
  float material = 0.0;
  float nearOrbit = 1.0;

  // AI modified: a fixed 48-step ceiling keeps the embedded prototype economical to render.
  for (int stepIndex = 0; stepIndex < 48; stepIndex++) {
    vec3 position = rayOrigin + rayDirection * travel;
    vec2 surface = surfaceDistance(position);
    if (surface.y > 1.5) nearOrbit = min(nearOrbit, max(surface.x, 0.0));
    if (surface.x < 0.0019) {
      material = surface.y;
      break;
    }
    travel += surface.x * 0.84;
    if (travel > 5.6) break;
  }

  color += purple * exp(-nearOrbit * 105.0) * mix(0.012, 0.07, dark);
  if (material > 0.0) {
    vec3 position = rayOrigin + rayDirection * travel;
    vec3 normal = surfaceNormal(position);
    vec3 view = normalize(rayOrigin - position);
    vec3 light = normalize(vec3(-0.60, 0.90, 1.30));
    vec3 reflection = reflect(-view, normal);
    float face = max(dot(normal, view), 0.0);
    float fresnel = pow(1.0 - face, 2.55);
    float diffuse = max(dot(normal, light), 0.0);
    float broadHighlight = pow(max(dot(reflection, light), 0.0), 15.0);
    float sharpHighlight = pow(max(dot(reflection, light), 0.0), 100.0);
    float rimLight = pow(max(dot(normal, normalize(vec3(0.75, -0.20, -0.40))), 0.0), 4.0);

    vec3 violetBody = mix(vec3(0.55, 0.34, 0.83), vec3(0.20, 0.09, 0.39), dark);
    vec3 pearl = mix(vec3(0.98, 0.93, 1.0), vec3(0.78, 0.64, 1.0), dark);
    vec3 core = mix(violetBody, pearl, diffuse * 0.56);

    float interior = 0.5 + 0.5 * sin(position.y * 4.0 + position.x * 2.0 + time * 0.24);
    float innerGlow = exp(-length(position.xy - vec2(-0.12, -0.20)) * 2.5) * face;
    core = mix(core, backdrop, 0.12 + face * 0.13);
    core += purple * interior * (0.055 + bands.y * 0.065);
    core += vec3(0.37, 0.23, 0.63) * innerGlow * mix(0.12, 0.32, dark);
    core += vec3(0.77, 0.59, 1.0) * fresnel * (0.32 + bands.z * 0.16);
    core += vec3(0.60, 0.47, 0.83) * rimLight * 0.23;
    core += pearl * broadHighlight * 0.21;
    core += vec3(1.0, 0.97, 1.0) * sharpHighlight * 0.52;

    float orbitPosition = atan(position.y, position.x);
    float orbitFlow = pow(0.5 + 0.5 * sin(orbitPosition * 2.0 - time * (0.16 + bands.y * 0.16)), 10.0);
    vec3 orbit = mix(violetBody, pearl, 0.28 + diffuse * 0.37 + fresnel * 0.25);
    orbit += pearl * orbitFlow * (0.18 + bands.z * 0.22);
    if (material > 2.5) orbit = mix(backdrop, orbit, mix(0.30, 0.52, dark));
    color = material < 1.5 ? core : orbit;
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
