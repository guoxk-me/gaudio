import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const coverDir = 'public/cover'
const thumbDir = join(coverDir, 'thumbs')

const coverThemes = [
  {
    id: 'aurora-loop',
    title: 'Aurora Loop',
    accent: '#2f8cff',
    secondary: '#53d8b6',
    background: '#081827',
  },
  {
    id: 'city-lantern',
    title: 'City Lantern',
    accent: '#ffb347',
    secondary: '#4ac6ff',
    background: '#18202b',
  },
  {
    id: 'signal-bloom',
    title: 'Signal Bloom',
    accent: '#fb7185',
    secondary: '#a3e635',
    background: '#1e1724',
  },
  {
    id: 'warm-current',
    title: 'Warm Current',
    accent: '#f97316',
    secondary: '#22c55e',
    background: '#201b15',
  },
]

function coverSvgForTheme(theme) {
  const waveLines = Array.from({ length: 8 }, (_, lineIndex) => {
    const y = 170 + lineIndex * 28
    const amplitude = 18 + lineIndex * 3
    const opacity = 0.32 + lineIndex * 0.055

    return `<path d="M 48 ${y} C 128 ${y - amplitude}, 184 ${y + amplitude}, 264 ${y} S 400 ${y - amplitude}, 464 ${y}" fill="none" stroke="${lineIndex % 2 === 0 ? theme.accent : theme.secondary}" stroke-width="${lineIndex === 5 ? 7 : 4}" stroke-linecap="round" opacity="${opacity.toFixed(2)}"/>`
  }).join('')

  return `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="${theme.background}"/>
      <rect x="32" y="32" width="448" height="448" rx="34" fill="none" stroke="${theme.accent}" stroke-opacity="0.28" stroke-width="2"/>
      <circle cx="392" cy="118" r="84" fill="${theme.accent}" opacity="0.22"/>
      <circle cx="126" cy="370" r="112" fill="${theme.secondary}" opacity="0.16"/>
      ${waveLines}
      <text x="48" y="78" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="0">${theme.title}</text>
      <text x="48" y="112" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="500" letter-spacing="0">GAudio original sample</text>
      <text x="48" y="454" fill="#e2e8f0" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="0">generated synthesis</text>
    </svg>
  `
}

await mkdir(coverDir, { recursive: true })
await mkdir(thumbDir, { recursive: true })

for (const theme of coverThemes) {
  const coverSvg = Buffer.from(coverSvgForTheme(theme))
  const coverFile = `${theme.id}.png`
  const thumbFile = `${theme.id}.webp`

  // AI modified: cover art is generated locally so docs samples stay license-safe.
  await sharp(coverSvg)
    .png({ compressionLevel: 9 })
    .toFile(join(coverDir, coverFile))

  await sharp(coverSvg)
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(join(thumbDir, thumbFile))

  console.log(`generated cover/${coverFile} and cover/thumbs/${thumbFile}`)
}
