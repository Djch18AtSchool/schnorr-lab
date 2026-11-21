/** JSON con color por tipo de valor (sin HTML crudo: cada token es un elemento de React). */
import type { ReactNode } from "react";

function render(value: unknown, depth: number): ReactNode {
  const pad = "  ".repeat(depth);
  if (value === null || value === undefined) return <span className="z">null</span>;
  if (typeof value === "string") return <span className="s">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="n">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="b">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return <>{"[\n"}{value.map((item, i) => <span key={i}>{pad}  {render(item, depth + 1)}{i < value.length - 1 ? ",\n" : "\n"}</span>)}{pad}{"]"}</>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return (
    <>
      {"{\n"}
      {entries.map(([key, item], i) => (
        <span key={key}>{pad}  <span className="k">{JSON.stringify(key)}</span>: {render(item, depth + 1)}{i < entries.length - 1 ? ",\n" : "\n"}</span>
      ))}
      {pad}{"}"}
    </>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="json">{typeof value === "string" ? value : render(value, 0)}</pre>;
}
