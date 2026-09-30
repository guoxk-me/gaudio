export interface DemoTrack {
  id: string
  title: string
  artist: string
  coverThumb: string
  coverFile: string
}

export interface DemoFormatGroup {
  folder: string
  label: string
  extension: string
  mimeType: string
}

// AI modified: docs use generated original samples to avoid third-party music rights.
export const demoTracks: DemoTrack[] = [
  {
    id: 'aurora-loop',
    title: 'Aurora Loop',
    artist: 'GAudio original',
    coverThumb: 'aurora-loop.webp',
    coverFile: 'aurora-loop.png',
  },
  {
    id: 'city-lantern',
    title: 'City Lantern',
    artist: 'GAudio original',
    coverThumb: 'city-lantern.webp',
    coverFile: 'city-lantern.png',
  },
  {
    id: 'signal-bloom',
    title: 'Signal Bloom',
    artist: 'GAudio original',
    coverThumb: 'signal-bloom.webp',
    coverFile: 'signal-bloom.png',
  },
  {
    id: 'warm-current',
    title: 'Warm Current',
    artist: 'GAudio original',
    coverThumb: 'warm-current.webp',
    coverFile: 'warm-current.png',
  },
]

export const demoFormatGroups: DemoFormatGroup[] = [
  { folder: 'mp3', label: 'MP3', extension: '.mp3', mimeType: 'audio/mpeg' },
  { folder: 'wav', label: 'WAV', extension: '.wav', mimeType: 'audio/wav' },
  { folder: 'm4a', label: 'AAC (M4A)', extension: '.m4a', mimeType: 'audio/mp4' },
  { folder: 'ogg', label: 'Opus (OGG)', extension: '.ogg', mimeType: 'audio/ogg' },
  { folder: 'hls', label: 'HLS', extension: '.m3u8', mimeType: 'application/vnd.apple.mpegurl' },
  { folder: 'dash', label: 'DASH', extension: '.mpd', mimeType: 'application/dash+xml' },
]

export function demoSampleUrl(publicAssetBase: string, formatFolder: string, trackId: string, extension: string): string {
  return `${publicAssetBase}audio/${formatFolder}/${trackId}${extension}`
}

export function demoCoverThumbUrl(publicAssetBase: string, coverThumb: string): string {
  return `${publicAssetBase}cover/thumbs/${coverThumb}`
}

export function demoCoverArtUrl(publicAssetBase: string, coverFile: string): string {
  return `${publicAssetBase}cover/${encodeURIComponent(coverFile)}`
}

export function findDemoTrack(trackId: string): DemoTrack {
  return demoTracks.find(track => track.id === trackId) ?? demoTracks[0]
}

export function findDemoFormatGroup(formatFolder: string): DemoFormatGroup {
  return demoFormatGroups.find(group => group.folder === formatFolder) ?? demoFormatGroups[0]
}

export const defaultDemoTrackId = demoTracks[0].id
export const defaultDemoFormatFolder = demoFormatGroups[0].folder
