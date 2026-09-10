import React from "react";
import { Composition } from "remotion";
import { OfferStill, OfferStillProps } from "./OfferStill";

// Care Gap tokens (web/hub/hubs.design.json → hubs["care-gap"]) as the studio
// defaults — the render script overrides every prop from the real hub + offer.
const defaults: OfferStillProps = {
  eyebrow: "The Care Gap",
  title: "Help House a Caregiver",
  line: "Every dollar you deploy keeps a skilled caregiver housed, employed, and counted.",
  url: "stablehomefoundation.com",
  bgSrc: "plate.png",
  bg: "#eceef2",
  ink: "#191b1f",
  sea: "#23506e",
  accent: "#b23a2e",
  displayFont: "Newsreader",
  bodyFont: "IBM Plex Sans",
  monoFont: "IBM Plex Mono",
  anchor: "top",
  showLine: true,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="OfferStillSquare"
      component={OfferStill}
      width={1080}
      height={1080}
      fps={30}
      durationInFrames={1}
      defaultProps={{ ...defaults, showLine: false }}
    />
    <Composition
      id="OfferStillPortrait"
      component={OfferStill}
      width={1080}
      height={1350}
      fps={30}
      durationInFrames={1}
      defaultProps={{ ...defaults, showLine: true }}
    />
  </>
);
