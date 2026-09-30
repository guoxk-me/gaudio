export interface DocumentationTocLink {
  id: string
  text: string
  depth: number
  children?: DocumentationTocLink[]
}

export interface DocumentationNavigationLink {
  label: string
  path: string
}

export interface DocumentationNavigationGroup {
  label: string
  links: DocumentationNavigationLink[]
}
