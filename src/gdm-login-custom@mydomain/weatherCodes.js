// weatherCodes.js — WMO weather code → meteocons icon slug mapping.
//
// Adapted from wttrbar's WEATHER_CODES table (https://github.com/bjesus/wttrbar)
// and the WWO condition codes list (https://www.worldweatheronline.com/feed/wwoConditionCodes.txt).
//
// See icon-mapping.md for the full reference table and the rationale for
// each mapping.

// Map of WMO weather code → [dayIcon, nightIcon] (meteocons slugs, no .svg).
export const WEATHER_CODE_MAP = {
    // Clear / Cloudy
    113: ['clear-day', 'clear-night'],
    116: ['partly-cloudy-day', 'partly-cloudy-night'],
    119: ['cloudy', 'cloudy'],
    122: ['overcast', 'overcast'],

    // Haze / Dust
    125: ['haze-day', 'haze-night'],
    128: ['dust-day', 'dust-night'],
    131: ['dust-day', 'dust-night'],
    134: ['dust-day', 'dust-night'],
    137: ['dust-day', 'dust-night'],
    140: ['dust-day', 'dust-night'],
    143: ['fog-day', 'fog-night'],
    146: ['smoke', 'smoke'],
    149: ['smoke', 'smoke'],
    152: ['smoke', 'smoke'],
    155: ['smoke', 'smoke'],
    158: ['dust-day', 'dust-night'],
    161: ['dust-day', 'dust-night'],

    // Fog
    248: ['fog-day', 'fog-night'],
    260: ['fog-day', 'fog-night'],

    // Drizzle
    263: ['partly-cloudy-day-drizzle', 'partly-cloudy-night-drizzle'],
    266: ['overcast-drizzle', 'overcast-drizzle'],
    281: ['overcast-drizzle', 'overcast-drizzle'],
    284: ['overcast-drizzle', 'overcast-drizzle'],

    // Rain
    176: ['partly-cloudy-day-rain', 'partly-cloudy-night-rain'],
    293: ['partly-cloudy-day-rain', 'partly-cloudy-night-rain'],
    296: ['overcast-rain', 'overcast-rain'],
    299: ['overcast-rain', 'overcast-rain'],
    302: ['overcast-rain', 'overcast-rain'],
    305: ['overcast-rain', 'overcast-rain'],
    308: ['extreme-rain', 'extreme-rain'],
    311: ['overcast-rain', 'overcast-rain'],
    314: ['overcast-rain', 'overcast-rain'],
    317: ['overcast-sleet', 'overcast-sleet'],
    353: ['partly-cloudy-day-rain', 'partly-cloudy-night-rain'],
    356: ['partly-cloudy-day-rain', 'partly-cloudy-night-rain'],
    359: ['extreme-rain', 'extreme-rain'],

    // Snow
    179: ['partly-cloudy-day-snow', 'partly-cloudy-night-snow'],
    227: ['overcast-snow', 'overcast-snow'],
    230: ['extreme-snow', 'extreme-snow'],
    320: ['overcast-sleet', 'overcast-sleet'],
    323: ['partly-cloudy-day-snow', 'partly-cloudy-night-snow'],
    326: ['overcast-snow', 'overcast-snow'],
    329: ['overcast-snow', 'overcast-snow'],
    332: ['overcast-snow', 'overcast-snow'],
    335: ['overcast-snow', 'overcast-snow'],
    338: ['extreme-snow', 'extreme-snow'],
    368: ['partly-cloudy-day-snow', 'partly-cloudy-night-snow'],
    371: ['overcast-snow', 'overcast-snow'],

    // Sleet / Ice
    182: ['partly-cloudy-day-sleet', 'partly-cloudy-night-sleet'],
    185: ['partly-cloudy-day-drizzle', 'partly-cloudy-night-drizzle'],
    350: ['overcast-sleet', 'overcast-sleet'],
    362: ['partly-cloudy-day-sleet', 'partly-cloudy-night-sleet'],
    365: ['overcast-sleet', 'overcast-sleet'],
    374: ['partly-cloudy-day-sleet', 'partly-cloudy-night-sleet'],
    377: ['overcast-sleet', 'overcast-sleet'],

    // Thunderstorms
    200: ['thunderstorms-overcast', 'thunderstorms-overcast'],
    386: ['thunderstorms-overcast-rain', 'thunderstorms-overcast-rain'],
    389: ['thunderstorms-extreme-rain', 'thunderstorms-extreme-rain'],
    392: ['thunderstorms-overcast-snow', 'thunderstorms-overcast-snow'],
    395: ['thunderstorms-extreme-snow', 'thunderstorms-extreme-snow'],
};

/**
 * Returns the meteocons icon slug (without extension) for a given weather code,
 * choosing day or night variant based on whether the sun is up.
 *
 * @param {number} code - WMO weather code from wttr.in
 * @param {boolean} isDaytime - true if it's currently daytime
 * @returns {string} icon slug (e.g. 'clear-day', 'overcast-rain')
 */
export function getWeatherIconName(code, isDaytime) {
    const entry = WEATHER_CODE_MAP[code];
    if (!entry) {
        log(`[gdm-login-custom] Unknown weather code: ${code} — using default`);
        return isDaytime ? 'partly-cloudy-day' : 'partly-cloudy-night';
    }
    return isDaytime ? entry[0] : entry[1];
}

/**
 * Determines whether it's currently daytime based on sunrise/sunset times
 * from wttr.in's astronomy data.
 *
 * @param {string} sunrise - "HH:MM AM" or "HH:MM PM" format from wttr.in
 * @param {string} sunset  - same format
 * @param {Date} now       - current time
 * @returns {boolean} true if sun is up
 */
export function isDaytimeFromAstronomy(sunrise, sunset, now = new Date()) {
    try {
        const parseTime = (s) => {
            const m = s.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
            if (!m) return null;
            let h = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
            if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
            return h * 60 + min;
        };
        const sr = parseTime(sunrise);
        const ss = parseTime(sunset);
        if (sr === null || ss === null) return true;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        return nowMin >= sr && nowMin < ss;
    } catch (e) {
        log(`[gdm-login-custom] isDaytime parse error: ${e}`);
        return true;
    }
}

// Beaufort scale thresholds in km/h (upper bound of each level).
const BEAUFORT_THRESHOLDS = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];

/**
 * Convert wind speed in km/h to Beaufort scale number (0-12).
 * @param {number|string} kmh - wind speed in km/h
 * @returns {number} Beaufort scale 0-12
 */
export function kmhToBeaufort(kmh) {
    const speed = parseFloat(kmh);
    for (let i = 0; i < BEAUFORT_THRESHOLDS.length; i++) {
        if (speed < BEAUFORT_THRESHOLDS[i])
            return i;
    }
    return 12;
}
