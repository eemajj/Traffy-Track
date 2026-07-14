"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { ComplaintMapPoint, MapFocus } from "@/lib/map";

const DEFAULT_CENTER: [number, number] = [13.75, 100.35];

function getMarkerColor(state: string | null) {
  if (state === "เสร็จสิ้น" || state === "ไม่เกี่ยวข้อง" || state === "ส่งต่อ(ใหม่)") {
    return "#1f7a5a";
  }

  if (!state) {
    return "#5b6b84";
  }

  return "#c98322";
}

function MapViewport({ points, focus, revision }: { points: ComplaintMapPoint[]; focus?: MapFocus | null; revision: number }) {
  const map = useMap();

  useEffect(() => {
    const fitToPoints = () => {
      map.invalidateSize();

      if (focus) {
        const latDelta = focus.radiusMeters / 110574;
        const lngDelta = focus.radiusMeters / (111320 * Math.cos((focus.lat * Math.PI) / 180));
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

      map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), {
        padding: [32, 32],
        maxZoom: 15
      });
    };

    const animationFrame = window.requestAnimationFrame(fitToPoints);
    const retryTimer = window.setTimeout(fitToPoints, 180);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(retryTimer);
      observer.disconnect();
    };
  }, [focus, map, points, revision]);

  return null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "ไม่ระบุ";
  }

  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ComplaintMap({ points, focus }: { points: ComplaintMapPoint[]; focus?: MapFocus | null }) {
  const [viewportRevision, setViewportRevision] = useState(0);

  return (
    <div className="complaint-map-shell relative" aria-label="แผนที่จุดร้องเรียน">
      <button
        type="button"
        onClick={() => {
          setViewportRevision((current) => current + 1);
        }}
        className="absolute right-3 top-3 z-10 min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:border-brand/35 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        จัดกรอบทุกจุด
      </button>
      <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom className="complaint-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport points={points} focus={viewportRevision === 0 ? focus : null} revision={viewportRevision} />
        {focus ? (
          <Circle
            center={[focus.lat, focus.lng]}
            radius={focus.radiusMeters}
            pathOptions={{ color: "#00744b", fillColor: "#00744b", fillOpacity: 0.12, weight: 2 }}
          />
        ) : null}
        {points.map((point) => (
          <CircleMarker
            key={point.ticket_id}
            center={[point.lat, point.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: getMarkerColor(point.state),
              fillOpacity: 0.9
            }}
          >
            <Popup>
              <div className="min-w-52 space-y-2 text-sm text-ink">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/cases/${encodeURIComponent(point.ticket_id)}`} className="font-mono font-semibold text-brand hover:text-brand-deep">
                    {point.ticket_id}
                  </Link>
                  <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold">{point.state || "ไม่ระบุสถานะ"}</span>
                </div>
                <p className="font-semibold leading-5">{point.comment || "ไม่มีรายละเอียดปัญหา"}</p>
                <p className="leading-5 text-muted">{point.address || "ไม่ระบุที่อยู่"}</p>
                <p className="text-xs text-muted">อัปเดต {formatDate(point.last_activity)}</p>
                <Link href={`/cases/${encodeURIComponent(point.ticket_id)}`} className="inline-flex font-semibold text-brand hover:text-brand-deep">
                  เปิดรายละเอียดเคส →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
