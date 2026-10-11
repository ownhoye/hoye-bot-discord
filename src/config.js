require('dotenv').config({ quiet: true });

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);
const hex = (value, fallback) => {
  const parsed = parseInt(String(value || '').replace('#', ''), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
};

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,
  devs: list(process.env.DEV_IDS),
  owners: list(process.env.OWNER_IDS),
  supportUrl: process.env.SUPPORT_URL || null,
  colors: {
    main: hex(process.env.MAIN_COLOR, 0x5865f2),
    success: 0x57f287,
    error: 0xed4245,
    warn: 0xfee75c,
    info: 0x3498db,
  },
};
