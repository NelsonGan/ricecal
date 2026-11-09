/**
 * Shared panorama for the opening triptych (scenes 01–03).
 *
 * The three scenes are one continuous 3870 × 2796 composition cut into three
 * panels. Each renders the same full-width background offset by its panel
 * index, so the wash and the pandan blades line up across the cuts when the
 * three sit side by side in a store gallery.
 */

import type { ReactNode } from 'react';
import { Blob, Pandan, Grains } from './flora';
import { C } from './tokens';
import { EXPORT_WIDTH, EXPORT_HEIGHT } from '../utils/export';

export const PANEL_W = EXPORT_WIDTH;
export const PANEL_H = EXPORT_HEIGHT;
const PANO_W = PANEL_W * 3;

function Pano({ panel, zIndex, children }: {
  panel: number; zIndex: number; children: ReactNode;
}) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: -panel * PANEL_W,
      width: PANO_W, height: PANEL_H,
      zIndex, pointerEvents: 'none',
    }}>{children}</div>
  );
}

export function TriptychBackground({ panel }: { panel: number }) {
  return (
    <Pano panel={panel} zIndex={1}>
      {/* One wash, drifting canvas → pandan soft across the three panels */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(96deg,
          ${C.canvas} 0%, #F1F7F3 26%,
          ${C.pandanSoft} 52%, #F2F8F4 78%, ${C.canvas} 100%)`,
      }} />
      {/* Airy top light, uniform across the cuts */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 30%)',
      }} />

      {/* ── Panel 1 — blades rising from the bottom left ── */}
      <Pandan x={-190} y={2130} size={520} color={C.pandanSoftLine} opacity={0.9} rotate={-16} />
      <Blob x={-160} y={2360} size={620} color={C.pandan} opacity={0.10} rotate={16} />
      <Grains x={1085} y={140} size={180} color={C.kayaSoftLine} opacity={0.9} rotate={18} />

      {/* ── Seam 1 → 2 ── */}
      <Blob x={1120} y={2300} size={520} color={C.kaya} opacity={0.10} rotate={-20} />

      {/* ── Panel 2 — the brand panel; keep it quiet behind the cards ── */}
      <Blob x={1700} y={-260} size={700} color={C.pandan} opacity={0.07} rotate={22} />
      <Pandan x={2250} y={2300} size={470} color={C.pandanSoftLine} opacity={0.75} rotate={14} />
      <Blob x={2500} y={2420} size={520} color={C.water} opacity={0.07} rotate={-14} />

      {/* ── Panel 3 — mirror of panel 1, blades from the bottom right ── */}
      <Pandan x={3480} y={2120} size={520} color={C.pandanSoftLine} opacity={0.9} rotate={18} flip />
      <Blob x={3520} y={2380} size={600} color={C.pandan} opacity={0.10} rotate={-18} />
      <Grains x={2618} y={136} size={175} color={C.hibiscusSoftLine} opacity={0.85} rotate={-24} />
    </Pano>
  );
}
