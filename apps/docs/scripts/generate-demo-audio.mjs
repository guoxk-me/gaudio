import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const audioRoot = join(scriptDir, '../public/audio')
const sampleRate = 44_100
const durationSeconds = 18
const channels = 2

const demoTracks = [
  {
    id: 'aurora-loop',
    bpm: 92,
    chords: [
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4', 'A4'],
    ],
    bassNotes: ['C2', 'A1', 'F2', 'G2'],
    leadNotes: ['E5', 'G5', 'B5', 'D6', 'B5', 'G5', 'E5', 'C5'],
  },
  {
    id: 'city-lantern',
    bpm: 104,
    chords: [
      ['D4', 'F#4', 'A4', 'C#5'],
      ['B3', 'D4', 'F#4', 'A4'],
      ['G3', 'B3', 'D4', 'F#4'],
      ['A3', 'C#4', 'E4', 'G4'],
    ],
    bassNotes: ['D2', 'B1', 'G2', 'A1'],
    leadNotes: ['F#5', 'A5', 'C#6', 'E6', 'D6', 'A5', 'F#5', 'E5'],
  },
  {
    id: 'signal-bloom',
    bpm: 86,
    chords: [
      ['E3', 'G3', 'B3', 'D4'],
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4'],
      ['B3', 'D4', 'F#4', 'A4'],
    ],
    bassNotes: ['E2', 'C2', 'A1', 'B1'],
    leadNotes: ['G5', 'B5', 'D6', 'E6', 'D6', 'B5', 'A5', 'G5'],
  },
  {
    id: 'warm-current',
    bpm: 98,
    chords: [
      ['F3', 'A3', 'C4', 'E4'],
      ['D3', 'F3', 'A3', 'C4'],
      ['Bb3', 'D4', 'F4', 'A4'],
      ['C4', 'E4', 'G4', 'Bb4'],
    ],
    bassNotes: ['F2', 'D2', 'Bb1', 'C2'],
    leadNotes: ['A5', 'C6', 'E6', 'F6', 'E6', 'C6', 'A5', 'G5'],
  },
]

const noteOffsets = new Map([
  ['C', -9],
  ['C#', -8],
  ['D', -7],
  ['D#', -6],
  ['E', -5],
  ['F', -4],
  ['F#', -3],
  ['G', -2],
  ['G#', -1],
  ['A', 0],
  ['A#', 1],
  ['Bb', 1],
  ['B', 2],
])

function frequencyForNote(noteName) {
  const noteMatch = /^([A-G](?:#|b)?)(\d)$/.exec(noteName)

  if (!noteMatch) {
    throw new Error(`Unsupported note name: ${noteName}`)
  }

  const [, pitchName, octaveText] = noteMatch
  const semitoneOffset = noteOffsets.get(pitchName)

  if (semitoneOffset === undefined) {
    throw new Error(`Unsupported pitch name: ${pitchName}`)
  }

  const octave = Number(octaveText)
  const semitonesFromA4 = semitoneOffset + (octave - 4) * 12

  return 440 * 2 ** (semitonesFromA4 / 12)
}

function amplitudeEnvelope(sampleTime, noteSeconds) {
  const attackSeconds = Math.min(0.05, noteSeconds * 0.2)
  const releaseSeconds = Math.min(0.2, noteSeconds * 0.35)

  if (sampleTime < attackSeconds) {
    return sampleTime / attackSeconds
  }

  if (sampleTime > noteSeconds - releaseSeconds) {
    return Math.max(0, (noteSeconds - sampleTime) / releaseSeconds)
  }

  return 1
}

function addSineTone(leftSamples, rightSamples, startSeconds, noteSeconds, frequency, gain, pan) {
  const startSample = Math.floor(startSeconds * sampleRate)
  const totalSamples = Math.floor(noteSeconds * sampleRate)
  const leftGain = Math.cos((pan + 1) * Math.PI / 4)
  const rightGain = Math.sin((pan + 1) * Math.PI / 4)

  for (let sampleOffset = 0; sampleOffset < totalSamples; sampleOffset += 1) {
    const sampleIndex = startSample + sampleOffset

    if (sampleIndex >= leftSamples.length) {
      break
    }

    const sampleTime = sampleOffset / sampleRate
    const phase = 2 * Math.PI * frequency * sampleTime
    const signal = Math.sin(phase) + 0.28 * Math.sin(phase * 2 + 0.35)
    const shapedSignal = Math.tanh(signal * 0.78)
    const envelope = amplitudeEnvelope(sampleTime, noteSeconds)

    leftSamples[sampleIndex] += shapedSignal * gain * envelope * leftGain
    rightSamples[sampleIndex] += shapedSignal * gain * envelope * rightGain
  }
}

function addNoiseBrush(leftSamples, rightSamples, startSeconds, noteSeconds, gain) {
  const startSample = Math.floor(startSeconds * sampleRate)
  const totalSamples = Math.floor(noteSeconds * sampleRate)

  for (let sampleOffset = 0; sampleOffset < totalSamples; sampleOffset += 1) {
    const sampleIndex = startSample + sampleOffset

    if (sampleIndex >= leftSamples.length) {
      break
    }

    const sampleTime = sampleOffset / sampleRate
    const phase = sampleOffset * 12_989 + 78_233
    const noise = Math.sin(phase) * 43_758.5453
    const centeredNoise = (noise - Math.floor(noise)) * 2 - 1
    const envelope = amplitudeEnvelope(sampleTime, noteSeconds)
    const filteredNoise = centeredNoise * Math.exp(-sampleTime * 22)

    leftSamples[sampleIndex] += filteredNoise * gain * envelope
    rightSamples[sampleIndex] += filteredNoise * gain * envelope
  }
}

function audioSamplesForTrack(trackSpec) {
  const totalSamples = sampleRate * durationSeconds
  const leftSamples = new Float32Array(totalSamples)
  const rightSamples = new Float32Array(totalSamples)
  const beatSeconds = 60 / trackSpec.bpm
  const chordSeconds = beatSeconds * 4

  for (let chordIndex = 0; chordIndex < 8; chordIndex += 1) {
    const chord = trackSpec.chords[chordIndex % trackSpec.chords.length]
    const chordStart = chordIndex * chordSeconds
    const bassNote = trackSpec.bassNotes[chordIndex % trackSpec.bassNotes.length]

    addSineTone(leftSamples, rightSamples, chordStart, chordSeconds * 0.96, frequencyForNote(bassNote), 0.2, -0.12)

    for (const [noteIndex, noteName] of chord.entries()) {
      const pan = -0.45 + noteIndex * 0.3
      addSineTone(
        leftSamples,
        rightSamples,
        chordStart,
        chordSeconds * 0.95,
        frequencyForNote(noteName),
        0.075,
        pan,
      )
    }

    for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
      const leadNote = trackSpec.leadNotes[(chordIndex * 3 + stepIndex) % trackSpec.leadNotes.length]
      const stepStart = chordStart + stepIndex * beatSeconds * 0.5
      const pan = stepIndex % 2 === 0 ? 0.34 : -0.28

      addSineTone(leftSamples, rightSamples, stepStart, beatSeconds * 0.42, frequencyForNote(leadNote), 0.09, pan)
    }

    addNoiseBrush(leftSamples, rightSamples, chordStart, beatSeconds * 0.18, 0.055)
  }

  return { leftSamples, rightSamples }
}

function waveBytesForTrack(trackSpec) {
  const { leftSamples, rightSamples } = audioSamplesForTrack(trackSpec)
  const frameCount = leftSamples.length
  const audioByteLength = frameCount * channels * 2
  const waveBytes = Buffer.alloc(44 + audioByteLength)

  waveBytes.write('RIFF', 0)
  waveBytes.writeUInt32LE(36 + audioByteLength, 4)
  waveBytes.write('WAVE', 8)
  waveBytes.write('fmt ', 12)
  waveBytes.writeUInt32LE(16, 16)
  waveBytes.writeUInt16LE(1, 20)
  waveBytes.writeUInt16LE(channels, 22)
  waveBytes.writeUInt32LE(sampleRate, 24)
  waveBytes.writeUInt32LE(sampleRate * channels * 2, 28)
  waveBytes.writeUInt16LE(channels * 2, 32)
  waveBytes.writeUInt16LE(16, 34)
  waveBytes.write('data', 36)
  waveBytes.writeUInt32LE(audioByteLength, 40)

  for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
    const leftSample = Math.max(-0.96, Math.min(0.96, Math.tanh(leftSamples[sampleIndex] * 1.15)))
    const rightSample = Math.max(-0.96, Math.min(0.96, Math.tanh(rightSamples[sampleIndex] * 1.15)))
    const byteOffset = 44 + sampleIndex * channels * 2

    waveBytes.writeInt16LE(Math.round(leftSample * 32_767), byteOffset)
    waveBytes.writeInt16LE(Math.round(rightSample * 32_767), byteOffset + 2)
  }

  return waveBytes
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const errorChunks = []

    ffmpeg.stderr.on('data', chunk => errorChunks.push(chunk))
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(Buffer.concat(errorChunks).toString('utf8')))
    })
  })
}

async function encodeStandardFormats(trackSpec) {
  const sourceWave = join(audioRoot, 'wav', `${trackSpec.id}.wav`)

  await runFfmpeg(['-y', '-i', sourceWave, '-codec:a', 'libmp3lame', '-b:a', '128k', join(audioRoot, 'mp3', `${trackSpec.id}.mp3`)])
  await runFfmpeg(['-y', '-i', sourceWave, '-codec:a', 'aac', '-b:a', '128k', join(audioRoot, 'm4a', `${trackSpec.id}.m4a`)])
  await runFfmpeg(['-y', '-i', sourceWave, '-codec:a', 'libopus', '-b:a', '96k', join(audioRoot, 'ogg', `${trackSpec.id}.ogg`)])
}

async function encodeHls(trackSpec) {
  const sourceWave = join(audioRoot, 'wav', `${trackSpec.id}.wav`)
  const outputPattern = join(audioRoot, 'hls', `${trackSpec.id}-%v.m3u8`)

  await runFfmpeg([
    '-y',
    '-i',
    sourceWave,
    '-filter_complex',
    '[0:a]asplit=3[a0][a1][a2]',
    '-map',
    '[a0]',
    '-codec:a:0',
    'aac',
    '-b:a:0',
    '48k',
    '-ac:a:0',
    '1',
    '-map',
    '[a1]',
    '-codec:a:1',
    'aac',
    '-b:a:1',
    '96k',
    '-ac:a:1',
    '2',
    '-map',
    '[a2]',
    '-codec:a:2',
    'aac',
    '-b:a:2',
    '128k',
    '-ac:a:2',
    '2',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    join(audioRoot, 'hls', `${trackSpec.id}-%v_%03d.ts`),
    '-master_pl_name',
    `${trackSpec.id}.m3u8`,
    '-var_stream_map',
    'a:0,name:48k a:1,name:96k a:2,name:128k',
    outputPattern,
  ])
}

async function encodeDash(trackSpec) {
  const sourceWave = join(audioRoot, 'wav', `${trackSpec.id}.wav`)

  await runFfmpeg([
    '-y',
    '-i',
    sourceWave,
    '-filter_complex',
    '[0:a]asplit=3[a0][a1][a2]',
    '-map',
    '[a0]',
    '-codec:a:0',
    'aac',
    '-b:a:0',
    '48k',
    '-ac:a:0',
    '1',
    '-map',
    '[a1]',
    '-codec:a:1',
    'aac',
    '-b:a:1',
    '96k',
    '-ac:a:1',
    '2',
    '-map',
    '[a2]',
    '-codec:a:2',
    'aac',
    '-b:a:2',
    '128k',
    '-ac:a:2',
    '2',
    '-f',
    'dash',
    '-seg_duration',
    '4',
    '-use_template',
    '1',
    '-use_timeline',
    '1',
    '-adaptation_sets',
    'id=0,streams=0,1,2',
    '-init_seg_name',
    `${trackSpec.id}-init-$RepresentationID$.m4s`,
    '-media_seg_name',
    `${trackSpec.id}-segment-$RepresentationID$-$Number%05d$.m4s`,
    join(audioRoot, 'dash', `${trackSpec.id}.mpd`),
  ])
}

await rm(join(audioRoot, 'flac'), { recursive: true, force: true })

for (const folder of ['mp3', 'wav', 'm4a', 'ogg', 'hls', 'dash']) {
  // AI modified: regenerate demo audio folders so third-party samples cannot linger.
  await rm(join(audioRoot, folder), { recursive: true, force: true })
  await mkdir(join(audioRoot, folder), { recursive: true })
}

for (const trackSpec of demoTracks) {
  const sourceWave = join(audioRoot, 'wav', `${trackSpec.id}.wav`)

  await writeFile(sourceWave, waveBytesForTrack(trackSpec))
  await encodeStandardFormats(trackSpec)
  await encodeHls(trackSpec)
  await encodeDash(trackSpec)
  console.log(`generated audio samples for ${trackSpec.id}`)
}
