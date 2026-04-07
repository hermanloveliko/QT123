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

async function postForm(path: string, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: fd,
  });
  if (!r.ok) {
    let msg = "上传失败";
    try {
      const j = (await r.json()) as { message?: string };
      msg = j?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await r.json()) as { url: string };
  return { url: normalizeUploadUrl(data.url) };
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

/** 关于我们 hero 等：视频上传（服务端校验类型与大小） */
export async function uploadSiteVideo(file: File): Promise<string> {
  const { url } = await postForm("/api/admin/upload-video", file);
  return url;
}
