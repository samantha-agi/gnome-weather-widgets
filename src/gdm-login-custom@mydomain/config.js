// config.js — Configuration constants for the GDM Login Customizer extension.
//
// All user-tweakable settings live here. Edit values, save, then restart GDM
// (sudo systemctl restart gdm) to apply.

// OPT-IN: set to true to also hide the GNOME Shell top bar on the login screen.
export const HIDE_TOPBAR = true;

// Moon image display size in pixels.
export const MOON_SIZE = 140;

// Margin from screen edges (px).
export const EDGE_MARGIN = 48;

// Default accent color (overridden by settings.json at runtime).
export const ACCENT_COLOR = '#f56691';

// Moon phase: set to true for southern hemisphere (inverts the phase shadow).
export const INVERT_MOON = false;

// Weather configuration.
// Set WEATHER_LOCATION to null to disable the weather widget entirely.
export const WEATHER_LOCATION = 'Hoogezand';
export const WEATHER_UNITS = 'C';                   // 'C' for Celsius, 'F' for Fahrenheit
export const WEATHER_REFRESH_MINUTES = 30;          // how often to re-fetch
export const WEATHER_ICON_SIZE = 96;                // animated icon size in px
export const WEATHER_FORECAST_HOURS = 12;           // how many time periods to show in forecast
export const WEATHER_LANG = 'en';                   // wttr.in language subdomain

// SVG viewBox dimension (meteocons uses 128x128). Used to normalize
// rotation pivot points (cx/128, cy/128) and translate distances.
export const ICON_VIEWBOX = 128;

// Gap between moon+clock widget and weather widget (px).
export const WEATHER_GAP = 45;
