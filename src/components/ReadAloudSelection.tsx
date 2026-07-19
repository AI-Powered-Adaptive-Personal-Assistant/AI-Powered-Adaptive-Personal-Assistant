import { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { speak, cancelSpeech } from "../lib/tts";

interface ReadAloudSelectionProps {
  /** User's preferred language, used to pick the TTS voice. */
  language?: string;
}

interface Anchor {
  top: number;
  left: number;
  text: string;
}

/**
 * App-wide "read the highlighted region aloud" helper.
 *
 * Whenever the user selects (highlights) text anywhere in the app, a small
 * floating button appears next to the selection; clicking it reads the
 * selected text aloud in the user's language. Click again (or clear the
 * selection) to stop.
 */
export default function ReadAloudSelection({ language }: ReadAloudSelectionProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";

      // Ignore trivially short or empty selections.
      if (!sel || sel.rangeCount === 0 || text.length < 2) {
        setAnchor(null);
        return;
      }

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setAnchor(null);
        return;
      }

      // Position the button just above the start of the selection (viewport coords).
      setAnchor({
        top: Math.max(8, rect.top - 44),
        left: Math.min(window.innerWidth - 140, Math.max(8, rect.left)),
        text,
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      // Don't recompute when interacting with our own button.
      if (barRef.current?.contains(e.target as Node)) return;
      // Let the selection settle first.
      setTimeout(updateFromSelection, 0);
    };

    const onKeyUp = () => setTimeout(updateFromSelection, 0);

    const onHide = (e?: Event) => {
      if (e && barRef.current?.contains(e.target as Node)) return;
      const text = window.getSelection()?.toString().trim() ?? "";
      if (text.length < 2) setAnchor(null);
    };

    const onDismiss = () => setAnchor(null);

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    document.addEventListener("selectionchange", onHide);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
      document.removeEventListener("selectionchange", onHide);
      cancelSpeech();
    };
  }, []);

  // When the selection is dismissed (scroll/resize/clear) mid-read, the Stop
  // button unmounts — so stop the speech here too, otherwise a long read-aloud
  // keeps playing with no way to halt it.
  useEffect(() => {
    if (!anchor && speaking) {
      cancelSpeech();
      setSpeaking(false);
    }
  }, [anchor, speaking]);

  if (!anchor) return null;

  const handleClick = () => {
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    speak(anchor.text, language, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <div
      ref={barRef}
      style={{ position: "fixed", top: anchor.top, left: anchor.left, zIndex: 9999 }}
      // Prevent the mousedown from clearing the text selection before the click fires.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-full shadow-2xl border border-white/10 text-xs font-bold hover:bg-slate-800 active:scale-95 transition-all"
      >
        {speaking ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" /> Stop
          </>
        ) : (
          <>
            <Volume2 className="w-3.5 h-3.5" /> Read
          </>
        )}
      </button>
    </div>
  );
}
