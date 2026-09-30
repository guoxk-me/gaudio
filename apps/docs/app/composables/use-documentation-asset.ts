export function useDocumentationAsset(relativePath: string): string {
  const runtimeConfig = useRuntimeConfig()

  // AI modified: public assets inherit Nuxt's deployment base instead of assuming the domain root.
  return `${runtimeConfig.app.baseURL}${relativePath.replace(/^\/+/, '')}`
}
