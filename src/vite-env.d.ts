// Types for the Vite env variables used by the app. The base types come
// from "vite/client" (tsconfig.app.json, compilerOptions.types).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Makes import.meta.env reject variables not declared above.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}
