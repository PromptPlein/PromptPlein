import { useState } from 'react';
import { Copy, Check, RotateCcw, Cpu } from 'lucide-react';
import toast from 'react-hot-toast';
import { copyToClipboard } from '@/lib/utils';
import type { OptimizeResult } from '@/types';

interface OptimizedOutputProps {
  result: OptimizeResult;
  onReset: () => void;
}

const providerLabel: Record<OptimizeResult['provider'], string> = {
  claude: 'Claude (Anthropic)',
  deepseek: 'DeepSeek (fallback)',
  'local-template': 'Lokale template',
};

export default function OptimizedOutput({ result, onReset }: OptimizedOutputProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(result.optimized_content);
    setCopied(true);
    toast.success('Geoptimaliseerde prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-rijksblauw-700">Geoptimaliseerde prompt</h3>
        <span className="opl-badge bg-slate-100 text-slate-600">
          <Cpu size={12} /> {providerLabel[result.provider]}
        </span>
      </div>

      {result.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {result.error}
        </div>
      )}

      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800">
        {result.optimized_content}
      </pre>

      <div className="flex items-center justify-end gap-3">
        <button className="opl-btn-secondary" onClick={onReset}>
          <RotateCcw size={16} /> Opnieuw
        </button>
        <button className="opl-btn-primary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Gekopieerd' : 'Kopieer prompt'}
        </button>
      </div>
    </div>
  );
}
