export default defineNuxtRouteMiddleware((to) => {
  let destinationPath = to.path

  // AI modified: preserve published VitePress links while keeping one canonical Nuxt route tree.
  destinationPath = destinationPath.replace(/\.(?:html|md)$/, '')
  destinationPath = destinationPath.replace(/^\/en(?=\/|$)/, '') || '/'
  destinationPath = destinationPath.replace(/^\/docs\/(?=guide(?:\/|$)|api(?:\/|$))/, '/')

  if (destinationPath.length > 1 && destinationPath.endsWith('/')) {
    destinationPath = destinationPath.slice(0, -1)
  }

  if (destinationPath === to.path) {
    return
  }

  return navigateTo({ path: destinationPath, query: to.query, hash: to.hash }, {
    redirectCode: 301,
    replace: true,
  })
})
