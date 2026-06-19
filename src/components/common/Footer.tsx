import { isSupabaseConfigured } from '@/lib/supabase';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:px-6 lg:px-8">
        <p>Overheid Prompt Library — Phase 1 MVP. Niet voor verwerking van persoonsgegevens.</p>
        <p className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isSupabaseConfigured ? 'bg-rijksgroen' : 'bg-rijksoranje'
            }`}
          />
          {isSupabaseConfigured ? 'Verbonden met Supabase' : 'Lokale demo-modus (localStorage)'}
        </p>
      </div>
    </footer>
  );
}
