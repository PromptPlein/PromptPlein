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

// Expliciete icoon-map (geen `import *`, dat zou de hele icon-set bundelen).
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

/** Het icoon bij een categorie; een onbekende of lege naam geeft de map. */
export function categoryIcon(name?: string | null): LucideIcon {
  return CATEGORY_ICONS[name ?? 'Folder'] ?? Folder;
}
