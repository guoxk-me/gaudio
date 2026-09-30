const reviewedLicenseExpressions = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  // AI modified: node-forge can be redistributed under the permissive BSD option.
  '(BSD-3-Clause OR GPL-2.0)',
  // AI modified: BlueOak is a permissive notice-preserving software license.
  'BlueOak-1.0.0',
  // AI modified: CC0 code can be redistributed without copyright restrictions.
  'CC0-1.0',
  // AI modified: CC-BY content is redistributable because the generated notice retains attribution.
  'CC-BY-4.0',
  'ISC',
  'MIT',
  // AI modified: pako's MIT and zlib terms both permit redistribution with preserved notices.
  '(MIT AND Zlib)',
  // AI modified: sha.js combines two already reviewed permissive licenses.
  '(MIT AND BSD-3-Clause)',
  // AI modified: type-fest offers either of two already reviewed permissive licenses.
  '(MIT OR CC0-1.0)',
  'MPL-2.0',
  // AI modified: OFL permits bundling the unmodified Geist font files with their license text.
  'OFL-1.1',
  // AI modified: Python-2.0 is a permissive redistribution license used by argparse.
  'Python-2.0',
])

// AI modified: a newly introduced license must receive human compatibility review before documentation can ship it.
export function assertReviewedLicense(packageIdentity: string, licenseExpression: string): void {
  if (!reviewedLicenseExpressions.has(licenseExpression)) {
    const reportedExpression = licenseExpression === '' ? '(empty)' : licenseExpression

    throw new Error(`${packageIdentity} uses unreviewed license expression "${reportedExpression}". Review and explicitly allow it before release.`)
  }
}
