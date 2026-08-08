import type { Theme } from 'vitepress'
import { useData, useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { defineComponent, h, nextTick, onMounted, watch } from 'vue'
import '../../assets/css/demo-ui.css'
import './custom.css'

const GaudioLayout = defineComponent({
  name: 'GaudioLayout',
  setup() {
    const { lang } = useData()
    const route = useRoute()

    function syncLayoutMainLandmarks(): void {
      const pageContent = document.querySelector<HTMLElement>('#VPContent')
      const hasNotFoundPage = Boolean(pageContent?.querySelector('.NotFound'))

      // AI modified: the persistent content wrapper owns the 404 main role and releases it after navigation.
      if (hasNotFoundPage) {
        pageContent?.setAttribute('role', 'main')
      }
      else {
        pageContent?.removeAttribute('role')
      }

      document.querySelector<HTMLElement>('.VPHome')?.setAttribute('role', 'main')
      const documentFooter = document.querySelector<HTMLElement>('.VPDocFooter')
      const documentInformation = documentFooter?.querySelector<HTMLElement>('.edit-info')

      // AI modified: footer is a group because region is not permitted on footer; its metadata remains a landmark.
      documentFooter?.setAttribute('role', 'group')
      documentFooter?.removeAttribute('aria-label')
      documentInformation?.setAttribute('role', 'region')
      documentInformation?.setAttribute(
        'aria-label',
        lang.value === 'zh-CN' ? '页面信息' : 'Page information',
      )
    }

    function syncLayoutMainLandmarksAfterNavigation(): void {
      void nextTick(syncLayoutMainLandmarks)
    }

    // AI modified: VitePress 1.x renders its home root as a div, so expose it as the page's main landmark.
    onMounted(syncLayoutMainLandmarks)
    watch(() => route.path, syncLayoutMainLandmarksAfterNavigation, { flush: 'post' })

    return () => h(DefaultTheme.Layout)
  },
})

export default {
  extends: DefaultTheme,
  Layout: GaudioLayout,
} satisfies Theme
