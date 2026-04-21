import { API_BASE } from "./api";

export function normalizeUploadUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${API_BASE.replace(/\/$/, "")}${url}`;
  return url;
}

export async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("无法读取图片尺寸"));
    };
    img.src = objUrl;
  });
}

export function assertImageSize(
  width: number,
  height: number,
  expectW: number,
  expectH: number,
  tolerance: number,
): void {
  const dw = Math.abs(width - expectW);
  const dh = Math.abs(height - expectH);
  if (dw > tolerance || dh > tolerance) {
    throw new Error(`图片尺寸需为 ${expectW}×${expectH} px（允许 ±${tolerance}），当前为 ${width}×${height}`);
  }
}

async function postForm(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const token = localStorage.getItem("admin_token");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.withCredentials = true;
    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { url: string };
          resolve({ url: normalizeUploadUrl(data.url) });
        } catch {
          reject(new Error("上传失败：响应解析错误"));
        }
      } else {
        let msg = "上传失败";
        try {
          const j = JSON.parse(xhr.responseText) as { message?: string };
          msg = j?.message || msg;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("上传失败：网络错误"));
    xhr.ontimeout = () => reject(new Error("上传超时"));
    xhr.timeout = 300000; // 5 分钟
    xhr.send(fd);
  });
}

/** 站点配置用：校验尺寸后上传 */
export async function uploadSiteImage(
  file: File,
  expectW: number,
  expectH: number,
  tolerance: number,
): Promise<string> {
  const { width, height } = await readImageDimensions(file);
  assertImageSize(width, height, expectW, expectH, tolerance);
  const { url } = await postForm("/api/admin/upload", file);
  return url;
}

/** 关于我们 hero 等：视频上传（服务端校验类型与大小），支持进度回调 */
export async function uploadSiteVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { url } = await postForm("/api/admin/upload-video", file, onProgress);
  return url;
}
