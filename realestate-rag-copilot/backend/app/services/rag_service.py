from pathlib import Path

from app.schemas.response import EvidenceItem

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "rag_docs"


class RagService:
    def search(self, query: str, contract_type: str) -> list[EvidenceItem]:
        docs = []
        for path in DATA_DIR.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
            for chunk in chunks:
                score = self._keyword_score(query, contract_type, chunk)
                if score > 0:
                    docs.append((score, path.stem, chunk))

        docs.sort(key=lambda item: item[0], reverse=True)
        return [
            EvidenceItem(
                title=f"RAG 체크리스트: {source}",
                description=chunk.replace("\n", " ")[:240],
                source=f"rag_docs/{source}.md",
            )
            for _, source, chunk in docs[:3]
        ]

    def _keyword_score(self, query: str, contract_type: str, chunk: str) -> int:
        keywords = ["등기부", "보증보험", "시세", "특약", "권리", "전세", "월세", "매매"]
        text = f"{query} {contract_type}".lower()
        chunk_lower = chunk.lower()
        return sum(1 for keyword in keywords if keyword in text and keyword in chunk_lower)
