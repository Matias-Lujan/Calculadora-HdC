// Minimal declaration of the Deno globals the Edge Functions use, so that
// `npm run typecheck` (tsconfig.functions.json) can check index.ts with tsc.
// Supabase runs the functions on Deno, which provides the real ones.

declare namespace Deno {
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): unknown
  const env: {
    get(key: string): string | undefined
  }
}
