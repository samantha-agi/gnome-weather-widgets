// animatedIcon.js — Multi-layer animated SVG icon.
//
// Renders a meteocons-style animated SVG by splitting it into per-element
// layers (each with its own SVG file + JSON sidecar describing animations)
// and driving the animations manually with a 60 FPS GLib timeout loop.
//
// See svg-converter.md for the full pipeline documentation.
//
// Animation types supported:
//   - <animateTransform type="rotate">   values="0 cx cy;360 cx cy"
//   - <animateTransform type="translate"> values="x1 y1;x2 y2;..."  (multi-keyframe)
//   - <animate attributeName="opacity">  values="v1;v2;..." with keyTimes

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { ICON_VIEWBOX } from './config.js';

export const AnimatedIcon = GObject.registerClass(
class AnimatedIcon extends St.Widget {
    /**
     * @param {string} iconDir - Path to a directory containing manifest.json,
     *                            layer SVGs, and JSON sidecars (output of
     *                            scripts/split_meteocons_svg.py).
     * @param {number} size - Display size in pixels (square).
     */
    _init(iconDir, size = 96) {
        super._init({
            width: size,
            height: size,
        });
        this._size = size;
        this._iconDir = iconDir;
        this._layers = [];  // [{ icon, transitions: [...] }]

        try {
            // Read manifest.json (preserves document order so z-order is correct).
            const manifestPath = `${this._iconDir}/manifest.json`;
            const [ok, bytes] = GLib.file_get_contents(manifestPath);
            if (!ok)
                throw new Error(`could not read manifest at ${manifestPath}`);
            const manifest = JSON.parse(bytes.toString());
            log(`[gdm-login-custom] AnimatedIcon: manifest has ${manifest.layers.length} layers (${iconDir})`);

            // Scale factor: SVG viewBox is 128, display size is `size`.
            const scale = this._size / ICON_VIEWBOX;

            // Load each layer in manifest order. add_child() appends in order,
            // and Clutter renders children in insertion order — so the LAST
            // added child renders on top. SVG document order is the same:
            // later elements render on top of earlier ones.
            for (const layerEntry of manifest.layers) {
                try {
                    this._loadLayer(layerEntry, scale);
                } catch (e) {
                    log(`[gdm-login-custom] AnimatedIcon: failed to load layer ${layerEntry.svg_file}: ${e}`);
                }
            }
            log(`[gdm-login-custom] AnimatedIcon: ${this._layers.length} layers loaded`);
        } catch (e) {
            log(`[gdm-login-custom] AnimatedIcon failed: ${e}`);
        }
    }

    _loadLayer(layerEntry, scale) {
        const svgPath = `${this._iconDir}/${layerEntry.svg_file}`;
        const jsonPath = `${this._iconDir}/${layerEntry.sidecar_file}`;

        // Load the SVG as a St.Icon.
        const gicon = Gio.Icon.new_for_string(`file://${svgPath}`);
        const icon = new St.Icon({
            gicon: gicon,
            icon_size: this._size,
            x_expand: false,
            y_expand: false,
        });
        // Position at top-left of the container; translation animations
        // will move it via the x/y properties.
        icon.set_position(0, 0);
        this.add_child(icon);

        // Load the JSON sidecar (if it exists) and apply animations.
        let sidecar = null;
        try {
            const [ok2, bytes2] = GLib.file_get_contents(jsonPath);
            if (ok2) {
                sidecar = JSON.parse(bytes2.toString());
            }
        } catch (e) {
            log(`[gdm-login-custom] AnimatedIcon: no/invalid sidecar for ${layerEntry.svg_file}: ${e}`);
        }

        const transitions = [];
        if (sidecar && sidecar.animations) {
            for (const anim of sidecar.animations) {
                try {
                    const t = this._buildTransition(icon, anim, scale);
                    if (t) {
                        transitions.push(t);
                        // Animation is already running (started inside _buildTransition).
                    }
                } catch (e) {
                    log(`[gdm-login-custom] AnimatedIcon: failed to build transition for ${layerEntry.svg_file}: ${e}`);
                }
            }
        }
        this._layers.push({ icon, transitions, filename: layerEntry.svg_file });
        log(`[gdm-login-custom] AnimatedIcon: loaded ${layerEntry.svg_file} (${transitions.length} transitions)`);
    }

    _buildTransition(icon, anim, scale) {
        // Manual animation driver. We bypass Clutter's transition machinery
        // entirely (KeyframeTransition was unreliable when from==to) and use
        // a single GLib timeout per animated layer that ticks at 60 FPS
        // (matching the Lottie source's `fr` field) and sets properties
        // directly on the actor.
        //
        // Each animation has:
        //   - duration_ms: total cycle time
        //   - begin_ms: SMIL-style offset (negative = "started in the past")
        //   - values: array of strings (each parsed per animation type)
        //   - key_times: optional, normalized 0..1 timestamps for each value
        //                (if absent, values are evenly spaced)
        //   - calc_mode: "spline" with key_splines for easing
        //
        // For each tick:
        //   progress = ((now - start_time) mod duration_ms) / duration_ms
        //   find surrounding keyTimes pair, interpolate, set on actor.
        const duration = anim.duration_ms || 1000;
        const beginOffset = anim.begin_ms || 0;
        const fps = 60;
        const tickMs = Math.max(1, Math.round(1000 / fps));  // 16ms

        // Pre-parse values into numeric form.
        let parsedValues;  // array of numbers (for opacity) or {x, y} (for translate)
        if (anim.type === 'transform' && anim.transform_type === 'translate') {
            parsedValues = anim.values.map(v => {
                const [x, y] = v.split(/\s+/).map(parseFloat);
                return { x: x * scale, y: y * scale };
            });
        } else if (anim.type === 'attribute' && anim.attribute_name === 'opacity') {
            // Clutter opacity is 0-255.
            parsedValues = anim.values.map(v => Math.round(parseFloat(v) * 255));
        } else if (anim.type === 'transform' && anim.transform_type === 'rotate') {
            // values: ["0 cx cy", "360 cx cy"]
            const v0 = anim.values[0].split(/\s+/).map(parseFloat);
            const v1 = anim.values[1].split(/\s+/).map(parseFloat);
            const cx = v0[1], cy = v0[2];
            // Set the pivot point so rotation is around (cx, cy) in SVG units,
            // normalized to [0..1] for Clutter.
            icon.set_pivot_point(cx / ICON_VIEWBOX, cy / ICON_VIEWBOX);
            parsedValues = [v0[0], v1[0]];  // just the angle
        } else {
            log(`[gdm-login-custom] AnimatedIcon: unsupported animation type=${anim.type} attr=${anim.attribute_name} transform=${anim.transform_type}`);
            return null;
        }

        // Parse keyTimes if present.
        let keyTimes = null;
        if (anim.key_times) {
            keyTimes = anim.key_times.split(';').map(parseFloat);
        } else {
            // Evenly spaced: 0, 1/N, 2/N, ..., 1.
            const n = parsedValues.length;
            keyTimes = parsedValues.map((_, i) => i / (n - 1));
        }

        // Parse keySplines if present (SVG cubic-bezier easing per segment).
        // Format: ".42 0 .58 1; .42 0 .58 1" — each segment is "x1 y1 x2 y2".
        let splines = null;
        if (anim.key_splines) {
            splines = anim.key_splines.split(';').map(s => {
                const parts = s.trim().split(/\s+/).map(parseFloat);
                return { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
            });
        }

        // The starting wall-clock time. Negative begin means the animation
        // started |beginOffset| ms ago, so we set startTime accordingly.
        const startTime = Date.now() + beginOffset;  // beginOffset is negative

        // Property setter function — calls the right Clutter.Actor setter
        // based on the animation type.
        const setProperty = (value) => {
            try {
                if (anim.type === 'transform' && anim.transform_type === 'translate') {
                    // value is { x, y }. Translate the actor from its base
                    // position (0, 0 in the container) by (x, y).
                    icon.set_position(value.x, value.y);
                } else if (anim.type === 'attribute' && anim.attribute_name === 'opacity') {
                    icon.set_opacity(value);
                } else if (anim.type === 'transform' && anim.transform_type === 'rotate') {
                    icon.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, value);
                }
            } catch (e) {
                // log once on first failure, then stop trying
                if (!setProperty._errored) {
                    setProperty._errored = true;
                    log(`[gdm-login-custom] AnimatedIcon: setProperty failed: ${e}`);
                }
            }
        };

        // Cubic-bezier easing function for SVG calcMode="spline".
        // Approximates the bezier curve via binary search (20 iterations).
        function bezierEase(t, x1, y1, x2, y2) {
            // Standard cubic-bezier with P0=(0,0), P3=(1,1).
            // Solve for parameter s such that bezier_x(s) = t, then return bezier_y(s).
            let lo = 0, hi = 1;
            for (let i = 0; i < 20; i++) {
                const mid = (lo + hi) / 2;
                const x = 3 * (1 - mid) * (1 - mid) * mid * x1 + 3 * (1 - mid) * mid * mid * x2 + mid * mid * mid;
                if (x < t) lo = mid; else hi = mid;
            }
            const tt = (lo + hi) / 2;
            return 3 * (1 - tt) * (1 - tt) * tt * y1 + 3 * (1 - tt) * tt * tt * y2 + tt * tt * tt;
        }

        // Linear interpolation between two values.
        function lerp(a, b, t) {
            if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
            if (a && typeof a === 'object' && 'x' in a) {
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            return a;
        }

        // The tick function. Computes current progress, finds surrounding
        // keyframes, interpolates, and sets the property.
        const tick = () => {
            const now = Date.now();
            let elapsed = now - startTime;
            // Modulo to keep within one cycle.
            elapsed = ((elapsed % duration) + duration) % duration;  // handle negatives
            const progress = elapsed / duration;

            // Find surrounding keyframes.
            let i = 0;
            while (i < keyTimes.length - 1 && keyTimes[i + 1] < progress) i++;
            // Now keyTimes[i] <= progress <= keyTimes[i+1] (or i is last index).
            if (i >= keyTimes.length - 1) {
                // Past the last keyframe — use the last value.
                setProperty(parsedValues[parsedValues.length - 1]);
                return GLib.SOURCE_CONTINUE;
            }
            const t0 = keyTimes[i], t1 = keyTimes[i + 1];
            const v0 = parsedValues[i], v1 = parsedValues[i + 1];
            const segmentProgress = t1 > t0 ? (progress - t0) / (t1 - t0) : 0;

            // Apply easing if calc_mode is "spline".
            let easedProgress = segmentProgress;
            if (splines && splines[i]) {
                const sp = splines[i];
                easedProgress = bezierEase(segmentProgress, sp.x1, sp.y1, sp.x2, sp.y2);
            }

            setProperty(lerp(v0, v1, easedProgress));
            return GLib.SOURCE_CONTINUE;
        };

        // Run one tick immediately to set the initial state.
        tick();

        // Schedule the recurring tick.
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, tickMs, tick);
        return {
            timeoutId,
            start: () => {},  // already running
            advance: (ms) => {
                // No-op: beginOffset is already accounted for in startTime.
            },
            stop: () => {
                if (timeoutId) {
                    GLib.source_remove(timeoutId);
                }
            },
        };
    }

    destroy() {
        for (const layer of this._layers) {
            for (const t of layer.transitions) {
                // Stop the GLib timeout driving this animation.
                try { t.stop(); } catch (e) {}
            }
        }
        this._layers = [];
        super.destroy();
    }
});
