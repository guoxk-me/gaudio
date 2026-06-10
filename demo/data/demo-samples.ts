export interface DemoTrack {
  id: string
  title: string
  artist: string
}

export interface DemoFormatGroup {
  folder: string
  label: string
  extension: string
  mimeType: string
}

export const demoTracks: DemoTrack[] = [
  { id: 'betcha-instrumental', title: 'Betcha', artist: '伯贤' },
  { id: 'chocolate-instrumental', title: 'Chocolate', artist: '伯贤' },
  { id: 'pineapple-slice-instrumental', title: 'Pineapple Slice', artist: '边伯贤' },
]

export const demoFormatGroups: DemoFormatGroup[] = [
  { folder: 'mp3', label: 'MP3', extension: '.mp3', mimeType: 'audio/mpeg' },
  { folder: 'wav', label: 'WAV', extension: '.wav', mimeType: 'audio/wav' },
  { folder: 'm4a', label: 'AAC (M4A)', extension: '.m4a', mimeType: 'audio/mp4' },
  { folder: 'ogg', label: 'Opus (OGG)', extension: '.ogg', mimeType: 'audio/ogg' },
]

export function demoSampleUrl(formatFolder: string, trackId: string, extension: string): string {
  return `/${formatFolder}/${trackId}${extension}`
}

export function findDemoTrack(trackId: string): DemoTrack {
  return demoTracks.find(track => track.id === trackId) ?? demoTracks[0]
}

export function findDemoFormatGroup(formatFolder: string): DemoFormatGroup {
  return demoFormatGroups.find(group => group.folder === formatFolder) ?? demoFormatGroups[0]
}

export const defaultDemoTrackId = demoTracks[0].id
export const defaultDemoFormatFolder = demoFormatGroups[0].folder
export const defaultDemoSampleUrl = demoSampleUrl(
  defaultDemoFormatFolder,
  defaultDemoTrackId,
  findDemoFormatGroup(defaultDemoFormatFolder).extension,
)
