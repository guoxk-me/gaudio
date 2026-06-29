import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeShowcase from './components/HomeShowcase.vue'
import './custom.css'

// AI modified: registers the custom home showcase used by the Markdown landing page.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeShowcase', HomeShowcase)
  },
} satisfies Theme
