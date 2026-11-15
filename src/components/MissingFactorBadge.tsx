/** Marks a food eaten cooked whose yield (cooking factor) is not loaded yet. */
export function MissingFactorBadge() {
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      Falta cuánto rinde
    </span>
  )
}
