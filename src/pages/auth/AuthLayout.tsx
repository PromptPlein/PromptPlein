import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/** Gedeelde, gecentreerde kaart-layout voor de auth-pagina's. */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rijksblauw-500 text-white">
        <ShieldCheck size={28} />
      </span>
      <h1 className="text-2xl font-bold text-rijksblauw-700">{title}</h1>
      {subtitle && <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>}

      <div className="mt-6 w-full">{children}</div>

      {footer && <div className="mt-4 w-full text-center text-sm text-slate-500">{footer}</div>}

      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={14} /> Terug naar de app
      </Link>
    </div>
  );
}
