/** The long side of the uploaded photo, in pixels (spec §6.1). */
const MAX_SIDE = 1600
const JPEG_QUALITY = 0.85

/**
 * The chosen photo as a JPEG with its long side at most 1600 px (spec
 * §6.1): it weighs less and HEIC photos become JPEG. A smaller photo is not
 * enlarged. It decodes with an <img> and not createImageBitmap, which in
 * Safari has had bugs with the EXIF orientation. Throws if the photo cannot
 * be opened.
 */
export async function toResizedJpeg(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const { naturalWidth: width, naturalHeight: height } = image
    if (width === 0 || height === 0) throw new Error('Empty image')

    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('No canvas context')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob === null) reject(new Error('Could not encode the photo'))
          else resolve(blob)
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
