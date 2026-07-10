// -*- mode: js2; indent-tabs-mode: nil -*-
//
// GDM Login Customizer — runs in both GDM and user session modes.
//
// VERSION: 52.0  (dual-session: GDM login screen + user-session weather panel)
// Released: 2026-07-10
//
// To verify you have this version, run:  grep "VERSION: 52" extension.js
//
// In GDM session mode: builds the login screen UI (moon + clock + weather + power button).
// In user session mode: adds a "Weather" button to the topbar with a slide-down panel.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    HIDE_TOPBAR,
    MOON_SIZE,
    EDGE_MARGIN,
    WEATHER_LOCATION,
    WEATHER_GAP,
} from './config.js';
import { loadSettings, getThemeCssPath } from './settings.js';
import { MoonPhaseWidget } from './moonPhaseWidget.js';
import { WeatherWidget } from './weatherWidget.js';
import { PowerOffButton } from './powerButton.js';
import { WeatherPanel } from './weatherPanel.js';

export default class GdmLoginCustomExtension extends Extension {
    enable() {
        const mode = Main.sessionMode ? Main.sessionMode.currentMode : 'unknown';
        log(`[gdm-login-custom] enable() called. sessionMode=${mode}`);

        this._signals = [];
        this._timeouts = [];
        this._mode = mode;

        // Load user settings (overrides config.js defaults).
        this._settings = loadSettings();

        // Load stylesheets: structural (extension dir) + colors (/etc/gdm-login-custom/).
        this._stylesheetFile = Gio.File.new_for_path(this.path + '/stylesheet.css');
        this._themeFile = Gio.File.new_for_path(getThemeCssPath());
        // Fallback to extension dir theme.css if /etc doesn't have one yet.
        if (!this._themeFile.query_exists(null))
            this._themeFile = Gio.File.new_for_path(this.path + '/theme.css');
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        theme.load_stylesheet(this._stylesheetFile);
        theme.load_stylesheet(this._themeFile);

        try {
            if (mode === 'gdm') {
                this._enableGdm();
            } else {
                // Any non-gdm mode (user, ubuntu, etc.) → user session UI.
                this._enableUser();
            }
            log(`[gdm-login-custom] enable() completed (mode=${mode}).`);
        } catch (e) {
            log(`[gdm-login-custom] enable() THREW: ${e}`);
            logError(e);
        }
    }

    // ======================================================================
    // GDM session mode — login screen UI
    // ======================================================================

    _enableGdm() {
        this._hiddenPanelActor = null;
        this._hiddenPanelBox = null;

        // --- 1) Hide the top bar ---
        if (HIDE_TOPBAR) {
            if (Main.panel) {
                this._hiddenPanelActor = Main.panel;
                Main.panel.hide();
            }
            if (Main.layoutManager && Main.layoutManager.panelBox) {
                this._hiddenPanelBox = Main.layoutManager.panelBox;
                Main.layoutManager.panelBox.hide();
            }
            log('[gdm-login-custom] HIDE_TOPBAR is true — top bar hidden.');
        }

        // --- 2) Moon + clock widget ---
        const imagePath = this.path + '/moon.png';
        this._moon = new MoonPhaseWidget(imagePath, MOON_SIZE);

        this._timeLabel = new St.Label({ text: '--:--', style_class: 'glc-clock-time' });
        this._dateLabel = new St.Label({ text: '--/--/----', style_class: 'glc-clock-date' });

        const clockBox = new St.BoxLayout({
            style_class: 'glc-clock-box',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        clockBox.add_child(this._timeLabel);
        clockBox.add_child(this._dateLabel);

        this._leftWidget = new St.BoxLayout({ style_class: 'glc-left-widget' });
        this._leftWidget.add_child(this._moon);
        this._leftWidget.add_child(clockBox);

        // --- 2b) Weather widget ---
        if (WEATHER_LOCATION) {
            try {
                this._weatherWidget = new WeatherWidget(this.path);
            } catch (e) {
                log(`[gdm-login-custom] WeatherWidget creation failed: ${e}`);
            }
        }

        // --- 3) Power-off button ---
        if (HIDE_TOPBAR) {
            this._powerButton = new PowerOffButton();
        }

        // --- 4) Place actors ---
        const container = Main.uiGroup;
        container.add_child(this._leftWidget);
        if (this._weatherWidget)
            container.add_child(this._weatherWidget);
        if (this._powerButton)
            container.add_child(this._powerButton);

        // Re-position on monitor changes.
        const monitorChangedId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
        this._signals.push({ obj: Main.layoutManager, id: monitorChangedId });

        try {
            if (Meta && Meta.later_add && Meta.LaterType) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._reposition();
                    this._raise();
                    return false;
                });
            }
        } catch (e) {}

        this._reposition();
        this._raise();

        // Re-raise periodically for the first 10 seconds.
        let raiseCount = 0;
        const raiseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._reposition();
            this._raise();
            raiseCount++;
            if (raiseCount >= 20)
                return GLib.SOURCE_REMOVE;
            return GLib.SOURCE_CONTINUE;
        });
        this._timeouts.push(raiseId);

        // Clock tick + moon refresh.
        const clockId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateClock();
            this._raise();
            return GLib.SOURCE_CONTINUE;
        });
        this._timeouts.push(clockId);

        const moonId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 600, () => {
            this._moon.updatePhase();
            return GLib.SOURCE_CONTINUE;
        });
        this._timeouts.push(moonId);

        this._updateClock();
    }

    _raise() {
        if (this._leftWidget && this._leftWidget.get_parent() === Main.uiGroup)
            Main.uiGroup.set_child_above_sibling(this._leftWidget, null);
        if (this._weatherWidget && this._weatherWidget.get_parent() === Main.uiGroup)
            Main.uiGroup.set_child_above_sibling(this._weatherWidget, null);
        if (this._powerButton && this._powerButton.get_parent() === Main.uiGroup)
            Main.uiGroup.set_child_above_sibling(this._powerButton, null);
    }

    _reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        if (this._leftWidget) {
            this._leftWidget.set_position(monitor.x + EDGE_MARGIN, monitor.y + EDGE_MARGIN);
        }
        if (this._weatherWidget) {
            const leftH = this._leftWidget ? this._leftWidget.height : 0;
            this._weatherWidget.set_position(
                monitor.x + EDGE_MARGIN,
                monitor.y + EDGE_MARGIN + leftH + WEATHER_GAP
            );
        }
        if (this._powerButton) {
            this._powerButton.set_position(
                monitor.x + monitor.width - this._powerButton.width - EDGE_MARGIN,
                monitor.y + EDGE_MARGIN
            );
        }
    }

    _updateClock() {
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        if (this._timeLabel)
            this._timeLabel.set_text(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
        if (this._dateLabel)
            this._dateLabel.set_text(`${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`);
    }

    // ======================================================================
    // User session mode — topbar weather button + slide-down panel
    // ======================================================================

    _enableUser() {
        if (WEATHER_LOCATION) {
            this._weatherPanel = new WeatherPanel(this.path);
            Main.panel._rightBox.insert_child_at_index(this._weatherPanel, 0);
            log('[gdm-login-custom] Weather button added to topbar.');
        } else {
            log('[gdm-login-custom] WEATHER_LOCATION is null — weather panel disabled.');
        }
    }

    // ======================================================================
    // Disable — cleans up whichever mode was active
    // ======================================================================

    disable() {
        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts = [];

        for (const s of this._signals) {
            try { s.obj.disconnect(s.id); } catch (e) {}
        }
        this._signals = [];

        if (this._mode === 'gdm') {
            this._disableGdm();
        } else {
            // Any non-gdm mode.
            this._disableUser();
        }

        // Unload stylesheets.
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (this._stylesheetFile)
                theme.unload_stylesheet(this._stylesheetFile);
            if (this._themeFile)
                theme.unload_stylesheet(this._themeFile);
        } catch (e) {}
    }

    _disableGdm() {
        if (this._powerButton) {
            if (this._powerButton.get_parent())
                this._powerButton.get_parent().remove_child(this._powerButton);
            this._powerButton.destroy();
            this._powerButton = null;
        }
        if (this._weatherWidget) {
            if (this._weatherWidget.get_parent())
                this._weatherWidget.get_parent().remove_child(this._weatherWidget);
            try { this._weatherWidget.destroy(); } catch (e) {}
            this._weatherWidget = null;
        }
        if (this._leftWidget) {
            if (this._leftWidget.get_parent())
                this._leftWidget.get_parent().remove_child(this._leftWidget);
            this._leftWidget.destroy();
            this._leftWidget = null;
        }
        this._moon = null;
        this._timeLabel = null;
        this._dateLabel = null;

        if (this._hiddenPanelBox)
            this._hiddenPanelBox.show();
        if (this._hiddenPanelActor)
            this._hiddenPanelActor.show();
        this._hiddenPanelActor = null;
        this._hiddenPanelBox = null;
    }

    _disableUser() {
        if (this._weatherPanel) {
            Main.panel._rightBox.remove_child(this._weatherPanel);
            try { this._weatherPanel.destroy(); } catch (e) {}
            this._weatherPanel = null;
        }
    }
}
