/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // These are validated at startup — set them in .env.local or Vercel dashboard
    // Required: TELEGRAM_BOT_TOKEN, JWT_SECRET
    // Optional: CRON_SECRET (secures /api/cron/* endpoints)
  },
}

module.exports = nextConfig
