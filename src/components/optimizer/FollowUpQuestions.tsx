import type { Technique } from '@/types';

interface FollowUpQuestionsProps {
  technique: Technique;
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
}

export default function FollowUpQuestions({
  technique,
  answers,
  onChange,
}: FollowUpQuestionsProps) {
  if (technique.follow_up_questions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">Deze techniek heeft geen vervolgvragen.</p>
    );
  }

  return (
    <div className="space-y-4">
      {technique.follow_up_questions.map((q) => (
        <div key={q.id}>
          <label className="opl-label" htmlFor={`fu-${q.id}`}>
            {q.label}
          </label>
          <textarea
            id={`fu-${q.id}`}
            className="opl-input min-h-[64px] resize-y"
            value={answers[q.id] ?? ''}
            placeholder={q.placeholder}
            onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
