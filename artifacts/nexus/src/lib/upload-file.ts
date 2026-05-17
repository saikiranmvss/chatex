export type UploadResult = {
  url: string;
  mediaType: string;
  mediaSize: number;
  mediaName: string;
};

export function getMessageTypeFromMime(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export async function uploadChatFile(file: File): Promise<UploadResult> {
  const token = localStorage.getItem("nexus_token");
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to upload file");
  }

  return res.json() as Promise<UploadResult>;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
