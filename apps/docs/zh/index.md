---
layout: home

hero:
  name: GAudio
  text: 浏览器优先的音频流播放
  tagline: 预发布阶段的 TypeScript 媒体播放库，可选接入 HLS 与 DASH 适配器。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 交互示例
      link: /zh/examples/

features:
  - title: 预发布核心 API
    details: 通过一个类型化播放器控制加载、播放、跳转、音量、速度和媒体状态；首次正式发布前 API 仍可能调整。
  - title: 可选自适应流
    details: 只在应用需要时接入 HLS 或 DASH，不让核心播放场景加载供应商库。
  - title: 浏览器原生生命周期
    details: 观察媒体就绪、缓冲、跳转、自适应变体、分段加载和类型化错误。
  - title: Player 持有的音频分析
    details: 通过 AudioPlayer 配置直接启用频域和波形采样，也可以在自定义 engine 中接入应用自己的 Web Audio 图。
---
