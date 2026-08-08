export type DemoLocale = 'en' | 'zh'

export const demoText = {
  en: {
    locale: 'en',
    intro: 'Load bundled samples, external URLs, explicit source objects, HLS, and DASH streams through the public GAudio API.',
    studio: {
      eyebrow: 'Interactive showcase',
      title: 'GAudio Player Studio',
      subtitle: 'A product-style player surface that exercises the main application-facing APIs: playback, sources, playlists, Media Session, adaptive streaming, analyzer visualization, typed events, and utility previews.',
      library: 'Library',
      libraryHint: 'Switch bundled tracks and delivery formats.',
      nowPlaying: 'Now playing',
      featureDeck: 'API feature deck',
      featureMapTitle: 'Public API coverage',
      featureMapHint: 'Every tab maps to documented package exports used by real applications.',
      featureHighlights: [
        'AudioPlayer',
        'AudioSource inputs',
        'Playlist + Media Session',
        'HLS / DASH adapters',
        'Adaptive quality',
        'AudioAnalyzer',
        'EventEmitter',
        'GAudioError',
      ],
      tabs: {
        source: 'Source',
        playlist: 'Playlist & utilities',
        adaptive: 'Adaptive',
        live: 'Live telemetry',
      },
    },
    panels: {
      advancedTitle: 'Advanced source controls',
      advancedDescription: 'Protocol overrides, source modes, preload, and manual quality selection.',
      inspectorTitle: 'Developer inspector',
      inspectorDescription: 'Live player telemetry, event log, and API coverage utilities.',
      statusTab: 'Status',
      eventsTab: 'Events',
      apiTab: 'API',
    },
    homeMini: {
      ariaLabel: 'GAudio homepage mini player',
      kicker: 'Try the library',
      openFullDemo: 'Open interactive demo',
      loading: 'Loading sample…',
      loadError: 'Sample unavailable',
      retryLoad: 'Retry sample',
      playbackError: 'Playback failed — try again',
      play: 'Play',
      pause: 'Pause',
      states: {
        idle: 'Idle',
        loading: 'Loading',
        ready: 'Ready',
        playing: 'Playing',
        paused: 'Paused',
        buffering: 'Buffering',
        ended: 'Ended',
        error: 'Error',
      },
    },
    catalog: {
      ariaLabel: 'Sample track catalog',
      bundledSample: 'Bundled sample',
      previous: 'Previous',
      next: 'Next',
      format: 'Format',
      track: 'Track',
      manualSource: 'Manual source',
      manualArtist: 'External or edited URL',
      manualFormat: 'Custom URL',
      manualCover: 'Manual source placeholder',
    },
    controls: {
      ariaLabel: 'Audio player controls',
      sourceUrl: 'Source URL',
      protocol: 'Protocol',
      sourceMode: 'Source mode',
      quality: 'Audio quality',
      automaticQuality: 'Automatic ABR',
      loadUrl: 'Load source',
      operationError: 'Source operation failed',
      operationPending: 'Operation in progress…',
      play: 'Play',
      pause: 'Pause',
      stop: 'Stop',
      fastSeek: 'Fast seek',
      seek: 'Seek',
      volume: 'Volume',
      playbackRate: 'Playback rate',
      muted: 'Muted',
      mute: 'Mute',
      unmute: 'Unmute',
      loop: 'Loop',
      autoplay: 'Autoplay',
      preservePitch: 'Preserve pitch',
      preload: 'Preload',
      sourceModes: {
        urlString: 'URL string',
        sourceDescription: 'Source object',
        httpSource: 'HttpAudioSource',
        blobSource: 'BlobAudioSource',
        blobSourceSingleFileOnly: 'single-file media only',
        customSource: 'Custom AudioSource',
      },
    },
    status: {
      ariaLabel: 'Player status and events',
      events: 'Events',
      yes: 'yes',
      no: 'no',
      sourceOpen: 'open',
      sourceClose: 'close',
      tracks: 'tracks',
      index: 'index',
      audioTracks: 'audio tracks',
      selected: 'selected',
      manual: 'manual',
      loadingResource: 'loading',
      loadedResource: 'loaded',
      fatal: 'fatal',
      recoverable: 'recoverable',
      streamError: 'error',
      capturedSamples: 'captured player samples',
      eventMessages: {
        loadstart: 'loadstart',
        canplay: 'canplay',
        play: 'play',
        playing: 'playing',
        pause: 'pause',
        waiting: 'waiting',
        ended: 'ended',
        analyzerUnavailable: 'AudioPlayer analyzer unavailable',
        analyzerCaptured: 'AudioPlayer analyzer preview captured',
        playlistLoaded: 'playlist preview loaded with distinct fallback and alternate sources',
      },
      eventLabels: {
        statechange: 'statechange',
        loadedmetadata: 'loadedmetadata',
        seeking: 'seeking',
        seeked: 'seeked',
        volumechange: 'volumechange',
        muted: 'muted',
        ratechange: 'ratechange',
        adaptivechange: 'adaptivechange',
        manifestloaded: 'manifestloaded',
        variants: 'variants',
        variantchange: 'variantchange',
        segmentloaded: 'segmentloaded',
        streamerror: 'streamerror',
        fatal: 'fatal',
        loaded: 'loaded',
        loadedSourceVia: 'loaded source via',
        autoplay: 'autoplay',
        preservesPitch: 'preservesPitch',
        preload: 'preload',
        quality: 'quality',
        hlsConfigUpdate: 'HLS config update',
        dashSettingsUpdate: 'DASH settings update',
        selectedAudioTrack: 'selected alternate audio track',
        previousPlaylistTrack: 'previous playlist track',
        nextPlaylistTrack: 'next playlist track',
        eventEmitterPreview: 'EventEmitter preview',
        gaudioErrorPreview: 'GAudioError preview',
      },
      streamErrorCategories: {
        manifest: 'manifest',
        network: 'network',
        media: 'media',
        segment: 'segment',
        other: 'other',
      },
      values: {
        'player analyzer unavailable': 'player analyzer unavailable',
        'listener received payload': 'listener received payload',
        'GAudioError: SOURCE_UNAVAILABLE': 'GAudioError: source unavailable (SOURCE_UNAVAILABLE)',
      },
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
    adaptiveQuality: {
      ariaLabel: 'Adaptive bitrate controls',
      kicker: 'Adaptive delivery',
      title: 'Adaptive bitrate',
      options: 'Bitrate choices',
      currentBitrate: 'Current bitrate',
      variants: 'Available variants',
      waiting: 'Waiting for HLS or DASH manifest',
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
      waitingCanvas: 'Analyzer waiting for loaded player audio',
      ready: 'ready',
      none: 'none',
    },
    capabilities: {
      ariaLabel: 'GAudio API capabilities',
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
      selectAlternateAudio: 'Select alternate audio',
      previousPlaylistTrack: 'Previous playlist track',
      nextPlaylistTrack: 'Next playlist track',
      runError: 'Run error preview',
      updateHls: 'Apply HLS config update',
      updateDash: 'Apply DASH settings update',
      frequency: 'Frequency',
      waveform: 'Waveform',
      apiCoverage: [
        ['AudioPlayer', 'Constructor options, load/play/pause/stop, seek/fastSeek, volume, rate, mute, loop, autoplay, preload, pitch, state, ranges, canPlayType, event subscriptions, source replacement, media session metadata, analyzer access, adaptive quality, and lifecycle disposal are represented by the player console, monitors, and utility buttons.'],
        ['Audio source inputs', 'Source mode switches between URL strings, AudioSourceDescription objects, HttpAudioSource, BlobAudioSource, and a custom AudioSource with open/close counters.'],
        ['Playlist and media session', 'The playlist preview configures distinct valid fallbackSources, exposes alternate-audio selection and previous/next navigation, and reports playlist, audio-track, and Media Session getters.'],
        ['createHlsAdapter', 'The HLS adapter is imported from gaudio/hls, initialized with AdaptivePlaybackPreset.Balanced, exposes support and implementation diagnostics, and can update config at runtime.'],
        ['createDashAdapter', 'The DASH adapter is imported from gaudio/dash, initialized with AdaptivePlaybackPreset.Balanced, exposes support and instance diagnostics, and can update settings at runtime.'],
        ['Adaptive playback types', 'Protocol, implementation, manifest, variant, bitrate, segment, quality selection, and stream error events are shown in live monitors.'],
        ['AudioAnalyzer', 'The utility preview reads player analyzer samples, while the visualization area paints bars, radial spectrum, and waveform canvases from live Web Audio samples.'],
        ['EventEmitter', 'The utility preview registers, emits, removes, and clears a typed listener.'],
        ['GAudioError', 'The error preview constructs a typed GAudio error and player errors are captured in the live event log.'],
        ['MediaElementAudioEngine', 'Native MP3, WAV, AAC, and OGG files route through the built-in media-element engine, with browser support shown per MIME type.'],
      ],
    },
  },
  zh: {
    locale: 'zh',
    intro: '通过 GAudio 公共 API 加载内置样例、外部 URL、显式 Source 对象、HLS 与 DASH 流。',
    studio: {
      eyebrow: '交互式展示',
      title: 'GAudio Player Studio',
      subtitle: '以产品级播放器界面演示主要的应用集成 API：播放控制、Source 输入、Playlist、Media Session、自适应流、Analyzer 可视化、类型化事件与工具预览。',
      library: '曲库',
      libraryHint: '切换内置曲目与分发格式。',
      nowPlaying: '正在播放',
      featureDeck: 'API 功能面板',
      featureMapTitle: '公共 API 覆盖',
      featureMapHint: '每个 Tab 都对应文档中的 package 导出，可直接映射到真实应用集成。',
      featureHighlights: [
        'AudioPlayer',
        'AudioSource 输入',
        'Playlist + Media Session',
        'HLS / DASH adapter',
        'Adaptive quality',
        'AudioAnalyzer',
        'EventEmitter',
        'GAudioError',
      ],
      tabs: {
        source: 'Source',
        playlist: 'Playlist 与工具',
        adaptive: 'Adaptive',
        live: '实时遥测',
      },
    },
    panels: {
      advancedTitle: '高级 Source 控制',
      advancedDescription: '协议覆盖、Source 模式、预加载与手动音质选择。',
      inspectorTitle: '开发者 Inspector',
      inspectorDescription: '实时播放器遥测、事件日志与 API 覆盖工具。',
      statusTab: '状态',
      eventsTab: '事件',
      apiTab: 'API',
    },
    homeMini: {
      ariaLabel: 'GAudio 首页迷你播放器',
      kicker: '立即体验',
      openFullDemo: '打开完整交互 Demo',
      loading: '正在加载样例…',
      loadError: '样例暂时不可用',
      retryLoad: '重试样例',
      playbackError: '播放失败，请重试',
      play: '播放',
      pause: '暂停',
      states: {
        idle: '空闲',
        loading: '加载中',
        ready: '已就绪',
        playing: '播放中',
        paused: '已暂停',
        buffering: '缓冲中',
        ended: '已结束',
        error: '错误',
      },
    },
    catalog: {
      ariaLabel: '样例曲目目录',
      bundledSample: '内置样例',
      previous: '上一首',
      next: '下一首',
      format: '格式',
      track: '曲目',
      manualSource: '手动 Source',
      manualArtist: '外部或已编辑的 URL',
      manualFormat: '自定义 URL',
      manualCover: '手动 Source 占位封面',
    },
    controls: {
      ariaLabel: '音频播放器控制',
      sourceUrl: 'Source URL',
      protocol: '协议',
      sourceMode: 'Source 模式',
      quality: '音频质量',
      automaticQuality: '自动 ABR',
      loadUrl: '加载 Source',
      operationError: 'Source 操作失败',
      operationPending: '操作进行中…',
      play: '播放',
      pause: '暂停',
      stop: '停止',
      fastSeek: '快速跳转',
      seek: '跳转',
      volume: '音量',
      playbackRate: '播放速度',
      muted: '静音',
      mute: '静音',
      unmute: '取消静音',
      loop: '循环',
      autoplay: '自动播放',
      preservePitch: '保持音高',
      preload: '预加载',
      sourceModes: {
        urlString: 'URL 字符串',
        sourceDescription: 'Source object',
        httpSource: 'HttpAudioSource',
        blobSource: 'BlobAudioSource',
        blobSourceSingleFileOnly: '仅限单文件媒体',
        customSource: '自定义 AudioSource',
      },
    },
    status: {
      ariaLabel: '播放器状态与事件',
      events: '事件',
      yes: '是',
      no: '否',
      sourceOpen: '打开',
      sourceClose: '关闭',
      tracks: '曲目',
      index: '索引',
      audioTracks: '音轨',
      selected: '已选择',
      manual: '手动',
      loadingResource: '正在加载',
      loadedResource: '已加载',
      fatal: '致命',
      recoverable: '可恢复',
      streamError: '错误',
      capturedSamples: '已采集播放器样本',
      eventMessages: {
        loadstart: '开始加载',
        canplay: '可以播放',
        play: '请求播放',
        playing: '正在播放',
        pause: '已暂停',
        waiting: '正在等待缓冲',
        ended: '播放结束',
        analyzerUnavailable: 'AudioPlayer analyzer 不可用',
        analyzerCaptured: '已采集 AudioPlayer analyzer 预览',
        playlistLoaded: '已加载包含独立 fallback 和 alternate source 的 playlist 预览',
      },
      eventLabels: {
        statechange: '状态变化',
        loadedmetadata: '已加载 metadata',
        seeking: '正在跳转',
        seeked: '跳转完成',
        volumechange: '音量变化',
        muted: '静音',
        ratechange: '速度变化',
        adaptivechange: '自适应实现变化',
        manifestloaded: 'Manifest 已加载',
        variants: '个档位',
        variantchange: '档位变化',
        segmentloaded: '分段已加载',
        streamerror: '流错误',
        fatal: '致命',
        loaded: '已加载',
        loadedSourceVia: '已通过以下模式加载 Source',
        autoplay: '自动播放',
        preservesPitch: '保持音高',
        preload: '预加载',
        quality: '音质',
        hlsConfigUpdate: 'HLS 配置更新',
        dashSettingsUpdate: 'DASH 设置更新',
        selectedAudioTrack: '已选择 alternate audio track',
        previousPlaylistTrack: '已切换到上一首 playlist track',
        nextPlaylistTrack: '已切换到下一首 playlist track',
        eventEmitterPreview: 'EventEmitter 预览',
        gaudioErrorPreview: 'GAudioError 预览',
      },
      streamErrorCategories: {
        manifest: 'Manifest',
        network: '网络',
        media: '媒体',
        segment: '分段',
        other: '其他',
      },
      values: {
        'media element': '媒体元素',
        'automatic': '自动',
        'automatic ABR': '自动 ABR',
        'automatic ABR; manual variants available': '自动 ABR；可手动选择档位',
        'unknown': '未知',
        'none': '无',
        'not captured': '未采集',
        'not run': '未运行',
        'metadata pending': '等待元数据',
        'direct source': '直接 Source',
        'no variants': '无可用档位',
        'no selectable variants': '无可选档位',
        'native metadata unavailable': '原生实现不提供 metadata',
        'native HLS uses browser ABR': '原生 HLS 使用浏览器 ABR',
        'selected variant unavailable': '所选档位不可用',
        'waiting': '等待中',
        'loading': '加载中',
        'ready': '已就绪',
        'adapter': '适配器',
        'unsupported': '不支持',
        'active': '已启用',
        'inactive': '未启用',
        'idle': '空闲',
        'playing': '播放中',
        'paused': '已暂停',
        'buffering': '缓冲中',
        'ended': '已结束',
        'error': '错误',
        'true': '是',
        'false': '否',
        'default': '默认',
        'probably': '很可能支持',
        'maybe': '可能支持',
        'preset': '预设',
        'HLS supported': 'HLS 支持',
        'HLS implementation': 'HLS 实现',
        'HLS instance': 'HLS 实例',
        'DASH supported': 'DASH 支持',
        'DASH instance': 'DASH 实例',
        'player analyzer unavailable': '播放器 analyzer 不可用',
        'listener received payload': '监听器已收到 payload',
        'GAudioError: SOURCE_UNAVAILABLE': 'GAudioError：Source 不可用（SOURCE_UNAVAILABLE）',
      },
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
    adaptiveQuality: {
      ariaLabel: '自适应码率控制',
      kicker: '自适应分发',
      title: '自适应码率',
      options: '码率选项',
      currentBitrate: '当前码率',
      variants: '可用档位',
      waiting: '等待 HLS 或 DASH manifest',
    },
    visualizer: {
      ariaLabel: '音频分析可视化',
      title: '播放器分析器',
      description: '从当前 AudioPlayer 的 analyzer 读取波形与频域样本，并在播放控制旁绘制实时信号。',
      bars: '频谱',
      radial: '电平表',
      waveform: '波形',
      start: '启动分析器',
      stop: '停止分析器',
      status: '状态',
      peak: '峰值',
      energy: '能量',
      running: '实时',
      stopped: '已停止',
      unavailable: 'AudioContext 不可用',
      waitingCanvas: '正在等待播放器加载音频',
      ready: '就绪',
      none: '无',
    },
    capabilities: {
      ariaLabel: 'GAudio API 能力',
      title: 'API 覆盖',
      browserSupport: '浏览器支持',
      adapterDiagnostics: '自适应适配器',
      utilityDemos: '工具能力',
      api: 'API',
      demoSurface: 'Demo 展示',
      support: '支持',
      value: '值',
      sourceLifecycle: 'Source 生命周期',
      playlist: 'Playlist 与媒体会话',
      mediaSession: '媒体会话',
      analyzer: 'AudioAnalyzer',
      eventEmitter: 'EventEmitter',
      error: 'GAudioError',
      runAnalyzer: '采集分析器预览',
      runEventEmitter: '运行事件器预览',
      runPlaylist: '运行 playlist 预览',
      selectAlternateAudio: '选择 alternate audio',
      previousPlaylistTrack: '上一首 playlist track',
      nextPlaylistTrack: '下一首 playlist track',
      runError: '运行错误预览',
      updateHls: '应用 HLS 配置更新',
      updateDash: '应用 DASH 设置更新',
      frequency: '频域',
      waveform: '波形',
      apiCoverage: [
        ['AudioPlayer', '播放器控制台、监听面板和工具按钮展示构造参数、load/play/pause/stop、seek/fastSeek、音量、速度、静音、循环、自动播放、预加载、音高、状态、时间范围、canPlayType、事件订阅、Source 替换、Media Session、analyzer、adaptive quality 和生命周期 dispose。'],
        ['Audio source inputs', 'Source 模式可在 URL 字符串、AudioSourceDescription、HttpAudioSource、BlobAudioSource 和带 open/close 计数的自定义 AudioSource 之间切换。'],
        ['Playlist and media session', 'playlist 预览会配置彼此独立且有效的 fallbackSources，提供 alternate audio 选择和上一首/下一首导航，并展示 playlist、audio-track 与 Media Session getter。'],
        ['createHlsAdapter', '从 gaudio/hls 导入 HLS 适配器，用 AdaptivePlaybackPreset.Balanced 初始化，展示支持与实现诊断，并可运行时更新 config。'],
        ['createDashAdapter', '从 gaudio/dash 导入 DASH 适配器，用 AdaptivePlaybackPreset.Balanced 初始化，展示支持与实例诊断，并可运行时更新 settings。'],
        ['Adaptive playback types', '协议、实现、manifest、variant、码率、分段、音质选择和 stream error 事件会显示在实时监听面板。'],
        ['AudioAnalyzer', '工具预览读取播放器 analyzer 样本；频谱区则用 Web Audio 样本分别绘制柱状、径向和波形 canvas。'],
        ['EventEmitter', '工具预览会注册、触发、移除并清空一个类型化监听器。'],
        ['GAudioError', '错误预览会构造类型化 GAudio 错误，播放器错误也会进入实时事件日志。'],
        ['MediaElementAudioEngine', '原生 MP3、WAV、AAC 和 OGG 文件会路由到内置 media-element engine，并按 MIME type 展示浏览器支持。'],
      ],
    },
  },
} satisfies Record<DemoLocale, DemoText>

export interface DemoText {
  locale: DemoLocale
  intro: string
  studio: {
    eyebrow: string
    title: string
    subtitle: string
    library: string
    libraryHint: string
    nowPlaying: string
    featureDeck: string
    featureMapTitle: string
    featureMapHint: string
    featureHighlights: string[]
    tabs: {
      source: string
      playlist: string
      adaptive: string
      live: string
    }
  }
  panels: {
    advancedTitle: string
    advancedDescription: string
    inspectorTitle: string
    inspectorDescription: string
    statusTab: string
    eventsTab: string
    apiTab: string
  }
  homeMini: {
    ariaLabel: string
    kicker: string
    openFullDemo: string
    loading: string
    loadError: string
    retryLoad: string
    playbackError: string
    play: string
    pause: string
    states: Record<string, string>
  }
  catalog: {
    ariaLabel: string
    bundledSample: string
    previous: string
    next: string
    format: string
    track: string
    manualSource: string
    manualArtist: string
    manualFormat: string
    manualCover: string
  }
  controls: {
    ariaLabel: string
    sourceUrl: string
    protocol: string
    sourceMode: string
    quality: string
    automaticQuality: string
    loadUrl: string
    operationError: string
    operationPending: string
    play: string
    pause: string
    stop: string
    fastSeek: string
    seek: string
    volume: string
    playbackRate: string
    muted: string
    mute: string
    unmute: string
    loop: string
    autoplay: string
    preservePitch: string
    preload: string
    sourceModes: {
      urlString: string
      sourceDescription: string
      httpSource: string
      blobSource: string
      blobSourceSingleFileOnly: string
      customSource: string
    }
  }
  status: {
    ariaLabel: string
    events: string
    yes: string
    no: string
    sourceOpen: string
    sourceClose: string
    tracks: string
    index: string
    audioTracks: string
    selected: string
    manual: string
    loadingResource: string
    loadedResource: string
    fatal: string
    recoverable: string
    streamError: string
    capturedSamples: string
    eventMessages: {
      loadstart: string
      canplay: string
      play: string
      playing: string
      pause: string
      waiting: string
      ended: string
      analyzerUnavailable: string
      analyzerCaptured: string
      playlistLoaded: string
    }
    eventLabels: {
      statechange: string
      loadedmetadata: string
      seeking: string
      seeked: string
      volumechange: string
      muted: string
      ratechange: string
      adaptivechange: string
      manifestloaded: string
      variants: string
      variantchange: string
      segmentloaded: string
      streamerror: string
      fatal: string
      loaded: string
      loadedSourceVia: string
      autoplay: string
      preservesPitch: string
      preload: string
      quality: string
      hlsConfigUpdate: string
      dashSettingsUpdate: string
      selectedAudioTrack: string
      previousPlaylistTrack: string
      nextPlaylistTrack: string
      eventEmitterPreview: string
      gaudioErrorPreview: string
    }
    streamErrorCategories: Record<string, string>
    values: Record<string, string>
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
  adaptiveQuality: {
    ariaLabel: string
    kicker: string
    title: string
    options: string
    currentBitrate: string
    variants: string
    waiting: string
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
    waitingCanvas: string
    ready: string
    none: string
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
    selectAlternateAudio: string
    previousPlaylistTrack: string
    nextPlaylistTrack: string
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

// AI modified: translate public demo status prose while leaving API identifiers unchanged.
export function demoStatusForDisplay(status: unknown, text: DemoText): string {
  if (typeof status === 'boolean') {
    return status ? text.status.yes : text.status.no
  }

  const statusText = String(status)
  const translatedStatus = text.status.values[statusText]

  if (translatedStatus) {
    return translatedStatus
  }

  const sourceLifecycleMatch = /^open (\d+) \/ close (\d+)$/.exec(statusText)

  if (sourceLifecycleMatch) {
    return `${text.status.sourceOpen} ${sourceLifecycleMatch[1]} / ${text.status.sourceClose} ${sourceLifecycleMatch[2]}`
  }

  const playlistMatch = /^(\d+) tracks \/ index (-?\d+) \/ audio tracks (\d+) \/ selected (.+)$/.exec(statusText)

  if (playlistMatch) {
    const selectedTrackLabel = text.status.values[playlistMatch[4]] ?? playlistMatch[4]

    return `${playlistMatch[1]} ${text.status.tracks} / ${text.status.index} ${playlistMatch[2]} / ${playlistMatch[3]} ${text.status.audioTracks} / ${text.status.selected} ${selectedTrackLabel}`
  }

  const manualQualityMatch = /^manual (.+)$/.exec(statusText)

  if (manualQualityMatch) {
    return `${text.status.manual}: ${manualQualityMatch[1]}`
  }

  const resourceStatusMatch = /^(loading|loaded) (.+)$/.exec(statusText)

  if (resourceStatusMatch) {
    const actionLabel = resourceStatusMatch[1] === 'loading'
      ? text.status.loadingResource
      : text.status.loadedResource

    return `${actionLabel} ${resourceStatusMatch[2]}`
  }

  const streamErrorMatch = /^(fatal|recoverable) (.+) error$/.exec(statusText)

  if (streamErrorMatch) {
    const severityLabel = streamErrorMatch[1] === 'fatal'
      ? text.status.fatal
      : text.status.recoverable
    const categoryLabel = text.status.streamErrorCategories[streamErrorMatch[2]] ?? streamErrorMatch[2]

    return `${categoryLabel} ${severityLabel} ${text.status.streamError}`
  }

  const analyzerMatch = /^captured (\d+) player samples$/.exec(statusText)

  if (analyzerMatch) {
    return `${text.status.capturedSamples}: ${analyzerMatch[1]}`
  }

  return statusText
}

// AI modified: event payloads stay locale-neutral in the composable and are translated only when rendered.
export function demoEventForDisplay(message: string, text: DemoText): string {
  const translatedStaticMessage: Record<string, string> = {
    'loadstart': text.status.eventMessages.loadstart,
    'canplay': text.status.eventMessages.canplay,
    'play': text.status.eventMessages.play,
    'playing': text.status.eventMessages.playing,
    'pause': text.status.eventMessages.pause,
    'waiting': text.status.eventMessages.waiting,
    'ended': text.status.eventMessages.ended,
    'AudioPlayer analyzer unavailable': text.status.eventMessages.analyzerUnavailable,
    'AudioPlayer analyzer preview captured': text.status.eventMessages.analyzerCaptured,
    'playlist preview loaded with distinct fallback and alternate sources': text.status.eventMessages.playlistLoaded,
  }
  const staticMessage = translatedStaticMessage[message]

  if (staticMessage) {
    return staticMessage
  }

  const stateChangeMatch = /^statechange: (.+)$/.exec(message)
  if (stateChangeMatch) {
    return `${text.status.eventLabels.statechange}: ${demoStatusForDisplay(stateChangeMatch[1], text)}`
  }

  const timedEventMatch = /^(loadedmetadata|seeking|seeked): (.+)s$/.exec(message)
  if (timedEventMatch) {
    const eventLabel = text.status.eventLabels[timedEventMatch[1] as 'loadedmetadata' | 'seeking' | 'seeked']

    return `${eventLabel}: ${timedEventMatch[2]}s`
  }

  const volumeChangeMatch = /^volumechange: (.+) \/ muted (true|false)$/.exec(message)
  if (volumeChangeMatch) {
    return `${text.status.eventLabels.volumechange}: ${volumeChangeMatch[1]} / ${text.status.eventLabels.muted} ${demoStatusForDisplay(volumeChangeMatch[2], text)}`
  }

  const rateChangeMatch = /^ratechange: (.+)$/.exec(message)
  if (rateChangeMatch) {
    return `${text.status.eventLabels.ratechange}: ${rateChangeMatch[1]}`
  }

  const adaptiveChangeMatch = /^adaptivechange: (.+)$/.exec(message)
  if (adaptiveChangeMatch) {
    return `${text.status.eventLabels.adaptivechange}: ${adaptiveChangeMatch[1]}`
  }

  const manifestLoadedMatch = /^manifestloaded: (\d+) variants$/.exec(message)
  if (manifestLoadedMatch) {
    return `${text.status.eventLabels.manifestloaded}: ${manifestLoadedMatch[1]} ${text.status.eventLabels.variants}`
  }

  const variantChangeMatch = /^variantchange: (.+)$/.exec(message)
  if (variantChangeMatch) {
    return `${text.status.eventLabels.variantchange}: ${demoStatusForDisplay(variantChangeMatch[1], text)}`
  }

  const segmentLoadedMatch = /^segmentloaded: (.+)$/.exec(message)
  if (segmentLoadedMatch) {
    return `${text.status.eventLabels.segmentloaded}: ${segmentLoadedMatch[1]}`
  }

  const streamErrorMatch = /^streamerror: (.+) \/ fatal (true|false)$/.exec(message)
  if (streamErrorMatch) {
    const categoryLabel = text.status.streamErrorCategories[streamErrorMatch[1]] ?? streamErrorMatch[1]

    return `${text.status.eventLabels.streamerror}: ${categoryLabel} / ${text.status.eventLabels.fatal} ${demoStatusForDisplay(streamErrorMatch[2], text)}`
  }

  const sourceModeMatch = /^loaded source via (.+)$/.exec(message)
  if (sourceModeMatch) {
    const sourceModeLabel = sourceModeMatch[1] === 'url-string'
      ? text.controls.sourceModes.urlString
      : sourceModeMatch[1] === 'source-description'
        ? text.controls.sourceModes.sourceDescription
        : sourceModeMatch[1] === 'http-source'
          ? text.controls.sourceModes.httpSource
          : sourceModeMatch[1] === 'blob-source'
            ? text.controls.sourceModes.blobSource
            : sourceModeMatch[1] === 'custom-source'
              ? text.controls.sourceModes.customSource
              : sourceModeMatch[1]

    return `${text.status.eventLabels.loadedSourceVia}: ${sourceModeLabel}`
  }

  const loadedSampleMatch = /^loaded: (.+)$/.exec(message)
  if (loadedSampleMatch) {
    return `${text.status.eventLabels.loaded}: ${loadedSampleMatch[1]}`
  }

  const settingMatch = /^(autoplay|preservesPitch|preload): (.+)$/.exec(message)
  if (settingMatch) {
    const settingLabel = text.status.eventLabels[settingMatch[1] as 'autoplay' | 'preservesPitch' | 'preload']

    return `${settingLabel}: ${demoStatusForDisplay(settingMatch[2], text)}`
  }

  const qualityMatch = /^quality: (.+)$/.exec(message)
  if (qualityMatch) {
    return `${text.status.eventLabels.quality}: ${demoStatusForDisplay(qualityMatch[1], text)}`
  }

  const hlsConfigMatch = /^HLS config update: (.+)$/.exec(message)
  if (hlsConfigMatch) {
    return `${text.status.eventLabels.hlsConfigUpdate}: ${hlsConfigMatch[1]}`
  }

  const dashSettingsMatch = /^DASH settings update: (.+)$/.exec(message)
  if (dashSettingsMatch) {
    return `${text.status.eventLabels.dashSettingsUpdate}: ${dashSettingsMatch[1]}`
  }

  const alternateAudioMatch = /^selected alternate audio track: (.+)$/.exec(message)
  if (alternateAudioMatch) {
    return `${text.status.eventLabels.selectedAudioTrack}: ${alternateAudioMatch[1]}`
  }

  const playlistNavigationMatch = /^(previous|next) playlist track: (-?\d+)$/.exec(message)
  if (playlistNavigationMatch) {
    const eventLabel = playlistNavigationMatch[1] === 'previous'
      ? text.status.eventLabels.previousPlaylistTrack
      : text.status.eventLabels.nextPlaylistTrack

    return `${eventLabel}: ${playlistNavigationMatch[2]}`
  }

  const eventEmitterMatch = /^EventEmitter preview: (.+)$/.exec(message)
  if (eventEmitterMatch) {
    return `${text.status.eventLabels.eventEmitterPreview}: ${demoStatusForDisplay(eventEmitterMatch[1], text)}`
  }

  const gaudioErrorMatch = /^GAudioError preview: (.+)$/.exec(message)
  if (gaudioErrorMatch) {
    return `${text.status.eventLabels.gaudioErrorPreview}: ${gaudioErrorMatch[1]}`
  }

  const playerErrorMatch = /^error: (.+)$/.exec(message)
  if (playerErrorMatch) {
    return `${text.status.streamError}: ${playerErrorMatch[1]}`
  }

  return message
}
