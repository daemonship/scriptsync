import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ScriptSync — AI B-Roll Logging for Video Editors',
  description:
    'Upload video clips, get AI-generated tags and descriptions, paste your script, and instantly see matched B-roll suggestions.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
