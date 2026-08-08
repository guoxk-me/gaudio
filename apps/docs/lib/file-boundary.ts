import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function isWithinDirectory(directoryPath: string, candidatePath: string): boolean {
  const pathWithinDirectory = relative(directoryPath, candidatePath)

  return pathWithinDirectory !== '..'
    && !pathWithinDirectory.startsWith(`..${sep}`)
    && !isAbsolute(pathWithinDirectory)
}

// AI modified: resolve files before reading so an in-tree symlink cannot escape its trusted directory.
export async function realpathWithinDirectory(
  resolvedDirectoryPath: string,
  candidatePath: string,
  fileDescription: string,
): Promise<string> {
  const absoluteCandidatePath = resolve(candidatePath)

  if (!isWithinDirectory(resolvedDirectoryPath, absoluteCandidatePath)) {
    throw new Error(`${fileDescription} is outside its allowed directory.`)
  }

  const resolvedCandidatePath = await realpath(absoluteCandidatePath)

  if (!isWithinDirectory(resolvedDirectoryPath, resolvedCandidatePath)) {
    throw new Error(`${fileDescription} resolves outside its allowed directory.`)
  }

  return resolvedCandidatePath
}
