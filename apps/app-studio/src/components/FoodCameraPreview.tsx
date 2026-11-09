import type { CSSProperties } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { BODY_FONT } from './sceneParts';
import type { SearchFood } from '../data/searchCreatives';
import scan from '../data/searchAnimation.json';
import type { AppStoreCopy } from '../scenes/appStoreCopy';
import styles from './FoodCameraPreview.module.css';
import { useFitText } from './useFitText';

/** Marketing camera simulation; the generated food stays separate from the animated UI. */
export function FoodCameraPreview({ food, copy, scale = 3, animated = true }: {
  food: SearchFood; copy: AppStoreCopy; scale?: number; animated?: boolean;
}) {
  const scanningRef = useFitText<HTMLSpanElement>(12, 0.7);
  const cameraRef = useFitText<HTMLDivElement>(11, 0.7);
  const keyframes = Array.from({ length: 101 }, (_, i) => {
    const top = (scan.minTop + (scan.maxTop - scan.minTop) * (1 - Math.cos(i / 100 * Math.PI * 2)) / 2) * 100;
    return `${i}% { top: ${top}%; }`;
  }).join('\n');
  return <DeviceFrame scale={scale}>
    <div data-food-camera data-camera-animated={animated} role="img"
      aria-label={`${food.name} · ${copy.camera}`}
      style={{ position: 'relative', width: 320, height: 695, background: '#0B1510', color: '#fff',
        transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: BODY_FONT }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: 17, left: 28, fontSize: 11, fontWeight: 800 }}>9:41</div>
      <div aria-hidden="true" style={{ position: 'absolute', top: 10, left: 115, width: 90, height: 25,
        borderRadius: 30, background: '#000' }} />
      <svg aria-hidden="true" viewBox="0 0 38 14" width={33} height={13}
        style={{ position: 'absolute', top: 19, right: 25 }}>
        <path d="M1 10h3V8H1zm5 0h3V5H6zm5 0h3V2h-3z" fill="white" />
        <rect x="20" y="2" width="15" height="9" rx="2" fill="none" stroke="white" />
        <rect x="22" y="4" width="11" height="5" rx="1" fill="white" />
        <path d="M37 5v3" stroke="white" strokeWidth="2" />
      </svg>
      <div style={{ position: 'absolute', left: 22, right: 22, top: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between' }}>
        <span aria-hidden="true" style={{ fontSize: 27, lineHeight: 1, fontWeight: 400 }}>×</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="white" strokeWidth={1.5}><path d="M4 7h4l2-3h4l2 3h4v13H4z" strokeLinejoin="round"/><circle cx="12" cy="13" r="4"/></svg>
        <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="white" strokeWidth={1.8}>
          <path d="M13 2 5 13h6l-1 9 9-13h-6z" strokeLinejoin="round" />
        </svg>
      </div>
      <style>{`@keyframes ricecalFoodScan { ${keyframes} }`}</style>
      <div data-camera-viewport style={{ position: 'absolute', left: 0, right: 0, top: 112, height: 418, overflow: 'hidden' }}>
        <img src={food.image} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 52%', display: 'block' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(#0004, transparent 28%, transparent 75%, #0003)' }} />
        <div style={{ position: 'absolute', left: 32, right: 32, top: 18, display: 'flex', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 24,
            background: '#102B20E8', color: '#E7FFEE', padding: '8px 13px', fontSize: 12, fontWeight: 800,
            maxWidth: '100%', whiteSpace: 'nowrap' }}>
            <span className={styles.statusDot} /><span ref={scanningRef}
              style={{ display: 'block', width: 194, minWidth: 0, textAlign: 'center' }}>{copy.scanning}</span>
          </span>
        </div>
        {[{ top: 82, left: 18 }, { top: 82, right: 18 }, { bottom: 56, left: 18 }, { bottom: 56, right: 18 }].map((corner, index) => (
          <div key={index} aria-hidden="true" style={{ position: 'absolute', ...corner, width: 28, height: 28,
            borderColor: '#C6FFD8', borderStyle: 'solid',
            borderWidth: `${index < 2 ? 3 : 0}px ${index % 2 ? 3 : 0}px ${index > 1 ? 3 : 0}px ${index % 2 ? 0 : 3}px`,
            borderRadius: index === 0 ? '8px 0 0 0' : index === 1 ? '0 8px 0 0' : index === 2 ? '0 0 0 8px' : '0 0 8px 0',
          }} />
        ))}
        <img data-camera-scanline aria-hidden="true" alt="" src={scan.beamImage} className={styles.scanline}
          style={{ height: scan.beamHeight, transform: `translateY(-${scan.beamLineY}px)`, '--scan-period': `${scan.period}s`, '--scan-name': 'ricecalFoodScan' } as CSSProperties} />
        <span style={{ position: 'absolute', bottom: 14, left: 139, width: 42, textAlign: 'center',
          borderRadius: 20, padding: '3px 0', fontSize: 11, fontWeight: 800, background: '#13251BAA' }}>1×</span>
      </div>
      <div ref={cameraRef} style={{ position: 'absolute', top: 544, left: 24, right: 24, textAlign: 'center',
        color: '#B2F5C7', fontSize: 11, fontWeight: 800, letterSpacing: '1px' }}>{copy.camera}</div>
      <div aria-hidden="true" style={{ position: 'absolute', left: 124, top: 575, width: 72, height: 72,
        border: '3px solid white', borderRadius: '50%', padding: 4, boxSizing: 'border-box' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff' }} />
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: 31, top: 591, width: 39, height: 39,
        border: '2px solid #fff6', borderRadius: 10, overflow: 'hidden' }}>
        <img src={food.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <svg aria-hidden="true" viewBox="0 0 24 24" width={27} height={27} fill="none" stroke="white" strokeWidth={1.6}
        style={{ position: 'absolute', top: 598, right: 36 }}>
        <path d="M20 8a8 8 0 0 0-13-3L4 8m0-5v5h5M4 16a8 8 0 0 0 13 3l3-3m0 5v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 12, left: 109, width: 102,
        height: 4, background: '#fff', borderRadius: 10 }} />
    </div>
  </DeviceFrame>;
}
