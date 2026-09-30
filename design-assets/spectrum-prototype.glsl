precision highp float;
uniform vec2 u_resolution;
uniform sampler2D u_spectrum;
uniform float u_variant;
uniform float u_energy;

// AI modified: every ridge reads a real FFT history row; there is no clock-driven surrogate.
float amplitude(float x, float row) {
  float frequency = clamp(x, 0.0, 1.0);
  float bin = frequency * 63.0;
  float left = floor(bin);
  float blend = fract(bin);
  blend = blend * blend * (3.0 - 2.0 * blend);
  float a = texture2D(u_spectrum, vec2((left + .5) / 64.0, (row + .5) / 12.0)).r;
  float b = texture2D(u_spectrum, vec2((min(left + 1.0, 63.0) + .5) / 64.0, (row + .5) / 12.0)).r;
  return mix(a, b, blend);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 background = vec3(.041, .029, .059);
  float aura = exp(-pow((uv.y - .43) * 4.0, 2.0) - pow((uv.x - .5) * 1.8, 2.0));
  vec3 color = background + vec3(.031, .009, .065) * aura * u_energy;
  float pixel = 1.0 / u_resolution.y;
  for (int index = 11; index >= 0; index--) {
    float layer = float(index);
    float depth = layer / 11.0;
    float width = .84 - depth * .12;
    float x = (uv.x - .5 - depth * .035) / width + .5;
    float inside = smoothstep(0.0, .04, x) * (1.0 - smoothstep(.96, 1.0, x));
    float envelope = pow(max(sin(clamp(x, 0.0, 1.0) * 3.14159), 0.0), .6);
    float signal = pow(amplitude(x, layer), 1.25);
    float height = signal * envelope * (.42 - depth * .16);
    float baseline = .25 + depth * .16;
    float curve = baseline + height;
    float distanceToLine = abs(uv.y - curve);
    if (u_variant > .5) {
      baseline = .51 + (depth - .5) * .028;
      float upper = baseline + height * .68;
      float lower = baseline - height * .68;
      distanceToLine = min(abs(uv.y - upper), abs(uv.y - lower));
      float interior = smoothstep(lower, baseline, uv.y) * (1.0 - smoothstep(baseline, upper, uv.y));
      color += vec3(.04, .009, .077) * interior * inside * (1.0 - depth) * signal;
    }
    float stroke = 1.0 - smoothstep(pixel * .55, pixel * 1.7, distanceToLine);
    float halo = exp(-distanceToLine / (.004 + pixel)) * .065;
    float fade = pow(1.0 - depth * .81, 1.35);
    vec3 violet = mix(vec3(.41, .18, .78), vec3(.77, .60, 1.0), 1.0 - depth);
    if (index == 0) violet = mix(vec3(.72, .44, 1.0), vec3(.95, .86, 1.0), signal);
    float signalVisibility = .075 + .925 * smoothstep(.015, .38, signal);
    color += violet * (stroke * .53 + halo) * fade * inside * signalVisibility;
    float underRidge = exp(-abs(uv.y - curve) / .02) * step(uv.y, curve);
    if (u_variant < .5) color += violet * underRidge * .04 * fade * inside;
  }
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
