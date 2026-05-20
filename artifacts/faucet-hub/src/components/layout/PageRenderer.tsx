import { Fragment } from "react";

interface PageRendererProps {
  content: string;
}

function renderLine(line: string, key: number) {
  if (line.startsWith("# ")) {
    return <h1 key={key} className="text-3xl font-bold font-mono mt-8 mb-4 text-foreground">{line.slice(2)}</h1>;
  }
  if (line.startsWith("## ")) {
    return <h2 key={key} className="text-xl font-bold font-mono mt-6 mb-3 text-primary">{line.slice(3)}</h2>;
  }
  if (line.startsWith("### ")) {
    return <h3 key={key} className="text-lg font-semibold font-mono mt-4 mb-2 text-foreground">{line.slice(4)}</h3>;
  }
  if (line.startsWith("- ")) {
    return (
      <li key={key} className="ml-4 text-muted-foreground leading-relaxed flex gap-2">
        <span className="text-primary mt-1 shrink-0">▸</span>
        <span>{renderInline(line.slice(2))}</span>
      </li>
    );
  }
  const trimmed = line.trim();
  if (/^\d+\.\s/.test(trimmed)) {
    const match = trimmed.match(/^(\d+)\.\s(.+)$/);
    if (match) {
      return (
        <li key={key} className="ml-4 text-muted-foreground leading-relaxed flex gap-2">
          <span className="text-primary font-mono shrink-0">[{match[1]}]</span>
          <span>{renderInline(match[2])}</span>
        </li>
      );
    }
  }
  if (!trimmed) return null;
  return <p key={key} className="text-muted-foreground leading-relaxed">{renderInline(line)}</p>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function PageRenderer({ content }: PageRendererProps) {
  const blocks = content.split("\n\n");
  return (
    <div className="space-y-4">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const hasListItems = lines.some(l => l.startsWith("- ") || /^\d+\.\s/.test(l.trim()));
        if (hasListItems) {
          return (
            <ul key={bi} className="space-y-2">
              {lines.map((line, li) => renderLine(line, li))}
            </ul>
          );
        }
        return (
          <Fragment key={bi}>
            {lines.map((line, li) => renderLine(line, li))}
          </Fragment>
        );
      })}
    </div>
  );
}
