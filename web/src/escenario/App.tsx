/** Elige la fuente de datos (?fuente=simulada) y monta el Escenario. Cambiar de fuente es explícito. */
import { useCallback, useMemo, useState } from "react";
import { createRealSource } from "./data/realSource";
import { createSimulatedSource } from "./data/simulated/simulatedSource";
import { searchWithSource, sourceKindFromSearch, type SourceKind } from "./data/source";
import { Scenario } from "./Scenario";
import "./styles/index.css";

export function App() {
  const [kind, setKind] = useState<SourceKind>(() => sourceKindFromSearch(window.location.search));
  const [attempt, setAttempt] = useState(0);
  const source = useMemo(() => (kind === "simulada" ? createSimulatedSource() : createRealSource()), [kind, attempt]);

  const changeSource = useCallback((next: SourceKind) => {
    const search = searchWithSource(window.location.search, next);
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
    setKind(next);
  }, []);

  return <Scenario key={`${kind}:${attempt}`} source={source} onSource={changeSource} onRetry={() => setAttempt((n) => n + 1)} />;
}
