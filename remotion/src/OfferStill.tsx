import React, { useEffect } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  delayRender,
  continueRender,
  useVideoConfig,
} from "remotion";

export type OfferStillProps = {
  /** Small tracked kicker, e.g. the hub name. Rendered UPPERCASE in the mono face. */
  eyebrow: string;
  /** The headline — verbatim from the offer/asset title. Display serif. */
  title: string;
  /** One sentence from the offer page. Body sans. Shown when `showLine`. */
  line: string;
  /** Bare domain, e.g. "stablehomefoundation.com". Mono, small. "" hides it. */
  url: string;
  /** The wordless plate: an https URL, or a filename placed in remotion/public/. */
  bgSrc: string;
  /** Hub design tokens (from web/hub/hubs.design.json → hubs[slug]). */
  bg: string;
  ink: string;
  sea: string;
  accent: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  /** Where the text block sits. The plates keep the top ~40% calm, so "top" is the default. */
  anchor: "top" | "bottom";
  /** Portrait/IG: true (headline + line + url). Square/thumb: usually false. */
  showLine: boolean;
};

const gf = (family: string, weights: string) =>
  `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, "+")}:wght@${weights}&display=swap`;

const useFonts = (families: Array<[string, string]>) => {
  useEffect(() => {
    const handle = delayRender(`fonts: ${families.map((f) => f[0]).join(", ")}`);
    const links = families.map(([family, weights]) => {
      const el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = gf(family, weights);
      document.head.appendChild(el);
      return el;
    });
    // @ts-ignore - document.fonts is available in the Chromium renderer
    (document.fonts?.ready || Promise.resolve()).then(() =>
      // give the CSS a beat to apply
      setTimeout(() => continueRender(handle), 120)
    );
    return () => links.forEach((el) => el.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export const OfferStill: React.FC<OfferStillProps> = ({
  eyebrow,
  title,
  line,
  url,
  bgSrc,
  bg,
  ink,
  sea,
  accent,
  displayFont,
  bodyFont,
  monoFont,
  anchor,
  showLine,
}) => {
  const { height } = useVideoConfig();
  useFonts([
    [displayFont, "500;600;700"],
    [bodyFont, "400;500"],
    [monoFont, "400;500;600"],
  ]);

  const isUrl = /^https?:\/\//i.test(bgSrc);
  const src = bgSrc ? (isUrl ? bgSrc : staticFile(bgSrc)) : "";
  const atTop = anchor !== "bottom";

  // A soft scrim so the type reads over any plate — strongest at the anchored
  // edge, gone by ~48% across.
  const scrim = `linear-gradient(${atTop ? "180deg" : "0deg"}, ${hexA(bg, 0.66)} 0%, ${hexA(bg, 0.42)} 22%, ${hexA(bg, 0)} 48%)`;

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      <AbsoluteFill style={{ background: scrim }} />
      <AbsoluteFill
        style={{
          padding: "78px 84px",
          justifyContent: atTop ? "flex-start" : "flex-end",
          alignItems: "flex-start",
        }}
      >
        <div style={{ maxWidth: 900 }}>
          {eyebrow ? (
            <div
              style={{
                fontFamily: `"${monoFont}", ui-monospace, monospace`,
                fontWeight: 600,
                fontSize: 25,
                letterSpacing: "0.17em",
                textTransform: "uppercase",
                color: sea,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div style={{ width: 60, height: 3, background: accent, margin: "18px 0 22px" }} />
          <div
            style={{
              fontFamily: `"${displayFont}", Georgia, serif`,
              fontWeight: 600,
              fontSize: height > 1200 ? 74 : 80,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              color: ink,
            }}
          >
            {title}
          </div>
          {showLine && line ? (
            <div
              style={{
                fontFamily: `"${bodyFont}", system-ui, sans-serif`,
                fontWeight: 400,
                fontSize: 29,
                lineHeight: 1.45,
                color: hexA(ink, 0.86),
                marginTop: 26,
                maxWidth: 820,
              }}
            >
              {line}
            </div>
          ) : null}
          {url ? (
            <div
              style={{
                fontFamily: `"${monoFont}", ui-monospace, monospace`,
                fontWeight: 500,
                fontSize: 21,
                letterSpacing: "0.02em",
                color: sea,
                marginTop: showLine && line ? 24 : 20,
              }}
            >
              {url}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** #rrggbb (or #rgb) + alpha -> rgba(). Falls back to the raw string for non-hex tokens. */
function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
