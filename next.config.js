/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true'

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['ws', 'msedge-tts', 'bufferutil', 'utf-8-validate', 'pdf-parse'],
  },
  ...(isGithubPages && {
    output: 'export',
    trailingSlash: true,
    basePath: '/downline-analysis',
    assetPrefix: '/downline-analysis',
  }),
  images: {
    unoptimized: true,
  },
  env: {
    // These are validated at startup — set them in .env.local or Vercel dashboard
    // Required: TELEGRAM_BOT_TOKEN, JWT_SECRET
    // Optional: CRON_SECRET (secures /api/cron/* endpoints)
  },
}

module.exports = nextConfig
