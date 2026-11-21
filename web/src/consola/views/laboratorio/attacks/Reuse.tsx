/** Ataques: r repetido (despejar x de dos respuestas) y repetición de pruebas no interactivas. */
import type { NizkReplayResults, NonceReuseResults } from "../../../data/labTypes";
import { nonceSteps, REPLAY_CASE_TEXT } from "../../../lib/labExperiments";
import { DataTable, ExperimentFrame, Tally, Verdict, type ExpContext } from "../Experiment";

function WorkedExample({ nonce, q }: { nonce: NonceReuseResults; q: number }) {
  const e = nonce.example;
  const steps = nonceSteps(nonce, q);
  if (!e) return null;
  return (
    <div className="worked">
      <h3>Ejemplo del escrito (q = {q}, x = {e.xReal})</h3>
      <ol>
        <li>Dos sesiones con el mismo compromiso <b>t = {e.t}</b>: retos c<sub>1</sub> = {e.c1} y c<sub>2</sub> = {e.c2}, respuestas s<sub>1</sub> = {e.s1} y s<sub>2</sub> = {e.s2}
          {e.bothAccepted ? <> (el banco <b>aceptó las dos</b>)</> : null}.</li>
        <li>Restar: s<sub>1</sub> − s<sub>2</sub> ≡ (c<sub>1</sub> − c<sub>2</sub>)·x (mod q), así que x ≡ (s<sub>1</sub> − s<sub>2</sub>)·(c<sub>1</sub> − c<sub>2</sub>)<sup>−1</sup> (mod q).</li>
        {steps ? <li>s<sub>1</sub> − s<sub>2</sub> ≡ {steps.ds}, c<sub>1</sub> − c<sub>2</sub> ≡ {steps.dc} y {steps.dc}<sup>−1</sup> ≡ {steps.inverse} (mod {q}); x ≡ {steps.ds}·{steps.inverse} ≡ <b>{steps.x}</b>.</li> : null}
      </ol>
      {e.recovered ? <Verdict tone="bad">x extraída = {e.xExtracted} = x real</Verdict> : <Verdict tone="ok">No se pudo extraer x</Verdict>}
    </div>
  );
}

export function NonceExperiment({ ctx, nonce, q }: { ctx: ExpContext; nonce: NonceReuseResults; q: number }) {
  const rnd = nonce.random;
  return (
    <ExperimentFrame ctx={ctx} source={rnd ? `${rnd.trials} casos al azar con ${rnd.group}` : "ejemplo del escrito"}
      conclusion={<>Repetir r es fatal: con dos respuestas al mismo t, x sale con una resta y un inverso modular
        {rnd ? <> — se recuperó en <b>{rnd.recovered} de {rnd.trials}</b> casos al azar con q de {rnd.qBits} bits</> : null}. Por eso el celular genera un r nuevo,
        con <code>secrets</code>, en cada inicio de sesión (ver «r y c nuevos en cada sesión»).</>}
      data={<DataTable head={["Caso", "t", "c₁", "s₁", "c₂", "s₂", "x real", "x extraída"]}
        rows={nonce.example ? [["ejemplo", nonce.example.t, nonce.example.c1, nonce.example.s1, nonce.example.c2, nonce.example.s2, nonce.example.xReal, nonce.example.xExtracted]] : []} />}>
      <div className="split">
        <WorkedExample nonce={nonce} q={q} />
        {rnd ? <Tally value={rnd.recovered} of={rnd.trials} tone={rnd.recovered === rnd.trials ? "bad" : "warn"}
          label={<>casos al azar ({rnd.group}, q de {rnd.qBits} bits) donde se recuperó x</>} /> : null}
      </div>
    </ExperimentFrame>
  );
}

export function ReplayExperiment({ ctx, replay }: { ctx: ExpContext; replay: NizkReplayResults }) {
  const protectedCase = replay.cases.find((c) => c.id === "con-proteccion");
  const plain = replay.cases.find((c) => c.id === "sin-proteccion");
  return (
    <ExperimentFrame ctx={ctx} source={`ventana de ${replay.window} s`}
      conclusion={<>Una prueba Fiat-Shamir es un solo mensaje, así que se puede copiar: {plain ? <>sin protección el verificador <b>{plain.accepted ? "la acepta" : "la rechaza"}</b></> : null}
        {protectedCase ? <>; el banco la <b>{protectedCase.accepted ? "acepta" : "rechaza"}</b> porque recuerda las pruebas ya usadas y exige una marca de tiempo m dentro de {replay.window} s</> : null}.
        {replay.victimLocked ? " La cuenta de la víctima quedó bloqueada." : " Rechazar las copias no bloquea la cuenta de la víctima."}</>}
      data={<DataTable numeric={false} head={["Caso", "Original aceptada", "Copia aceptada", "Respuesta"]}
        rows={replay.cases.map((c) => [REPLAY_CASE_TEXT[c.id].title, c.originalAccepted == null ? "—" : c.originalAccepted ? "sí" : "no", c.accepted ? "sí" : "no", c.reason])} />}>
      <div className="cases">
        {replay.cases.map((c) => (
          <div key={c.id} className={`case ${c.accepted ? "bad" : "ok"}`}>
            <h3>{REPLAY_CASE_TEXT[c.id].title}</h3>
            <p className="why">{REPLAY_CASE_TEXT[c.id].detail(replay)}</p>
            {c.accepted ? <Verdict tone="bad">Copia aceptada</Verdict> : <Verdict tone="ok">Copia rechazada</Verdict>}
            <p className="reason">«{c.reason}»</p>
          </div>
        ))}
      </div>
    </ExperimentFrame>
  );
}
