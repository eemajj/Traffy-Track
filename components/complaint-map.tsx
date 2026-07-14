"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { ComplaintMapPoint, MapFocus } from "@/lib/map";

const DEFAULT_CENTER: L.LatLngExpression = [13.75, 100.35];
const THAI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short"
});

function getMarkerColor(state: string | null) {
  if (state === "เสร็จสิ้น" || state === "ไม่เกี่ยวข้อง" || state === "ส่งต่อ(ใหม่)") {
    return "#1f7a5a";
  }

  if (!state) {
    return "#5b6b84";
  }

  return "#c98322";
}

function formatDate(value: string | null) {
  if (!value) {
    return "ไม่ระบุ";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "ไม่ระบุ";
  }

  return THAI_DATE_TIME_FORMATTER.format(date);
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string,
  className?: string
) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

function createPopupContent(point: ComplaintMapPoint) {
  const content = document.createElement("div");
  content.className = "min-w-52 space-y-2 text-sm text-ink";

  const heading = document.createElement("div");
  heading.className = "flex items-start justify-between gap-3";

  const ticketLink = createTextElement("a", point.ticket_id, "font-mono font-semibold text-brand hover:text-brand-deep");
  ticketLink.href = `/cases/${encodeURIComponent(point.ticket_id)}`;
  const status = createTextElement(
    "span",
    point.state || "ไม่ระบุสถานะ",
    "rounded-full bg-surface px-2 py-1 text-xs font-semibold"
  );
  heading.append(ticketLink, status);

  const detail = createTextElement("p", point.comment || "ไม่มีรายละเอียดปัญหา", "font-semibold leading-5");
  const address = createTextElement("p", point.address || "ไม่ระบุที่อยู่", "leading-5 text-muted");
  const updatedAt = createTextElement("p", `อัปเดต ${formatDate(point.last_activity)}`, "text-xs text-muted");
  const detailLink = createTextElement("a", "เปิดรายละเอียดเคส →", "inline-flex font-semibold text-brand hover:text-brand-deep");
  detailLink.href = `/cases/${encodeURIComponent(point.ticket_id)}`;

  content.append(heading, detail, address, updatedAt, detailLink);
  return content;
}

function fitMapViewport(map: L.Map, points: ComplaintMapPoint[], focus?: MapFocus | null) {
  map.invalidateSize();

  if (focus) {
    const latDelta = focus.radiusMeters / 110574;
    const longitudeScale = Math.max(Math.cos((focus.lat * Math.PI) / 180), 0.01);
    const lngDelta = focus.radiusMeters / (111320 * longitudeScale);
    map.fitBounds(
      [
        [focus.lat - latDelta, focus.lng - lngDelta],
        [focus.lat + latDelta, focus.lng + lngDelta]
      ],
      { padding: [32, 32], maxZoom: 16 }
    );
    return;
  }

  if (points.length === 0) {
    map.setView(DEFAULT_CENTER, 12);
    return;
  }

  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 15);
    return;
  }

  map.fitBounds(points.map((point) => [point.lat, point.lng] as L.LatLngTuple), {
    padding: [32, 32],
    maxZoom: 15
  });
}

export function ComplaintMap({ points, focus }: { points: ComplaintMapPoint[]; focus?: MapFocus | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayerRef = useRef<L.LayerGroup | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    let map: L.Map | null = null;
    try {
      map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: 12,
        scrollWheelZoom: true,
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
    mapRef.current = map;
    dataLayerRef.current = dataLayer;
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => map.invalidateSize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      dataLayerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const dataLayer = dataLayerRef.current;
    if (!map || !dataLayer) {
      return;
    }

    dataLayer.clearLayers();

    if (focus) {
      L.circle([focus.lat, focus.lng], {
        radius: focus.radiusMeters,
        color: "#00744b",
        fillColor: "#00744b",
        fillOpacity: 0.12,
        weight: 2
      }).addTo(dataLayer);
    }

    for (const point of points) {
      L.circleMarker([point.lat, point.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: getMarkerColor(point.state),
        fillOpacity: 0.9
      })
        .bindPopup(() => createPopupContent(point))
        .addTo(dataLayer);
    }

    return () => {
      dataLayer.clearLayers();
    };
  }, [focus, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const activeFocus = viewportRevision === 0 ? focus : null;
    const fitToPoints = () => fitMapViewport(map, points, activeFocus);
    const animationFrame = window.requestAnimationFrame(fitToPoints);
    const retryTimer = window.setTimeout(fitToPoints, 180);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(retryTimer);
    };
  }, [focus, points, viewportRevision]);

  return (
    <div className="complaint-map-shell relative">
      <button
        type="button"
        onClick={() => {
          setViewportRevision((current) => current + 1);
        }}
        className="absolute right-3 top-3 z-10 min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:border-brand/35 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        จัดกรอบทุกจุด
      </button>
      <div ref={containerRef} className="complaint-map" role="region" aria-label="ตำแหน่งเรื่องร้องเรียนบนแผนที่" />
    </div>
  );
}
