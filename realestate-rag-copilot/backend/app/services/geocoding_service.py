from app.schemas.response import Location


class GeocodingService:
    MOCK_COORDINATES = [
        ("마포", 37.5662, 126.9017),
        ("성산", 37.5637, 126.9084),
        ("강남", 37.4979, 127.0276),
        ("송파", 37.5145, 127.1059),
        ("분당", 37.3827, 127.1189),
    ]

    def geocode(self, address: str) -> Location:
        for keyword, lat, lng in self.MOCK_COORDINATES:
            if keyword in address:
                return Location(lat=lat, lng=lng, address=address)
        return Location(lat=37.5665, lng=126.9780, address=address)
