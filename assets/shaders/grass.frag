#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_seed;   // random number picked once per page load (set by shader-canvas.js); 0 if not provided

// =====================================================================
//  SETTINGS - everything you're likely to tweak lives here
//  (sizes are in screen heights: 1.0 = the full height of the canvas)
//  The background is transparent: set it with CSS on the canvas.
// =====================================================================

// ---- Colours (flat) -------------------------------------------------
#define BACK_COLOR    vec3(0.32, 0.4, 0.26)    // back layer
#define FRONT_COLOR   vec3(0.26, 0.36, 0.2)    // front layer

// ---- Layout ---------------------------------------------------------
#define SPACING       0.04    // distance between blades (smaller = denser)
#define ROOT_JITTER   0.8     // 0 = evenly spaced, 1 = very random
#define ROOT_Y        -0.52   // where the roots sit (-0.5 = bottom edge of screen)
#define FRONT_DROP    0.02    // how much lower the front layer's roots sit

// ---- Blade size -----------------------------------------------------
#define BLADE_MIN_LEN 0.2     // shortest blade (1.0 = full screen height)
#define BLADE_VAR_LEN 0.6     // random extra length; blades longer than the screen just run off the top
#define LEN_SKEW      0.7     // below 1 = more tall blades, above 1 = more short ones
#define BACK_SCALE    0.8     // back layer length relative to the front layer
#define BLADE_WIDTH   0.02    // pill half-width (the rounded ends use the same radius)

// ---- Pose & breeze --------------------------------------------------
#define LEAN          0.1     // random sideways lean of each blade tip
#define BREEZE_SPEED  1.6
#define BREEZE_AMOUNT 0.1     // how far the tips sway
#define BREEZE_WAVE   1.0     // how quickly the sway changes from left to right

// ---- Flowers (a full ring of petals, tilted towards the viewer) -------
#define FLOWER_CHANCE 0.04    // share of blades that carry a flower (0..1)
#define FLOWER_SIZE   0.14    // flower radius
#define FLOWER_Y      0.3     // height of the flower's centre above the blade tip (flower sizes)
#define PETALS        8       // petals around the ring (whole number)
#define PETAL_ASPECT  0.56    // petal width / length
#define PETAL_COLOR_A vec3(0.96, 0.94, 0.86)   // each flower gets one of these two
#define PETAL_COLOR_B vec3(0.9, 0.58, 0.62)
#define FLOWER_CENTER vec3(0.95, 0.76, 0.22)

// Perspective: the whole flower is squashed vertically, the bottom more than the top
#define FLOWER_SQUASH   0.8   // overall vertical squash: 1 = seen head-on (round), small = very flat
#define SQUASH_GRADIENT 0.8   // extra squash towards the bottom: 0 = same everywhere, 0.9 = bottom nearly flat
#define SQUASH_CURVE    3.0   // how that extra squash builds up: 1 = steadily from top to bottom,
                              //   above 1 = only near the bottom, below 1 = already from the middle

// ---- Edges ----------------------------------------------------------
#define EDGE_SOFTNESS 0.5     // edge blur in pixels (0 = hard edges)

// ---- Performance ----------------------------------------------------
// Each pixel only looks at the blades rooted near it.
// Set this to (LEAN + FLOWER_SIZE) / SPACING, rounded up, or flowers get cut off at the sides.
// (With no flowers, (LEAN + BLADE_WIDTH) / SPACING rounded up is enough.)
#define NEIGHBORS     6

// =====================================================================

#define FLOWER_REACH (max(BLADE_WIDTH, FLOWER_SIZE))           // how far a flower blade reaches sideways beyond its lean
#define FLOWER_TOP   (FLOWER_SIZE * (1.0 + max(FLOWER_Y, 0.0))) // how far a flower rises above its blade's tip

// Cheap hash (no sin): needs highp, which the header asks for when available
float hash(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

// Paint a colour over what is already there. The result is premultiplied
// (rgb already multiplied by alpha), which is what the canvas expects.
void paint(inout vec4 acc, vec3 c, float coverage) {
    acc = mix(acc, vec4(c, 1.0), coverage);
}

// One layer of grass (fl = 0 back, 1 front) at the wind-shifted position wx, screen height py.
vec4 grassLayer(float fl, float wx, float py) {
    vec4 acc = vec4(0.0);

    float scale = mix(BACK_SCALE, 1.0, fl);
    float ty = py - (ROOT_Y - FRONT_DROP * fl);     // height above this layer's roots

    // Nothing in this layer reaches this high
    if (ty > (BLADE_MIN_LEN + BLADE_VAR_LEN) * scale + FLOWER_TOP) return acc;

    vec3 grassCol = mix(BACK_COLOR, FRONT_COLOR, fl);

    // Edge softness, in screen heights
    float aa = max(EDGE_SOFTNESS, 0.001) / u_resolution.y;
    float bladeIn2  = (BLADE_WIDTH - aa) * (BLADE_WIDTH - aa);
    float bladeOut2 = BLADE_WIDTH * BLADE_WIDTH;

    float petalLen = FLOWER_SIZE * 0.5;
    float avgSquash = FLOWER_SQUASH * (1.0 - 0.5 * SQUASH_GRADIENT);
    float petalSoft = min(2.0 * aa / (petalLen * PETAL_ASPECT * sqrt(avgSquash)), 0.9);   // same blur, in ellipse units
    float flowerR2 = FLOWER_SIZE * 1.25 * (FLOWER_SIZE * 1.25);   // anything further from a flower's centre skips it
    float centerR = FLOWER_SIZE * 0.28;

    float baseCell = floor(wx / SPACING);

    for (int k = -NEIGHBORS; k <= NEIGHBORS; k++) {
        float cell = baseCell + float(k);

        // One hash per blade; everything else about it is derived from this number
        float h0 = hash(cell + 517.0 * fl + u_seed);          // the seed shuffles every blade
        float rx = (cell + 0.5 + (h0 - 0.5) * ROOT_JITTER) * SPACING;
        float lean = (fract(h0 * 37.31 + 0.17) - 0.5) * 2.0 * LEAN;
        bool flower = fract(h0 * 91.7 + 0.53) < FLOWER_CHANCE;

        // Reject 1: can't reach this pixel sideways (exact for this blade)
        if (abs(wx - rx) > abs(lean) + (flower ? FLOWER_REACH : BLADE_WIDTH)) continue;

        // Reject 2: pixel is below the pill's bottom or above its top (or its flower)
        float len = (BLADE_MIN_LEN + BLADE_VAR_LEN * pow(fract(h0 * 17.9 + 0.71), LEN_SKEW)) * scale;
        if (ty < -BLADE_WIDTH || ty > (flower ? len + FLOWER_TOP : len)) continue;

        // A pill is every point within BLADE_WIDTH of a centre line.
        // The line runs from the root up to one radius below the tip, so the
        // rounded end finishes exactly at the full length.
        float yTop = len - BLADE_WIDTH;
        float yc = clamp(ty, 0.0, yTop);                // closest point on the line

        // The line curves out from the root: sideways offset grows with height squared
        float tc = yc / len;
        vec2 d = vec2(wx - (rx + lean * tc * tc), ty - yc);
        float dd = dot(d, d);
        if (dd < bladeOut2) paint(acc, grassCol, 1.0 - smoothstep(bladeIn2, bladeOut2, dd));

        // Flower: sits above the top of the line
        if (flower) {
            float tt = yTop / len;
            vec2 fc = vec2(wx - (rx + lean * tt * tt), ty - yTop - FLOWER_SIZE * FLOWER_Y);   // from the flower's centre
            if (dot(fc, fc) < flowerR2) {
                // Perspective: draw a flat, round flower, then squash it vertically.
                // The squash is stronger towards the bottom (b = 0 at the top, 1 at the bottom).
                float b = pow(max(0.5 - 0.5 * clamp(fc.y / FLOWER_SIZE, -1.0, 1.0), 0.0001), SQUASH_CURVE);
                float squash = max(FLOWER_SQUASH * (1.0 - SQUASH_GRADIENT * b), 0.05);
                vec2 q = vec2(fc.x, fc.y / squash);

                // Petals all the way round. The direction is turned a fixed step each time
                // instead of calling sin/cos for every petal.
                float stepC = cos(6.28318 / float(PETALS));
                float stepS = sin(6.28318 / float(PETALS));
                vec2 dir = vec2(0.0, 1.0);
                float petal = 0.0;
                for (int j = 0; j < PETALS; j++) {
                    vec2 rel = q - dir * petalLen;           // relative to the petal's centre
                    vec2 e = vec2(dot(rel, dir) / petalLen,
                                  (rel.x * dir.y - rel.y * dir.x) / (petalLen * PETAL_ASPECT));
                    petal = max(petal, 1.0 - smoothstep(1.0 - petalSoft, 1.0, dot(e, e)));
                    dir = vec2(dir.x * stepC + dir.y * stepS, dir.y * stepC - dir.x * stepS);
                }
                vec3 petalCol = mix(PETAL_COLOR_A, PETAL_COLOR_B, step(0.5, fract(h0 * 53.9 + 0.31)));
                paint(acc, petalCol, petal);

                // Centre, squashed along with the petals
                paint(acc, FLOWER_CENTER, 1.0 - smoothstep(centerR - aa, centerR, length(q)));
            }
        }
    }

    return acc;
}

void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    // ---- Wind, as one smooth sideways shift of the whole field ----
    // Computed once per pixel, so it costs the same however many blades there are.
    // Blades are then drawn in the un-shifted space, where they only lean a little.
    // The shift grows with height squared: roots stay put, tips move the most.
    // The time is wrapped to one full turn before it goes into sin(). u_time keeps growing
    // while the page is open, and on some GPUs sin() of a big number gets coarse and jittery.
    float seedPhase = fract(u_seed * 0.61803) * 6.28318;    // the breeze starts at a random point too
    float timePhase = fract(u_time * (BREEZE_SPEED / 6.28318)) * 6.28318;
    float h = p.y - ROOT_Y;
    float wx = p.x - h * h * sin(timePhase + p.x * BREEZE_WAVE + seedPhase) * BREEZE_AMOUNT;

    // Front layer first: where it fully covers the pixel, the back layer can't be seen,
    // so it is skipped. Otherwise the back layer is added behind it.
    vec4 col = grassLayer(1.0, wx, p.y);
    if (col.a < 0.999) col += grassLayer(0.0, wx, p.y) * (1.0 - col.a);

    gl_FragColor = col;
}
