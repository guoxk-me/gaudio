import process from 'node:process'

const defaultDocsSiteUrl = 'https://guoxk-me.github.io/gaudio/'

// AI modified: deployment metadata must use one validated production origin across Nuxt and artifact checks.
export function resolveDocsSiteUrl(configuredSiteUrl: string): string {
  let siteUrl: URL

  try {
    siteUrl = new URL(configuredSiteUrl)
  }
  catch {
    throw new TypeError('DOCS_SITE_URL must be an absolute HTTPS URL without credentials, query data, or a fragment.')
  }

  if (
    siteUrl.protocol !== 'https:'
    || siteUrl.username !== ''
    || siteUrl.password !== ''
    || siteUrl.search !== ''
    || siteUrl.hash !== ''
  ) {
    throw new TypeError('DOCS_SITE_URL must be an absolute HTTPS URL without credentials, query data, or a fragment.')
  }

  siteUrl.pathname = siteUrl.pathname.endsWith('/') ? siteUrl.pathname : `${siteUrl.pathname}/`
  return siteUrl.href
}

// AI modified: keep this deployment URL in Turbo's build cache inputs and development passthrough.
export const docsSiteUrl = resolveDocsSiteUrl(process.env.DOCS_SITE_URL ?? defaultDocsSiteUrl)
