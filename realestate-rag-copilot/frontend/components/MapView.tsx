"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/public-env";
import type { Location, MapMarker } from "@/lib/types";

declare global {
  interface Window {
    naver?: {
      maps: {
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
        Marker: new (options: Record<string, unknown>) => unknown;
      };
    };
  }
}

type Props = {
  location: Location;
  markers: MapMarker[];
};

export function MapView({ location, markers }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const clientId = publicEnv.naverMapClientId;

  useEffect(() => {
    if (!clientId) return;

    function renderMap() {
      if (!mapRef.current || !window.naver?.maps) return;
      const center = new window.naver.maps.LatLng(location.lat, location.lng);
      const map = new window.naver.maps.Map(mapRef.current, { center, zoom: 15 });
      markers.forEach((marker) => {
        new window.naver!.maps.Marker({
          position: new window.naver!.maps.LatLng(marker.lat, marker.lng),
          map,
          title: marker.label
        });
      });
    }

    if (window.naver?.maps) {
      renderMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
    script.async = true;
    script.onload = renderMap;
    document.head.appendChild(script);
  }, [clientId, location.lat, location.lng, markers]);

  if (clientId) {
    return <div ref={mapRef} className="h-96 rounded-lg border border-ink/15 bg-white" aria-label="네이버 지도" />;
  }

  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned aria-hidden="true" size={20} className="text-moss" />
          <h2 className="text-lg font-bold">지도 데모</h2>
        </div>
        <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">
          fallback coordinates
        </span>
      </div>
      <div className="relative h-96 overflow-hidden rounded-lg border border-dashed border-moss/50 bg-[linear-gradient(90deg,rgba(47,111,97,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(47,111,97,0.08)_1px,transparent_1px)] bg-[length:28px_28px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(47,111,97,0.18),transparent_34%)]" />
        <div className="absolute left-[12%] right-[10%] top-[52%] h-1 -rotate-6 rounded-full bg-moss/20" />
        <div className="absolute bottom-[18%] left-[18%] top-[12%] w-1 rotate-12 rounded-full bg-brass/20" />
        <div className="absolute left-5 top-5 max-w-[18rem] rounded-md border border-ink/10 bg-white/95 p-3 text-sm shadow-panel">
          지도 API 키가 없거나 좌표 조회가 실패하면 대체 좌표와 주변 표본 분포를 표시합니다.
        </div>
        {markers.slice(0, 6).map((marker, index) => (
          <div
            key={marker.id}
            className={`absolute grid h-10 w-10 place-items-center rounded-full text-[0.68rem] font-black text-white shadow-panel ring-4 ring-white/70 ${
              marker.marker_type === "target" ? "bg-clay" : "bg-moss"
            }`}
            style={{ left: `${20 + (index * 13) % 60}%`, top: `${56 - (index * 9) % 36}%` }}
            title={marker.label}
          >
            {marker.marker_type === "target" ? "대상" : index}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-ink/65">
        중심 좌표: {location.lat.toFixed(4)}, {location.lng.toFixed(4)} · 표본 {Math.max(0, markers.length - 1)}건
      </p>
    </section>
  );
}
