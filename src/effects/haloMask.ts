/** White/opaque mask pixels select the halo. The complement selects the body. */
export function splitMaskAlpha(image: Uint8ClampedArray, mask: Uint8ClampedArray, invert: boolean) {
  if (image.length !== mask.length || image.length % 4) throw new Error("蒙版尺寸不匹配");
  const body = new Uint8ClampedArray(image);
  const halo = new Uint8ClampedArray(image);
  for (let i = 0; i < image.length; i += 4) {
    const luminance = (mask[i] * 0.2126 + mask[i + 1] * 0.7152 + mask[i + 2] * 0.0722) / 255;
    const selected = (luminance * mask[i + 3]) / 255;
    const coverage = invert ? 1 - selected : selected;
    halo[i + 3] = Math.round(image[i + 3] * coverage);
    body[i + 3] = image[i + 3] - halo[i + 3];
  }
  return { body, halo };
}

export async function loadCharacterImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return image;
}

export function makeMaskedImages(image: HTMLImageElement, mask: HTMLImageElement, invert: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法读取蒙版");
  ctx.drawImage(image, 0, 0);
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  const selection = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const split = splitMaskAlpha(source.data, selection.data, invert);
  return [split.body, split.halo].map((pixels) => {
    const result = document.createElement("canvas");
    result.width = canvas.width;
    result.height = canvas.height;
    const output = result.getContext("2d");
    if (!output) throw new Error("无法创建蒙版纹理");
    const data = output.createImageData(result.width, result.height);
    data.data.set(pixels);
    output.putImageData(data, 0, 0);
    return result;
  });
}
