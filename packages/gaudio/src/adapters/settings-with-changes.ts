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
  const mergedSettings: Record<string, unknown> = { ...currentSettings }
  for (const [settingName, settingChange] of Object.entries(settingChanges)) {
    const currentSetting = mergedSettings[settingName]
    // AI modified: plain setting branches are copied recursively to avoid leaking mutable config references.
    mergedSettings[settingName] = isMergeableSettingRecord(settingChange)
      ? mergeSettingRecords(isMergeableSettingRecord(currentSetting) ? currentSetting : {}, settingChange)
      : settingChange
  }
  return mergedSettings
}

function isMergeableSettingRecord(setting: unknown): setting is Record<string, unknown> {
  if (typeof setting !== 'object' || setting === null || Array.isArray(setting)) {
    return false
  }
  const prototype = Object.getPrototypeOf(setting)
  return prototype === Object.prototype || prototype === null
}
