/**
 * Sección Laboratorio: todos los experimentos y mediciones del proyecto, uno por pantalla, con un
 * índice agrupado (lista lateral en pantallas anchas, selector en las angostas). La subsección va en
 * el hash (#laboratorio/impostor) y ← / → pasan al experimento anterior o siguiente.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Unavailable, ViewHead } from "../../components/Common";
import type { LabResults } from "../../data/source";
import { labFile } from "../../lib/labFiles";
import { EXPERIMENTS, experimentById, groupTitle, LAB_GROUPS, type ExperimentMeta } from "./catalog";
import { ExperimentView } from "./registry";

interface LaboratorioProps {
  results: LabResults | null;
  resultsError: string | undefined;
  simulated: boolean;
}

const PREFIX = "#laboratorio/";

function idFromHash(): string {
  const hash = window.location.hash;
  const id = hash.startsWith(PREFIX) ? decodeURIComponent(hash.slice(PREFIX.length)) : "";
  return experimentById(id) ? id : EXPERIMENTS[0].id;
}

/** Experimento activo, sincronizado con el hash (sobrevive a recargar y a compartir el enlace). */
function useExperimentRoute(): [string, (id: string) => void] {
  const [id, setId] = useState(idFromHash);
  useEffect(() => {
    const onHash = (): void => setId(idFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((next: string) => {
    window.history.replaceState(null, "", `${PREFIX}${next}`);
    setId(next);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);
  return [id, go];
}

/** ← y → recorren los experimentos (salvo con el foco en un campo o un selector). */
function useArrowKeys(onStep: (delta: number) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStep]);
}

function LabIndex({ current, onGo }: { current: string; onGo: (id: string) => void }) {
  return (
    <nav className="labidx" aria-label="Experimentos">
      {LAB_GROUPS.map((g) => (
        <div key={g.id} className="labgrp">
          <div className="labgrp-t">{g.title}</div>
          {EXPERIMENTS.filter((e) => e.group === g.id).map((e) => (
            <a key={e.id} href={`${PREFIX}${e.id}`} aria-current={e.id === current ? "page" : undefined}
              onClick={(ev) => { ev.preventDefault(); onGo(e.id); }}>{e.title}</a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function LabSelect({ current, onGo }: { current: string; onGo: (id: string) => void }) {
  return (
    <label className="labsel">
      <span className="sr">Experimento</span>
      <select className="field" value={current} onChange={(e) => onGo(e.target.value)}>
        {LAB_GROUPS.map((g) => (
          <optgroup key={g.id} label={g.title}>
            {EXPERIMENTS.filter((e) => e.group === g.id).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Pager({ index, onGo }: { index: number; onGo: (id: string) => void }) {
  const prev: ExperimentMeta | undefined = EXPERIMENTS[index - 1];
  const next: ExperimentMeta | undefined = EXPERIMENTS[index + 1];
  return (
    <div className="pager">
      {prev ? <button type="button" className="btn" onClick={() => onGo(prev.id)} title="Experimento anterior (←)"><ChevronLeft className="i" aria-hidden="true" />{prev.title}</button> : <span />}
      <span className="muted mono">{index + 1} / {EXPERIMENTS.length}</span>
      {next ? <button type="button" className="btn" onClick={() => onGo(next.id)} title="Experimento siguiente (→)">{next.title}<ChevronRight className="i" aria-hidden="true" /></button> : <span />}
    </div>
  );
}

export function Laboratorio({ results, resultsError, simulated }: LaboratorioProps) {
  const [id, go] = useExperimentRoute();
  const index = Math.max(0, EXPERIMENTS.findIndex((e) => e.id === id));
  const meta = EXPERIMENTS[index];
  const step = useCallback((delta: number) => {
    const next = EXPERIMENTS[index + delta];
    if (next) go(next.id);
  }, [index, go]);
  useArrowKeys(step);
  const groupIndex = EXPERIMENTS.filter((e) => e.group === meta.group).findIndex((e) => e.id === meta.id) + 1;
  const ctx = { meta, eyebrow: `${groupTitle(meta.group)} · ${groupIndex} de ${EXPERIMENTS.filter((e) => e.group === meta.group).length}`, file: labFile(meta.file), simulated };
  return (
    <>
      <ViewHead title="Laboratorio" tools={<LabSelect current={id} onGo={go} />}>
        Resultados de las mediciones y los experimentos del proyecto: la comparación con otros mecanismos, el rendimiento según el tamaño de p, los ataques y las
        verificaciones. Cada uno con la pregunta que responde, sus datos reales y la conclusión. Use ← y → para recorrerlos.
      </ViewHead>
      <div className="labx">
        <LabIndex current={id} onGo={go} />
        <div className="labmain">
          {results ? <ExperimentView key={id} id={id} results={results} ctx={ctx} /> : <Unavailable what="Los resultados del laboratorio" error={resultsError} />}
          <Pager index={index} onGo={go} />
        </div>
      </div>
    </>
  );
}
