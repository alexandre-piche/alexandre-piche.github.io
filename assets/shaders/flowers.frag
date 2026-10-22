#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#endif

uniform float u_time;
uniform vec2 u_resolution;

#define SIZE_MIN   0.018   // smallest flower
#define SIZE_VAR   0.018   // random extra size

float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
}

// cos(5a) from a point's direction, without atan: cos(5a) = 16c^5 - 20c^3 + 5c, with c = cos(a)
float cos5(vec2 v, float r) {
    float c = v.x / max(r, 1e-6);
    float c2 = c * c;
    return c * (c2 * (16.0 * c2 - 20.0) + 5.0);
}

void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    // A flower's petals never reach further than this from its position.
    // Pixels beyond it skip that flower entirely.
    float reach = pow((SIZE_MIN + SIZE_VAR) * 0.001, 1.0 / 3.0);

    // Soft pastel sky
    vec3 col = vec3(0.51, 0.61, 0.39);

    for (int i = 0; i < 32; i++) {
        float id = float(i);

        // Falling loop
        float y = 0.75 - mod(hash(id + 42.0) * 1.4 + 0.1
                             + u_time * (0.12 + hash(id + 9.0) * 0.1), 1.65);

        // Reject 1: too far above or below this pixel (this skips most flowers
        // before any of the sideways work is done)
        if (abs(p.y - y) > reach) continue;

        // Stable random placement, with gentle horizontal swaying
        float phase = hash(id + 17.0) * 6.28318;
        float x = hash(id + 1.0) * 2.0 - 1.0;
        x += sin(u_time * 1.2 + phase + y * 4.0) * 0.09;
        x += sin(u_time * 0.5 + phase) * 0.04;

        // Reject 2: too far to the side
        if (abs(p.x - x * aspect) > reach) continue;

        vec2 fp = vec2(p.x - x * aspect, p.y - y);

        float size = SIZE_MIN + hash(id + 3.0) * SIZE_VAR;

        // Reject 3: outside the flower whatever direction the petals point
        float r2 = dot(fp, fp);
        float r = sqrt(r2);
        if (r2 * r >= size * 0.001) continue;

        // Rotate the flower
        float rot = u_time * (0.3 + hash(id + 8.0)) + phase;
        float c = cos(rot);
        float s = sin(rot);
        vec2 rp = vec2(c * fp.x + s * fp.y, c * fp.y - s * fp.x);

        // 5-petal shape: inside where r^3 is below a limit that follows cos(5a)
        float inside = step(r2 * r, size * 0.001 * mix(1.0, cos5(rp, r), 0.49));

        // Small golden centre
        float centre = 1.0 - smoothstep(size * 0.16, size * 0.23, r);

        if (inside + centre > 0.0) {
            // Alternate flower colors
            vec3 petalColor = mix(vec3(1.0), vec3(0.35, 0.42, 0.25), step(0.5, hash(id + 21.0)));
            petalColor = mix(petalColor, vec3(0.76, 0.26, 0.18), step(0.82, hash(id + 31.0)));

            col = mix(col, petalColor, inside);
            col = mix(col, vec3(1.0, 0.82, 0.24), centre);
        }
    }

    gl_FragColor = vec4(col, 1.0);
}
