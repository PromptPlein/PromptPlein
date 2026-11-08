import {
  FileText,
  Megaphone,
  Scale,
  BarChart3,
  Mail,
  Users,
  Search,
  Folder,
  type LucideIcon,
} from '@/components/common/icons';

// The database stores a category icon by its lucide name. These maps translate
// that name; an explicit map, not `import *`, which would bundle the whole set.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  FileText,
  Megaphone,
  Scale,
  BarChart3,
  Mail,
  Users,
  Search,
  Folder,
};

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

/** Het icoon bij een categorie; een onbekende of lege naam geeft de map. */
export function categoryIcon(name?: string | null): LucideIcon {
  return CATEGORY_ICONS[name ?? 'Folder'] ?? Folder;
}

/** The nldd icon name for a category; an unknown or empty name gives the folder. */
export function categoryIconName(name?: string | null): string {
  return CATEGORY_ICON_NAMES[name ?? 'Folder'] ?? 'folder';
}
