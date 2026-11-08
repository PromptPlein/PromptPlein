// The database stores a category icon by its old lucide name; this maps it to
// the nldd icon with the same meaning.
const CATEGORY_ICON_NAMES: Record<string, string> = {
  FileText: 'file-text',
  Megaphone: 'megaphone',
  Scale: 'paragraph-sign',
  BarChart3: 'bar-chart',
  Mail: 'envelope',
  Users: 'users',
  Search: 'search',
  Folder: 'folder',
};

/** The nldd icon name for a category; an unknown or empty name gives the folder. */
export function categoryIconName(name?: string | null): string {
  return CATEGORY_ICON_NAMES[name ?? 'Folder'] ?? 'folder';
}
