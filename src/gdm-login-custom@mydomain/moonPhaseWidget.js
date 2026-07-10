// moonPhaseWidget.js — Moon-phase widget that draws moon.png with a phase shadow.
//
// GNOME 50 compatibility note:
//   Mutter MR !3470 (https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/3470)
//   moved ClutterCanvas out of Mutter and into gnome-shell as St.DrawingArea.
//   Direct `new Clutter.Canvas()` no longer works on GNOME 50 — use
//   St.DrawingArea with the 'repaint' signal instead.

import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { getMoonPhase } from './moonPhase.js';
import { INVERT_MOON } from './config.js';

export const MoonPhaseWidget = GObject.registerClass(
class MoonPhaseWidget extends St.DrawingArea {
    _init(imagePath, size = 140) {
        super._init({
            width: size,
            height: size,
            x_expand: false,
            y_expand: false,
        });
        this._size = size;
        this._imagePath = imagePath;
        this._pixbuf = null;

        try {
            this._pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                imagePath, size, size, true);
            log(`[gdm-login-custom] Loaded moon pixbuf: ${this._pixbuf.get_width()}x${this._pixbuf.get_height()}`);
        } catch (e) {
            log(`[gdm-login-custom] Failed to load moon image at ${imagePath}: ${e}`);
        }

        // 'repaint' is the modern GNOME 50 API (replaces Clutter.Canvas 'draw').
        this.connect('repaint', this._onRepaint.bind(this));

        this.updatePhase();
    }

    updatePhase() {
        this._phase = getMoonPhase(new Date());
        log(`[gdm-login-custom] Moon phase updated to ${this._phase.toFixed(3)} (${this._phaseName(this._phase)})`);
        this.queue_repaint();
    }

    _phaseName(p) {
        if (p < 0.03 || p > 0.97) return 'new';
        if (p < 0.22) return 'waxing crescent';
        if (p < 0.28) return 'first quarter';
        if (p < 0.47) return 'waxing gibbous';
        if (p < 0.53) return 'full';
        if (p < 0.72) return 'waning gibbous';
        if (p < 0.78) return 'last quarter';
        return 'waning crescent';
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const width = this._size;
        const height = this._size;

        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2;

        // 1) Draw the moon image, scaled to fit.
        if (this._pixbuf) {
            const pw = this._pixbuf.get_width();
            const ph = this._pixbuf.get_height();
            const scale = Math.min(width / pw, height / ph);
            const dw = pw * scale;
            const dh = ph * scale;
            const dx = (width - dw) / 2;
            const dy = (height - dh) / 2;
            Gdk.cairo_set_source_pixbuf(cr, this._pixbuf, dx, dy);
            cr.paint();
        } else {
            // Fallback: solid pale disc so the shadow is still visible.
            cr.setSourceRGBA(0.92, 0.92, 0.85, 1.0);
            cr.arc(cx, cy, r, 0, 2 * Math.PI);
            cr.fill();
        }

        // 2) Draw the phase shadow.
        //    Northern-hemisphere convention: waxing (0–0.5) lit on the right,
        //    waning (0.5–1.0) lit on the left.
        try {
            this._drawPhaseShadow(cr, cx, cy, r, this._phase);
        } catch (e) {
            log(`[gdm-login-custom] _drawPhaseShadow threw: ${e}`);
        }

        cr.$dispose();
    }

    _drawPhaseShadow(cr, cx, cy, r, phase) {
        // Tolerance for "new" / "full" so we don't draw degenerate paths.
        if (phase < 0.003 || phase > 0.997) {
            // New moon — entire disc in shadow.
            cr.setSourceRGBA(0.04, 0.04, 0.08, 0.92);
            cr.arc(cx, cy, r, 0, 2 * Math.PI);
            cr.fill();
            return;
        }
        if (Math.abs(phase - 0.5) < 0.003) {
            // Full moon — no shadow.
            return;
        }

        // x = cos(phase * 2π)  →  +1 at new, 0 at quarters, -1 at full.
        const x = Math.cos(phase * 2 * Math.PI);
        // For southern hemisphere, the lit side is mirrored.
        const isWaxing = INVERT_MOON ? phase >= 0.5 : phase < 0.5;

        // Cubic Bezier approximation constant for a circle is 4/3.
        const k = 4 / 3;

        let W;
        if (isWaxing) {
            // Waxing: dark on LEFT, lit on RIGHT.
            W = x * r;
        } else {
            // Waning: dark on RIGHT, lit on LEFT.
            W = -x * r;
        }

        cr.setSourceRGBA(0.04, 0.04, 0.08, 0.92);
        cr.newPath();
        cr.moveTo(cx, cy - r);

        if (isWaxing) {
            // Left semicircle (counterclockwise in screen coords: top → left → bottom).
            cr.arcNegative(cx, cy, r, -Math.PI / 2, Math.PI / 2);
        } else {
            // Right semicircle (clockwise: top → right → bottom).
            cr.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
        }

        // Terminator: cubic Bezier from (cx, cy+r) to (cx, cy-r), bulging by W on x.
        cr.curveTo(
            cx + W * k, cy + r,
            cx + W * k, cy - r,
            cx, cy - r
        );
        cr.closePath();
        cr.fill();
    }
});
