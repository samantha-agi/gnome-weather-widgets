// moonPhase.js — Moon phase from geocentric ecliptic elongation (Meeus).
//
// The moon phase is, by definition, the Sun–Moon angular separation along
// the ecliptic (elongation) as a fraction of 360°. We compute each body's
// ecliptic longitude from a truncated lunar/solar theory — Jean Meeus,
// "Astronomical Algorithms" and take their difference.
//
//   0.00 = new moon       0.50 = full moon
//   0.25 = first quarter  0.75 = last quarter
//   0 → 0.5 waxing,  0.5 → 1.0 waning
//
// Accuracy: phase timing typically within ~1–3 hours of true conjunction.

const RAD = Math.PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;  // Julian Date of the Unix epoch (1970-01-01 12:00 UT)
const J2000 = 2451545;  // Julian Date of J2000.0  (2000-01-01 12:00 TT)

// Days since J2000.0 from a JS Date.
function toDays(date) {
    return (date.getTime() / dayMs - 0.5 + J1970) - J2000;
}

// Sun's apparent geocentric ecliptic longitude (radians).
function sunLongitude(d) {
    const M = RAD * (357.5291 + 0.98560028 * d);          // mean anomaly
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const perihelion = RAD * 102.9372;
    return M + C + perihelion + Math.PI;
}

// Moon's geocentric ecliptic longitude (radians), truncated ELP/Meeus.
function moonLongitude(d) {
    const L = RAD * (218.316 + 13.176396 * d);            // mean longitude
    const M = RAD * (134.963 + 13.064993 * d);            // mean anomaly
    return L + RAD * 6.289 * Math.sin(M);                 // evection correction
}

/** Moon phase as a fraction in [0, 1): Sun–Moon elongation / 360°. */
export function getMoonPhase(date = new Date()) {
    const d = toDays(date);
    const elongation = moonLongitude(d) - sunLongitude(d);
    const norm = ((elongation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return norm / (2 * Math.PI);
}

/** Illuminated fraction of the Moon's disk, [0, 1]. */
export function getMoonIllumination(date = new Date()) {
    const phase = getMoonPhase(date);
    return (1 - Math.cos(phase * 2 * Math.PI)) / 2;
}
