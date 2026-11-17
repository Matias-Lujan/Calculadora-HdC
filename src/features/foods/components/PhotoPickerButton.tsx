import { Camera } from 'lucide-react'
import { button } from '../../../components/styles.ts'

type Props = {
  label: string
  onFile: (file: File) => void
  /** The main action (filled) or a secondary one (with a border). */
  variant?: 'primary' | 'secondary'
}

/**
 * A button that takes a photo or picks one from the gallery (spec §6.1):
 * on iOS, `<input type="file" accept="image/*">` offers both. The input is
 * inside the label, so the user's own tap opens the picker, as iOS needs.
 * The value is cleared after each pick, so the same photo can be picked
 * again.
 */
export function PhotoPickerButton({
  label,
  onFile,
  variant = 'primary',
}: Props) {
  return (
    <label
      className={`${button[variant]} cursor-pointer focus-within:outline-2 focus-within:outline-accent`}
    >
      <Camera aria-hidden="true" />
      {label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) onFile(file)
        }}
      />
    </label>
  )
}
