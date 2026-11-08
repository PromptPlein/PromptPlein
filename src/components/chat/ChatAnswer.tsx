import { useMemo } from 'react';
import RichText from '@/components/optimizer/RichText';
import { splitAnswer } from '@/lib/chatFiles';
import { checkCode } from '@/lib/fileCheck';
import ChatFileCard from './ChatFileCard';

/** The grammars nldd-code-viewer highlights, keyed by the names a model writes after the backticks. */
const VIEWER_LANGUAGES: Record<string, string> = {
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  html: 'html',
  xml: 'xml',
  svg: 'xml',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  markdown: 'markdown',
  md: 'markdown',
  rust: 'rust',
  rs: 'rust',
  gherkin: 'gherkin',
  toml: 'toml',
  sql: 'sql',
  python: 'python',
  py: 'python',
};

/**
 * Een antwoord van de chat: gewone tekst via RichText, een HTML-pagina als
 * bestand (ChatFileCard) en ander code als blok met vaste letterbreedte. Zonder
 * deze splitsing werd een codeblok honderden losse alinea's, en een regel CSS
 * die met een streepje begint een opsommingsteken.
 */
export default function ChatAnswer({
  text,
  isStreaming,
  onRepair,
}: {
  text: string;
  isStreaming: boolean;
  /** Zie ChatFileCard: de gevonden fouten als nieuw bericht naar de AI. */
  onRepair?: (text: string) => void;
}) {
  const segments = useMemo(() => splitAnswer(text), [text]);

  return (
    <nldd-container gap="12">
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          const live = isStreaming && i === segments.length - 1;
          return (
            <RichText
              key={i}
              text={segment.text}
              variant="chat"
              streaming={live}
              trailing={live ? <WritingCursor /> : null}
            />
          );
        }
        if (segment.isHtmlFile) {
          return (
            <ChatFileCard
              key={i}
              code={segment.code}
              closed={segment.closed}
              isStreaming={isStreaming}
              onRepair={onRepair}
            />
          );
        }
        return (
          <nldd-container key={i} gap="4">
            <nldd-text size="xs" color="secondary">
              {segment.lang || 'code'}
            </nldd-text>
            {/* The copy button of the viewer only shows once the block is complete:
                halfway it would copy a cut-off text. */}
            <nldd-code-viewer
              language={VIEWER_LANGUAGES[segment.lang.toLowerCase()] ?? ''}
              max-height="384px"
              no-copy={!segment.closed || undefined}
            >
              {segment.code}
            </nldd-code-viewer>
            {segment.closed && <CodeCheck lang={segment.lang} code={segment.code} />}
          </nldd-container>
        );
      })}
    </nldd-container>
  );
}

/** Staat direct achter de laatste letter, dus het oog hoeft niet te zoeken. */
function WritingCursor() {
  return <nldd-icon icon="pencil" size="inherit" color="accent"></nldd-icon>;
}

/** De snelle controle onder een codeblok (JSON, JavaScript, SVG), als die er is. */
function CodeCheck({ lang, code }: { lang: string; code: string }) {
  const result = useMemo(() => checkCode(lang, code), [lang, code]);
  if (!result) return null;
  return (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-icon
        icon={result.ok ? 'shield-check-mark' : 'exclamation-triangle'}
        size="16"
        color={result.ok ? 'success' : 'critical'}
      ></nldd-icon>
      <nldd-text size="xs" color={result.ok ? 'success' : 'critical'}>
        {result.ok
          ? 'Gecontroleerd: geen fouten gevonden.'
          : `Fout${result.problems[0].line ? ` op regel ${result.problems[0].line}` : ''}: ${result.problems[0].message}`}
      </nldd-text>
    </nldd-container>
  );
}
