"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { StationMarkerRow, PanelState } from "@/lib/types";
import { stationDivIcon, stationPopupHtml } from "./StationMarkerIcon";

// Telangana bounding center (roughly Hyderabad).
const DEFAULT_CENTER: [number, number] = [17.9784, 79.5941];
const DEFAULT_ZOOM = 7;

// SidePanel's `max-w-md` (28rem). The map container spans the full width behind
// the panel, so Leaflet's own notion of "center" sits under the panel unless we
// account for it -- see the focus effect below, which is the fix for "opening a
// station's panel doesn't actually center it in the visible map."
const SIDE_PANEL_WIDTH_PX = 448;

// Floor, not a forced value, for station-panel focus — see the focus effect below.
const MIN_STATION_ZOOM = 15;

// Matches the fixed zoom DashboardShell's focus computation uses for the
// nearby-analysis panel type. Duplicated here (rather than threaded through props)
// for the radius handle's clamping math — see the radiusCircle effect below.
const NEARBY_ANALYSIS_ZOOM = 14;

export type MapFocus =
  | { kind: "point"; lat: number; lon: number; zoom?: number }
  | { kind: "bounds"; bounds: [[number, number], [number, number]] };

interface StationMapProps {
  stations: StationMarkerRow[];
  onSelectStation: (scno: string) => void;
  /** containerPoint is Leaflet's e.containerPoint — pixel coords relative to the map's own
   * container div, which fills the same `relative`-positioned wrapper DashboardShell renders
   * it in, so no extra offset math is needed to position the choice menu. */
  onContextMenu: (lat: number, lon: number, containerPoint: { x: number; y: number }) => void;
  focus?: MapFocus | null;
  panel: PanelState;
  /** The predict-new-site candidate point, or null when that panel isn't open. Dragging the
   * marker (or editing lat/lon in the panel) updates this — see DashboardShell's predictCoords. */
  predictMarker?: { lat: number; lon: number } | null;
  onPredictMarkerDrag?: (lat: number, lon: number) => void;
  /** Nearby-station-analysis radius, shown as a dashed circle so the analyzed area is visible
   * on the map. Updates live as the panel's radius slider moves (see DashboardShell). */
  radiusCircle?: { lat: number; lon: number; radiusM: number } | null;
  /** Fired once when the circle's own resize handle (see below) is released. Live feedback
   * during the drag itself (circle resize, tooltip) is purely imperative Leaflet — not
   * bubbled to React until release — so the effect below never fights the user's own drag
   * by snapping the handle back to its canonical position mid-gesture. Reuses the same
   * commit path the radius slider already uses (see DashboardShell). */
  onRadiusCircleCommit?: (radiusM: number) => void;
  /** unique_scno of the station whose side panel is currently open, or null. Highlighted
   * with a distinct marker style (see StationMarkerIcon's `selected`) so it's clear which
   * marker the open panel corresponds to. */
  selectedScno?: string | null;
}

const predictDivIcon = L.divIcon({
  className: "vc-marker",
  html: `<div class="vc-dot predict"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function StationMap({
  stations,
  onSelectStation,
  onContextMenu,
  focus,
  predictMarker,
  onPredictMarkerDrag,
  radiusCircle,
  onRadiusCircleCommit,
  selectedScno,
}: StationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const predictMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const radiusHandleRef = useRef<L.Marker | null>(null);
  // True while the user is actively dragging the radius handle -- guards the
  // effect below from snapping the handle back to its canonical position mid-drag
  // in response to its own dragend-triggered prop update.
  const draggingRadiusHandleRef = useRef(false);
  const onSelectRef = useRef(onSelectStation);
  const onContextMenuRef = useRef(onContextMenu);
  const onPredictMarkerDragRef = useRef(onPredictMarkerDrag);
  const onRadiusCircleCommitRef = useRef(onRadiusCircleCommit);

  useEffect(() => {
    onSelectRef.current = onSelectStation;
    onContextMenuRef.current = onContextMenu;
    onPredictMarkerDragRef.current = onPredictMarkerDrag;
    onRadiusCircleCommitRef.current = onRadiusCircleCommit;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      preferCanvas: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Free OSM tiles — no API key, no billing account. See plan §1.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        return L.divIcon({
          html: `<div class="vc-cluster">${count}</div>`,
          className: "vc-marker",
          iconSize: [38, 38],
        });
      },
    });

    map.addLayer(cluster);

    map.on("contextmenu", (e: L.LeafletMouseEvent) => {
      onContextMenuRef.current(e.latlng.lat, e.latlng.lng, e.containerPoint);
    });

    mapRef.current = map;
    clusterRef.current = cluster;

    // SideNav's collapse toggle animates the map container's width via CSS
    // transition — Leaflet doesn't observe that itself, so without this its
    // canvas keeps the old size and the newly-freed strip renders as blank
    // gray until the next manual pan/zoom. ResizeObserver catches every
    // resize, including that transition's end.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Sync markers whenever the station list changes.
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    cluster.clearLayers();

    const markers = stations
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const marker = L.marker([station.latitude, station.longitude], {
          icon: stationDivIcon(station, station.unique_scno === selectedScno),
        });
        marker.bindPopup(stationPopupHtml(station));
        marker.on("click", () => onSelectRef.current(station.unique_scno));
        return marker;
      });

    cluster.addLayers(markers);
  }, [stations, selectedScno]);

  // React to programmatic focus changes (area/landmark/station/predict results).
  // Deliberately independent of predictMarker — this only fires from the initial
  // right-click's `focus` prop, never from live coordinate edits below, so dragging
  // the predict marker or typing new lat/lon never yanks the map view around.
  useEffect(() => {
    if (!focus || !mapRef.current) return;
    const map = mapRef.current;
    if (focus.kind === "bounds") {
      // Bias the fitted bounds away from the side panel's side, same reasoning as the
      // point case below -- otherwise "fit to bounds" centers within the FULL container
      // width, half of which is covered by the panel.
      map.flyToBounds(focus.bounds, {
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48 + SIDE_PANEL_WIDTH_PX, 48],
        duration: 0.6,
      });
    } else {
      // Falls back to the map's current zoom (not a hardcoded default) so a station-click
      // focus (which omits zoom) doesn't zoom OUT if already zoomed in closer than
      // MIN_STATION_ZOOM. But it does floor at MIN_STATION_ZOOM: selecting a station from
      // a list (area/nearby-analysis) can happen at any inherited zoom (e.g. a city-level
      // area-bounds fit), and below that floor the target stays absorbed into a marker
      // cluster bubble — neither centered nor visible/highlighted individually. Other
      // focus kinds (landmark/predict-new-site/nearby-analysis) always pass an explicit zoom.
      const zoom = focus.zoom ?? Math.max(map.getZoom(), MIN_STATION_ZOOM);
      // flyTo centers its target on the map container's true geometric center, which
      // sits under the side panel (a same-size overlay, not a layout sibling that
      // shrinks the map). Shift the target right in pixel space by half the panel's
      // width so the point ends up centered in the actually-visible map area instead.
      const targetPoint = map.project([focus.lat, focus.lon], zoom).add([SIDE_PANEL_WIDTH_PX / 2, 0]);
      const adjustedCenter = map.unproject(targetPoint, zoom);
      map.flyTo(adjustedCenter, zoom, { duration: 0.6 });
    }
  }, [focus]);

  // Create/move/remove the draggable predict-new-site candidate marker. Repositioning
  // (drag, or an external coordinate edit) only calls setLatLng — it never touches the
  // map's own pan/zoom, so it can't feed back into `focus` above.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!predictMarker) {
      if (predictMarkerRef.current) {
        map.removeLayer(predictMarkerRef.current);
        predictMarkerRef.current = null;
      }
      return;
    }

    const latlng: L.LatLngExpression = [predictMarker.lat, predictMarker.lon];

    if (predictMarkerRef.current) {
      predictMarkerRef.current.setLatLng(latlng);
      return;
    }

    const marker = L.marker(latlng, { icon: predictDivIcon, draggable: true, zIndexOffset: 1000 });
    marker.bindTooltip("Drag to adjust location", { direction: "top", offset: [0, -12] });
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onPredictMarkerDragRef.current?.(pos.lat, pos.lng);
    });
    marker.addTo(map);
    predictMarkerRef.current = marker;
  }, [predictMarker]);

  // Dashed circle showing the nearby-analysis radius. Cheap to update on every slider
  // tick (setLatLng/setRadius, no re-render of markers or a new fetch) — see
  // NearbyAnalysisPanel, which filters an already-fetched station list client-side
  // for the same reason. Also carries a draggable resize handle (below) as a second,
  // map-native way to change the radius alongside the panel's slider.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!radiusCircle) {
      if (radiusCircleRef.current) {
        map.removeLayer(radiusCircleRef.current);
        radiusCircleRef.current = null;
      }
      if (radiusHandleRef.current) {
        map.removeLayer(radiusHandleRef.current);
        radiusHandleRef.current = null;
      }
      return;
    }

    const center = L.latLng(radiusCircle.lat, radiusCircle.lon);
    // Canonical handle position: due west of center, at the current radius. West (not
    // east) so it stays away from the side panel covering the map's right side, and
    // "canonical" so external radius changes (the slider) reposition the handle
    // predictably instead of leaving it wherever a previous drag happened to end.
    //
    // Clamped so a large radius can't push the handle past the map container's own
    // left edge -- behind SideNav, a real DOM sibling that swallows mouse events
    // before Leaflet ever sees them, not just a z-index quirk. Deliberately computed
    // via project()/unproject() at NEARBY_ANALYSIS_ZOOM rather than
    // latLngToContainerPoint()/getSize() against the map's LIVE view: this effect and
    // the focus effect above both fire from the same render, but focus's flyTo is a
    // 600ms animation -- sampling the live view here would race it and clamp against
    // the map's pre-animation position/zoom, not where it's actually flying to. Working
    // in zoom-fixed projected pixels (pure math, no dependency on live pan/zoom state)
    // sidesteps that race entirely. When clamped, the handle sits at a fixed safe
    // distance rather than exactly on the circle's edge; the circle itself always still
    // renders at the true radius regardless.
    const handleLatLngFor = (radiusM: number) => {
      const zoom = NEARBY_ANALYSIS_ZOOM;
      const metersPerDegreeLon = 111320 * Math.cos((center.lat * Math.PI) / 180);
      const desired = L.latLng(center.lat, center.lng - radiusM / metersPerDegreeLon);

      const mapWidth = map.getSize().x;
      const margin = 28;
      // By construction (see the focus effect's SIDE_PANEL_WIDTH_PX offset), `center`
      // ends up sitting this far right of the map container's own left edge once the
      // flyTo completes.
      const finalCenterX = mapWidth / 2 - SIDE_PANEL_WIDTH_PX / 2;

      const centerProjected = map.project(center, zoom);
      const desiredProjected = map.project(desired, zoom);
      const westOffsetPx = centerProjected.x - desiredProjected.x;

      const finalHandleX = finalCenterX - westOffsetPx;
      const clampedX = Math.min(Math.max(finalHandleX, margin), mapWidth - margin);
      const clampedOffsetPx = finalCenterX - clampedX;

      return map.unproject(L.point(centerProjected.x - clampedOffsetPx, centerProjected.y), zoom);
    };

    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng(center);
      radiusCircleRef.current.setRadius(radiusCircle.radiusM);
    } else {
      const circle = L.circle(center, {
        radius: radiusCircle.radiusM,
        color: "#00775c",
        weight: 2,
        dashArray: "8 6",
        fillColor: "#00775c",
        fillOpacity: 0.06,
        interactive: false,
      });
      circle.addTo(map);
      radiusCircleRef.current = circle;
    }

    // Never fight the user's own in-progress drag by snapping the handle back to the
    // canonical point mid-gesture -- only reposition it for externally-driven changes
    // (the slider, or a new right-click center).
    if (draggingRadiusHandleRef.current) return;

    if (radiusHandleRef.current) {
      radiusHandleRef.current.setLatLng(handleLatLngFor(radiusCircle.radiusM));
      return;
    }

    const handle = L.marker(handleLatLngFor(radiusCircle.radiusM), {
      icon: L.divIcon({
        className: "vc-marker",
        html: `<div class="vc-radius-handle"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
      draggable: true,
      zIndexOffset: 900,
    });
    handle.bindTooltip("Drag to resize radius", { direction: "right", offset: [10, 0] });

    handle.on("dragstart", () => {
      draggingRadiusHandleRef.current = true;
      handle.openTooltip();
    });
    handle.on("drag", () => {
      const circle = radiusCircleRef.current;
      if (!circle) return;
      const radiusM = circle.getLatLng().distanceTo(handle.getLatLng());
      circle.setRadius(radiusM);
      handle.setTooltipContent(`${(radiusM / 1000).toFixed(1)} km`);
    });
    handle.on("dragend", () => {
      draggingRadiusHandleRef.current = false;
      const circle = radiusCircleRef.current;
      if (!circle) return;
      const radiusM = circle.getLatLng().distanceTo(handle.getLatLng());
      onRadiusCircleCommitRef.current?.(radiusM);
    });

    handle.addTo(map);
    radiusHandleRef.current = handle;
  }, [radiusCircle]);

  return <div ref={containerRef} className="h-full w-full" />;
}
