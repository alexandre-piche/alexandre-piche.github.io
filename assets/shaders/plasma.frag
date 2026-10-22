// Plain fragment shader: declare only the uniforms you want.
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 4.0;
  vec2 m = (u_mouse / u_resolution - 0.5) * 2.0;

  float v = sin(p.x + u_time)
          + sin((p.y + u_time * 0.7) * 1.3)
          + sin((p.x + p.y + u_time * 0.5) * 0.8)
          + sin(length(p - m * 2.0) * 2.0 - u_time);

  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v * 1.2);
  gl_FragColor = vec4(col, 1.0);
}
