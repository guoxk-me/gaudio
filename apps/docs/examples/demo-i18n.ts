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
      title: 'Audio analyzer canvas',
      description: 'Start a silent Web Audio source, read live frequency and waveform samples, and paint a moving spectrum on canvas.',
      start: 'Start visualizer',
      stop: 'Stop visualizer',
      status: 'Status',
      peak: 'Peak',
      energy: 'Energy',
      running: 'running',
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
      analyzer: 'AudioAnalyzer',
      eventEmitter: 'EventEmitter',
      runAnalyzer: 'Capture analyzer preview',
      runEventEmitter: 'Run emitter preview',
      updateHls: 'Apply HLS config update',
      updateDash: 'Apply DASH settings update',
      frequency: 'Frequency',
      waveform: 'Waveform',
      apiCoverage: [
        ['AudioPlayer', 'Constructor options, load/play/pause/stop, seek/fastSeek, volume, rate, mute, loop, autoplay, preload, pitch, state, ranges, canPlayType, events, and dispose are shown in the controls and status panels.'],
        ['HttpAudioSource and AudioSource', 'Source mode switches between URL strings, source descriptions, HttpAudioSource, and a custom AudioSource with open/close counters.'],
        ['HLS and DASH adapters', 'Adapters are registered from public subpaths, expose support diagnostics, can update HLS config or DASH settings at runtime, and expose vendor instances for manual quality experiments.'],
        ['AdaptivePlaybackPreset', 'The demo initializes both adaptive adapters with the Balanced audio VOD preset.'],
        ['AudioAnalyzer', 'The utility preview creates a Web Audio graph, reads frequency and waveform byte samples, and the canvas visualizer paints those samples every animation frame.'],
        ['EventEmitter', 'The utility preview registers, emits, removes, and clears a typed listener.'],
        ['GAudioError and events', 'Typed errors and lifecycle events are captured in the live event log.'],
        ['MediaElementAudioEngine', 'Native media files route through the built-in media-element engine.'],
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
      title: 'Audio analyzer canvas',
      description: '启动一个静音 Web Audio source，实时读取频域与波形样本，并在 canvas 上绘制动态频谱。',
      start: '启动频谱',
      stop: '停止频谱',
      status: '状态',
      peak: '峰值',
      energy: '能量',
      running: '运行中',
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
      analyzer: 'AudioAnalyzer',
      eventEmitter: 'EventEmitter',
      runAnalyzer: '采集分析器预览',
      runEventEmitter: '运行事件器预览',
      updateHls: '应用 HLS 配置更新',
      updateDash: '应用 DASH 设置更新',
      frequency: '频域',
      waveform: '波形',
      apiCoverage: [
        ['AudioPlayer', '控制面板与状态面板展示构造参数、load/play/pause/stop、seek/fastSeek、音量、速度、静音、循环、自动播放、预加载、音高、状态、时间范围、canPlayType、事件和 dispose。'],
        ['HttpAudioSource and AudioSource', 'Source 模式可在 URL 字符串、Source description、HttpAudioSource 和带 open/close 计数的自定义 AudioSource 之间切换。'],
        ['HLS and DASH adapters', '从公共子路径注册适配器，展示支持诊断，可在运行时更新 HLS config 或 DASH settings，并通过 vendor instance 展示手动音质实验。'],
        ['AdaptivePlaybackPreset', 'demo 使用 Balanced 音频 VOD 预设初始化两个自适应适配器。'],
        ['AudioAnalyzer', '工具预览会创建 Web Audio 图并读取频域与波形字节样本，canvas 可视化会在每一帧绘制这些样本。'],
        ['EventEmitter', '工具预览会注册、触发、移除并清空一个类型化监听器。'],
        ['GAudioError and events', '类型化错误与生命周期事件会进入实时事件日志。'],
        ['MediaElementAudioEngine', '原生媒体文件会路由到内置 media-element engine。'],
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
    analyzer: string
    eventEmitter: string
    runAnalyzer: string
    runEventEmitter: string
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
