import sharp from 'sharp'

export const ETALON_WIDTH = 795
export const ETALON_HEIGHT = 1123
export const PIXEL_TOLERANCE = 64
export const MAX_SPATIAL_DISTANCE = 3

export interface EtalonComparison {
  diffRatio: number
  missingStructureRatio: number
  extraStructureRatio: number
  actualPng: Buffer
  diffPng: Buffer
}

const MIN_STRUCTURAL_RUN = 48

interface StructuralSegment { orientation: 'h' | 'v'; position: number; start: number; end: number }

function structuralSegments(raw: Buffer, width: number, height: number): StructuralSegment[] {
  const ink = new Uint8Array(width * height)
  for (let pixel = 0; pixel < ink.length; pixel += 1) {
    const index = pixel * 3
    ink[pixel] = raw[index] * 0.2126 + raw[index + 1] * 0.7152 + raw[index + 2] * 0.0722 < 210 ? 1 : 0
  }
  const segments: StructuralSegment[] = []
  const collect = (orientation: 'h' | 'v') => {
    const primary = orientation === 'h' ? height : width
    const secondary = orientation === 'h' ? width : height
    for (let position = 0; position < primary; position += 1) {
      let start = -1
      for (let cursor = 0; cursor <= secondary; cursor += 1) {
        const x = orientation === 'h' ? cursor : position
        const y = orientation === 'h' ? position : cursor
        const active = cursor < secondary && ink[y * width + x] === 1
        if (active && start < 0) start = cursor
        if ((!active || cursor === secondary) && start >= 0) {
          if (cursor - start >= MIN_STRUCTURAL_RUN) segments.push({ orientation, position, start, end: cursor - 1 })
          start = -1
        }
      }
    }
  }
  collect('h')
  collect('v')
  return segments
}

function collapseSegments(segments: StructuralSegment[]): StructuralSegment[] {
  const collapsed: StructuralSegment[] = []
  for (const segment of segments.sort((left, right) => left.orientation.localeCompare(right.orientation) || left.position - right.position || left.start - right.start)) {
    const previous = collapsed.at(-1)
    const overlap = previous && previous.orientation === segment.orientation && Math.min(previous.end, segment.end) - Math.max(previous.start, segment.start) >= MIN_STRUCTURAL_RUN * .8
    if (previous && overlap && Math.abs(previous.position - segment.position) <= 2) {
      previous.position = Math.round((previous.position + segment.position) / 2)
      previous.start = Math.min(previous.start, segment.start)
      previous.end = Math.max(previous.end, segment.end)
    } else collapsed.push({ ...segment })
  }
  return collapsed
}

function structuralSegmentRatio(source: StructuralSegment[], candidate: StructuralSegment[]): number {
  const available = candidate.map((segment) => ({ segment, used: false }))
  let unmatched = 0
  for (const expected of source) {
    const match = available.find((entry) => !entry.used
      && entry.segment.orientation === expected.orientation
      && Math.abs(entry.segment.position - expected.position) <= MAX_SPATIAL_DISTANCE
      && Math.min(entry.segment.end, expected.end) - Math.max(entry.segment.start, expected.start) >= MIN_STRUCTURAL_RUN * .8)
    if (match) match.used = true
    else unmatched += 1
  }
  return source.length === 0 ? 0 : unmatched / source.length
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

  return {
    diffRatio: mismatchCount / (ETALON_WIDTH * ETALON_HEIGHT),
    missingStructureRatio: structuralSegmentRatio(
      collapseSegments(structuralSegments(etalonRaw, ETALON_WIDTH, ETALON_HEIGHT)),
      collapseSegments(structuralSegments(actualRaw, ETALON_WIDTH, ETALON_HEIGHT)),
    ),
    extraStructureRatio: structuralSegmentRatio(
      collapseSegments(structuralSegments(actualRaw, ETALON_WIDTH, ETALON_HEIGHT)),
      collapseSegments(structuralSegments(etalonRaw, ETALON_WIDTH, ETALON_HEIGHT)),
    ),
    actualPng,
    diffPng,
  }
}
