// backend/utils/place.js
// Canonical city key generator and ISO 3166-1 alpha-2 country resolver.

const { normalizeText } = require('./normalize');

// ISO 3166-1 alpha-2 countries lookup table (Standard Alpha-2 codes, official names, and aliases)
const ISO_COUNTRIES = {
  AF: { code: 'AF', name: 'Afghanistan' },
  AX: { code: 'AX', name: 'Åland Islands' },
  AL: { code: 'AL', name: 'Albania' },
  DZ: { code: 'DZ', name: 'Algeria' },
  AS: { code: 'AS', name: 'American Samoa' },
  AD: { code: 'AD', name: 'Andorra' },
  AO: { code: 'AO', name: 'Angola' },
  AI: { code: 'AI', name: 'Anguilla' },
  AQ: { code: 'AQ', name: 'Antarctica' },
  AG: { code: 'AG', name: 'Antigua and Barbuda' },
  AR: { code: 'AR', name: 'Argentina' },
  AM: { code: 'AM', name: 'Armenia' },
  AW: { code: 'AW', name: 'Aruba' },
  AU: { code: 'AU', name: 'Australia' },
  AT: { code: 'AT', name: 'Austria' },
  AZ: { code: 'AZ', name: 'Azerbaijan' },
  BS: { code: 'BS', name: 'Bahamas' },
  BH: { code: 'BH', name: 'Bahrain' },
  BD: { code: 'BD', name: 'Bangladesh' },
  BB: { code: 'BB', name: 'Barbados' },
  BY: { code: 'BY', name: 'Belarus' },
  BE: { code: 'BE', name: 'Belgium' },
  BZ: { code: 'BZ', name: 'Belize' },
  BJ: { code: 'BJ', name: 'Benin' },
  BM: { code: 'BM', name: 'Bermuda' },
  BT: { code: 'BT', name: 'Bhutan' },
  BO: { code: 'BO', name: 'Bolivia' },
  BA: { code: 'BA', name: 'Bosnia and Herzegovina' },
  BW: { code: 'BW', name: 'Botswana' },
  BR: { code: 'BR', name: 'Brazil' },
  IO: { code: 'IO', name: 'British Indian Ocean Territory' },
  BN: { code: 'BN', name: 'Brunei' },
  BG: { code: 'BG', name: 'Bulgaria' },
  BF: { code: 'BF', name: 'Burkina Faso' },
  BI: { code: 'BI', name: 'Burundi' },
  KH: { code: 'KH', name: 'Cambodia' },
  CM: { code: 'CM', name: 'Cameroon' },
  CA: { code: 'CA', name: 'Canada' },
  CV: { code: 'CV', name: 'Cape Verde' },
  KY: { code: 'KY', name: 'Cayman Islands' },
  CF: { code: 'CF', name: 'Central African Republic' },
  TD: { code: 'TD', name: 'Chad' },
  CL: { code: 'CL', name: 'Chile' },
  CN: { code: 'CN', name: 'China' },
  CO: { code: 'CO', name: 'Colombia' },
  KM: { code: 'KM', name: 'Comoros' },
  CG: { code: 'CG', name: 'Congo' },
  CD: { code: 'CD', name: 'Democratic Republic of the Congo' },
  CK: { code: 'CK', name: 'Cook Islands' },
  CR: { code: 'CR', name: 'Costa Rica' },
  CI: { code: 'CI', name: "Cote d'Ivoire", aliases: ['ivory coast'] },
  HR: { code: 'HR', name: 'Croatia' },
  CU: { code: 'CU', name: 'Cuba' },
  CY: { code: 'CY', name: 'Cyprus' },
  CZ: { code: 'CZ', name: 'Czech Republic', aliases: ['czechia'] },
  DK: { code: 'DK', name: 'Denmark' },
  DJ: { code: 'DJ', name: 'Djibouti' },
  DM: { code: 'DM', name: 'Dominica' },
  DO: { code: 'DO', name: 'Dominican Republic' },
  EC: { code: 'EC', name: 'Ecuador' },
  EG: { code: 'EG', name: 'Egypt' },
  SV: { code: 'SV', name: 'El Salvador' },
  GQ: { code: 'GQ', name: 'Equatorial Guinea' },
  ER: { code: 'ER', name: 'Eritrea' },
  EE: { code: 'EE', name: 'Estonia' },
  ET: { code: 'ET', name: 'Ethiopia' },
  FJ: { code: 'FJ', name: 'Fiji' },
  FI: { code: 'FI', name: 'Finland' },
  FR: { code: 'FR', name: 'France' },
  GA: { code: 'GA', name: 'Gabon' },
  GM: { code: 'GM', name: 'Gambia' },
  GE: { code: 'GE', name: 'Georgia' },
  DE: { code: 'DE', name: 'Germany' },
  GH: { code: 'GH', name: 'Ghana' },
  GR: { code: 'GR', name: 'Greece' },
  GL: { code: 'GL', name: 'Greenland' },
  GD: { code: 'GD', name: 'Grenada' },
  GT: { code: 'GT', name: 'Guatemala' },
  GN: { code: 'GN', name: 'Guinea' },
  GW: { code: 'GW', name: 'Guinea-Bissau' },
  GY: { code: 'GY', name: 'Guyana' },
  HT: { code: 'HT', name: 'Haiti' },
  HN: { code: 'HN', name: 'Honduras' },
  HK: { code: 'HK', name: 'Hong Kong' },
  HU: { code: 'HU', name: 'Hungary' },
  IS: { code: 'IS', name: 'Iceland' },
  IN: { code: 'IN', name: 'India', aliases: ['ind', 'bharat'] },
  ID: { code: 'ID', name: 'Indonesia' },
  IR: { code: 'IR', name: 'Iran' },
  IQ: { code: 'IQ', name: 'Iraq' },
  IE: { code: 'IE', name: 'Ireland' },
  IL: { code: 'IL', name: 'Israel' },
  IT: { code: 'IT', name: 'Italy' },
  JM: { code: 'JM', name: 'Jamaica' },
  JP: { code: 'JP', name: 'Japan' },
  JO: { code: 'JO', name: 'Jordan' },
  KZ: { code: 'KZ', name: 'Kazakhstan' },
  KE: { code: 'KE', name: 'Kenya' },
  KI: { code: 'KI', name: 'Kiribati' },
  KR: { code: 'KR', name: 'South Korea', aliases: ['korea', 'republic of korea'] },
  KW: { code: 'KW', name: 'Kuwait' },
  KG: { code: 'KG', name: 'Kyrgyzstan' },
  LA: { code: 'LA', name: 'Laos' },
  LV: { code: 'LV', name: 'Latvia' },
  LB: { code: 'LB', name: 'Lebanon' },
  LS: { code: 'LS', name: 'Lesotho' },
  LR: { code: 'LR', name: 'Liberia' },
  LY: { code: 'LY', name: 'Libya' },
  LI: { code: 'LI', name: 'Liechtenstein' },
  LT: { code: 'LT', name: 'Lithuania' },
  LU: { code: 'LU', name: 'Luxembourg' },
  MO: { code: 'MO', name: 'Macau' },
  MG: { code: 'MG', name: 'Madagascar' },
  MW: { code: 'MW', name: 'Malawi' },
  MY: { code: 'MY', name: 'Malaysia' },
  MV: { code: 'MV', name: 'Maldives' },
  ML: { code: 'ML', name: 'Mali' },
  MT: { code: 'MT', name: 'Malta' },
  MH: { code: 'MH', name: 'Marshall Islands' },
  MR: { code: 'MR', name: 'Mauritania' },
  MU: { code: 'MU', name: 'Mauritius' },
  MX: { code: 'MX', name: 'Mexico' },
  FM: { code: 'FM', name: 'Micronesia' },
  MD: { code: 'MD', name: 'Moldova' },
  MC: { code: 'MC', name: 'Monaco' },
  MN: { code: 'MN', name: 'Mongolia' },
  ME: { code: 'ME', name: 'Montenegro' },
  MA: { code: 'MA', name: 'Morocco' },
  MZ: { code: 'MZ', name: 'Mozambique' },
  MM: { code: 'MM', name: 'Myanmar', aliases: ['burma'] },
  NA: { code: 'NA', name: 'Namibia' },
  NR: { code: 'NR', name: 'Nauru' },
  NP: { code: 'NP', name: 'Nepal' },
  NL: { code: 'NL', name: 'Netherlands', aliases: ['holland'] },
  NZ: { code: 'NZ', name: 'New Zealand' },
  NI: { code: 'NI', name: 'Nicaragua' },
  NE: { code: 'NE', name: 'Niger' },
  NG: { code: 'NG', name: 'Nigeria' },
  NO: { code: 'NO', name: 'Norway' },
  OM: { code: 'OM', name: 'Oman' },
  PK: { code: 'PK', name: 'Pakistan' },
  PW: { code: 'PW', name: 'Palau' },
  PS: { code: 'PS', name: 'Palestine' },
  PA: { code: 'PA', name: 'Panama' },
  PG: { code: 'PG', name: 'Papua New Guinea' },
  PY: { code: 'PY', name: 'Paraguay' },
  PE: { code: 'PE', name: 'Peru' },
  PH: { code: 'PH', name: 'Philippines' },
  PL: { code: 'PL', name: 'Poland' },
  PT: { code: 'PT', name: 'Portugal' },
  QA: { code: 'QA', name: 'Qatar' },
  RO: { code: 'RO', name: 'Romania' },
  RU: { code: 'RU', name: 'Russia', aliases: ['russian federation'] },
  RW: { code: 'RW', name: 'Rwanda' },
  SA: { code: 'SA', name: 'Saudi Arabia' },
  SN: { code: 'SN', name: 'Senegal' },
  RS: { code: 'RS', name: 'Serbia' },
  SC: { code: 'SC', name: 'Seychelles' },
  SL: { code: 'SL', name: 'Sierra Leone' },
  SG: { code: 'SG', name: 'Singapore' },
  SK: { code: 'SK', name: 'Slovakia' },
  SI: { code: 'SI', name: 'Slovenia' },
  SB: { code: 'SB', name: 'Solomon Islands' },
  SO: { code: 'SO', name: 'Somalia' },
  ZA: { code: 'ZA', name: 'South Africa' },
  ES: { code: 'ES', name: 'Spain' },
  LK: { code: 'LK', name: 'Sri Lanka' },
  SD: { code: 'SD', name: 'Sudan' },
  SR: { code: 'SR', name: 'Suriname' },
  SE: { code: 'SE', name: 'Sweden' },
  CH: { code: 'CH', name: 'Switzerland' },
  SY: { code: 'SY', name: 'Syria' },
  TW: { code: 'TW', name: 'Taiwan' },
  TJ: { code: 'TJ', name: 'Tajikistan' },
  TZ: { code: 'TZ', name: 'Tanzania' },
  TH: { code: 'TH', name: 'Thailand' },
  TL: { code: 'TL', name: 'Timor-Leste' },
  TG: { code: 'TG', name: 'Togo' },
  TO: { code: 'TO', name: 'Tonga' },
  TT: { code: 'TT', name: 'Trinidad and Tobago' },
  TN: { code: 'TN', name: 'Tunisia' },
  TR: { code: 'TR', name: 'Turkey', aliases: ['turkiye'] },
  TM: { code: 'TM', name: 'Turkmenistan' },
  TV: { code: 'TV', name: 'Tuvalu' },
  UG: { code: 'UG', name: 'Uganda' },
  UA: { code: 'UA', name: 'Ukraine' },
  AE: { code: 'AE', name: 'United Arab Emirates', aliases: ['uae'] },
  GB: { code: 'GB', name: 'United Kingdom', aliases: ['uk', 'great britain', 'england', 'scotland', 'wales'] },
  US: { code: 'US', name: 'United States', aliases: ['usa', 'united states of america'] },
  UY: { code: 'UY', name: 'Uruguay' },
  UZ: { code: 'UZ', name: 'Uzbekistan' },
  VU: { code: 'VU', name: 'Vanuatu' },
  VA: { code: 'VA', name: 'Vatican City' },
  VE: { code: 'VE', name: 'Venezuela' },
  VN: { code: 'VN', name: 'Vietnam' },
  YE: { code: 'YE', name: 'Yemen' },
  ZM: { code: 'ZM', name: 'Zambia' },
  ZW: { code: 'ZW', name: 'Zimbabwe' },
};

// Build inverted fast lookup map (lowercased names and aliases -> country object)
const COUNTRY_LOOKUP = new Map();
for (const [code, entry] of Object.entries(ISO_COUNTRIES)) {
  COUNTRY_LOOKUP.set(code.toLowerCase(), entry);
  COUNTRY_LOOKUP.set(entry.name.toLowerCase(), entry);
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      COUNTRY_LOOKUP.set(alias.toLowerCase(), entry);
    }
  }
}

/**
 * Canonicalizes a city name into a consistent lookup key:
 * - Trims and converts to lower case
 * - Strips accents / diacritics via Unicode NFD decomposition
 * - Normalizes NFKC and collapses non-alphanumeric whitespace/dashes
 * E.g.: "Bengaluru", "BENGALURU", " Bengaluru " -> "bengaluru"
 * E.g.: "New York", "New-York" -> "new-york"
 *
 * @param {string} city
 * @returns {string}
 */
function toCityKey(city) {
  if (!city || typeof city !== 'string') return '';
  const normalized = city
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .trim()
    .toLowerCase();

  // Replace spaces and punctuation with single hyphens, strip leading/trailing hyphens
  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates and resolves a country string (name, alias, or ISO code) to ISO 3166-1 alpha-2 details.
 * Returns null if the country is unknown or invalid.
 *
 * @param {string} countryInput
 * @returns {{ code: string, name: string } | null}
 */
function resolveCountry(countryInput) {
  if (!countryInput || typeof countryInput !== 'string') return null;
  const cleaned = countryInput
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  return COUNTRY_LOOKUP.get(cleaned) || null;
}

module.exports = {
  toCityKey,
  resolveCountry,
  ISO_COUNTRIES,
};
