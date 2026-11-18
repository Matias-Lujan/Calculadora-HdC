import { ChevronLeft } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Notice } from '../../../components/Notice.tsx'
import { PhotoPickerButton } from '../../../components/PhotoPickerButton.tsx'
import { backLink, button, pageTitle } from '../../../components/styles.ts'
import {
  NOT_A_LABEL_MESSAGE,
  PHOTO_OPEN_ERROR_MESSAGE,
  PHOTO_UPLOAD_ERROR_MESSAGE,
  READ_ERROR_MESSAGE,
  VisionError,
  visionErrorMessage,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  heldLabelPhoto,
  releaseLabelPhoto,
} from '../../../lib/labelPhotoHandoff.ts'
import {
  FROM_MEAL_STATE,
  addToMealState,
  isFromMeal,
} from '../../../lib/mealHandoff.ts'
import { LabelFoodForm } from '../components/LabelFoodForm.tsx'
import { LabelProgress } from '../components/LabelProgress.tsx'
import { LabelReadError } from '../components/LabelReadError.tsx'
import { toResizedJpeg } from '../photo.ts'
import {
  useDeleteLabelPhoto,
  useTranscribeLabel,
  useUploadLabelPhoto,
} from '../queries.ts'
import type { Transcription } from '../transcription.ts'

/** The resized JPEG, and a local URL to show it without downloading it. */
type LocalPhoto = { blob: Blob; url: string }

type Step =
  | { kind: 'pick' }
  | { kind: 'preparing' }
  | { kind: 'open-failed' }
  | { kind: 'uploading' }
  | { kind: 'upload-failed' }
  | { kind: 'reading'; path: string }
  | { kind: 'read-failed'; path: string; error: unknown }
  | { kind: 'not-a-label'; path: string; observation: string | null }
  | { kind: 'confirm'; path: string; transcription: Transcription | null }

/** The uploaded photo of a step, if any (to delete it on cancel). */
function uploadedPath(step: Step): string | null {
  return 'path' in step ? step.path : null
}

/**
 * New food from the photo of its label (spec §6.1, §9.4): take or pick the
 * photo, resize it, upload it, read it, and confirm. Reading errors offer
 * loading the data by hand, with the photo in sight.
 *
 * The buttons that open it ("Con foto" in Inicio, "Agregar con una foto" in
 * "Mis alimentos") open the camera or the gallery in the same tap, and the
 * screen starts with that photo (UX-16, src/lib/labelPhotoHandoff.ts).
 * Without one (a reload, a typed URL), it asks for the photo first.
 *
 * Opened from Inicio (spec §6.6, §14 #61), going back and cancelling return
 * to Inicio, and saving returns there with the food, which Inicio adds to
 * the meal. Opened from the catalog, they return to the catalog and saving
 * shows the food.
 */
export function NewLabelFoodPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromMeal = isFromMeal(location.state)
  const backTo = fromMeal ? '/' : '/foods'
  const uploadPhoto = useUploadLabelPhoto()
  const transcribe = useTranscribeLabel()
  const deletePhoto = useDeleteLabelPhoto()
  // The photo picked with the button that opened the screen, if any.
  const [pickedFile] = useState(() => heldLabelPhoto(location.state))
  const [step, setStep] = useState<Step>(() =>
    pickedFile === null ? { kind: 'pick' } : { kind: 'preparing' },
  )
  const [photo, setPhoto] = useState<LocalPhoto | null>(null)
  // Each new photo (or leaving the screen) starts a new attempt: what an
  // older one finishes afterwards is ignored, and a photo it uploads late
  // is deleted.
  const attemptRef = useRef(0)

  // The local URL lives while its photo is shown.
  useEffect(() => {
    if (photo === null) return
    return () => URL.revokeObjectURL(photo.url)
  }, [photo])

  // Leaving the screen ends the current attempt.
  useEffect(
    () => () => {
      attemptRef.current += 1
    },
    [],
  )

  async function read(path: string, attempt: number) {
    setStep({ kind: 'reading', path })
    try {
      const transcription = await transcribe.mutateAsync(path)
      if (attempt !== attemptRef.current) return
      setStep(
        transcription.is_nutrition_label
          ? { kind: 'confirm', path, transcription }
          : {
              kind: 'not-a-label',
              path,
              observation: transcription.observations?.trim() || null,
            },
      )
    } catch (error) {
      if (attempt === attemptRef.current) {
        setStep({ kind: 'read-failed', path, error })
      }
    }
  }

  async function upload(blob: Blob, attempt: number) {
    setStep({ kind: 'uploading' })
    let path: string
    try {
      path = await uploadPhoto.mutateAsync(blob)
    } catch {
      if (attempt === attemptRef.current) setStep({ kind: 'upload-failed' })
      return
    }
    if (attempt !== attemptRef.current) {
      deletePhoto.mutate(path)
      return
    }
    await read(path, attempt)
  }

  async function start(file: File) {
    const previous = uploadedPath(step)
    if (previous !== null) deletePhoto.mutate(previous)
    attemptRef.current += 1
    setPhoto(null)
    setStep({ kind: 'preparing' })
    await prepare(file, attemptRef.current)
  }

  async function prepare(file: File, attempt: number) {
    let blob: Blob
    try {
      blob = await toResizedJpeg(file)
    } catch {
      if (attempt === attemptRef.current) setStep({ kind: 'open-failed' })
      return
    }
    if (attempt !== attemptRef.current) return
    setPhoto({ blob, url: URL.createObjectURL(blob) })
    await upload(blob, attempt)
  }

  // The photo picked before opening the screen starts the first attempt,
  // once. Its mark leaves the navigation state (without a new entry), so
  // going back or forward to this entry does not upload it again. (In
  // development, React runs effects twice: the first attempt ends with the
  // effect above and the second one goes on with the same photo.)
  const startPicked = useEffectEvent(() => {
    if (pickedFile === null) return
    releaseLabelPhoto()
    void navigate('/foods/label', {
      replace: true,
      state: fromMeal ? FROM_MEAL_STATE : null,
      preventScrollReset: true,
    })
    // The screen already starts in "Preparando", without a photo.
    attemptRef.current += 1
    void prepare(pickedFile, attemptRef.current)
  })
  useEffect(() => {
    startPicked()
  }, [])

  // Cancel deletes the uploaded photo without waiting (spec §6.1).
  function cancel() {
    const path = uploadedPath(step)
    if (path !== null) deletePhoto.mutate(path)
    attemptRef.current += 1
    void navigate(backTo)
  }

  function saved(food: Food) {
    if (fromMeal) {
      void navigate('/', { replace: true, state: addToMealState(food) })
    } else {
      void navigate(`/foods/${food.id}`, { replace: true })
    }
  }

  const back = (
    <Link to={backTo} className={backLink}>
      <ChevronLeft aria-hidden="true" className="shrink-0" />
      {fromMeal ? 'Inicio' : 'Mis alimentos'}
    </Link>
  )

  if (step.kind === 'confirm' && photo !== null) {
    return (
      <section className="flex flex-col gap-4">
        {back}
        <LabelFoodForm
          photoUrl={photo.url}
          photoPath={step.path}
          transcription={step.transcription}
          onCancel={cancel}
          onSaved={saved}
        />
      </section>
    )
  }

  const photoView = photo !== null && (
    <img
      src={photo.url}
      alt="Foto de la etiqueta"
      className="max-h-[45vh] w-full rounded-control object-contain"
    />
  )

  return (
    <section className="flex flex-col gap-4">
      {back}
      <h1 className={pageTitle}>Agregar con una foto</h1>

      {step.kind === 'pick' && (
        <>
          <p>
            Sacale una foto a la tabla nutricional del paquete; si entra,
            también al nombre.
          </p>
          <PhotoPickerButton
            label="Sacar o elegir la foto"
            onFile={(file) => void start(file)}
          />
        </>
      )}

      {step.kind === 'preparing' && (
        <>
          <LabelProgress current="preparing" />
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'open-failed' && (
        <>
          <Notice tone="error" role="alert">
            <p>{PHOTO_OPEN_ERROR_MESSAGE}</p>
          </Notice>
          <PhotoPickerButton
            label="Sacar o elegir otra foto"
            onFile={(file) => void start(file)}
          />
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'uploading' && (
        <>
          <LabelProgress current="uploading" />
          {photoView}
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'upload-failed' && (
        <>
          {photoView}
          <Notice tone="error" role="alert">
            <p>{PHOTO_UPLOAD_ERROR_MESSAGE}</p>
          </Notice>
          {photo !== null && (
            <button
              type="button"
              className={button.primary}
              onClick={() => void upload(photo.blob, attemptRef.current)}
            >
              Reintentar
            </button>
          )}
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'reading' && (
        <>
          <LabelProgress current="reading" />
          {/* A band of light goes over the photo while it is read (UX-22),
              only without "Reducir movimiento". */}
          <div className="relative overflow-hidden rounded-control">
            {photoView}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 hidden h-1/4 bg-linear-to-b from-transparent via-on-display/45 to-transparent motion-safe:block motion-safe:animate-scan"
            />
          </div>
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'read-failed' && (
        <>
          {photoView}
          <ReadFailure
            error={step.error}
            onManual={() =>
              setStep({ kind: 'confirm', path: step.path, transcription: null })
            }
            onRetry={() => void read(step.path, attemptRef.current)}
            onRetake={(file) => void start(file)}
            onCancel={cancel}
          />
        </>
      )}

      {step.kind === 'not-a-label' && (
        <>
          {photoView}
          <LabelReadError
            message={NOT_A_LABEL_MESSAGE}
            observation={step.observation}
            onRetake={(file) => void start(file)}
            onManual={() =>
              setStep({ kind: 'confirm', path: step.path, transcription: null })
            }
            onCancel={cancel}
          />
        </>
      )}
    </section>
  )
}

type ReadFailureProps = {
  error: unknown
  onManual: () => void
  onRetry: () => void
  onRetake: (file: File) => void
  onCancel: () => void
}

/**
 * A failed reading (spec §9.3, §9.4): an expected error with its message,
 * and "Reintentar" only if it can be retried; anything else is unexpected,
 * with the generic message and "Reintentar". A photo that could not be read
 * (INVALID_REQUEST) offers taking another one.
 */
function ReadFailure({
  error,
  onManual,
  onRetry,
  onRetake,
  onCancel,
}: ReadFailureProps) {
  const expected = error instanceof VisionError ? error : null
  const retryable = expected === null || expected.retryable
  return (
    <LabelReadError
      message={
        expected === null
          ? READ_ERROR_MESSAGE
          : visionErrorMessage(expected.code)
      }
      onManual={onManual}
      onRetry={retryable ? onRetry : undefined}
      onRetake={expected?.code === 'INVALID_REQUEST' ? onRetake : undefined}
      onCancel={onCancel}
    />
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={button.secondary} onClick={onClick}>
      Cancelar
    </button>
  )
}
