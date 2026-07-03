import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeMiniPlayer from './components/HomeMiniPlayer.vue'
import '../../assets/css/demo-ui.css'
import './custom.css'

// AI modified: register demo UI styles and the homepage mini player showcase.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeMiniPlayer', HomeMiniPlayer)
  },
} satisfies Theme
