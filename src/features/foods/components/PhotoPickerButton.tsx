type Props = {
  label: string
  onFile: (file: File) => void
  /** The main action (filled) or a secondary one (with a border). */
  variant?: 'primary' | 'secondary'
}

const VARIANTS = {
  primary: 'bg-slate-900 font-medium text-white',
  secondary: 'border border-slate-300',
} as const

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
      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-base focus-within:outline-2 focus-within:outline-slate-500 ${VARIANTS[variant]}`}
    >
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
