# 05. 네이버 지도 API 연동 설계

## 1. 역할 정의

네이버 지도 API는 매물 데이터를 제공하는 소스가 아니다.

이 프로젝트에서 네이버 지도 API의 역할은 다음이다.

> 주소를 좌표로 변환하고, 분석 대상 매물과 주변 요소를 지도 위에서 시각화하는 UX 계층

## 2. 사용 기능

| 기능 | API | MVP 포함 여부 |
|---|---|---|
| 주소 → 좌표 변환 | Geocoding | 필수 |
| 좌표 → 주소 변환 | Reverse Geocoding | 선택 |
| 지도 표시 | Dynamic Map | 필수 |
| 정적 지도 이미지 | Static Map | 선택 |
| 길찾기 | Directions | 2차 기능 |
| 지도 스타일링 | Map Styling | 2차 기능 |

## 3. MVP 지도 기능

MVP에서는 아래 3개만 구현한다.

1. 사용자가 입력한 주소를 좌표로 변환
2. 지도에 대상 매물 마커 표시
3. 주변 실거래/학교/역 mock POI 표시

## 4. 프론트엔드 지도 표시 구조

### `MapView.tsx` 입력 props

```ts
export type MapMarker = {
  id: string;
  title: string;
  type: "target" | "transaction" | "school" | "subway" | "poi";
  lat: number;
  lng: number;
  description?: string;
};

export type MapViewProps = {
  center: {
    lat: number;
    lng: number;
  };
  markers: MapMarker[];
};
```

### 지도 마커 정책

| 타입 | 의미 |
|---|---|
| target | 분석 대상 매물 |
| transaction | 주변 실거래 비교 지점 |
| school | 학교 |
| subway | 지하철역 |
| poi | 기타 편의시설 |

## 5. 백엔드 좌표 응답 구조

`/analyze` API는 지도 표시를 위해 다음 데이터를 반환한다.

```json
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780,
    "address": "서울시 마포구 성산동"
  },
  "map_markers": [
    {
      "id": "target_001",
      "title": "분석 대상 매물",
      "type": "target",
      "lat": 37.5665,
      "lng": 126.9780,
      "description": "사용자가 입력한 주소"
    },
    {
      "id": "tx_001",
      "title": "주변 전세 거래",
      "type": "transaction",
      "lat": 37.5658,
      "lng": 126.9791,
      "description": "전세 2.6억 / 49㎡"
    }
  ]
}
```

## 6. 환경변수

`.env.example`

```env
NAVER_MAPS_CLIENT_ID=
NAVER_MAPS_CLIENT_SECRET=
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=
USE_MOCK_GEO=true
```

## 7. Backend Geocoding Service 설계

### 파일

`backend/app/services/geocoding_service.py`

### 함수

```python
def geocode_address(address: str) -> dict:
    """
    주소를 좌표로 변환한다.
    USE_MOCK_GEO=true이면 mock 좌표를 반환한다.
    API 키가 있으면 네이버 Geocoding API를 호출한다.
    실패 시 fallback 좌표를 반환한다.
    """
```

### fallback 정책

- API 키 없음 → mock 좌표 반환
- API 호출 실패 → mock 좌표 반환 + warning 추가
- 주소 없음 → 400 에러 반환

## 8. 지도 기반 인사이트

지도 API 자체가 리스크를 판단하지는 않는다.
지도 정보는 Report Agent가 다음과 같이 해석한다.

| 지도 정보 | 리포트 문장 예시 |
|---|---|
| 지하철역 500m 이내 | “대중교통 접근성은 양호한 편입니다.” |
| 학교 500m 이내 | “생활권 내 학교가 있어 실거주 관점에서 참고할 수 있습니다.” |
| 주변 거래 다수 | “주변 유사 거래 비교가 가능합니다.” |
| 주변 거래 부족 | “비교 가능한 거래가 부족해 시세 판단의 불확실성이 있습니다.” |

## 9. 구현 순서

1. mock 좌표 반환 함수 구현
2. frontend 지도 영역 placeholder 구현
3. Naver Maps script 로드
4. 대상 매물 마커 표시
5. mock 주변 마커 표시
6. 실제 Geocoding API 연동
7. 지도 기반 인사이트 문장 생성

## 10. 주의사항

- 네이버 지도는 매물 데이터를 제공하지 않는다.
- 매물/실거래 데이터는 별도 API 또는 mock data에서 가져온다.
- API 사용량과 요금 정책은 실제 개발 전 확인해야 한다.
- 발표 데모에서는 API 장애를 대비해 mock mode를 기본값으로 둔다.
