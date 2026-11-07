import { Link } from 'react-router-dom';
import { HELP_PATH } from '@/lib/shortcuts';

export default function Footer() {
  return (
    <footer className="bg-rijksblauw-700 text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs sm:flex-row sm:px-6 lg:px-8">
        <p>Overheid Prompt Library. Niet voor verwerking van persoonsgegevens.</p>
        <Link to={HELP_PATH} className="opl-raak underline">
          Hulp bij toegankelijkheid
        </Link>
      </div>
    </footer>
  );
}
