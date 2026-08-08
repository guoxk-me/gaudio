// AI modified: verify the packed artifact through public ESM/CJS exports without relying on workspace links.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { env, versions } from 'node:process'

const shouldHaveOptionalPeers = env.GAUDIO_EXPECT_OPTIONAL_PEERS === 'true'
const esmRoot = await import('gaudio')
const esmDash = await import('gaudio/dash')
const esmHls = await import('gaudio/hls')
const require = createRequire(import.meta.url)
const cjsRoot = require('gaudio')
const cjsDash = require('gaudio/dash')
const cjsHls = require('gaudio/hls')

assert.equal(typeof esmRoot.AudioPlayer, 'function')
assert.equal(typeof esmHls.createHlsAdapter, 'function')
assert.equal(typeof esmDash.createDashAdapter, 'function')
assert.equal(typeof cjsRoot.AudioPlayer, 'function')
assert.equal(typeof cjsHls.createHlsAdapter, 'function')
assert.equal(typeof cjsDash.createDashAdapter, 'function')

async function expectUnavailablePeer(createEngine, peerName) {
  try {
    await createEngine()
    assert.fail(`Expected ${peerName} to be unavailable`)
  }
  catch (error) {
    assert.equal(error?.name, 'GAudioError')
    assert.equal(error?.code, 'ADAPTER_UNAVAILABLE')
    assert.match(error?.message ?? '', new RegExp(peerName.replace('.', '\\.')))
    assert.ok(error?.cause instanceof Error)
  }
}

const esmHlsAdapter = esmHls.createHlsAdapter({ playbackStrategy: 'hls-only' })
const esmDashAdapter = esmDash.createDashAdapter()
const cjsHlsAdapter = cjsHls.createHlsAdapter({ playbackStrategy: 'hls-only' })
const cjsDashAdapter = cjsDash.createDashAdapter()

assert.equal(esmHlsAdapter.protocol, 'hls')
assert.equal(esmDashAdapter.protocol, 'dash')
assert.equal(cjsHlsAdapter.protocol, 'hls')
assert.equal(cjsDashAdapter.protocol, 'dash')

if (shouldHaveOptionalPeers) {
  assert.equal(typeof require.resolve('hls.js'), 'string')
  assert.equal(typeof require.resolve('dashjs'), 'string')
}
else {
  // AI modified: advertise only the capability needed to reach GAudio's missing-peer contract.
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    value: class ConsumerAudio {
      canPlayType() {
        return ''
      }
    },
  })
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    value: class ConsumerMediaSource {
      static isTypeSupported() {
        return true
      }
    },
  })

  assert.equal(esmHlsAdapter.isSupported(), true)
  assert.equal(esmDashAdapter.isSupported(), true)
  assert.equal(cjsHlsAdapter.isSupported(), true)
  assert.equal(cjsDashAdapter.isSupported(), true)
  assert.throws(() => require.resolve('hls.js'), { code: 'MODULE_NOT_FOUND' })
  assert.throws(() => require.resolve('dashjs'), { code: 'MODULE_NOT_FOUND' })

  await expectUnavailablePeer(() => esmHlsAdapter.createEngine(), 'hls.js')
  await expectUnavailablePeer(() => esmDashAdapter.createEngine(), 'dashjs')
  // AI modified: CommonJS consumers must receive the same optional-peer contract as ESM consumers.
  await expectUnavailablePeer(() => cjsHlsAdapter.createEngine(), 'hls.js')
  await expectUnavailablePeer(() => cjsDashAdapter.createEngine(), 'dashjs')
}

// AI modified: installed-peer checks stay SSR-safe; real vendor playback remains a browser E2E responsibility.
const peerMode = shouldHaveOptionalPeers
  ? 'resolvable optional peers and SSR-safe entry imports'
  : 'optional-peer errors'
console.log(`Verified gaudio ESM/CJS exports with ${peerMode} on Node ${versions.node}`)
