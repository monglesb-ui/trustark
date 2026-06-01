import { FileSearch } from "lucide-react";
import type { EvidenceItem } from "@/lib/types";

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch aria-hidden="true" size={20} className="text-moss" />
          <h2 className="text-lg font-bold">핵심 근거</h2>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-2.5 py-1 text-xs font-bold text-moss">
          RAG + 규칙 근거
        </span>
      </div>
      <ul className="grid gap-3">
        {items.map((item, index) => (
          <li key={`${item.source}-${index}`} className="rounded-md border border-ink/10 border-l-4 border-l-moss bg-mint/35 p-4">
            <p className="font-bold">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink/75">{item.description}</p>
            <p className="mt-2 text-xs font-medium text-ink/55">출처: {item.source}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
