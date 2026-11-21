/**
 * Clustering for the food map: places close together on screen merge into
 * one bubble at the current zoom (Supercluster), so a month in one city stays
 * readable when zoomed out and splits apart as the user zooms in.
 */

import Supercluster from 'supercluster'

import type { MapRegion, PlaceGroup } from './placeLocation'

export type PlaceMarker =
  | { kind: 'place'; key: string; latitude: number; longitude: number; group: PlaceGroup }
  | {
      kind: 'cluster'
      key: string
      latitude: number
      longitude: number
      groups: PlaceGroup[]
      /** Meals under the bubble. */
      count: number
      /** Zoom at which the bubble splits, for tap-to-zoom. */
      expansionZoom: number
    }

interface PointProps {
  index: number
  count: number
}

/** The web-map zoom level a region shows at a given width in points. */
export function zoomForRegion(region: MapRegion, widthPoints: number): number {
  const delta = Math.max(1e-6, Math.min(360, region.longitudeDelta))
  const zoom = Math.log2((360 * (Math.max(1, widthPoints) / 256)) / delta)
  return Math.max(0, Math.min(20, zoom))
}

/** The longitude delta that shows `zoom` at `widthPoints` (inverse of zoomForRegion). */
export function longitudeDeltaForZoom(zoom: number, widthPoints: number): number {
  return Math.min(360, (360 * (Math.max(1, widthPoints) / 256)) / 2 ** zoom)
}

function bboxForRegion(region: MapRegion): [number, number, number, number] {
  const halfLat = Math.min(90, region.latitudeDelta / 2)
  const south = Math.max(-90, region.latitude - halfLat)
  const north = Math.min(90, region.latitude + halfLat)
  if (region.longitudeDelta >= 360) return [-180, south, 180, north]
  const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180
  const west = wrap(region.longitude - region.longitudeDelta / 2)
  const east = wrap(region.longitude + region.longitudeDelta / 2)
  // Supercluster takes a west > east box as one crossing the antimeridian.
  return [west, south, east, north]
}

/** Past this zoom places no longer merge; a bubble there shares one point. */
export const CLUSTER_MAX_ZOOM = 17

export function createPlaceClusterer(groups: readonly PlaceGroup[]) {
  const index = new Supercluster<PointProps, { count: number }>({
    radius: 64,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (props) => ({ count: props.count }),
    reduce: (acc, props) => {
      acc.count += props.count
    },
  })
  index.load(
    groups.map((group, i) => ({
      type: 'Feature' as const,
      properties: { index: i, count: group.entries.length },
      geometry: { type: 'Point' as const, coordinates: [group.longitude, group.latitude] },
    })),
  )

  return (region: MapRegion, widthPoints: number): PlaceMarker[] => {
    const zoom = Math.floor(zoomForRegion(region, widthPoints))
    const markers = index.getClusters(bboxForRegion(region), zoom).map((feature): PlaceMarker => {
      const [longitude, latitude] = feature.geometry.coordinates as [number, number]
      const props = feature.properties as Partial<PointProps> & {
        cluster?: boolean
        cluster_id?: number
        count?: number
      }
      if (props.cluster && typeof props.cluster_id === 'number') {
        const leaves = index.getLeaves(props.cluster_id, Infinity)
        const clusterGroups = leaves
          .map((leaf) => groups[(leaf.properties as PointProps).index])
          .filter((group): group is PlaceGroup => Boolean(group))
        return {
          kind: 'cluster',
          key: `cluster:${props.cluster_id}`,
          latitude,
          longitude,
          groups: clusterGroups,
          count: props.count ?? clusterGroups.reduce((n, g) => n + g.entries.length, 0),
          expansionZoom: index.getClusterExpansionZoom(props.cluster_id),
        }
      }
      const group = groups[props.index as number] as PlaceGroup
      return { kind: 'place', key: group.key, latitude, longitude, group }
    })
    return mergeSamePoint(markers)
  }
}

/**
 * Past the clustering zoom every place comes back on its own, and places at
 * one point (two stalls in one food court, say) would draw as one pin with the
 * others unreachable under it. They become a bubble that lists them instead.
 */
function mergeSamePoint(markers: PlaceMarker[]): PlaceMarker[] {
  const byPoint = new Map<string, PlaceMarker[]>()
  for (const marker of markers) {
    const point = `${marker.latitude.toFixed(5)},${marker.longitude.toFixed(5)}`
    const list = byPoint.get(point)
    if (list) list.push(marker)
    else byPoint.set(point, [marker])
  }
  const out: PlaceMarker[] = []
  for (const [point, list] of byPoint) {
    if (list.length === 1) {
      out.push(list[0] as PlaceMarker)
      continue
    }
    const groups = list.flatMap((marker) =>
      marker.kind === 'place' ? [marker.group] : marker.groups,
    )
    out.push({
      kind: 'cluster',
      key: `point:${point}`,
      latitude: (list[0] as PlaceMarker).latitude,
      longitude: (list[0] as PlaceMarker).longitude,
      groups,
      count: groups.reduce((n, g) => n + g.entries.length, 0),
      // They never split, however far in.
      expansionZoom: CLUSTER_MAX_ZOOM + 1,
    })
  }
  return out
}
