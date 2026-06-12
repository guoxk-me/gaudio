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

  it('replaces arrays, regular expressions, and class instances', () => {
    const replacementPattern = /stable/
    const replacementVendorSetting = new VendorSetting('replacement')

    const mergedSettings = settingsWithChanges({
      values: [1, 2],
      pattern: /balanced/,
      vendorSetting: new VendorSetting('current'),
    }, {
      values: [3],
      pattern: replacementPattern,
      vendorSetting: replacementVendorSetting,
    })

    expect(mergedSettings.values).toEqual([3])
    expect(mergedSettings.pattern).toBe(replacementPattern)
    expect(mergedSettings.vendorSetting).toBe(replacementVendorSetting)
  })
})
