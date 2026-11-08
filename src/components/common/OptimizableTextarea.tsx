import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { useAuth } from '@/context/AuthContext';
import { optimizeChatInput } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';

interface OptimizableTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Tooltip of the improve button. Defaults to the wording of the chat; a field
   * with another purpose may sharpen it.
   */
  optimizeTitle?: string;
}

type FieldElement = HTMLElement & { value?: string };

/**
 * A text field with the improve button of the chat input: one click and the AI
 * writes out what the user jotted down in keywords. The original text stays
 * one click away afterwards.
 *
 * Deliberately the same route as the chat (`optimizeChatInput`), so the same
 * system instruction from the admin portal and the same switch: when "sterretje
 * tonen" is off there, the button does not show here either.
 *
 * Only for signed-in users: the improvement runs on the chat gate of the edge
 * function, which asks for a session. Without one the button stays away rather
 * than failing on the first click.
 *
 * The forwarded ref reaches the native textarea inside the nldd field, for
 * callers that focus it or place the caret.
 */
const OptimizableTextarea = forwardRef<HTMLTextAreaElement, OptimizableTextareaProps>(
  function OptimizableTextarea(
    {
      value,
      onValueChange,
      optimizeTitle,
      disabled,
      id,
      rows,
      placeholder,
      maxLength,
      minLength,
      required,
      readOnly,
      name,
      autoComplete,
      onKeyDown,
      onFocus,
      onBlur,
      onPaste,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const { user } = useAuth();
    const fieldRef = useRef<FieldElement>(null);
    const [settings, setSettings] = useState<ChatSettings | null>(null);
    const [optimizing, setOptimizing] = useState(false);
    // The text from before the last improvement, with what came out. While the
    // field still holds exactly that result, the user can go back.
    const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
      null,
    );

    useNlddValue(fieldRef, value, onValueChange);

    useImperativeHandle(ref, () => {
      const inner = () => fieldRef.current?.shadowRoot?.querySelector('textarea') ?? null;
      return {
        focus: (options?: FocusOptions) => inner()?.focus(options),
        blur: () => inner()?.blur(),
        select: () => inner()?.select(),
        setSelectionRange: (start: number | null, end: number | null, direction?: 'forward' | 'backward' | 'none') =>
          inner()?.setSelectionRange(start, end, direction),
        get value() {
          return inner()?.value ?? value;
        },
      } as unknown as HTMLTextAreaElement;
    });

    useEffect(() => {
      let active = true;
      void getChatSettingsCached().then((s) => {
        if (active) setSettings(s);
      });
      return () => {
        active = false;
      };
    }, []);

    const available = Boolean(user) && Boolean(settings?.optimizeEnabled);
    const canOptimize = available && !disabled && !optimizing && value.trim().length > 0;
    // Only while the field still holds exactly the improved result; once the
    // user types on, "herstellen" means nothing any more.
    const canUndo = beforeOptimize !== null && value === beforeOptimize.after && !optimizing;

    async function optimize() {
      if (!settings || !canOptimize) return;
      const before = value;
      setOptimizing(true);
      try {
        const res = await optimizeChatInput({ text: before, settings });
        if (res.error) {
          notify.error(res.error);
          return;
        }
        if (!res.changed || !res.text.trim()) {
          notify('Je tekst was al duidelijk genoeg.', { icon: '✨' });
          return;
        }
        onValueChange(res.text);
        setBeforeOptimize({ before, after: res.text });
      } finally {
        setOptimizing(false);
      }
    }

    function undoOptimize() {
      if (!canUndo || !beforeOptimize) return;
      onValueChange(beforeOptimize.before);
      setBeforeOptimize(null);
    }

    return (
      <nldd-container gap="8">
        <nldd-multi-line-text-field
          ref={fieldRef}
          input-id={id}
          rows={rows}
          placeholder={placeholder}
          maxlength={maxLength !== undefined ? String(maxLength) : undefined}
          minlength={minLength !== undefined ? String(minLength) : undefined}
          required={required || undefined}
          readonly={readOnly || undefined}
          name={name}
          autocomplete={autoComplete}
          accessible-label={ariaLabel}
          disabled={disabled || optimizing || undefined}
          onKeyDown={onKeyDown as unknown as React.KeyboardEventHandler<HTMLElement>}
          onFocus={onFocus as unknown as React.FocusEventHandler<HTMLElement>}
          onBlur={onBlur as unknown as React.FocusEventHandler<HTMLElement>}
          onPaste={onPaste as unknown as React.ClipboardEventHandler<HTMLElement>}
        ></nldd-multi-line-text-field>

        {/* Shows once there is text, so an empty field stays calm. */}
        {available && (value.trim().length > 0 || optimizing) && !canUndo && (
          <nldd-container layout="row" horizontal-alignment="right">
            <nldd-tooltip
              text={
                optimizeTitle ??
                'Verbeter mijn tekst met AI; je oorspronkelijke tekst kun je daarna terughalen'
              }
            >
              <nldd-button
                appearance="neutral-tinted"
                size="sm"
                start-icon="sparkles"
                text="Verbeter met AI"
                accessible-label="Verbeter mijn tekst met AI"
                loading={optimizing || undefined}
                loading-text="Bezig met verbeteren"
                disabled={(!canOptimize && !optimizing) || undefined}
                onClick={() => void optimize()}
              ></nldd-button>
            </nldd-tooltip>
          </nldd-container>
        )}

        {/* After an improvement: one click back to the own text. Goes away as
            soon as the user types on. */}
        {canUndo && (
          <nldd-container layout="wrap" gap="8" vertical-alignment="center">
            <nldd-text size="xs" color="secondary">
              Je tekst is verbeterd. Lees hem na en pas gerust aan.
            </nldd-text>
            <nldd-button
              appearance="neutral-transparent"
              size="xs"
              start-icon="undo"
              text="Herstel mijn tekst"
              onClick={undoOptimize}
            ></nldd-button>
          </nldd-container>
        )}
      </nldd-container>
    );
  },
);

export default OptimizableTextarea;
