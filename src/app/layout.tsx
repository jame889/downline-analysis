import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'Downline Analyzer',
  description: 'SPS Downline Analysis Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-gray-50 transition-colors">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
