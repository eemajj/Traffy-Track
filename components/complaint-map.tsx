"use client";

import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ComplaintMapPoint, MapFocus } from "@/lib/map";
import {
  buildVisibleMapPoints,
  formatMapDate as formatDate,
  getMapCaseHref as getCaseHref,
  getMapMarkerColor as getMarkerColor,
  getMapStatusMeta as getStatusMeta
} from "@/lib/map/page-model";

const DEFAULT_CENTER: L.LatLngExpression = [13.75, 100.35];
const CLUSTER_CELL_SIZE = 58;
const LIST_LIMIT = 100;

function createTextElement<K extends keyof HTMLElementTagNameMap>(tagName: K, text: string, className?: string) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createPopupContent(point: ComplaintMapPoint) {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  const content = document.createElement("div");
  content.className = "min-w-52 space-y-2 text-sm text-ink";

  const heading = document.createElement("div");
  heading.className = "flex items-start justify-between gap-3";
  const ticketLink = createTextElement("a", point.ticket_id, "font-mono font-semibold text-brand hover:text-brand-deep");
  ticketLink.href = getCaseHref(point.ticket_id, returnTo);
  const status = createTextElement("span", point.state || "ไม่ระบุสถานะ", "rounded-full bg-surface px-2 py-1 text-xs font-semibold");
  heading.append(ticketLink, status);

  const detail = createTextElement("p", point.comment || "ไม่มีรายละเอียดปัญหา", "font-semibold leading-5");
  const address = createTextElement("p", point.address || "ไม่ระบุที่อยู่", "leading-5 text-muted");
  const updatedAt = createTextElement("p", `อัปเดต ${formatDate(point.last_activity)}`, "text-xs text-muted");
  const detailLink = createTextElement("a", "เปิดรายละเอียดเคส →", "inline-flex min-h-11 items-center font-semibold text-brand hover:text-brand-deep");
  detailLink.href = getCaseHref(point.ticket_id, returnTo);
  content.append(heading, detail, address, updatedAt, detailLink);
  return content;
}

function fitMapViewport(map: L.Map, points: ComplaintMapPoint[], focus?: MapFocus | null) {
  map.invalidateSize();
  if (focus) {
    const latDelta = focus.radiusMeters / 110574;
    const longitudeScale = Math.max(Math.cos((focus.lat * Math.PI) / 180), 0.01);
    const lngDelta = focus.radiusMeters / (111320 * longitudeScale);
    map.fitBounds([[focus.lat - latDelta, focus.lng - lngDelta], [focus.lat + latDelta, focus.lng + lngDelta]], {
      padding: [32, 32],
      maxZoom: 16,
      animate: false
    });
    return;
  }
  if (points.length === 0) {
    map.setView(DEFAULT_CENTER, 12, { animate: false });
  } else if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 15, { animate: false });
  } else {
    map.fitBounds(points.map((point) => [point.lat, point.lng] as L.LatLngTuple), {
      padding: [32, 32],
      maxZoom: 15,
      animate: false
    });
  }
}

type ComplaintMapProps = {
  points: ComplaintMapPoint[];
  focus?: MapFocus | null;
  returnTo: string;
};

export function ComplaintMap({ points, focus, returnTo }: ComplaintMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByTicketRef = useRef(new Map<string, L.CircleMarker>());
  const listItemRefs = useRef(new Map<string, HTMLElement>());
  const [viewportRevision, setViewportRevision] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [visibleTicketIds, setVisibleTicketIds] = useState<string[] | null>(null);
  const [scrollWheelEnabled, setScrollWheelEnabled] = useState(false);
  const visibleListPoints = useMemo(() => buildVisibleMapPoints(points, visibleTicketIds, LIST_LIMIT), [points, visibleTicketIds]);
  const visiblePointCount = visibleTicketIds?.length ?? points.length;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let map: L.Map | null = null;
    try {
      map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: 12,
        scrollWheelZoom: false,
        preferCanvas: true
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
    } catch (error) {
      map?.remove();
      throw error;
    }

    const dataLayer = L.layerGroup().addTo(map);
    const markerByTicket = markerByTicketRef.current;
    mapRef.current = map;
    dataLayerRef.current = dataLayer;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.invalidateSize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      markerByTicket.clear();
      dataLayerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const dataLayer = dataLayerRef.current;
    if (!map || !dataLayer) return;

    const renderData = () => {
      dataLayer.clearLayers();
      markerByTicketRef.current.clear();

      if (focus) {
        L.circle([focus.lat, focus.lng], {
          radius: focus.radiusMeters,
          color: "#00744b",
          fillColor: "#00744b",
          fillOpacity: 0.12,
          weight: 2
        }).addTo(dataLayer);
      }

      const groups = new Map<string, ComplaintMapPoint[]>();
      const viewportBounds = map.getBounds();
      const renderBounds = viewportBounds.pad(0.25);
      const visiblePoints: ComplaintMapPoint[] = [];
      for (const point of points) {
        if (viewportBounds.contains([point.lat, point.lng])) visiblePoints.push(point);
        if (!renderBounds.contains([point.lat, point.lng])) continue;
        const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
        const key = `${Math.floor(pixel.x / CLUSTER_CELL_SIZE)}:${Math.floor(pixel.y / CLUSTER_CELL_SIZE)}`;
        const group = groups.get(key);
        if (group) group.push(point);
        else groups.set(key, [point]);
      }

      for (const group of groups.values()) {
        if (group.length === 1) {
          const point = group[0];
          const isSelected = point.ticket_id === selectedTicketId;
          if (isSelected) {
            L.circleMarker([point.lat, point.lng], {
              radius: 17,
              color: "var(--brand-deep)",
              weight: 3,
              fillColor: "var(--brand-deep)",
              fillOpacity: 0.16,
              opacity: 0.9,
              interactive: false
            }).addTo(dataLayer);
          }
          const marker = L.circleMarker([point.lat, point.lng], {
            radius: isSelected ? 10 : 7,
            color: isSelected ? "var(--brand-deep)" : "var(--surface-elevated)",
            weight: isSelected ? 4 : 2,
            fillColor: getMarkerColor(point.state),
            fillOpacity: 1
          }).bindPopup(() => createPopupContent(point));
          if (isSelected) {
            marker.bindTooltip(`เคส ${point.ticket_id}`, {
              permanent: true,
              direction: "bottom",
              className: "complaint-map-selected-label",
              offset: L.point(0, 12),
              opacity: 1
            });
          }
          marker.on("click", () => setSelectedTicketId(point.ticket_id));
          marker.addTo(dataLayer);
          markerByTicketRef.current.set(point.ticket_id, marker);
          if (isSelected) {
            marker.openTooltip();
            marker.openPopup();
          }
          continue;
        }

        const center = group.reduce((result, point) => ({ lat: result.lat + point.lat, lng: result.lng + point.lng }), { lat: 0, lng: 0 });
        const clusterLatLng: L.LatLngExpression = [center.lat / group.length, center.lng / group.length];
        const cluster = L.marker(clusterLatLng, {
          keyboard: true,
          title: `กลุ่มเรื่องร้องเรียน ${group.length} เรื่อง กดเพื่อขยาย`,
          icon: L.divIcon({
            className: "complaint-map-cluster",
            html: `<span>${group.length}</span>`,
            iconSize: [42, 42],
            iconAnchor: [21, 21]
          })
        });
        cluster.on("click", () => {
          setSelectedTicketId(null);
          map.setView(clusterLatLng, Math.min(map.getZoom() + 2, 18), { animate: false });
        });
        cluster.addTo(dataLayer);
      }

      const nextVisibleTicketIds = visiblePoints.map((point) => point.ticket_id);
      setVisibleTicketIds((current) => {
        if (current && current.length === nextVisibleTicketIds.length && current.every((ticketId, index) => ticketId === nextVisibleTicketIds[index])) {
          return current;
        }
        return nextVisibleTicketIds;
      });
    };

    renderData();
    map.on("zoomend moveend", renderData);
    return () => {
      map.off("zoomend moveend", renderData);
      dataLayer.clearLayers();
    };
  }, [focus, points, returnTo, selectedTicketId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scrollWheelEnabled) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [scrollWheelEnabled]);

  useEffect(() => {
    if (!selectedTicketId) return;
    listItemRefs.current.get(selectedTicketId)?.scrollIntoView({ block: "nearest" });
  }, [selectedTicketId, visibleListPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeFocus = viewportRevision === 0 ? focus : null;
    const fitToPoints = () => fitMapViewport(map, points, activeFocus);
    const animationFrame = window.requestAnimationFrame(fitToPoints);
    const retryTimer = window.setTimeout(fitToPoints, 180);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(retryTimer);
    };
  }, [focus, points, viewportRevision]);

  function showPoint(point: ComplaintMapPoint) {
    const map = mapRef.current;
    if (!map) return;
    setSelectedTicketId(point.ticket_id);
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 17), { animate: false });
  }

  return (
    <div aria-labelledby="map-results-heading" className="grid min-w-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="complaint-map-results order-last flex min-h-0 flex-col border-t border-border bg-white lg:order-first lg:border-r lg:border-t-0">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="map-results-heading" className="font-semibold text-ink">เคสในพื้นที่ที่มองเห็น</h2>
              <span className="text-xs font-medium text-muted">{visiblePointCount} จุด</span>
            </div>
            <p id="map-instructions" className="mt-1 text-xs leading-5 text-muted">เลื่อนหรือซูมแผนที่เพื่ออัปเดตรายการ เลือกเคสเพื่อโฟกัสตำแหน่ง</p>
            <p className="mt-2 min-h-5 text-xs font-semibold" style={{ color: selectedTicketId ? "var(--brand-deep)" : "var(--muted)" }} aria-live="polite">
              {selectedTicketId ? `กำลังไฮไลต์เคส ${selectedTicketId}` : "ยังไม่ได้เลือกเคส"}
            </p>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto" aria-label="รายการเรื่องร้องเรียนในพื้นที่แผนที่">
            {visibleListPoints.map((point) => (
              <li
                key={point.ticket_id}
                ref={(element) => {
                  if (element) listItemRefs.current.set(point.ticket_id, element);
                  else listItemRefs.current.delete(point.ticket_id);
                }}
                className="border-b border-border last:border-b-0"
              >
                <article className={`px-4 py-3 transition-colors duration-200 ${selectedTicketId === point.ticket_id ? "complaint-map-result-selected" : "bg-white hover:bg-surface/45"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={getCaseHref(point.ticket_id, returnTo)} className="font-mono text-sm font-semibold text-brand hover:text-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                      {point.ticket_id}
                    </Link>
                    <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${getStatusMeta(point.state).className}`}>{getStatusMeta(point.state).label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showPoint(point)}
                    className="mt-2 block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    aria-pressed={selectedTicketId === point.ticket_id}
                  >
                    <span className="line-clamp-2 block text-sm font-medium leading-6 text-ink">{point.comment || "ไม่มีรายละเอียดปัญหา"}</span>
                    <span className="mt-1 line-clamp-1 block text-xs text-muted">{point.address || "ไม่ระบุที่อยู่"}</span>
                    <span className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold" style={{ color: selectedTicketId === point.ticket_id ? "var(--brand-deep)" : "var(--brand)" }}>
                      {selectedTicketId === point.ticket_id ? "● กำลังแสดงตำแหน่งนี้" : "แสดงตำแหน่ง →"}
                    </span>
                  </button>
                </article>
              </li>
            ))}
            {visibleListPoints.length === 0 ? (
              <li className="px-5 py-10 text-center">
                <p className="font-semibold text-ink">ไม่มีเคสในพื้นที่นี้</p>
                <p className="mt-1 text-sm leading-6 text-muted">ลองซูมออกหรือกด “จัดกรอบทุกจุด”</p>
              </li>
            ) : null}
          </ol>
          {visiblePointCount > LIST_LIMIT ? <p className="border-t border-border bg-surface px-4 py-3 text-xs leading-5 text-muted">แสดง 100 เคสแรกในพื้นที่นี้ ซูมเข้าเพื่อดูรายการที่เจาะจงขึ้น</p> : null}
        </aside>
        <div className="complaint-map-shell order-first relative min-w-0 lg:order-last">
          <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setScrollWheelEnabled((current) => !current)}
              aria-pressed={scrollWheelEnabled}
              className={scrollWheelEnabled ? "min-h-11 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" : "min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:border-brand/35 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"}
            >
              {scrollWheelEnabled ? "ซูมด้วยล้อ: เปิด" : "เปิดซูมด้วยล้อ"}
            </button>
            <button type="button" onClick={() => setViewportRevision((current) => current + 1)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:border-brand/35 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              จัดกรอบทุกจุด
            </button>
          </div>
          <div ref={containerRef} className="complaint-map" role="region" aria-label="ตำแหน่งเรื่องร้องเรียนบนแผนที่" aria-describedby="map-instructions" />
        </div>
    </div>
  );
}
