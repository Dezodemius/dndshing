import sharp from 'sharp'

export const ETALON_WIDTH = 1656
export const ETALON_HEIGHT = 2339
export const PIXEL_TOLERANCE = 64

export interface EtalonComparison {
  diffRatio: number
  actualPng: Buffer
  diffPng: Buffer
}

/**
 * Compare screenshots at the supplied A4 reference resolution. The source
 * images are PDF rasterisations, so this allows a fixed per-channel font and
 * anti-aliasing tolerance while still exposing structural changes.
 */
export async function compareToEtalon(
  appScreenshot: Buffer,
  etalonPath: string,
  perChannelTolerance = PIXEL_TOLERANCE,
): Promise<EtalonComparison> {
  const etalonRaw = await sharp(etalonPath)
    .resize(ETALON_WIDTH, ETALON_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()
  const actualPng = await sharp(appScreenshot)
    .resize(ETALON_WIDTH, ETALON_HEIGHT, { fit: 'fill' })
    .png()
    .toBuffer()
  const actualRaw = await sharp(appScreenshot)
    .resize(ETALON_WIDTH, ETALON_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()

  const diff = Buffer.alloc(ETALON_WIDTH * ETALON_HEIGHT * 3)
  let mismatchCount = 0
  for (let index = 0; index < etalonRaw.length; index += 3) {
    const differs =
      Math.abs(etalonRaw[index] - actualRaw[index]) > perChannelTolerance ||
      Math.abs(etalonRaw[index + 1] - actualRaw[index + 1]) > perChannelTolerance ||
      Math.abs(etalonRaw[index + 2] - actualRaw[index + 2]) > perChannelTolerance
    if (differs) {
      mismatchCount += 1
      diff[index] = 255
      diff[index + 1] = 0
      diff[index + 2] = 0
      continue
    }

    const grey = (etalonRaw[index] + etalonRaw[index + 1] + etalonRaw[index + 2]) / 3
    const faded = 255 - Math.round((255 - grey) * 0.25)
    diff[index] = faded
    diff[index + 1] = faded
    diff[index + 2] = faded
  }

  const diffPng = await sharp(diff, {
    raw: { width: ETALON_WIDTH, height: ETALON_HEIGHT, channels: 3 },
  })
    .png()
    .toBuffer()

  return { diffRatio: mismatchCount / (ETALON_WIDTH * ETALON_HEIGHT), actualPng, diffPng }
}
