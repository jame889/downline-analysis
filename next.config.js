const { execFileSync } = require('node:child_process')
let revision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown'
if (revision === 'unknown') {
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}
}
/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true'

const nextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['ws', 'msedge-tts', 'bufferutil', 'utf-8-validate', 'pdf-parse', 'mupdf', 'tesseract.js', 'canvas'],
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
    APP_BUILD_REVISION: revision,
    // These are validated at startup — set them in .env.local or Vercel dashboard
    // Required: TELEGRAM_BOT_TOKEN, JWT_SECRET
    // Optional: CRON_SECRET (secures /api/cron/* endpoints)
  },
}

module.exports = nextConfig
