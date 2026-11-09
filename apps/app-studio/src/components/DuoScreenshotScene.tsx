import { forwardRef } from 'react';
import { SceneCanvas, SceneGlows, renderHeadline, DeviceScreen, DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import type { DuoSceneConfig } from '../scenes/duoSceneData';
import { DUO_EXPORT_WIDTH, DUO_EXPORT_HEIGHT } from '../utils/export';

interface Props {
  scene: DuoSceneConfig;
  previewScale?: number;
}

const W = DUO_EXPORT_WIDTH;
const H = DUO_EXPORT_HEIGHT;

/** The screen, at the captures' own aspect so nothing is cropped by the frame. */
const SCREEN_W = 2160;
const SCREEN_H = Math.round(SCREEN_W * (H / W));
const BEZEL = 22;
const RIM = 8;
const FRAME_W = SCREEN_W + (BEZEL + RIM) * 2;
/** The device starts under the headline and only its lower bezel leaves the canvas. */
const FRAME_TOP = 500;

/**
 * iPhone Duo open on its side: one wide display with the fold down its centre,
 * marked by the hinge's ends on the rim rather than by a line over the screen.
 */
function DuoFrame({ screenshot }: { screenshot: string }) {
  const radius = 64;
  const hinge = { position: 'absolute', left: '50%', width: 56, height: RIM + 4,
    transform: 'translateX(-50%)', background: '#1c1c1e', borderRadius: 4 } as const;
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
      <div style={{ ...hinge, top: -2 }} />
      <div style={{ ...hinge, bottom: -2 }} />
      <div style={{
        width: '100%', height: '100%', padding: BEZEL, boxSizing: 'border-box',
        borderRadius: radius + BEZEL, background: '#0a0a0c',
      }}>
        <DeviceScreen screenshot={screenshot} width={SCREEN_W} height={SCREEN_H} borderRadius={radius} />
      </div>
    </div>
  );
}

export const DuoScreenshotScene = forwardRef<HTMLDivElement, Props>(
  ({ scene, previewScale = 0.16 }, ref) => {
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

        <div style={{ position: 'absolute', top: 68, left: (W - FRAME_W) / 2, zIndex: 7,
          color: scene.textColor, opacity: 0.7, fontSize: 40, fontWeight: 800,
          fontFamily: DISPLAY_FONT, letterSpacing: '-0.5px' }}>RiceCal</div>

        <h1 ref={headlineRef} style={{
          position: 'absolute', top: 150, left: (W - FRAME_W) / 2, right: (W - FRAME_W) / 2,
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
          <DuoFrame screenshot={scene.screenshot} />
        </div>

        {scene.decorations}
      </SceneCanvas>
    );
  },
);

DuoScreenshotScene.displayName = 'DuoScreenshotScene';
