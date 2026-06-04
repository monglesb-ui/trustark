import { FileSearch } from "lucide-react";
import type { EvidenceItem } from "@/lib/types";

function sourceLabel(source: string) {
  if (source.startsWith("rag_docs")) return "법령·체크리스트";
  if (source.startsWith("risk_rule")) return "규칙 엔진";
  return "참조 데이터";
}

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch aria-hidden="true" size={20} className="text-moss" />
          <h2 className="text-lg font-bold">핵심 터무니</h2>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-2.5 py-1 text-xs font-bold text-moss">
          법령 + 규칙 근거
        </span>
      </div>
      <ul className="grid gap-3">
        {items.map((item, index) => (
          <li key={`${item.source}-${index}`} className="rounded-md border border-ink/10 border-l-4 border-l-moss bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-moss/10 px-2 py-1 text-xs font-black text-moss">{sourceLabel(item.source)}</span>
              <span className="text-xs font-bold text-ink/45">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <p className="font-bold text-ink">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink/75">{item.description}</p>
            <p className="mt-3 border-t border-ink/10 pt-2 text-xs font-medium text-ink/55">출처: {item.source}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
