/**
 * Qué componente dibuja cada experimento del índice y con qué parte de LabResults. Si el archivo
 * falta, se muestra el aviso con el comando que lo genera; si falta solo un bloque, se dice cuál.
 */
import type { ReactNode } from "react";
import type { LabResults } from "../../data/source";
import { ArithmeticExperiment, RandomnessExperiment } from "./Checks";
import { BsgsExperiment } from "./attacks/Bsgs";
import { ImpostorExperiment, SimulatorExperiment } from "./attacks/Impostor";
import { NonceExperiment, ReplayExperiment } from "./attacks/Reuse";
import { ComparisonLatency, ComparisonNetwork } from "./comparison/CostCharts";
import { ComparisonStolen } from "./comparison/StolenDb";
import { ComparisonSummary } from "./comparison/Summary";
import { ComparisonQualitative, ComparisonStored } from "./comparison/Tables";
import { ExperimentBlockMissing, MissingFile, type ExpContext } from "./Experiment";
import { LatencyBackends, LatencyRatio } from "./performance/Growth";
import { LatencyBits } from "./performance/LatencyBits";

type Render = (r: LabResults, ctx: ExpContext) => ReactNode | undefined;

/** El q del grupo del escrito (lo traen el simulador o el impostor); el ejemplo de r repetido lo usa. */
const toyQ = (r: LabResults): number => r.experimentos?.simulator?.q ?? r.experimentos?.impostor?.q ?? 0;

const RENDERS: Readonly<Record<string, Render>> = {
  comparacion: (r, ctx) => r.comparacion && <ComparisonSummary ctx={ctx} c={r.comparacion} />,
  "comparacion-latencia": (r, ctx) => r.comparacion && <ComparisonLatency ctx={ctx} c={r.comparacion} />,
  "comparacion-red": (r, ctx) => r.comparacion && <ComparisonNetwork ctx={ctx} c={r.comparacion} />,
  "comparacion-base-robada": (r, ctx) => r.comparacion && <ComparisonStolen ctx={ctx} c={r.comparacion} />,
  "comparacion-guarda": (r, ctx) => r.comparacion && <ComparisonStored ctx={ctx} c={r.comparacion} />,
  "comparacion-cualitativa": (r, ctx) => r.comparacion && <ComparisonQualitative ctx={ctx} c={r.comparacion} />,
  "latencia-bits": (r, ctx) => r.latency && <LatencyBits ctx={ctx} results={r.latency} />,
  "latencia-aritmeticas": (r, ctx) => r.latency && <LatencyBackends ctx={ctx} results={r.latency} />,
  "latencia-razon": (r, ctx) => r.latency && <LatencyRatio ctx={ctx} results={r.latency} />,
  bsgs: (r, ctx) => r.bsgs && <BsgsExperiment ctx={ctx} results={r.bsgs} />,
  impostor: (r, ctx) => r.experimentos && (r.experimentos.impostor ? <ImpostorExperiment ctx={ctx} imp={r.experimentos.impostor} /> : <ExperimentBlockMissing ctx={ctx} what="impostor" />),
  simulador: (r, ctx) => r.experimentos && (r.experimentos.simulator ? <SimulatorExperiment ctx={ctx} sim={r.experimentos.simulator} /> : <ExperimentBlockMissing ctx={ctx} what="simulador" />),
  "r-repetido": (r, ctx) => r.experimentos && (r.experimentos.nonceReuse ? <NonceExperiment ctx={ctx} nonce={r.experimentos.nonceReuse} q={toyQ(r)} /> : <ExperimentBlockMissing ctx={ctx} what="r_repetido" />),
  repeticion: (r, ctx) => r.experimentos && (r.experimentos.replay ? <ReplayExperiment ctx={ctx} replay={r.experimentos.replay} /> : <ExperimentBlockMissing ctx={ctx} what="repeticion" />),
  aleatoriedad: (r, ctx) => r.experimentos && (r.experimentos.randomness ? <RandomnessExperiment ctx={ctx} rnd={r.experimentos.randomness} /> : <ExperimentBlockMissing ctx={ctx} what="aleatoriedad" />),
  aritmetica: (r, ctx) => r.experimentos && (r.experimentos.arithmetic ? <ArithmeticExperiment ctx={ctx} arith={r.experimentos.arithmetic} /> : <ExperimentBlockMissing ctx={ctx} what="aritmetica" />),
};

export function ExperimentView({ id, results, ctx }: { id: string; results: LabResults; ctx: ExpContext }) {
  const view = RENDERS[id]?.(results, ctx);
  return view ? <>{view}</> : <MissingFile ctx={ctx} state={results.files[ctx.meta.file]} />;
}
