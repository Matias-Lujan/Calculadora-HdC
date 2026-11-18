/**
 * While the session is read (an instant): the paper background, without a
 * text that would flash, and "Cargando" for screen readers (UX-26).
 */
export function LoadingScreen() {
  return (
    <div role="status" data-loading="" className="min-h-dvh">
      <span className="sr-only">Cargando</span>
    </div>
  )
}
