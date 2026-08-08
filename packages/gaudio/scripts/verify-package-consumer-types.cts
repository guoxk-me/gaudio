import type {
  AudioPlayerOptions,
  AudioSourceDescription,
} from 'gaudio'
import type { DashAdapterOptions, DashSettingsChanges } from 'gaudio/dash'
import type { HlsAdapterOptions } from 'gaudio/hls'
import { AudioPlayer, BlobAudioSource, MediaElementAudioEngine } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const source: AudioSourceDescription = {
  protocol: 'media',
  url: 'https://example.com/audio.mp3',
}
const hlsOptions: HlsAdapterOptions = {
  playbackStrategy: 'native-first',
}
// AI modified: compile the sparse nested settings accepted by the public DASH adapter contract.
const dashSettings: DashSettingsChanges = {
  streaming: {
    abr: {
      throughput: {
        bandwidthSafetyFactor: 0.8,
      },
    },
  },
}
const dashOptions: DashAdapterOptions = {
  contentType: 'vod',
  settings: dashSettings,
}
const dashAdapter = createDashAdapter(dashOptions)
dashAdapter.updateSettings(dashSettings)
const playerOptions: AudioPlayerOptions = {
  adapters: [
    createHlsAdapter(hlsOptions),
    dashAdapter,
  ],
  source,
}

// AI modified: the CommonJS declaration must preserve the supported subclass contract.
class ConsumerMediaElementAudioEngine extends MediaElementAudioEngine {
  private isDisposed = false

  private assertUsable(): boolean {
    return !this.isDisposed
  }

  isConsumerUsable(): boolean {
    return this.assertUsable()
  }
}

void ConsumerMediaElementAudioEngine

const blobSource = new BlobAudioSource(new Blob())
if (false) {
  // @ts-expect-error BlobAudioSource owns its object URL for its full lifecycle.
  blobSource.url = 'blob:https://example.com/consumer-owned'
}

// AI modified: compile the CommonJS declaration conditions from a real external consumer.
new AudioPlayer(playerOptions).dispose()
