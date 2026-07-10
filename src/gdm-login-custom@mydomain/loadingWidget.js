// loadingWidget.js — Animated loading indicator shown while waiting for network.
//
// A theme-colored spinning ring SVG + "Waiting for internet connection" text.
// The spinner SVG has a static outer ring (25% opacity) and an animated arc.
// The SMIL <animateTransform> in the SVG won't play via librsvg, so we rotate
// the St.Icon via Clutter.PropertyTransition.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { getSpinnerSvgPath } from './settings.js';

export const LoadingWidget = GObject.registerClass(
class LoadingWidget extends St.BoxLayout {
    _init(extensionPath) {
        super._init({
            style_class: 'glc-loading',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });

        this._extensionPath = extensionPath;
        this._spinTrans = null;

        // Spinner icon (theme-colored, 48px) — loaded as bytes to bypass caching.
        let spinnerGicon = null;
        try {
            const [ok, spinnerBytes] = GLib.file_get_contents(getSpinnerSvgPath());
            if (ok)
                spinnerGicon = Gio.BytesIcon.new(spinnerBytes);
        } catch (e) {
            log(`[gdm-login-custom] Could not load spinner.svg: ${e}`);
        }
        this._spinner = new St.Icon({
            gicon: spinnerGicon,
            icon_size: 48,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._spinner.set_pivot_point(0.5, 0.5);
        this.add_child(this._spinner);

        // "Waiting for internet connection" text — full text, no truncation.
        const label = new St.Label({
            text: 'Waiting for internet connection',
            style_class: 'glc-loading-text',
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.set_line_wrap(false);
        this.add_child(label);

        // Start the rotation animation (0.75s per rotation to match the SVG's dur).
        this._spinTrans = new Clutter.PropertyTransition({
            property_name: 'rotation-angle-z',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_FLOAT,
                initial: 0.0,
                final: 360.0,
            }),
            duration: 750,
            repeat_count: -1,
            progress_mode: Clutter.AnimationMode.LINEAR,
        });
        this._spinner.add_transition('spin', this._spinTrans);
        this._spinTrans.start();
    }

    destroy() {
        if (this._spinTrans) {
            try { this._spinTrans.stop(); } catch (e) {}
            this._spinTrans = null;
        }
        super.destroy();
    }
});
