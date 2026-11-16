import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  NOT_A_LABEL_MESSAGE,
  PHOTO_OPEN_ERROR_MESSAGE,
  PHOTO_UPLOAD_ERROR_MESSAGE,
  READ_ERROR_MESSAGE,
  VisionError,
  visionErrorMessage,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import { addToMealState, isFromMeal } from '../../../lib/mealHandoff.ts'
import { LabelFoodForm } from '../components/LabelFoodForm.tsx'
import { LabelReadError } from '../components/LabelReadError.tsx'
import { PhotoPickerButton } from '../components/PhotoPickerButton.tsx'
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
 * Opened from Inicio (spec §6.6, §14 #61), going back and cancelling return
 * to Inicio, and saving returns there with the food, which Inicio adds to
 * the meal. Opened from the catalog, they return to the catalog and saving
 * shows the food.
 */
export function NewLabelFoodPage() {
  const navigate = useNavigate()
  const fromMeal = isFromMeal(useLocation().state)
  const backTo = fromMeal ? '/' : '/foods'
  const uploadPhoto = useUploadLabelPhoto()
  const transcribe = useTranscribeLabel()
  const deletePhoto = useDeleteLabelPhoto()
  const [step, setStep] = useState<Step>({ kind: 'pick' })
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
    const attempt = attemptRef.current
    setPhoto(null)
    setStep({ kind: 'preparing' })
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
    <Link
      to={backTo}
      className="flex min-h-11 items-center self-start text-slate-700"
    >
      {fromMeal ? '← Inicio' : '← Mis alimentos'}
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
      className="max-h-[45vh] w-full rounded-lg object-contain"
    />
  )

  return (
    <section className="flex flex-col gap-4">
      {back}
      <h1 className="text-2xl font-semibold">Agregar con una foto</h1>

      {step.kind === 'pick' && (
        <>
          <p className="text-slate-700">
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
        <p aria-live="polite" className="text-slate-700">
          Preparando la foto…
        </p>
      )}

      {step.kind === 'open-failed' && (
        <>
          <p role="alert" className="text-red-700">
            {PHOTO_OPEN_ERROR_MESSAGE}
          </p>
          <PhotoPickerButton
            label="Sacar o elegir otra foto"
            onFile={(file) => void start(file)}
          />
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'uploading' && (
        <>
          {photoView}
          <p aria-live="polite" className="text-slate-700">
            Subiendo la foto…
          </p>
          <CancelButton onClick={cancel} />
        </>
      )}

      {step.kind === 'upload-failed' && (
        <>
          {photoView}
          <p role="alert" className="text-red-700">
            {PHOTO_UPLOAD_ERROR_MESSAGE}
          </p>
          {photo !== null && (
            <button
              type="button"
              className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
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
          {photoView}
          <p aria-live="polite" className="text-slate-700">
            Leyendo la etiqueta… Puede tardar unos segundos.
          </p>
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
    <button
      type="button"
      className="min-h-11 rounded-lg border border-slate-300 px-4 text-base"
      onClick={onClick}
    >
      Cancelar
    </button>
  )
}
