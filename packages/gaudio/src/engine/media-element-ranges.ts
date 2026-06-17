import type { TimeRange } from './audio-engine-types'

export function mediaTimeRanges(timeRanges: TimeRanges): readonly TimeRange[] {
  const ranges: TimeRange[] = []
  for (let index = 0; index < timeRanges.length; index += 1) {
    ranges.push({
      start: timeRanges.start(index),
      end: timeRanges.end(index),
    })
  }
  return ranges
}
