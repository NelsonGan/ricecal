import { forwardRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { SceneCanvas, SceneGlows, renderHeadline, DISPLAY_FONT } from './sceneParts';
import { DsIcon } from './decorations';
import { useFitText, useFitLines } from './useFitText';
import { C, R, slab } from './tokens';
import { Blob, Pandan } from './flora';
import type { IPadSceneConfig } from '../scenes/ipadSceneData';
import { IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT } from '../utils/export';

interface Props {
  scene: IPadSceneConfig;
  previewScale?: number;
}

const W = IPAD_EXPORT_WIDTH;
const H = IPAD_EXPORT_HEIGHT;

export const IPadScreenshotScene = forwardRef<HTMLDivElement, Props>(
  ({ scene, previewScale = 0.17 }, ref) => {
    const headlineRef = useFitText<HTMLHeadingElement>(136, 0.55);
    const subRef = useFitLines<HTMLParagraphElement>(52, 2);

    return (
      <SceneCanvas
        ref={ref}
        width={W}
        height={H}
        previewScale={previewScale}
        background={`linear-gradient(122deg, ${scene.gradientFrom}, ${scene.gradientTo})`}
      >
        <SceneGlows
          accent={scene.accentColor}
          top={{ inset: 420, size: 1500 }}
          bottom={{ bottomInset: 380, leftInset: 420, size: 1300 }}
        />
        <Pandan x={-160} y={1320} size={520} color={C.pandanSoftLine} opacity={0.75} rotate={-20} />
        <Blob x={2320} y={-180} size={620} color={scene.accentColor} opacity={0.09} rotate={18} />

        {/* Left column — headline, one line of body, three short proofs */}
        <div style={{
          position: 'absolute', left: 132, top: 0, bottom: 0, width: 1130,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          zIndex: 6,
        }}>
          <h1 ref={headlineRef} style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 136, fontWeight: 800, color: scene.textColor,
            lineHeight: 1.06, margin: 0, whiteSpace: 'pre-line',
            letterSpacing: '-2px',
          }}>
            {renderHeadline(scene.headline, scene.highlight, scene.accentColor)}
          </h1>
          <p ref={subRef} style={{
            fontSize: 52, fontWeight: 600, color: scene.subColor,
            lineHeight: 1.35, margin: '38px 0 0', maxWidth: 1030,
          }}>{scene.subheadline}</p>

          {scene.bullets.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 60 }}>
            {scene.bullets.map((b) => (
              <div key={b.text} style={{
                display: 'flex', alignItems: 'center', gap: 26,
                alignSelf: 'flex-start',
                background: C.surface, borderRadius: R.full,
                padding: '20px 44px 20px 22px',
                boxShadow: slab(C.lineStrong, 7),
                maxWidth: 1030,
              }}>
                <DsIcon name={b.icon} size={72} />
                <span style={{
                  fontFamily: DISPLAY_FONT, fontSize: 46, fontWeight: 800,
                  color: C.heading, lineHeight: 1.15,
                }}>{b.text}</span>
              </div>
            ))}
          </div> : null}
        </div>

        {/* Right — two phones, the front one overlapping */}
        <div style={{
          position: 'absolute', right: -60, top: 96, zIndex: 4,
          transform: 'rotate(-7deg)',
        }}>
          <DeviceFrame screenshot={scene.shots[0]} scale={2.5} />
        </div>
        <div style={{
          position: 'absolute', right: 630, top: 210, zIndex: 5,
          transform: 'rotate(4deg)',
        }}>
          <DeviceFrame screenshot={scene.shots[1]} scale={2.5} />
        </div>
      </SceneCanvas>
    );
  },
);

IPadScreenshotScene.displayName = 'IPadScreenshotScene';
