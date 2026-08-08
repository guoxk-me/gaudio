export function settingsWithChanges<Settings extends object>(
  currentSettings: Settings,
  settingChanges: object,
): Settings {
  return mergeSettingRecords(
    currentSettings as Record<string, unknown>,
    settingChanges as Record<string, unknown>,
  ) as Settings
}

function mergeSettingRecords(
  currentSettings: Record<string, unknown>,
  settingChanges: Record<string, unknown>,
): Record<string, unknown> {
  const mergedSettings: Record<string, unknown> = {}
  for (const [settingName, currentSetting] of Object.entries(currentSettings)) {
    rejectUnsafeSettingName(settingName)
    // AI modified: configuration snapshots isolate every mutable plain branch, including nested arrays.
    mergedSettings[settingName] = isolatedSettingValue(currentSetting)
  }

  for (const [settingName, settingChange] of Object.entries(settingChanges)) {
    rejectUnsafeSettingName(settingName)
    const currentSetting = mergedSettings[settingName]
    // AI modified: plain setting branches are copied recursively to avoid leaking mutable config references.
    mergedSettings[settingName] = isMergeableSettingRecord(settingChange)
      ? mergeSettingRecords(isMergeableSettingRecord(currentSetting) ? currentSetting : {}, settingChange)
      : isolatedSettingValue(settingChange)
  }
  return mergedSettings
}

function isolatedSettingValue(setting: unknown): unknown {
  if (Array.isArray(setting)) {
    return setting.map(arraySetting => isolatedSettingValue(arraySetting))
  }
  if (isMergeableSettingRecord(setting)) {
    return mergeSettingRecords({}, setting)
  }
  return setting
}

function rejectUnsafeSettingName(settingName: string): void {
  // AI modified: vendor configuration must never be able to change an object's prototype chain.
  if (settingName === '__proto__' || settingName === 'prototype' || settingName === 'constructor') {
    throw new TypeError(`Unsupported settings key "${settingName}"`)
  }
}

function isMergeableSettingRecord(setting: unknown): setting is Record<string, unknown> {
  if (typeof setting !== 'object' || setting === null || Array.isArray(setting)) {
    return false
  }
  const prototype = Object.getPrototypeOf(setting)
  return prototype === Object.prototype || prototype === null
}
