import type { DocumentationNavigationGroup, DocumentationNavigationLink } from '../types/documentation'

const englishGuideLinks: DocumentationNavigationLink[] = [
  { label: 'Getting Started', path: '/guide/getting-started' },
  { label: 'Configuration', path: '/guide/configuration' },
  { label: 'Recipes', path: '/guide/recipes' },
  { label: 'Adaptive Playback', path: '/guide/adaptive-playback' },
  { label: 'Events', path: '/guide/events' },
  { label: 'API Reference', path: '/guide/api-reference' },
]

const chineseGuideLinks: DocumentationNavigationLink[] = [
  { label: '快速开始', path: '/zh/guide/getting-started' },
  { label: '配置', path: '/zh/guide/configuration' },
  { label: '实践配方', path: '/zh/guide/recipes' },
  { label: '自适应播放', path: '/zh/guide/adaptive-playback' },
  { label: '事件', path: '/zh/guide/events' },
  { label: 'API 参考', path: '/zh/guide/api-reference' },
]

export function guideNavigation(isChinese: boolean): DocumentationNavigationGroup[] {
  return [{
    label: isChinese ? '指南' : 'Guide',
    links: isChinese ? chineseGuideLinks : englishGuideLinks,
  }]
}

export function guideSurrounding(path: string, isChinese: boolean): {
  next?: DocumentationNavigationLink
  previous?: DocumentationNavigationLink
} {
  const guideLinks = isChinese ? chineseGuideLinks : englishGuideLinks
  const currentIndex = guideLinks.findIndex(guideLink => guideLink.path === path)

  return {
    previous: currentIndex > 0 ? guideLinks[currentIndex - 1] : undefined,
    next: currentIndex >= 0 && currentIndex < guideLinks.length - 1
      ? guideLinks[currentIndex + 1]
      : undefined,
  }
}
