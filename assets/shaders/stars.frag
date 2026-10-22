
#ifdef GL_ES
precision highp float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

#define PI 3.14159265359
#define STAR_COUNT 18.0

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Signed distance to a stylized five-point star
float starSDF(vec2 p, float radius) {
    float a = atan(p.y, p.x);
    float sector = PI / 5.0;
    float angle = mod(a + sector, 2.0 * sector) - sector;
    float r = radius * (0.58 + 0.42 * cos(5.0 * angle));
    return length(p) - r;
}

float starGlow(vec2 p, float radius) {
    float d = starSDF(p, radius);
    float shape = 1.0 - smoothstep(-0.008, 0.008, d);
    float glow = exp(-max(d, 0.0) * 24.0 / radius);
    return shape + glow * 0.25;
}

vec3 fallingStar(vec2 p, float seed, float id) {
    float speed = mix(0.22, 0.48, hash21(vec2(id, 4.7)));
    float duration = mix(2.2, 4.0, hash21(vec2(id, 8.3)));

    float phase = fract(
        u_time / duration + seed
    );

    // The star travels down and to the right.
    vec2 velocity = normalize(vec2(0.42, -1.0));

    float aspect = u_resolution.x / u_resolution.y;

    float startX = mix(-1.0, aspect + 0.1,
                       hash21(vec2(id, 1.2)));
    float startY = 0.5 + hash21(vec2(id, 2.4)) * 0.5;

    float travel = phase * 1.8;

    vec2 head = vec2(
        startX,
        startY
    ) + velocity * travel;

    // Star trails point opposite to velocity.
    vec2 trailDir = -velocity;
    vec2 rel = p - head;

    float trailLength = mix(0.10, 0.27,
                            hash21(vec2(id, 6.1)));
    float trailWidth = mix(0.0015, 0.0035,
                           hash21(vec2(id, 7.2)));

    float along = dot(rel, trailDir);
    float across = abs(
        rel.x * trailDir.y - rel.y * trailDir.x
    );

    float valid = step(0.0, along)
                * (1.0 - step(trailLength, along));

    float taper = 1.0 - clamp(along / trailLength, 0.0, 1.0);

    float trail = exp(
        -across * across /
        (trailWidth * trailWidth * (0.15 + taper * 0.85))
    ) * taper * valid;

    // Brighter, tapered head and star-shaped silhouette.
    float size = mix(0.009, 0.017,
                     hash21(vec2(id, 3.9)));

    float shape = starGlow(rel, size);

    float headGlow = exp(
        -dot(rel, rel) / (size * size * 5.0)
    );

    // Fade at screen boundaries.
    float fade = smoothstep(-0.8, 0.15, head.y)
               * (1.0 - smoothstep(0.95, 1.3, head.y));

    vec3 cold = vec3(0.35, 0.58, 1.0);
    vec3 warm = vec3(1.0, 0.79, 0.48);
    vec3 color = mix(cold, warm,
                     hash21(vec2(id, 9.8)));

    return color * fade * (
        trail * 1.7 +
        shape * 0.95 +
        headGlow * 1.2
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // Aspect-correct coordinates.
    vec2 p = (uv - 0.5) *
             vec2(u_resolution.x / u_resolution.y, 1.0);

    // Midnight blue gradient.
    vec3 col = mix(
        vec3(0.008, 0.012, 0.045),
        vec3(0.045, 0.035, 0.13),
        smoothstep(0.0, 1.0, uv.y)
    );

    // Subtle animated nebula.
    float nebula = sin(p.x * 5.0 + u_time * 0.08)
                 * sin(p.y * 7.0 - u_time * 0.06);

    col += vec3(0.018, 0.012, 0.055)
         * (0.5 + 0.5 * nebula);

    // Tiny twinkling background stars.
    vec2 grid = uv * vec2(100.0, 65.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;

    float rnd = hash21(cell);
    vec2 offset = vec2(
        hash21(cell + 12.4),
        hash21(cell + 45.6)
    ) - 0.5;

    float d = length(local - offset * 0.7);
    float twinkle = 0.55 + 0.45 * sin(
        u_time * (1.5 + rnd * 3.0) + rnd * 40.0
    );

    float tiny = exp(-d * d * 1800.0)
               * step(0.82, rnd) * twinkle;

    col += vec3(0.55, 0.65, 1.0) * tiny;

    // Larger decorative sparkle stars.
    for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float seed = hash21(vec2(fi * 7.1, 19.3));

        vec2 pos = vec2(
            hash21(vec2(fi + 21.0, 2.0)) *
                (u_resolution.x / u_resolution.y),
            hash21(vec2(fi + 11.0, 5.0))
        );

        float tw = 0.7 + 0.3 * sin(
            u_time * 1.8 + fi * 4.2
        );

        vec2 sp = uv - pos;
        sp.x *= u_resolution.x / u_resolution.y;

        float crossGlow = exp(-abs(sp.x) * 180.0)
                        * exp(-abs(sp.y) * 18.0)
                        + exp(-abs(sp.y) * 180.0)
                        * exp(-abs(sp.x) * 18.0);

        float sparkle = crossGlow
                      * smoothstep(0.94, 0.99, seed)
                      * tw;

        col += vec3(0.48, 0.58, 1.0) * sparkle * 0.5;
    }

    // Falling five-point stars and direction-aligned trails.
    for (int i = 0; i < 18; i++) {
        float fi = float(i);
        float seed = hash21(vec2(fi + 3.7, 17.1));

        col += fallingStar(p, seed, fi + 1.0);
    }

    // Gentle mouse-controlled atmospheric glow.
    vec2 mouse = u_mouse / u_resolution;
    vec2 md = uv - mouse;
    md.x *= u_resolution.x / u_resolution.y;

    col += vec3(0.025, 0.035, 0.09)
         * exp(-dot(md, md) * 18.0);

    // Cinematic vignette.
    float vignette = 1.0 - 0.35 *
        dot((uv - 0.5) * 2.0, (uv - 0.5) * 2.0);

    col *= max(vignette, 0.0);

    // Soft HDR-style glow.
    col = 1.0 - exp(-col * 1.4);

    gl_FragColor = vec4(col, 1.0);
}