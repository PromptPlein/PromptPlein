/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_OPTIMIZE_FUNCTION_URL?: string;
  readonly VITE_ADMIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Mammoth levert geen eigen typedefinities; een minimale shim voor het enige
// dat we gebruiken: platte tekst uit een .docx-arraybuffer halen.
declare module 'mammoth' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: unknown[];
  }>;
}
