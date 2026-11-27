import { forwardRef } from 'react';
import { SceneCanvas, SceneGlows, renderHeadline, DeviceScreen, DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import type { IPadSceneConfig } from '../scenes/ipadSceneData';
import { IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT } from '../utils/export';

interface Props {
  scene: IPadSceneConfig;
  previewScale?: number;
}

const W = IPAD_EXPORT_WIDTH;
const H = IPAD_EXPORT_HEIGHT;

/**
 * The screen, at the captures' own 2752 × 2064 aspect. Sized so it ends inside
 * the canvas: FRAME_TOP + RIM + BEZEL + SCREEN_H stays under 2048, and only the
 * lower bezel and rim leave it.
 */
const SCREEN_W = 2040;
const SCREEN_H = Math.round(SCREEN_W * (2064 / 2752));
const BEZEL = 34;
const RIM = 8;
const FRAME_W = SCREEN_W + (BEZEL + RIM) * 2;
/** The Duo canvas the shared planting is laid out on (`duoSceneData.tsx`). */
const DUO_W = 2853;
/** The device starts under the headline and only its lower bezel leaves the canvas. */
const FRAME_TOP = 470;

/** An iPad Pro on its side: an even bezel all round, the camera on the top edge. */
function IPadFrame({ screenshot }: { screenshot: string }) {
  const radius = 40;
  return (
    <div style={{
      position: 'relative',
      width: SCREEN_W + BEZEL * 2,
      height: SCREEN_H + BEZEL * 2,
      padding: RIM,
      borderRadius: radius + BEZEL + RIM,
      background: 'linear-gradient(150deg, #6e6e73 0%, #2c2c2e 30%, #48484d 55%, #1c1c1e 80%, #5a5a5f 100%)',
      boxShadow: '0 90px 200px rgba(20,45,32,0.28), 0 28px 64px rgba(20,45,32,0.16)',
      boxSizing: 'content-box',
    }}>
      <div style={{
        position: 'relative',
        width: '100%', height: '100%', padding: BEZEL, boxSizing: 'border-box',
        borderRadius: radius + BEZEL, background: '#0a0a0c',
      }}>
        <div style={{
          position: 'absolute', top: (BEZEL - 12) / 2, left: '50%', width: 12, height: 12,
          transform: 'translateX(-50%)', borderRadius: 6, background: '#1f2a33',
        }} />
        <DeviceScreen screenshot={screenshot} width={SCREEN_W} height={SCREEN_H} borderRadius={radius} />
      </div>
    </div>
  );
}

export const IPadScreenshotScene = forwardRef<HTMLDivElement, Props>(
  ({ scene, previewScale = 0.17 }, ref) => {
    const headlineRef = useFitText<HTMLHeadingElement>(128);

    return (
      <SceneCanvas
        ref={ref}
        width={W}
        height={H}
        previewScale={previewScale}
        background={`linear-gradient(160deg, ${scene.gradientFrom}, ${scene.gradientTo})`}
      >
        <SceneGlows
          accent={scene.accentColor}
          top={{ inset: 420, size: 1500 }}
          bottom={{ bottomInset: 380, leftInset: 420, size: 1300 }}
        />

        <div style={{ position: 'absolute', top: 60, left: (W - FRAME_W) / 2, zIndex: 7,
          color: scene.textColor, opacity: 0.7, fontSize: 40, fontWeight: 800,
          fontFamily: DISPLAY_FONT, letterSpacing: '-0.5px' }}>RiceCal</div>

        <h1 ref={headlineRef} style={{
          position: 'absolute', top: 136, left: (W - FRAME_W) / 2, right: (W - FRAME_W) / 2,
          zIndex: 7, margin: 0,
          fontFamily: DISPLAY_FONT, fontSize: 128, fontWeight: 800, color: scene.textColor,
          lineHeight: 1.06, whiteSpace: 'pre-line', letterSpacing: '-1.5px',
        }}>
          {renderHeadline(scene.headline, scene.highlight, scene.accentColor)}
        </h1>

        <div style={{
          position: 'absolute', top: FRAME_TOP, left: '50%',
          transform: 'translateX(-50%)', zIndex: 4,
        }}>
          <IPadFrame screenshot={scene.screenshot} />
        </div>

        {/* The planting is placed for the wider Duo canvas, so it is scaled to
            this one rather than left to hang off the right edge. */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: DUO_W, height: H * (DUO_W / W),
          transform: `scale(${W / DUO_W})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
          {scene.decorations}
        </div>
      </SceneCanvas>
    );
  },
);

IPadScreenshotScene.displayName = 'IPadScreenshotScene';
