/** How long the editors wait before retrying a save that failed unexpectedly. */
export const RETRY_DELAY_MS = 1500;

export const CONNECTION_MESSAGE =
  "Couldn't reach the server. Check the internet connection; your work is still on screen.";

/**
 * Runs a Server Action from an editor. If the request itself fails (a dropped
 * connection, a timeout), the editor gets an ordinary error result instead of
 * an exception, so it can say "Not saved" and offer to try again rather than
 * showing "Saving…" forever.
 */
export async function callAction<T>(action: () => Promise<T>): Promise<T | { ok: false; reason: "error"; message: string }> {
  try {
    return await action();
  } catch (error) {
    console.error("[editor] request failed:", error);
    return { ok: false, reason: "error", message: CONNECTION_MESSAGE };
  }
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
