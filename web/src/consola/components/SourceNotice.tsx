/**
 * Aviso discreto cuando la telemetría del banco no responde al arrancar: ofrece cambiar a la fuente
 * simulada, pero no lo hace sola (no se cae en silencio a datos falsos).
 */
import { Icon } from "./Icons";

export function SourceNotice({ error }: { error: string }) {
  const simulatedUrl = `?fuente=simulada${window.location.hash}`;
  return (
    <div className="notice" role="status">
      <Icon name="media" style={{ flex: "none", marginTop: 2 }} />
      <span>
        <b>No se pudo leer la telemetría del banco.</b> <span className="mono">{error}</span>. Las secciones muestran solo lo que sí respondió.
      </span>
      <span className="tools">
        <button type="button" className="btn" onClick={() => window.location.reload()}>Reintentar</button>
        <a className="btn primary" href={simulatedUrl}>Usar datos simulados</a>
      </span>
    </div>
  );
}
