import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A scannable QR code. Always dark on white, because phone cameras need that contrast even in dark mode. */
export function QrCode({ url, size = 176, label }: { url: string; size?: number; label?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, color: { dark: "#12141c", light: "#ffffff" } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [url, size]);
  if (!src) return <div className="qr" style={{ width: size, height: size }} aria-hidden />;
  return <img className="qr" src={src} width={size} height={size} alt={label ?? `QR code for ${url}`} />;
}

/** Copy the link, or open the phone's share sheet when there is one. */
export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older app views refuse clipboard writes; select the text so it can be copied by hand.
      const el = document.getElementById("invite-link") as HTMLInputElement | null;
      el?.select();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    try {
      await navigator.share({ title, text: "Join my Mafia game", url });
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="stack">
      <input id="invite-link" className="linkfield" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
      <div className="row2">
        <button className="btn ghost" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
        {canShare && <button className="btn" onClick={share}>Share invite</button>}
      </div>
    </div>
  );
}

/** The browser's "install" prompt, kept until the person asks for it. */
export function useInstall() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [installed, setInstalled] = useState(typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void> });
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    canInstall: !!prompt,
    install: async () => {
      await prompt?.prompt();
      setPrompt(null);
    },
    showIosHint: ios && !installed,
    installed,
  };
}
