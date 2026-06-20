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
  openai: 'GPT-4 (OpenAI)',
  deepseek: 'DeepSeek',
  'local-template': 'Lokale template',
};

export default function OptimizedOutput({ result, onReset }: OptimizedOutputProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(result.optimized_content);
    setCopied(true);
    toast.success('Prompt-template gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Gegenereerde prompt-template
        </h3>
        <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          <Cpu size={12} /> {providerLabel[result.provider]}
        </span>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Kopieer deze template en plak hem in je eigen AI-chat. Vul de plekken tussen{' '}
        <span className="font-mono text-xs">[haakjes]</span> zelf aan met je eigen inhoud.
      </p>

      {result.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          {result.error}
        </div>
      )}

      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
