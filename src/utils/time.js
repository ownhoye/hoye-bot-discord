const UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, j: 864e5, w: 6048e5 };

/** "10m", "1h30m", "2d" → millisecondes (null si invalide). */
function parseDuration(input) {
  const matches = String(input).toLowerCase().replace(/\s+/g, '').matchAll(/(\d+)([smhdjw])/g);
  let total = 0;
  let consumed = '';
  for (const [full, amount, unit] of matches) {
    total += Number(amount) * UNITS[unit];
    consumed += full;
  }
  if (!total || consumed !== String(input).toLowerCase().replace(/\s+/g, '')) return null;
  return total;
}

function formatDuration(ms) {
  const parts = [];
  const units = [
    ['j', 864e5],
    ['h', 36e5],
    ['min', 6e4],
    ['s', 1e3],
  ];
  for (const [label, size] of units) {
    const value = Math.floor(ms / size);
    if (value) {
      parts.push(`${value}${label}`);
      ms -= value * size;
    }
  }
  return parts.join(' ') || '0s';
}

module.exports = { parseDuration, formatDuration };
