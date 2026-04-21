const STORAGE_KEY = "qt_admin_entry_unlocked";

export function getAdminEntrySecret(): string {
  return String((import.meta as any).env?.VITE_ADMIN_ENTRY_SECRET || "").trim();
}

export function isAdminEntryUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockAdminEntry(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function lockAdminEntry(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * If URL contains `?admin_key=...` and matches secret, unlock for this tab session.
 * Returns true if unlock happened.
 */
export function consumeAdminEntryUnlockFromUrl(): boolean {
  const secret = getAdminEntrySecret();
  if (!secret) return false;
  try {
    const url = new URL(window.location.href);
    const key = String(url.searchParams.get("admin_key") || "");
    if (!key) return false;
    if (key !== secret) return false;
    unlockAdminEntry();
    url.searchParams.delete("admin_key");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    return true;
  } catch {
    return false;
  }
}

export function shouldExposeAdminUi(): boolean {
  const secret = getAdminEntrySecret();
  if (!secret) return import.meta.env.DEV;
  return isAdminEntryUnlocked();
}
