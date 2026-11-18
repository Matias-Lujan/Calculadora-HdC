import { Camera } from 'lucide-react'
import { button } from './styles.ts'

type Props = {
  label: string
  onFile: (file: File) => void
  /** The main action (filled) or a secondary one (with a border). */
  variant?: 'primary' | 'secondary'
  /** What VoiceOver says, if it is not the visible label. */
  accessibleName?: string
  /** Width and alignment where it is used (shrink-0, w-full). */
  className?: string
}

/**
 * A button that takes a photo or picks one from the gallery (spec §6.1):
 * on iOS, `<input type="file" accept="image/*">` offers both. The input is
 * inside the label, so the user's own tap opens the picker, as iOS needs.
 * The value is cleared after each pick, so the same photo can be picked
 * again; if no photo is picked, nothing happens. Inside a disabled
 * fieldset, the input is disabled and the button looks it.
 */
export function PhotoPickerButton({
  label,
  onFile,
  variant = 'primary',
  accessibleName,
  className,
}: Props) {
  return (
    <label
      className={`${button[variant]} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent has-disabled:cursor-default has-disabled:opacity-60${className === undefined ? '' : ` ${className}`}`}
    >
      <Camera aria-hidden="true" className="shrink-0" />
      {label}
      <input
        type="file"
        accept="image/*"
        aria-label={accessibleName}
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
