const backgroundKey = "neoarchive:home-background:v1";

export function getHomeBackground(): string | null {
  try {
    return window.localStorage.getItem(backgroundKey);
  } catch {
    return null;
  }
}

export function setHomeBackground(dataUrl: string): void {
  try {
    window.localStorage.setItem(backgroundKey, dataUrl);
  } catch {
    // ignore (可能超出配额)
  }
}

export function clearHomeBackground(): void {
  try {
    window.localStorage.removeItem(backgroundKey);
  } catch {
    // ignore
  }
}

/** 读取图片并压缩为不超过 maxDim 的 JPEG data URL，便于持久化且不占用太多空间。 */
export function readImageAsDataUrl(file: File, maxDim = 1920): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("无法处理图片"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片文件"));
    };
    image.src = url;
  });
}
