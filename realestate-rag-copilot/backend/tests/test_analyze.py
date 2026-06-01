from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analyze_returns_safe_korean_report():
    response = client.post(
        "/analyze",
        json={
            "contract_type": "jeonse",
            "address": "서울시 마포구 성산동 000-00",
            "deposit": 300000000,
            "monthly_rent": 0,
            "sale_price": None,
            "property_type": "villa",
            "user_question": "이 집 전세 계약 전에 뭘 봐야 하나요?",
        },
    )

    body = response.json()

    assert response.status_code == 200
    assert body["risk_level"] in ["낮음", "주의", "검토 필요", "위험"]
    assert body["market_comparison"]["sample_size"] >= 1
    assert body["markers"][0]["marker_type"] == "target"
    assert body["evidence"]
    assert body["risk_signals"]
    assert {"severity", "title", "metric", "description", "source"} <= set(body["risk_signals"][0])
    assert "계약해도 됩니다" not in body["summary"]
