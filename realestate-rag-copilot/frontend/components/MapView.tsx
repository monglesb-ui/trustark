"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/public-env";
import type { Location, MapMarker } from "@/lib/types";

type NaverLatLng = unknown;
type NaverMap = unknown;
type NaverClientGeocodeResponse = {
  result?: {
    items?: Array<{
      point?: { x?: string | number; y?: string | number };
      address?: string;
      isRoadAddress?: boolean;
    }>;
  };
  v2?: { addresses?: Array<{ x?: string; y?: string; roadAddress?: string; jibunAddress?: string }> };
};

declare global {
  interface Window {
    naver?: {
      maps: {
        LatLng: new (lat: number, lng: number) => NaverLatLng;
        Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMap;
        Marker: new (options: Record<string, unknown>) => unknown;
        Service?: {
          geocode: (
            options: { address: string },
            callback: (status: string, response: NaverClientGeocodeResponse) => void
          ) => void;
          Status?: {
            OK: string;
          };
        };
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
  const [mapStatus, setMapStatus] = useState("네이버 지도 준비 중");

  useEffect(() => {
    if (!clientId) return;

    function parseClientGeocode(response: NaverClientGeocodeResponse) {
      const item = response.result?.items?.[0];
      const v2Item = response.v2?.addresses?.[0];
      const lng = Number(item?.point?.x ?? v2Item?.x);
      const lat = Number(item?.point?.y ?? v2Item?.y);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return { lat, lng };
    }

    function markerSetFor(centerLat: number, centerLng: number, useClientGeocode: boolean) {
      if (!useClientGeocode) return markers;

      return markers
        .filter((marker) => marker.marker_type === "target")
        .map((marker) => ({ ...marker, lat: centerLat, lng: centerLng }));
    }

    function drawMap(centerLat: number, centerLng: number, useClientGeocode = false) {
      if (!mapRef.current || !window.naver?.maps) return;

      const center = new window.naver.maps.LatLng(centerLat, centerLng);
      const map = new window.naver.maps.Map(mapRef.current, { center, zoom: 16 });
      markerSetFor(centerLat, centerLng, useClientGeocode).forEach((marker) => {
        new window.naver!.maps.Marker({
          position: new window.naver!.maps.LatLng(marker.lat, marker.lng),
          map,
          title: marker.label
        });
      });
    }

    function renderMap() {
      if (!mapRef.current || !window.naver?.maps) return;

      const geocoder = window.naver.maps.Service;
      const okStatus = geocoder?.Status?.OK ?? "OK";

      if (!geocoder) {
        setMapStatus("Geocoder 서브모듈 없음 · 서버 좌표 사용");
        drawMap(location.lat, location.lng);
        return;
      }

      setMapStatus("네이버 Geocoder 주소 변환 중");
      geocoder.geocode({ address: location.address }, (status, response) => {
        const parsed = parseClientGeocode(response);

        if (status === okStatus && parsed) {
          setMapStatus(`네이버 Geocoder 성공 · ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`);
          drawMap(parsed.lat, parsed.lng, true);
          return;
        }

        setMapStatus(`네이버 Geocoder 실패(${status}) · 서버 좌표 사용`);
        drawMap(location.lat, location.lng);
      });
    }

    if (window.naver?.maps?.Service) {
      renderMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.onload = renderMap;
    script.onerror = () => {
      setMapStatus("네이버 지도 스크립트 로드 실패");
    };
    document.head.appendChild(script);
  }, [clientId, location.address, location.lat, location.lng, markers]);

  if (clientId) {
    return (
      <div className="relative">
        <div ref={mapRef} className="h-96 rounded-lg border border-ink/15 bg-white" aria-label="네이버 지도" />
        <div className="absolute left-3 top-3 rounded-md border border-ink/10 bg-white/95 px-3 py-2 text-xs font-bold text-ink shadow-sm">
          {mapStatus}
        </div>
      </div>
    );
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
