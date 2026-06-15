import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "BCO HUMAND",
  description: "Sistema de gestión de recursos humanos",
  icons: { icon: '/favicon.svg', apple: '/api/icons/180' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#667eea" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/api/icons/180" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
