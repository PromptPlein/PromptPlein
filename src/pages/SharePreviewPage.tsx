import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Check, Library, Eye, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getShareByToken, trackShareView } from '@/services/shareService';
import { getPrompt } from '@/services/repository';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { copyToClipboard, formatDate, sharingBadgeClasses, sharingLabel } from '@/lib/utils';
import type { EmailShare, Prompt } from '@/types';

export default function SharePreviewPage() {
  const { token } = useParams<{ token: string }>();
  const { categoryById, roleById } = useReferenceData();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [share, setShare] = useState<EmailShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const s = await getShareByToken(token);
      if (!active) return;
      setShare(s);
      if (s) {
        await trackShareView(token);
        const p = await getPrompt(s.prompt_id);
        if (active) setPrompt(p);
      }
    })().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  async function copy() {
    if (!prompt) return;
    await copyToClipboard(prompt.content);
    setCopied(true);
    toast.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!share || !prompt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-rijksblauw-700">Link niet gevonden</h1>
        <p className="mt-2 text-slate-600">
          Deze deel-link bestaat niet (meer) of is verlopen.
        </p>
        <Link to="/" className="opl-btn-primary mt-6 inline-flex">
          Naar de bibliotheek
        </Link>
      </div>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Library size={18} className="text-rijksblauw-500" />
        Gedeelde prompt
        <span className="ml-auto inline-flex items-center gap-1 text-xs">
          <Eye size={13} /> {share.view_count + 1} weergaven
        </span>
      </div>

      <div className="opl-card p-6">
        <h1 className="text-2xl font-bold text-rijksblauw-700">{prompt.title}</h1>
        {prompt.description && <p className="mt-2 text-slate-600">{prompt.description}</p>}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {category && <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700">{category.name}</span>}
          {role && <span className="opl-badge bg-slate-100 text-slate-600">{role.name}</span>}
          <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
            {sharingLabel(prompt.sharing_level)}
          </span>
        </div>

        <div className="mt-5 mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Prompt-inhoud</h2>
          <button onClick={copy} className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700">
            {copied ? <Check size={14} /> : <Copy size={14} />} Kopiëren
          </button>
        </div>
        <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800">
          {prompt.content}
        </pre>

        <p className="mt-4 text-xs text-slate-400">
          Gedeeld door {share.shared_by || 'een collega'} · {formatDate(share.shared_at)}
        </p>
      </div>

      <div className="mt-4 text-center">
        <Link to={`/prompt/${prompt.id}`} className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700">
          Open in de bibliotheek <ExternalLink size={14} />
        </Link>
      </div>
    </div>
  );
}
