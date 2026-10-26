// backend/config/passwordBlocklist.js
// Common password blocklist derived from OWASP / SecLists top breached passwords.
// Checked case-insensitively to prevent easily guessed passwords.

const COMMON_PASSWORDS = [
  'password', 'password1', 'password123', 'password12', 'password1234', 'password!',
  '12345678', '123456789', '1234567890', '00000000', '11111111', '12341234',
  '12344321', '12345670', '123456789a', '12345678a', '12345678b', '12345678c',
  'qwerty123', 'qwertyuiop', 'qwertzuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1',
  'admin123', 'admin1234', 'administrator', 'root1234', 'support123', 'welcome1',
  'welcome123', 'welcome!', 'iloveyou', 'iloveyou1', 'sunshine', 'sunshine1',
  'princess', 'princess1', 'football', 'football1', 'baseball', 'basketball',
  'monkey123', 'shadow123', 'master123', 'dragon123', 'superman', 'batman123',
  'starwars', 'starwars1', 'killer123', 'trustno1', 'jordan23', 'harley12',
  'charlie1', 'samuel12', 'anthony1', 'alexander', 'andrew12', 'daniel12',
  'michael1', 'matthew1', 'jessica1', 'nicole12', 'amanda12', 'ashley12',
  'brittany', 'hannah12', 'taylor12', 'morgan12', 'destiny1', 'bailey12',
  'computer', 'internet', 'secret12', 'access12', 'security', 'system123',
  'testing1', 'test1234', 'testing123', 'guest123', 'default123', 'changeme',
  'letmein1', 'mustang1', 'corvette', 'camaro12', 'ferrari1', 'porsche1',
  'whatever', 'nothing1', 'forever1', 'freedom1', 'memphis1', 'phoenix1',
  'november', 'december', 'january1', 'february', 'september', 'october1',
  'summer12', 'winter12', 'spring12', 'autumn12', 'monday12', 'friday12',
  'sunday12', 'saturday', 'liverpool', 'arsenal1', 'chelsea1', 'barcelona',
  'realmadrid', 'manchester', 'juventus', 'bayern12', 'dortmund', 'champions',
  'pokemon1', 'minecraft', 'fortnite', 'roblox12', 'assassin', 'godfather',
  'matrix12', 'avengers', 'titanium', 'platinum', 'diamond1', 'golden12',
  'silver12', 'emerald1', 'sapphire', 'crystal1', 'thunder1', 'lightning',
  'rainbow1', 'fireball', 'blizzard', 'tornado1', 'hurricane', 'volcano1',
  'butterfly', 'elephant', 'tiger123', 'lionking', 'panther1', 'leopard1',
  'dolphin1', 'penguin1', 'cheetah1', 'kangaroo', 'squirrel', 'hedgehog',
  'pepper12', 'ginger12', 'peanut12', 'cookie12', 'chocolate', 'vanilla1',
  'coffee12', 'teatime1', 'whiskey1', 'beerlover', 'tequila1', 'champagne',
  'monster1', 'phantom1', 'specter1', 'vampire1', 'werewolf', 'zombie12',
  'spiderman', 'ironman1', 'wolverine', 'deadpool', 'thanos12', 'gandalf1',
  'legolas1', 'aragorn1', 'frodo123', 'gollum12', 'mordor12', 'hogwarts',
  'gryffindor', 'slytherin', 'voldemort', 'dumbledore', 'sherlock', 'watson12',
  'albatross', 'badminton', 'cadillac', 'daffodil', 'enigma12', 'flamengo',
  'galatasaray', 'heidelberg', 'illuminati', 'jackpot1', 'kamikaze', 'labyrinth',
  'macintosh', 'narcissus', 'obsidian', 'parachute', 'quicksilver', 'rebellion',
  'sanctuary', 'tarantula', 'umbrella', 'valkyrie', 'westeros', 'xenophobia',
  'yellowstone', 'zeppelin', 'oddspot1', 'oddspot123',
];

const blocklistSet = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));

function isCommonPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return blocklistSet.has(password.toLowerCase().trim());
}

module.exports = {
  isCommonPassword,
  COMMON_PASSWORDS,
};
