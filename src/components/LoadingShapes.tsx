type Props = {
  /**
   * One gray shape per line, with the classes of its height (and width, if
   * it is not the whole line): the size of what is going to appear.
   */
  shapes: readonly string[]
}

/**
 * While something loads (UX-26): gray shapes in the place of what is going
 * to appear, so the screen does not jump when it does. Screen readers hear
 * "Cargando". `data-loading` lets the capture script wait until it goes.
 */
export function LoadingShapes({ shapes }: Props) {
  return (
    <div role="status" data-loading="" className="flex flex-col gap-3">
      <span className="sr-only">Cargando</span>
      {shapes.map((shape, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`rounded-card bg-sunken ${shape}`}
        />
      ))}
    </div>
  )
}
