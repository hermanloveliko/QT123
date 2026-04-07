import React, { useState } from "react";
import { Upload } from "lucide-react";
import { uploadSiteImage, uploadSiteVideo } from "../lib/admin-upload";

const zoneClass =
  "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-500 hover:border-industrial-blue/50 hover:bg-industrial-blue/5 transition-colors cursor-pointer";

export function AdminLocalImageField({
  label,
  hint,
  value,
  onChange,
  width,
  height,
  tolerance,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  width: number;
  height: number;
  tolerance: number;
}) {
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const url = await uploadSiteImage(f, width, height, tolerance);
      onChange(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {label ? <div className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</div> : null}
      <p className="text-[11px] text-gray-400 mb-2">本地上传，要求 {hint}（±{tolerance}px）</p>
      {value ? (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 max-h-40">
            <img src={value} alt="" className="w-full h-full object-contain max-h-40" />
          </div>
          <label className={`${zoneClass} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload size={18} className="text-industrial-blue" />
            <span>{busy ? "上传中…" : "重新上传"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPick} disabled={busy} />
          </label>
        </div>
      ) : (
        <label className={`${zoneClass} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload size={20} className="text-industrial-blue" />
          <span>{busy ? "上传中…" : "点击选择图片"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPick} disabled={busy} />
        </label>
      )}
    </div>
  );
}

export function AdminLocalVideoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const url = await uploadSiteVideo(f);
      onChange(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
      <p className="text-[11px] text-gray-400 mb-2">MP4 / WebM，单文件不超过 100MB（以服务端限制为准）</p>
      {value ? (
        <div className="space-y-2">
          <video src={value} className="w-full max-h-48 rounded-xl border border-gray-100 bg-black" controls muted playsInline />
          <label className={`${zoneClass} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload size={18} className="text-industrial-blue" />
            <span>{busy ? "上传中…" : "更换视频"}</span>
            <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={onPick} disabled={busy} />
          </label>
        </div>
      ) : (
        <label className={`${zoneClass} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload size={20} className="text-industrial-blue" />
          <span>{busy ? "上传中…" : "点击选择视频"}</span>
          <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={onPick} disabled={busy} />
        </label>
      )}
    </div>
  );
}
