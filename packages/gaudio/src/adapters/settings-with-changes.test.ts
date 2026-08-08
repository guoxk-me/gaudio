import { describe, expect, it } from 'vitest'
import { settingsWithChanges } from './settings-with-changes'

class VendorSetting {
  constructor(readonly name: string) {}
}

describe('settingsWithChanges', () => {
  it('recursively merges plain setting records without mutating inputs', () => {
    const currentSettings = {
      streaming: {
        buffer: { target: 30, maximum: 90 },
        retries: { count: 3 },
      },
    }
    const settingChanges = {
      streaming: {
        buffer: { target: 60 },
      },
    }

    const mergedSettings = settingsWithChanges(currentSettings, settingChanges)

    expect(mergedSettings).toEqual({
      streaming: {
        buffer: { target: 60, maximum: 90 },
        retries: { count: 3 },
      },
    })
    expect(mergedSettings.streaming).not.toBe(currentSettings.streaming)
    expect(currentSettings.streaming.buffer.target).toBe(30)
  })

  it('copies incoming plain setting branches when no current branch exists', () => {
    const settingChanges = {
      streaming: {
        retries: { count: 3 },
      },
    }

    const mergedSettings = settingsWithChanges<Partial<typeof settingChanges>>({}, settingChanges)

    expect(mergedSettings).toEqual(settingChanges)
    expect(mergedSettings.streaming).not.toBe(settingChanges.streaming)
    expect(mergedSettings.streaming?.retries).not.toBe(settingChanges.streaming.retries)
  })

  it('isolates arrays and their plain entries while retaining opaque vendor values', () => {
    const replacementPattern = /stable/
    const replacementVendorSetting = new VendorSetting('replacement')
    const replacementValues = [{ name: 'replacement' }]

    const mergedSettings = settingsWithChanges({
      values: [{ name: 'current' }],
      pattern: /balanced/,
      vendorSetting: new VendorSetting('current'),
    }, {
      values: replacementValues,
      pattern: replacementPattern,
      vendorSetting: replacementVendorSetting,
    })

    expect(mergedSettings.values).toEqual([{ name: 'replacement' }])
    expect(mergedSettings.values).not.toBe(replacementValues)
    expect(mergedSettings.values[0]).not.toBe(replacementValues[0])
    expect(mergedSettings.pattern).toBe(replacementPattern)
    expect(mergedSettings.vendorSetting).toBe(replacementVendorSetting)
  })

  it('isolates unchanged current arrays in the returned settings', () => {
    const currentSettings = {
      cmcd: {
        includeKeys: ['br', { name: 'duration' }],
      },
    }

    const mergedSettings = settingsWithChanges(currentSettings, {})
    const mergedKeys = mergedSettings.cmcd.includeKeys

    expect(mergedKeys).toEqual(['br', { name: 'duration' }])
    expect(mergedKeys).not.toBe(currentSettings.cmcd.includeKeys)
    expect(mergedKeys[1]).not.toBe(currentSettings.cmcd.includeKeys[1])
  })

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects the unsafe %s settings key at every depth',
    (unsafeSettingName) => {
      const topLevelChanges = JSON.parse(`{"${unsafeSettingName}":{"injected":true}}`) as object
      const nestedChanges = {
        streaming: JSON.parse(`{"${unsafeSettingName}":{"injected":true}}`) as object,
      }

      expect(() => settingsWithChanges({}, topLevelChanges)).toThrowError(
        `Unsupported settings key "${unsafeSettingName}"`,
      )
      expect(() => settingsWithChanges({}, nestedChanges)).toThrowError(
        `Unsupported settings key "${unsafeSettingName}"`,
      )
      expect(Object.prototype).not.toHaveProperty('injected')
    },
  )

  it('rejects unsafe keys already present in current settings', () => {
    const currentSettings = JSON.parse('{"__proto__":{"injected":true}}') as object

    expect(() => settingsWithChanges(currentSettings, {})).toThrowError(
      'Unsupported settings key "__proto__"',
    )
    expect(Object.prototype).not.toHaveProperty('injected')
  })
})
