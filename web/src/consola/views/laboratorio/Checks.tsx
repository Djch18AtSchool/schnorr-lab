/** Verificaciones: r y c nuevos en cada sesión, y la aritmética propia contra Python y SymPy. */
import type { ArithmeticResults, RandomnessResults } from "../../data/labTypes";
import { fmtInt } from "../../lib/format";
import { DataTable, ExperimentFrame, Tally, type ExpContext } from "./Experiment";

const toneOf = (value: number, of: number) => (value === of ? "ok" as const : "bad" as const);

export function RandomnessExperiment({ ctx, rnd }: { ctx: ExpContext; rnd: RandomnessResults }) {
  const allFresh = rnd.distinctT === rnd.logins && rnd.distinctC === rnd.logins;
  return (
    <ExperimentFrame ctx={ctx} source={`${fmtInt(rnd.logins)} inicios de sesión con ${rnd.group}`}
      conclusion={<>{allFresh ? <>Ningún valor se repitió: </> : <>Hubo repeticiones: </>}<b>{fmtInt(rnd.distinctT)}</b> compromisos t y <b>{fmtInt(rnd.distinctC)}</b> retos c distintos
        en {fmtInt(rnd.logins)} inicios de sesión ({fmtInt(rnd.accepted)} aceptados). Con q de {rnd.qBits} bits, que dos coincidan es prácticamente imposible; un r repetido
        revelaría x (ver «r repetido revela x»).</>}
      data={<DataTable head={["Grupo", "bits q", "inicios", "aceptados", "t distintos", "c distintos"]}
        rows={[[rnd.group, rnd.qBits, rnd.logins, rnd.accepted, rnd.distinctT, rnd.distinctC]]} />}>
      <div className="tallies">
        <Tally value={rnd.accepted} of={rnd.logins} tone={toneOf(rnd.accepted, rnd.logins)} label="inicios de sesión aceptados" />
        <Tally value={rnd.distinctT} of={rnd.logins} tone={toneOf(rnd.distinctT, rnd.logins)} label={<>compromisos t = g<sup>r</sup> distintos (r nuevo cada vez)</>} />
        <Tally value={rnd.distinctC} of={rnd.logins} tone={toneOf(rnd.distinctC, rnd.logins)} label="retos c distintos (los elige el banco)" />
      </div>
    </ExperimentFrame>
  );
}

export function ArithmeticExperiment({ ctx, arith }: { ctx: ExpContext; arith: ArithmeticResults }) {
  const all = arith.modPowMatches === arith.cases && arith.modInverseMatches === arith.cases;
  return (
    <ExperimentFrame ctx={ctx} source={`${fmtInt(arith.cases)} casos al azar de ${arith.bits} bits`}
      conclusion={<>{all ? "Coinciden en todos los casos" : "Hubo diferencias"}: mod_pow igualó a pow(b, e, m) en <b>{fmtInt(arith.modPowMatches)} de {fmtInt(arith.cases)}</b> casos y
        mod_inverse (Euclides extendido) a SymPy en <b>{fmtInt(arith.modInverseMatches)} de {fmtInt(arith.cases)}</b>, con números de {arith.bits} bits.</>}
      data={<DataTable head={["Operación", "Coincidencias", "Casos"]}
        rows={[["mod_pow frente a pow", arith.modPowMatches, arith.cases], ["mod_inverse frente a SymPy", arith.modInverseMatches, arith.cases]]} />}>
      <div className="tallies">
        <Tally value={arith.modPowMatches} of={arith.cases} tone={toneOf(arith.modPowMatches, arith.cases)} label={<>mod_pow(b, e, m) = pow(b, e, m), {arith.bits} bits</>} />
        <Tally value={arith.modInverseMatches} of={arith.cases} tone={toneOf(arith.modInverseMatches, arith.cases)} label={<>mod_inverse(a, m) = sympy.mod_inverse(a, m)</>} />
      </div>
      {arith.examples.length ? (
        <p className="cap">Ejemplos del escrito: {arith.examples.map((e, i) => <span key={e.expr}>{i ? "; " : ""}<code>{e.expr} = {e.value}</code></span>)}.</p>
      ) : null}
    </ExperimentFrame>
  );
}
