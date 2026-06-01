from app.schemas.response import AnalyzeResponse


class ValidationAgent:
    BLOCKED_PHRASES = ["계약해도 됩니다", "계약 가능", "안전합니다"]

    def run(self, response: AnalyzeResponse) -> AnalyzeResponse:
        joined = " ".join(
            [
                response.summary,
                *response.next_actions,
                *response.warnings,
                *[item.description for item in response.evidence],
            ]
        )
        if any(phrase in joined for phrase in self.BLOCKED_PHRASES):
            response.warnings.append("단정적 표현이 감지되어 전문가 검토 권장 문구를 우선 적용했습니다.")
        return response
