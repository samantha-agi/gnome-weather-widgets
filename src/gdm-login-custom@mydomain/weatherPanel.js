// weatherPanel.js — Topbar weather button with slide-down panel (user session).
//
// Adds a "Weather" button to the right side of the GNOME topbar. Clicking it
// slides down a black panel containing a WeatherWidget. Clicking again slides
// it back up. Uses Clutter.PropertyTransition for smooth animation.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { WeatherWidget } from './weatherWidget.js';
import { SettingsModal } from './settingsModal.js';
import { loadSettings, getThemeCssPath } from './settings.js';
import { getWeatherIconName, isDaytimeFromAstronomy } from './weatherCodes.js';
import { WEATHER_LANG, WEATHER_UNITS, WEATHER_REFRESH_MINUTES } from './config.js';

const WeatherPanel = GObject.registerClass(
class WeatherPanel extends St.Button {
    _init(extensionPath) {
        super._init({
            style_class: 'glc-weather-button',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._extensionPath = extensionPath;
        this._panel = null;
        this._isOpen = false;
        this._settingsModalOpen = false;
        this._httpSession = null;
        this._refreshTimeoutId = null;
        this._networkMonitor = null;
        this._networkChangedId = null;

        // Button content in the topbar: static weather icon + temp label.
        this._buttonContent = new St.BoxLayout({
            style_class: 'glc-weather-button-content',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._buttonIcon = new St.Icon({
            icon_size: 16,
            x_expand: false,
            y_expand: false,
        });
        this._buttonLabel = new St.Label({
            text: '--°',
            style_class: 'glc-weather-button-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._buttonContent.add_child(this._buttonIcon);
        this._buttonContent.add_child(this._buttonLabel);
        this.set_child(this._buttonContent);

        // Build the weather panel (hidden initially).
        this._buildPanel();

        // Toggle on click.
        this.connect('clicked', () => this._toggle());

        // Fetch weather for the topbar button.
        this._fetchButtonWeather();

        // Set up network monitoring for the button weather.
        this._networkMonitor = Gio.NetworkMonitor.get_default();
        this._networkChangedId = this._networkMonitor.connect('network-changed', (monitor, networkAvailable) => {
            const connectivity = monitor.get_connectivity();
            if (connectivity === Gio.NetworkConnectivity.FULL) {
                this._fetchButtonWeather();
            }
        });
    }

    _fetchButtonWeather() {
        const settings = loadSettings();
        const location = settings.location;

        if (!this._httpSession)
            this._httpSession = new Soup.Session();

        const url = `https://${WEATHER_LANG}.wttr.in/${encodeURIComponent(location)}?format=j1`;
        const msg = Soup.Message.new('GET', url);

        this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const text = bytes.get_data().toString();
                if (msg.get_status() !== Soup.Status.OK)
                    return;
                const data = JSON.parse(text);
                const current = data.current_condition[0];
                const astronomy = data.weather[0].astronomy[0];
                const code = parseInt(current.weatherCode, 10);
                const isDay = isDaytimeFromAstronomy(astronomy.sunrise, astronomy.sunset);
                const iconName = getWeatherIconName(code, isDay);
                const temp = WEATHER_UNITS === 'F' ? current.temp_F : current.temp_C;

                // Update the button icon (static SVG) — load as bytes to bypass caching.
                const svgPath = `${this._extensionPath}/weather-icons/static/${iconName}.svg`;
                try {
                    const [ok, iconBytes] = GLib.file_get_contents(svgPath);
                    if (ok)
                        this._buttonIcon.set_gicon(Gio.BytesIcon.new(iconBytes));
                } catch (e) {
                    log(`[gdm-login-custom] button icon load failed for ${iconName}: ${e}`);
                }
                this._buttonLabel.set_text(`${temp}°`);

                // Schedule next refresh.
                if (this._refreshTimeoutId)
                    GLib.source_remove(this._refreshTimeoutId);
                this._refreshTimeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    WEATHER_REFRESH_MINUTES * 60,
                    () => {
                        this._fetchButtonWeather();
                        return GLib.SOURCE_CONTINUE;
                    }
                );
            } catch (e) {
                log(`[gdm-login-custom] button weather fetch failed: ${e}`);
            }
        });
    }

    _buildPanel() {
        // Use a container that holds the weather widget + settings gear.
        const container = new St.BoxLayout({
            vertical: true,
        });

        // The weather widget.
        this._weatherWidget = new WeatherWidget(this._extensionPath);
        container.add_child(this._weatherWidget);

        // Settings gear button at the bottom-right.
        const gearRow = new St.BoxLayout({
            style_class: 'glc-weather-panel-gear-row',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        const gearBtn = new St.Button({
            style_class: 'glc-settings-gear',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'emblem-system-symbolic',
                icon_size: 16,
            }),
        });
        gearBtn.connect('clicked', () => {
            // Prevent opening multiple modals.
            if (this._settingsModalOpen)
                return;
            this._settingsModalOpen = true;
            const modal = new SettingsModal(this._extensionPath, () => {
                // On close — reload theme + weather widget.
                this._reloadTheme();
                this._reloadWeather();
                this._settingsModalOpen = false;
            });
            modal.show();
        });
        gearRow.add_child(gearBtn);
        container.add_child(gearRow);

        // Panel bin wrapping the container.
        this._panel = new St.Bin({
            style_class: 'glc-weather-panel',
            x_expand: false,
            y_expand: false,
            child: container,
        });

        // Add to uiGroup but position it off-screen.
        Main.uiGroup.add_child(this._panel);

        // Start hidden.
        this._positionPanel();
        this._panel.set_translation(0, -1000, 0);
        this._panel.set_opacity(0);
    }

    _reloadTheme() {
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            const themePath = getThemeCssPath();
            const themeFile = Gio.File.new_for_path(themePath);
            if (themeFile.query_exists(null)) {
                theme.unload_stylesheet(themeFile);
                theme.load_stylesheet(themeFile);
                log('[gdm-login-custom] Theme reloaded from ' + themePath);
            }
        } catch (e) {
            log(`[gdm-login-custom] Theme reload failed: ${e}`);
        }
        // Re-fetch button weather to refresh the icon (in case accent color changed
        // and the static SVG was regenerated).
        this._fetchButtonWeather();
    }

    _reloadWeather() {
        // Destroy and rebuild the weather widget with new settings.
        if (this._weatherWidget) {
            this._weatherWidget.destroy();
            this._weatherWidget = new WeatherWidget(this._extensionPath);
            // Insert it as the first child of the container (before the gear row).
            const container = this._panel.get_child();
            container.insert_child_at_index(this._weatherWidget, 0);
        }
    }

    _positionPanel() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._panel)
            return;
        // Let the panel size itself to its content. Just set position.
        const panelW = this._panel.get_preferred_width(-1)[1] || 360;
        const panelH = this._panel.get_preferred_height(panelW)[1] || 400;
        // Position: right side, below topbar.
        const panelX = monitor.x + monitor.width - panelW - 12;
        const panelY = monitor.y + 32;
        this._panel.set_position(panelX, panelY);
    }

    _toggle() {
        if (this._isOpen) {
            this._slideUp();
        } else {
            this._slideDown();
        }
    }

    _slideDown() {
        this._isOpen = true;
        this._positionPanel();

        // Get actual panel height for the slide animation.
        const panelW = this._panel.get_preferred_width(-1)[1] || 360;
        const panelH = this._panel.get_preferred_height(panelW)[1] || 400;

        // Remove any existing transition.
        this._panel.remove_transition('slide');

        const transition = new Clutter.PropertyTransition({
            property_name: 'translation-y',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_FLOAT,
                initial: -panelH,
                final: 0,
            }),
            duration: 300,
            progress_mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._panel.add_transition('slide', transition);
        transition.start();

        // Fade in.
        this._panel.remove_transition('fade');
        const fade = new Clutter.PropertyTransition({
            property_name: 'opacity',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_UINT,
                initial: 0,
                final: 255,
            }),
            duration: 300,
            progress_mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._panel.add_transition('fade', fade);
        fade.start();
    }

    _slideUp() {
        this._isOpen = false;

        const panelW = this._panel.get_preferred_width(-1)[1] || 360;
        const panelH = this._panel.get_preferred_height(panelW)[1] || 400;

        this._panel.remove_transition('slide');
        const transition = new Clutter.PropertyTransition({
            property_name: 'translation-y',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_FLOAT,
                initial: 0,
                final: -panelH,
            }),
            duration: 300,
            progress_mode: Clutter.AnimationMode.EASE_IN_CUBIC,
        });
        this._panel.add_transition('slide', transition);
        transition.start();

        // Fade out.
        this._panel.remove_transition('fade');
        const fade = new Clutter.PropertyTransition({
            property_name: 'opacity',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_UINT,
                initial: 255,
                final: 0,
            }),
            duration: 300,
            progress_mode: Clutter.AnimationMode.EASE_IN_CUBIC,
        });
        this._panel.add_transition('fade', fade);
        fade.start();
    }

    destroy() {
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
        if (this._networkChangedId && this._networkMonitor) {
            try { this._networkMonitor.disconnect(this._networkChangedId); } catch (e) {}
            this._networkChangedId = null;
        }
        this._networkMonitor = null;
        if (this._httpSession) {
            try { this._httpSession.abort(); } catch (e) {}
            this._httpSession = null;
        }
        if (this._weatherWidget) {
            try { this._weatherWidget.destroy(); } catch (e) {}
            this._weatherWidget = null;
        }
        if (this._panel) {
            if (this._panel.get_parent())
                this._panel.get_parent().remove_child(this._panel);
            this._panel.destroy();
            this._panel = null;
        }
        super.destroy();
    }
});

export { WeatherPanel };
