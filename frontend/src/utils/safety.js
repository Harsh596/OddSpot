// frontend/src/utils/safety.js
// Pure safety utilities: local solar time calculator, night detector, and structured report reasons.

/**
 * Calculates estimated local solar time for a given longitude.
 * Earth rotates 360 degrees in 24 hours (1 degree = 4 minutes).
 *
 * @param {number} longitude - Geographic longitude in decimal degrees (-180 to 180)
 * @returns {{ hours: number, minutes: number, isNight: boolean, timeString: string } | null}
 */
export function getLocalSolarTime(longitude) {
  if (typeof longitude !== 'number' || isNaN(longitude)) return null;

  const utcMillis = Date.now();
  const solarMillis = utcMillis + longitude * 4 * 60 * 1000;
  const solarDate = new Date(solarMillis);

  const hours = solarDate.getUTCHours();
  const minutes = solarDate.getUTCMinutes();
  const isNight = hours >= 20 || hours < 6;

  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return {
    hours,
    minutes,
    isNight,
    timeString,
  };
}

/**
 * Structured report reason categories aligned with backend validation schema.
 */
export const REPORT_REASONS = [
  {
    id: 'unsafe_or_private',
    label: 'Unsafe or Private Property',
    icon: '🔒',
    description:
      'Private residence, school, railway/utility hazard, or restricted zone. Automatically triggers location fuzzing once threshold is reached.',
  },
  {
    id: 'nsfw',
    label: 'NSFW / Explicit Content',
    icon: '🔞',
    description: 'Adult material, graphic violence, or sexually explicit photos.',
  },
  {
    id: 'spam',
    label: 'Spam or Commercial Promotion',
    icon: '📢',
    description: 'Unsolicited business advertisements, affiliate links, or commercial marketing.',
  },
  {
    id: 'doxxing',
    label: 'Doxxing or Personal Privacy Violation',
    icon: '👤',
    description: 'Exposes private individuals, vehicle license plates, or resident phone numbers.',
  },
  {
    id: 'misinformation',
    label: 'Fake Location or Misinformation',
    icon: '🧭',
    description: 'Fabricated GPS coordinates, AI-generated photos, or nonexistent location.',
  },
  {
    id: 'other',
    label: 'Other Guideline Violation',
    icon: '🚩',
    description: 'Vandalism encouragement, harassment, or other safety concern.',
  },
];
