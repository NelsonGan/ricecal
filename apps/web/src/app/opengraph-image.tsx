import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

/**
 * Every file the card draws, as bytes.
 *
 * Written as `fetch(new URL(..., import.meta.url))` because vinext reads that
 * exact shape at build time and inlines the file into the Worker bundle. A
 * Worker has no filesystem, so reading `public/` at request time fails. The
 * `.then` callback must stay `(res) => res.arrayBuffer()` for vinext to
 * recognise it.
 *
 * The two brand faces are checked in rather than fetched from Google. The
 * image renderer has no weighted font fallback, so without the real file the
 * wordmark comes out in a system regular and reads as somebody else's app.
 *
 * The icon is the 128px copy, the size it is drawn at, because the whole file
 * ships in the Worker.
 *
 * Inside the handler rather than at module scope: a Worker may not `fetch`
 * while its module loads, so if the pattern ever stopped being inlined, only
 * this route would fail.
 */
const pngDataUrl = (bytes: ArrayBuffer) =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

export default async function OpengraphImage() {
  const [icon, dish, baloo, nunito] = await Promise.all([
    fetch(new URL("../../public/icon-128.png", import.meta.url)).then((res) => res.arrayBuffer()),
    fetch(new URL("../../public/dishes/nasi-lemak.png", import.meta.url)).then((res) => res.arrayBuffer()),
    fetch(new URL("./fonts/baloo2-800.ttf", import.meta.url)).then((res) => res.arrayBuffer()),
    fetch(new URL("./fonts/nunito-400.ttf", import.meta.url)).then((res) => res.arrayBuffer()),
  ]);

  const iconSrc = pngDataUrl(icon);
  const dishSrc = pngDataUrl(dish);

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#F6F8F7",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 72,
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 28 }}>
          <img alt="" src={iconSrc} width={128} height={128} style={{ borderRadius: 34 }} />
          <div
            style={{
              color: "#1B3A2B",
              fontFamily: "Baloo",
              fontSize: 92,
              letterSpacing: -2,
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            color: "#1C2321",
            fontFamily: "Baloo",
            fontSize: 50,
            lineHeight: 1.2,
            marginTop: 28,
            maxWidth: 960,
            textAlign: "center",
          }}
        >
          A calorie tracker that already knows nasi lemak
        </div>

        <div
          style={{
            color: "#495450",
            fontFamily: "Nunito",
            fontSize: 30,
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Snap the plate, say what you ate, or scan the packet
        </div>

        <div style={{ alignItems: "center", display: "flex", gap: 20, marginTop: 34 }}>
          <div
            style={{
              alignItems: "center",
              background: "#EAF9F0",
              border: "2px solid #CFEBDA",
              borderRadius: 999,
              color: "#1B8A4E",
              display: "flex",
              fontFamily: "Baloo",
              fontSize: 28,
              padding: "14px 30px",
            }}
          >
            48,000 Asian dishes
          </div>
          <img alt="" src={dishSrc} width={92} height={92} />
          <div
            style={{
              alignItems: "center",
              background: "#FFF6E3",
              border: "2px solid #F0DDAE",
              borderRadius: 999,
              color: "#D99A1F",
              display: "flex",
              fontFamily: "Baloo",
              fontSize: 28,
              padding: "14px 30px",
            }}
          >
            3.2M barcodes
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { data: baloo, name: "Baloo", style: "normal", weight: 800 },
        { data: nunito, name: "Nunito", style: "normal", weight: 400 },
      ],
    },
  );
}
