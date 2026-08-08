const reviewedLicenseExpressions = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MPL-2.0',
])

// AI modified: a newly introduced license must receive human compatibility review before documentation can ship it.
export function assertReviewedLicense(packageIdentity: string, licenseExpression: string): void {
  if (!reviewedLicenseExpressions.has(licenseExpression)) {
    const reportedExpression = licenseExpression === '' ? '(empty)' : licenseExpression

    throw new Error(`${packageIdentity} uses unreviewed license expression "${reportedExpression}". Review and explicitly allow it before release.`)
  }
}
