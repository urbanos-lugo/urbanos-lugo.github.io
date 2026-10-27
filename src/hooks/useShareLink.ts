import { useState } from 'react';

/**
 * A link handed on. On a touch screen with a share sheet, the phone's own (a message, a chat,
 * the notes), which is where a link to a stop or a line goes from a phone; elsewhere it is
 * copied, as before, since on a desktop the share API opens the system's dialog where a copy
 * was wanted. "Copied" is said only when the copy worked: `navigator.clipboard` does not
 * exist on a non-secure origin and `writeText` can reject, and then the link is shown to copy
 * by hand.
 */
export function useShareLink() {
  const [copied, setCopied] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const viaSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

  const share = async (url: string, title: string) => {
    setFailedUrl(null);
    if (viaSheet) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closed by the reader: nothing happened and nothing needs saying. Refused for any other reason, it is copied instead.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      if (!navigator.clipboard) throw new Error('no clipboard on this origin');
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailedUrl(url);
    }
  };

  return { viaSheet, copied, failedUrl, share };
}
