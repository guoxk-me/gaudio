---
layout: home

hero:
  name: gaudio
  text: Browser-first audio streaming
  tagline: Pre-release TypeScript media playback with optional HLS and DASH adapters.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Interactive Example
      link: /examples/

features:
  - title: Pre-release core API
    details: Control loading, playback, seeking, volume, rate, and media state through one typed player while the package is still before its first official release.
  - title: Optional adaptive streaming
    details: Add HLS or DASH support without loading vendor libraries in core-only applications.
  - title: Browser-native lifecycle
    details: Observe media readiness, buffering, seeking, adaptive variants, segments, and typed failures.
  - title: Player-owned analysis
    details: Enable frequency and waveform sampling through AudioPlayer configuration, or connect custom Web Audio graphs when your engine owns the signal.
---

<HomeShowcase />
