from app.services.report_service import ReportService


class ReportAgent:
    def __init__(self, report_service: ReportService | None = None) -> None:
        self.report_service = report_service or ReportService()

    def run(self, **kwargs):
        return self.report_service.build(**kwargs)
