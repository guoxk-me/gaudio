import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const generatedApiRoot = resolve(import.meta.dirname, '../../api')

async function apiMarkdownFiles(directory: string): Promise<string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const markdownFiles = await Promise.all(directoryEntries.map(async (directoryEntry: Dirent) => {
    const entryPath = resolve(directory, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      return apiMarkdownFiles(entryPath)
    }

    return directoryEntry.isFile() && directoryEntry.name.endsWith('.md') ? [entryPath] : []
  }))

  return markdownFiles.flat()
}

export default {
  async paths() {
    const markdownFiles = await apiMarkdownFiles(generatedApiRoot)

    // AI modified: mirror generated declaration pages under /zh/api so locale switches never target a dead route.
    return Promise.all(markdownFiles.map(async (markdownFile) => {
      const apiPath = relative(generatedApiRoot, markdownFile)
        .split(sep)
        .join('/')
        .replace(/\.md$/, '')
      const generatedContent = (await readFile(markdownFile, 'utf8'))
        .replaceAll('](/api/', '](/zh/api/')
        .replaceAll('](/guide/api-reference)', '](/zh/guide/api-reference)')

      return {
        params: { path: apiPath },
        content: generatedContent,
      }
    }))
  },
}
