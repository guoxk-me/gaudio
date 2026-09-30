export function useDocumentationSearch() {
  const isSearchOpen = useState('documentation-search-open', () => false)

  function openSearch(): void {
    isSearchOpen.value = true
  }

  function closeSearch(): void {
    isSearchOpen.value = false
  }

  return { closeSearch, isSearchOpen, openSearch }
}
