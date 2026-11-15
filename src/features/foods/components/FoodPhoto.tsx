import { PHOTO_LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useLabelPhotoUrl } from '../queries.ts'

type Props = {
  path: string
}

/** The label photo of a food, with a signed URL (spec §6.5, §7.4). */
export function FoodPhoto({ path }: Props) {
  const url = useLabelPhotoUrl(path)

  if (url.data !== undefined) {
    return (
      <img
        src={url.data}
        alt="Foto de la etiqueta"
        className="max-h-[45vh] w-full rounded-lg object-contain"
      />
    )
  }
  if (url.isError) {
    return <p className="text-sm text-slate-600">{PHOTO_LOAD_ERROR_MESSAGE}</p>
  }
  return (
    <div
      aria-hidden="true"
      className="h-48 w-full animate-pulse rounded-lg bg-slate-100"
    />
  )
}
