import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '../../assets/css/demo-ui.css'
import './custom.css'
import HomeMiniPlayer from './components/HomeMiniPlayer.vue'

// AI modified: register demo UI styles and the homepage mini player showcase.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeMiniPlayer', HomeMiniPlayer)
  },
} satisfies Theme
