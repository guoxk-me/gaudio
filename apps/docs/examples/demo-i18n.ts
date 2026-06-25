export type DemoLocale = 'en' | 'zh'

export const demoText = {
  en: {
    intro: 'Load bundled samples, external URLs, explicit source objects, HLS, and DASH streams through the public gaudio API.',
    catalog: {
      ariaLabel: 'Local sample catalog',
      bundledSample: 'Bundled sample',
      previous: 'Previous',
      next: 'Next',
      format: 'Format',
      track: 'Track',
    },
    controls: {
      ariaLabel: 'Audio player controls',
      sourceUrl: 'Source URL',
      protocol: 'Protocol',
      sourceMode: 'Source mode',
      quality: 'Audio quality',
      automaticQuality: 'Automatic ABR',
      loadUrl: 'Load source',
      play: 'Play',
      pause: 'Pause',
      stop: 'Stop',
      fastSeek: 'Fast seek',
      seek: 'Seek',
      volume: 'Volume',
      playbackRate: 'Playback rate',
      muted: 'Muted',
      loop: 'Loop',
      autoplay: 'Autoplay',
      preservePitch: 'Preserve pitch',
      preload: 'Preload',
      sourceModes: {
        urlString: 'URL string',
        sourceDescription: 'Source object',
        httpSource: 'HttpAudioSource',
        blobSource: 'BlobAudioSource',
        customSource: 'Custom AudioSource',
      },
    },
    status: {
      ariaLabel: 'Player status and events',
      events: 'Events',
      labels: {
        state: 'State',
        buffered: 'Buffered',
        seekable: 'Seekable',
        played: 'Played',
        rate: 'Rate',
        paused: 'Paused',
        ended: 'Ended',
        seeking: 'Seeking',
        implementation: 'Implementation',
        manifest: 'Manifest',
        variant: 'Variant',
        bitrate: 'Bitrate',
        quality: 'Quality',
        segment: 'Segment',
      },
    },
    visualizer: {
      ariaLabel: 'Audio analyzer visualization',
      title: 'Player analyzer',
      description: 'Read waveform and frequency samples from the active AudioPlayer analyzer and paint the live signal beside playback controls.',
      bars: 'Spectrum',
      radial: 'Level meters',
      waveform: 'Waveform',
      start: 'Start analyzer',
      stop: 'Stop analyzer',
      status: 'Status',
      peak: 'Peak',
      energy: 'Energy',
      running: 'live',
      stopped: 'stopped',
      unavailable: 'AudioContext unavailable',
    },
    capabilities: {
      ariaLabel: 'gaudio API capabilities',
      title: 'API coverage',
      browserSupport: 'Browser support',
      adapterDiagnostics: 'Adaptive adapters',
      utilityDemos: 'Utilities',
      api: 'API',
      demoSurface: 'Demo surface',
      support: 'Support',
      value: 'Value',
      sourceLifecycle: 'Source lifecycle',
      playlist: 'Playlist and media session',
      mediaSession: 'Media session',
      analyzer: 'AudioAnalyzer',
      eventEmitter: 'EventEmitter',
      error: 'GAudioError',
      runAnalyzer: 'Capture analyzer preview',
      runEventEmitter: 'Run emitter preview',
      runPlaylist: 'Run playlist preview',
      runError: 'Run error preview',
      updateHls: 'Apply HLS config update',
      updateDash: 'Apply DASH settings update',
      frequency: 'Frequency',
      waveform: 'Waveform',
      apiCoverage: [
        ['AudioPlayer', 'Constructor options, load/play/pause/stop, seek/fastSeek, volume, rate, mute, loop, autoplay, preload, pitch, state, ranges, canPlayType, events, once/removeAllListeners, playlist controls, media session metadata, analyzer access, adaptive quality, and dispose are represented by the player console, monitors, and utility buttons.'],
        ['Audio source inputs', 'Source mode switches between URL strings, AudioSourceDescription objects, HttpAudioSource, BlobAudioSource, and a custom AudioSource with open/close counters.'],
        ['Playlist and media session', 'The playlist preview calls setPlaylist with fallbackSources, audioTracks, metadata, getPlaylist, getPlaylistIndex, getAudioTracks, getSelectedAudioTrack, and getMediaSessionMetadata.'],
        ['createHlsAdapter', 'The HLS adapter is imported from gaudio/hls, initialized with AdaptivePlaybackPreset.Balanced, exposes support and implementation diagnostics, and can update config at runtime.'],
        ['createDashAdapter', 'The DASH adapter is imported from gaudio/dash, initialized with AdaptivePlaybackPreset.Balanced, exposes support and instance diagnostics, and can update settings at runtime.'],
        ['Adaptive playback types', 'Protocol, implementation, manifest, variant, bitrate, segment, quality selection, and stream error events are shown in live monitors.'],
        ['AudioAnalyzer', 'The utility preview reads player analyzer samples, while the visualization area paints bars, radial spectrum, and waveform canvases from live Web Audio samples.'],
        ['EventEmitter', 'The utility preview registers, emits, removes, and clears a typed listener.'],
        ['GAudioError', 'The error preview constructs a typed gaudio error and player errors are captured in the live event log.'],
        ['MediaElementAudioEngine', 'Native MP3, WAV, AAC, and OGG files route through the built-in media-element engine, with browser support shown per MIME type.'],
      ],
    },
  },
  zh: {
    intro: '通过 gaudio 公共 API 加载内置样例、外部 URL、显式 Source 对象、HLS 与 DASH 流。',
    catalog: {
      ariaLabel: '本地样例目录',
      bundledSample: '内置样例',
      previous: '上一首',
      next: '下一首',
      format: '格式',
      track: '曲目',
    },
    controls: {
      ariaLabel: '音频播放器控制',
      sourceUrl: 'Source URL',
      protocol: '协议',
      sourceMode: 'Source 模式',
      quality: '音频质量',
      automaticQuality: '自动 ABR',
      loadUrl: '加载 Source',
      play: '播放',
      pause: '暂停',
      stop: '停止',
      fastSeek: '快速跳转',
      seek: '跳转',
      volume: '音量',
      playbackRate: '播放速度',
      muted: '静音',
      loop: '循环',
      autoplay: '自动播放',
      preservePitch: '保持音高',
      preload: '预加载',
      sourceModes: {
        urlString: 'URL 字符串',
        sourceDescription: 'Source object',
        httpSource: 'HttpAudioSource',
        blobSource: 'BlobAudioSource',
        customSource: '自定义 AudioSource',
      },
    },
    status: {
      ariaLabel: '播放器状态与事件',
      events: '事件',
      labels: {
        state: '状态',
        buffered: '已缓冲',
        seekable: '可跳转',
        played: '已播放',
        rate: '速度',
        paused: '已暂停',
        ended: '已结束',
        seeking: '跳转中',
        implementation: '实现',
        manifest: 'Manifest',
        variant: 'Variant',
        bitrate: '码率',
        quality: '音质',
        segment: '分段',
      },
    },
    visualizer: {
      ariaLabel: '音频分析可视化',
      title: '播放器分析器',
      description: '从当前 AudioPlayer 的 analyzer 读取波形与频域样本，并在播放控制旁绘制实时信号。',
      bars: 'Spectrum',
      radial: 'Level meters',
      waveform: 'Waveform',
      start: '启动分析器',
      stop: '停止分析器',
      status: '状态',
      peak: '峰值',
      energy: '能量',
      running: '实时',
      stopped: '已停止',
      unavailable: 'AudioContext 不可用',
    },
    capabilities: {
      ariaLabel: 'gaudio API 能力',
      title: 'API 覆盖',
      browserSupport: '浏览器支持',
      adapterDiagnostics: '自适应适配器',
      utilityDemos: '工具能力',
      api: 'API',
      demoSurface: 'Demo 展示',
      support: '支持',
      value: '值',
      sourceLifecycle: 'Source 生命周期',
      playlist: 'Playlist and media session',
      mediaSession: 'Media session',
      analyzer: 'AudioAnalyzer',
      eventEmitter: 'EventEmitter',
      error: 'GAudioError',
      runAnalyzer: '采集分析器预览',
      runEventEmitter: '运行事件器预览',
      runPlaylist: '运行 playlist 预览',
      runError: '运行错误预览',
      updateHls: '应用 HLS 配置更新',
      updateDash: '应用 DASH 设置更新',
      frequency: '频域',
      waveform: '波形',
      apiCoverage: [
        ['AudioPlayer', '播放器控制台、监听面板和工具按钮展示构造参数、load/play/pause/stop、seek/fastSeek、音量、速度、静音、循环、自动播放、预加载、音高、状态、时间范围、canPlayType、事件、once/removeAllListeners、playlist、Media Session、analyzer、adaptive quality 和 dispose。'],
        ['Audio source inputs', 'Source 模式可在 URL 字符串、AudioSourceDescription、HttpAudioSource、BlobAudioSource 和带 open/close 计数的自定义 AudioSource 之间切换。'],
        ['Playlist and media session', 'playlist 预览会调用 setPlaylist，并展示 fallbackSources、audioTracks、metadata、getPlaylist、getPlaylistIndex、getAudioTracks、getSelectedAudioTrack 和 getMediaSessionMetadata。'],
        ['createHlsAdapter', '从 gaudio/hls 导入 HLS 适配器，用 AdaptivePlaybackPreset.Balanced 初始化，展示支持与实现诊断，并可运行时更新 config。'],
        ['createDashAdapter', '从 gaudio/dash 导入 DASH 适配器，用 AdaptivePlaybackPreset.Balanced 初始化，展示支持与实例诊断，并可运行时更新 settings。'],
        ['Adaptive playback types', '协议、实现、manifest、variant、码率、分段、音质选择和 stream error 事件会显示在实时监听面板。'],
        ['AudioAnalyzer', '工具预览读取播放器 analyzer 样本；频谱区则用 Web Audio 样本分别绘制柱状、径向和波形 canvas。'],
        ['EventEmitter', '工具预览会注册、触发、移除并清空一个类型化监听器。'],
        ['GAudioError', '错误预览会构造类型化 gaudio 错误，播放器错误也会进入实时事件日志。'],
        ['MediaElementAudioEngine', '原生 MP3、WAV、AAC 和 OGG 文件会路由到内置 media-element engine，并按 MIME type 展示浏览器支持。'],
      ],
    },
  },
} satisfies Record<DemoLocale, DemoText>

export interface DemoText {
  intro: string
  catalog: {
    ariaLabel: string
    bundledSample: string
    previous: string
    next: string
    format: string
    track: string
  }
  controls: {
    ariaLabel: string
    sourceUrl: string
    protocol: string
    sourceMode: string
    quality: string
    automaticQuality: string
    loadUrl: string
    play: string
    pause: string
    stop: string
    fastSeek: string
    seek: string
    volume: string
    playbackRate: string
    muted: string
    loop: string
    autoplay: string
    preservePitch: string
    preload: string
    sourceModes: {
      urlString: string
      sourceDescription: string
      httpSource: string
      blobSource: string
      customSource: string
    }
  }
  status: {
    ariaLabel: string
    events: string
    labels: {
      state: string
      buffered: string
      seekable: string
      played: string
      rate: string
      paused: string
      ended: string
      seeking: string
      implementation: string
      manifest: string
      variant: string
      bitrate: string
      quality: string
      segment: string
    }
  }
  visualizer: {
    ariaLabel: string
    title: string
    description: string
    bars: string
    radial: string
    waveform: string
    start: string
    stop: string
    status: string
    peak: string
    energy: string
    running: string
    stopped: string
    unavailable: string
  }
  capabilities: {
    ariaLabel: string
    title: string
    browserSupport: string
    adapterDiagnostics: string
    utilityDemos: string
    api: string
    demoSurface: string
    support: string
    value: string
    sourceLifecycle: string
    playlist: string
    mediaSession: string
    analyzer: string
    eventEmitter: string
    error: string
    runAnalyzer: string
    runEventEmitter: string
    runPlaylist: string
    runError: string
    updateHls: string
    updateDash: string
    frequency: string
    waveform: string
    apiCoverage: Array<readonly [api: string, demoSurface: string]>
  }
}

// AI modified: VitePress locale codes drive all demo labels without duplicating component logic.
export function demoLocaleForLang(lang: string): DemoLocale {
  return lang.startsWith('zh') ? 'zh' : 'en'
}
