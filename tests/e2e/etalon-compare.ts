import sharp from "sharp";

// Etalon PDF screenshots are A4 at ~200 DPI.
export const ETALON_WIDTH = 1656;
export const ETALON_HEIGHT = 2339;

export type EtalonComparison = {
  diffRatio: number;
  actualPng: Buffer;
  diffPng: Buffer;
};

/**
 * Compare an app screenshot against an etalon image. Both are resized to the
 * etalon's native resolution, then compared pixel-by-pixel with a per-channel
 * tolerance. Returns the mismatch ratio plus the resized app PNG and a diff
 * visualisation (mismatching pixels painted red over a faded etalon).
 */
export async function compareToEtalon(
  appScreenshot: Buffer,
  etalonPath: string,
  perChannelTolerance = 64
): Promise<EtalonComparison> {
  const W = ETALON_WIDTH;
  const H = ETALON_HEIGHT;

  const etalonRaw = await sharp(etalonPath)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const actualPng = await sharp(appScreenshot)
    .resize(W, H, { fit: "fill" })
    .png()
    .toBuffer();

  const appRaw = await sharp(appScreenshot)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const diff = Buffer.alloc(W * H * 3);
  let mismatch = 0;

  for (let i = 0; i < etalonRaw.length; i += 3) {
    const dr = Math.abs(etalonRaw[i] - appRaw[i]);
    const dg = Math.abs(etalonRaw[i + 1] - appRaw[i + 1]);
    const db = Math.abs(etalonRaw[i + 2] - appRaw[i + 2]);

    if (dr > perChannelTolerance || dg > perChannelTolerance || db > perChannelTolerance) {
      mismatch++;
      diff[i] = 255;
      diff[i + 1] = 0;
      diff[i + 2] = 0;
    } else {
      // Fade matching areas to grey so the red diff stands out.
      const grey = (etalonRaw[i] + etalonRaw[i + 1] + etalonRaw[i + 2]) / 3;
      const v = 255 - Math.round((255 - grey) * 0.25);
      diff[i] = v;
      diff[i + 1] = v;
      diff[i + 2] = v;
    }
  }

  const diffPng = await sharp(diff, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toBuffer();

  return { diffRatio: mismatch / (W * H), actualPng, diffPng };
}
