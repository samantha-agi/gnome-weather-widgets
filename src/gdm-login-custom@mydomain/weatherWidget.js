// weatherWidget.js — Current weather + multi-period forecast widget.
//
// Fetches weather data from wttr.in JSON API, picks the appropriate meteocons
// icon slug based on WMO weather code + day/night, and renders the icon using
// AnimatedIcon (multi-layer animated SVG via 60 FPS GLib timeout loop).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';
import St from 'gi://St';

import {
    WEATHER_UNITS,
    WEATHER_ICON_SIZE,
    WEATHER_REFRESH_MINUTES,
    WEATHER_LANG,
} from './config.js';
import { loadSettings } from './settings.js';
import { getWeatherIconName, isDaytimeFromAstronomy, kmhToBeaufort } from './weatherCodes.js';
import { AnimatedIcon } from './animatedIcon.js';
import { LoadingWidget } from './loadingWidget.js';
import { getArrowSvgPath } from './settings.js';

export const WeatherWidget = GObject.registerClass(
class WeatherWidget extends St.BoxLayout {
    _init(extensionPath) {
        super._init({
            style_class: 'glc-weather',
            vertical: true,
        });
        this._extensionPath = extensionPath;
        this._animatedIconsDir = extensionPath + '/weather-icons/animated';
        this._staticIconsDir = extensionPath + '/weather-icons/static';
        this._windIconsDir = extensionPath + '/weather-icons/wind';
        this._httpSession = null;
        this._refreshTimeoutId = null;
        this._currentIcon = null;
        this._currentIconWidget = null;
        this._currentTempLabel = null;
        this._currentDescLabel = null;
        this._forecastBox = null;
        this._forecastIcons = [];  // track for cleanup

        // Build the UI: top row (icon + current info), bottom row (forecast).
        const topRow = new St.BoxLayout({
            style_class: 'glc-weather-current',
        });

        this._currentIconWidget = new St.Bin({
            style_class: 'glc-weather-current-icon',
            width: WEATHER_ICON_SIZE,
            height: WEATHER_ICON_SIZE,
        });

        const infoBox = new St.BoxLayout({
            style_class: 'glc-weather-info',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._currentTempLabel = new St.Label({
            text: '--°',
            style_class: 'glc-weather-temp',
        });
        this._currentDescLabel = new St.Label({
            text: 'Loading…',
            style_class: 'glc-weather-desc',
        });
        infoBox.add_child(this._currentTempLabel);
        infoBox.add_child(this._currentDescLabel);

        topRow.add_child(this._currentIconWidget);
        topRow.add_child(infoBox);

        this._forecastBox = new St.BoxLayout({
            style_class: 'glc-weather-forecast',
            vertical: true,
        });

        this.add_child(topRow);
        this.add_child(this._forecastBox);

        // Keep references for show/hide during loading.
        this._topRow = topRow;
        this._forecastBoxRef = this._forecastBox;

        // Show "Loading…" state, then set up network monitoring.
        this._networkMonitor = Gio.NetworkMonitor.get_default();
        this._networkChangedId = this._networkMonitor.connect('network-changed', (monitor, networkAvailable) => {
            // The signal arg is a boolean (networkAvailable), NOT the connectivity enum.
            // Call get_connectivity() to get the actual level.
            const connectivity = monitor.get_connectivity();
            if (connectivity === Gio.NetworkConnectivity.FULL) {
                log('[gdm-login-custom] Network connected (FULL) — fetching weather');
                this._fetchWeather();
            }
        });

        // Try immediately in case network is already up.
        this._fetchWeather();
    }

    _fetchWeather() {
        const settings = loadSettings();
        const location = settings.location;
        log(`[gdm-login-custom] Fetching weather for ${location}`);
        if (!this._httpSession) {
            try {
                this._httpSession = new Soup.Session();
            } catch (e) {
                log(`[gdm-login-custom] Soup.Session failed: ${e}`);
                this._currentDescLabel.set_text('Weather unavailable (no Soup)');
                return;
            }
        }

        // Clear any pending refresh timer.
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }

        const url = `https://${WEATHER_LANG}.wttr.in/${encodeURIComponent(location)}?format=j1`;
        const msg = Soup.Message.new('GET', url);

        this._httpSession.send_and_read_async(msg, null, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const text = bytes.get_data().toString();
                if (msg.get_status() !== Soup.Status.OK) {
                    log(`[gdm-login-custom] wttr.in HTTP ${msg.get_status()}`);
                    this._showLoading();
                    // Don't schedule a retry — the network-changed signal
                    // will fire when connectivity is restored.
                    return;
                }
                const data = JSON.parse(text);
                this._renderWeather(data);
                this._stopLoading();
                // Success — schedule normal refresh.
                this._refreshTimeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    WEATHER_REFRESH_MINUTES * 60,
                    () => {
                        this._fetchWeather();
                        return GLib.SOURCE_CONTINUE;
                    }
                );
            } catch (e) {
                log(`[gdm-login-custom] weather fetch failed: ${e}`);
                this._showLoading();
                // No retry — network-changed signal handles it.
            }
        });
    }

    _showLoading() {
        if (this._loadingWidget)
            return;  // already showing
        // Hide the weather content, show the loading widget in its place.
        this._topRow.hide();
        this._forecastBox.hide();
        this._loadingWidget = new LoadingWidget(this._extensionPath);
        // Insert at the same position as the weather content.
        this.insert_child_at_index(this._loadingWidget, 0);
    }

    _stopLoading() {
        if (this._loadingWidget) {
            this._loadingWidget.destroy();
            this._loadingWidget = null;
        }
        this._topRow.show();
        this._forecastBox.show();
    }

    _renderWeather(data) {
        try {
            const current = data.current_condition[0];
            const todayAstronomy = data.weather[0].astronomy[0];

            const code = parseInt(current.weatherCode, 10);
            const isDay = isDaytimeFromAstronomy(
                todayAstronomy.sunrise,
                todayAstronomy.sunset
            );
            const iconName = getWeatherIconName(code, isDay);
            // Current weather icon: animated SVG from weather-icons/animated/<slug>/
            const iconDir = `${this._animatedIconsDir}/${iconName}`;

            log(`[gdm-login-custom] Weather: code=${code} isDay=${isDay} icon=${iconName} temp=${current.temp_C}C desc=${current.weatherDesc[0].value}`);

            // Replace the current icon widget's child.
            if (this._currentIcon)
                this._currentIcon.destroy();
            try {
                this._currentIcon = new AnimatedIcon(iconDir, WEATHER_ICON_SIZE);
            } catch (e) {
                log(`[gdm-login-custom] AnimatedIcon creation failed: ${e}`);
                this._currentIcon = new St.Label({ text: '?' });
            }
            this._currentIconWidget.set_child(this._currentIcon);

            // Current temp + description.
            const temp = WEATHER_UNITS === 'F' ? current.temp_F : current.temp_C;
            this._currentTempLabel.set_text(`${temp}°${WEATHER_UNITS}`);
            this._currentDescLabel.set_text(current.weatherDesc[0].value);

            // Forecast: build a flat list of {date, hour, hourVal, ...} entries
            // across all days returned by wttr.in (usually 3 days × 8 hours = 24).
            const allEntries = [];
            for (const day of data.weather) {
                for (const h of day.hourly) {
                    allEntries.push({
                        date: day.date,             // "YYYY-MM-DD"
                        hourVal: parseInt(h.time, 10) / 100,
                        hourEntry: h,
                    });
                }
            }
            this._renderForecast(allEntries);
        } catch (e) {
            log(`[gdm-login-custom] _renderWeather failed: ${e}`);
            this._currentDescLabel.set_text('Weather parse error');
        }
    }

    _renderForecast(allEntries) {
        const settings = loadSettings();
        const forecastHours = settings.forecastHours;
        // Clear existing forecast items.
        const children = this._forecastBox.get_children();
        for (const c of children)
            c.destroy();
        this._forecastIcons = [];

        // Skip past hours of today.
        const nowHour = new Date().getHours();
        const todayStr = new Date().toISOString().slice(0, 10);
        let skippedPast = false;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                          'Thursday', 'Friday', 'Saturday'];
        let lastDateStr = null;
        let shown = 0;

        for (const entry of allEntries) {
            if (shown >= forecastHours)
                break;

            // Skip hours already past today (only at the start).
            if (!skippedPast && entry.date === todayStr && entry.hourVal < nowHour) {
                continue;
            }
            skippedPast = true;

            // When the day changes, insert a day header (full name, centered, underlined).
            if (entry.date !== lastDateStr) {
                const d = new Date(entry.date + 'T00:00:00');
                const fullDayName = dayNames[d.getDay()] || '';
                const dayHeader = new St.Label({
                    text: fullDayName,
                    style_class: 'glc-weather-day-header',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                });
                this._forecastBox.add_child(dayHeader);
                lastDateStr = entry.date;
            }

            const h = entry.hourEntry;
            const code = parseInt(h.weatherCode, 10);
            const isDay = entry.hourVal >= 6 && entry.hourVal < 18;
            const iconName = getWeatherIconName(code, isDay);
            const svgPath = `${this._staticIconsDir}/${iconName}.svg`;
            const temp = WEATHER_UNITS === 'F' ? h.FeelsLikeF : h.FeelsLikeC;

            // Wind direction + Beaufort.
            const windDir = h.winddir16Point || '';
            const beaufort = kmhToBeaufort(h.windspeedKmph);
            const windText = `${windDir}${beaufort}`;

            // Each forecast row: [time | weather-icon | temp | wind-icon + wind-text]
            const item = new St.BoxLayout({
                style_class: 'glc-weather-forecast-item',
                vertical: false,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });

            // Time label (e.g. "14h").
            const timeLabel = new St.Label({
                text: `${entry.hourVal.toString().padStart(2, '0')}h`,
                style_class: 'glc-weather-forecast-time',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });

            // Weather condition icon (static SVG, 36px).
            const iconBin = new St.Bin({
                style_class: 'glc-weather-forecast-icon',
                width: 36,
                height: 36,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                const gicon = Gio.Icon.new_for_string(`file://${svgPath}`);
                const icon = new St.Icon({
                    gicon: gicon,
                    icon_size: 36,
                    x_expand: false,
                    y_expand: false,
                });
                iconBin.set_child(icon);
                this._forecastIcons.push(icon);
            } catch (e) {
                log(`[gdm-login-custom] forecast icon load failed for ${iconName}: ${e}`);
            }

            // Temperature label.
            const tempLabel = new St.Label({
                text: `${temp}°`,
                style_class: 'glc-weather-forecast-temp',
                x_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            });

            // Wind direction icon (single arrow.svg, rotated per row).
            // The arrow points DOWN (south) by default = TO direction for a N wind.
            // Rotate by winddirDegree (clockwise from north) to point in the TO direction.
            const windDirDeg = parseInt(h.winddirDegree, 10) || 0;
            const windIconBin = new St.Bin({
                style_class: 'glc-weather-forecast-wind-icon',
                width: 16,
                height: 16,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                // Load arrow.svg as bytes to bypass St.Icon file-path caching.
                const arrowPath = getArrowSvgPath();
                const [ok, arrowBytes] = GLib.file_get_contents(arrowPath);
                if (ok) {
                    const windGicon = Gio.BytesIcon.new(arrowBytes);
                    const windIcon = new St.Icon({
                        gicon: windGicon,
                        icon_size: 16,
                        x_expand: false,
                        y_expand: false,
                        style_class: 'glc-weather-forecast-wind-icon',
                    });
                    windIcon.set_pivot_point(0.5, 0.5);
                    windIcon.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, windDirDeg);
                    windIconBin.set_child(windIcon);
                }
            } catch (e) {
                log(`[gdm-login-custom] wind icon load failed: ${e}`);
            }

            // Wind direction + Beaufort text (e.g. "NNW3").
            const windLabel = new St.Label({
                text: windText,
                style_class: 'glc-weather-forecast-wind-text',
                x_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            });

            item.add_child(timeLabel);
            item.add_child(iconBin);
            item.add_child(tempLabel);
            item.add_child(windIconBin);
            item.add_child(windLabel);

            this._forecastBox.add_child(item);
            shown++;
        }
        log(`[gdm-login-custom] Forecast rendered: ${shown} entries`);
    }

    destroy() {
        this._stopLoading();
        if (this._networkChangedId && this._networkMonitor) {
            try { this._networkMonitor.disconnect(this._networkChangedId); } catch (e) {}
            this._networkChangedId = null;
        }
        this._networkMonitor = null;
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
        if (this._httpSession) {
            try { this._httpSession.abort(); } catch (e) {}
            this._httpSession = null;
        }
        super.destroy();
    }
});
