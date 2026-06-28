import { getVersion } from "@tauri-apps/api/app";

const FEED_URL = "https://github.com/riiimparm/FastTask/releases.atom";

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, "").split(".").map(Number);
}

function isNewer(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv !== cv) return rv > cv;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const current = await getVersion();
    const res = await fetch(FEED_URL);
    if (!res.ok) return null;
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const entry = xml.querySelector("entry");
    if (!entry) return null;
    const title = entry.querySelector("title")?.textContent?.trim() ?? "";
    const releaseUrl = entry.querySelector("link")?.getAttribute("href") ?? "";
    if (!title || !isNewer(title, current)) return null;
    return { version: title.replace(/^v/, ""), releaseUrl };
  } catch {
    return null;
  }
}
