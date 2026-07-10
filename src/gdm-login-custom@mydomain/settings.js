// settings.js — Load and save user configuration.
//
// Config is stored in /etc/gdm-login-custom/config.json — a world-writable
// location readable by both the GDM session and the user session.
// theme.css, arrow.svg, and spinner.svg are also written there.
// If config.json doesn't exist, defaults from config.js are used.

import GLib from 'gi://GLib';

import {
    ACCENT_COLOR,
    HIDE_TOPBAR,
    INVERT_MOON,
    WEATHER_LOCATION,
    WEATHER_FORECAST_HOURS,
    WEATHER_REFRESH_MINUTES,
    WEATHER_ICON_SIZE,
    WEATHER_UNITS,
    WEATHER_LANG,
    MOON_SIZE,
    EDGE_MARGIN,
    WEATHER_GAP,
    ICON_VIEWBOX,
} from './config.js';

const CONFIG_DIR = '/etc/gdm-login-custom';
const CONFIG_PATH = CONFIG_DIR + '/config.json';

const DEFAULTS = {
    accentColor: ACCENT_COLOR,
    forecastHours: WEATHER_FORECAST_HOURS,
    location: WEATHER_LOCATION,
    hideTopbar: HIDE_TOPBAR,
    invertMoon: INVERT_MOON,
};

/**
 * Load config from /etc/gdm-login-custom/config.json.
 * Falls back to defaults from config.js if the file doesn't exist.
 *
 * @returns {Object} { accentColor, forecastHours, location, hideTopbar, invertMoon }
 */
export function loadConfig() {
    try {
        const [ok, bytes] = GLib.file_get_contents(CONFIG_PATH);
        if (ok) {
            const data = JSON.parse(bytes.toString());
            return {
                accentColor: data.accentColor || DEFAULTS.accentColor,
                forecastHours: data.forecastHours || DEFAULTS.forecastHours,
                location: data.location || DEFAULTS.location,
                hideTopbar: data.hideTopbar !== undefined ? data.hideTopbar : DEFAULTS.hideTopbar,
                invertMoon: data.invertMoon !== undefined ? data.invertMoon : DEFAULTS.invertMoon,
            };
        }
    } catch (e) {
        log(`[gdm-login-custom] Could not load config.json: ${e}`);
    }
    return { ...DEFAULTS };
}

/**
 * Save config to /etc/gdm-login-custom/config.json.
 * Also regenerates theme.css, arrow.svg, and spinner.svg.
 *
 * @param {Object} config - { accentColor, forecastHours, location, hideTopbar, invertMoon }
 */
export function saveConfig(config) {
    try {
        GLib.mkdir_with_parents(CONFIG_DIR, 0o777);
    } catch (e) {
        log(`[gdm-login-custom] Could not create ${CONFIG_DIR}: ${e}`);
    }

    const json = JSON.stringify(config, null, 2);
    try {
        GLib.file_set_contents(CONFIG_PATH, json);
        log(`[gdm-login-custom] Config saved to ${CONFIG_PATH}`);
    } catch (e) {
        log(`[gdm-login-custom] Could not save config.json: ${e}`);
    }

    // Regenerate theme.css
    const css = generateThemeCss(config.accentColor);
    GLib.file_set_contents(CONFIG_DIR + '/theme.css', css);

    // Regenerate arrow.svg
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
  <path d="M10.394,19.718L16.975,0.56C17.116,0.15 16.624,-0.179 16.304,0.109L10.278,5.539C10.12,5.681 9.88,5.681 9.722,5.539L3.696,0.109C3.376,-0.179 2.884,0.15 3.025,0.56L9.606,19.718C9.736,20.094 10.264,20.094 10.394,19.718Z" fill="${config.accentColor}"/>
</svg>
`;
    GLib.file_set_contents(CONFIG_DIR + '/arrow.svg', arrowSvg);

    // Regenerate spinner.svg
    const spinnerSvg = `<svg fill="${config.accentColor}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"/></svg>
`;
    GLib.file_set_contents(CONFIG_DIR + '/spinner.svg', spinnerSvg);
    log(`[gdm-login-custom] theme.css + arrow.svg + spinner.svg regenerated`);
}

export function getThemeCssPath() {
    return CONFIG_DIR + '/theme.css';
}

export function getArrowSvgPath() {
    return CONFIG_DIR + '/arrow.svg';
}

export function getSpinnerSvgPath() {
    return CONFIG_DIR + '/spinner.svg';
}

/**
 * Convert a hex color string (#RRGGBB) to RGB components.
 */
export function hexToRgb(hex) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 245, g: 102, b: 145 };
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}

/**
 * Generate the theme.css content for a given accent color.
 */
export function generateThemeCss(hex) {
    const { r, g, b } = hexToRgb(hex);
    return `/* GDM Login Customizer — theme (colors only, generated from config) */
/* Accent color: ${hex} (rgb ${r}, ${g}, ${b}) */

.glc-left-widget {
    background-color: rgba(0, 0, 0, 0.15);
}

.glc-clock-time {
    color: ${hex};
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
}

.glc-clock-date {
    color: ${hex};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}

.glc-power-button {
    background-color: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.35);
    color: ${hex};
}

.glc-power-button:hover {
    background-color: rgba(${r}, ${g}, ${b}, 0.75);
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.85);
    color: #FFFFFF;
}

.glc-power-button:active {
    background-color: rgba(140, 20, 20, 0.9);
}

.glc-confirm-backdrop {
    background-color: rgba(0, 0, 0, 0.55);
}

.glc-confirm-dialog {
    background-color: #1d1d1d;
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.4);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
}

.glc-confirm-title {
    color: ${hex};
}

.glc-confirm-body {
    color: #e6e6e6;
}

.glc-confirm-cancel {
    background-color: #3a3a3a;
    color: #e6e6e6;
}

.glc-confirm-cancel:hover {
    background-color: #4a4a4a;
}

.glc-confirm-ok {
    background-color: #b22222;
    color: #ffffff;
}

.glc-confirm-ok:hover {
    background-color: #c93030;
}

.glc-weather {
    border-top: 1px solid rgba(${r}, ${g}, ${b}, 0.2);
}

.glc-weather-temp {
    color: ${hex};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}

.glc-weather-desc {
    color: ${hex};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}

.glc-weather-forecast {
    border-top: 1px solid rgba(${r}, ${g}, ${b}, 0.2);
}

.glc-weather-day-header {
    color: ${hex};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.glc-weather-forecast-time {
    color: ${hex};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.glc-weather-forecast-temp {
    color: ${hex};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.glc-weather-forecast-wind-icon {
    color: ${hex};
}

.glc-weather-forecast-wind-text {
    color: ${hex};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.glc-weather-button-label {
    color: ${hex};
}

.glc-weather-panel {
    background-color: rgba(0, 0, 0, 0.92);
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.glc-settings-backdrop {
    background-color: rgba(0, 0, 0, 0.6);
}

.glc-settings-dialog {
    background-color: #1d1d1d;
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.glc-settings-title {
    color: ${hex};
}

.glc-settings-label {
    color: #e6e6e6;
}

.glc-settings-entry {
    background-color: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);
}

.glc-settings-entry:focus {
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.8);
}

.glc-settings-button {
    border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);
    color: ${hex};
}

.glc-settings-button:hover {
    background-color: rgba(${r}, ${g}, ${b}, 0.2);
}

.glc-settings-gear {
    color: ${hex};
}

.glc-loading-text {
    color: ${hex};
}
`;
}
