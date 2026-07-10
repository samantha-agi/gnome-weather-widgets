// moonPhase.js — Moon-phase math.
//
// Computes the moon phase as a fraction [0, 1) based on the J2000.0 epoch
// new moon (2000-01-06 18:14 UTC) and the standard synodic month length.

// Synodic (lunar) month in days.
const SYNODIC_MONTH = 29.53058867;

// Reference new-moon instant: 2000-01-06 18:14 UTC (J2000.0 epoch new moon).
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/**
 * Returns moon phase as a fraction in [0, 1).
 *   0.00 = new moon
 *   0.25 = first quarter (waxing)
 *   0.50 = full moon
 *   0.75 = last quarter (waning)
 *
 * @param {Date} date
 * @returns {number} phase fraction in [0, 1)
 */
export function getMoonPhase(date) {
    const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86400000;
    let phase = (daysSince % SYNODIC_MONTH) / SYNODIC_MONTH;
    if (phase < 0)
        phase += 1;
    return phase;
}
