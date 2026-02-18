const envUrl = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE = envUrl
  ? envUrl.replace(/\/+$/, "")
  : "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
