import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/base.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/views.css";
import "./styles/extras.css";
import "./styles/lab.css";
import "./styles/responsive.css";
import { App } from "./App";
import { RealSource } from "./data/realSource";
import { SimulatedSource } from "./data/simulated/simulatedSource";
import type { ConsoleDataSource } from "./data/source";

/** ?fuente=simulada usa el banco simulado en el navegador; si no, el banco real del origen. */
function chooseSource(): ConsoleDataSource {
  const wanted = new URLSearchParams(window.location.search).get("fuente");
  return wanted === "simulada" ? new SimulatedSource() : new RealSource();
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App source={chooseSource()} />
  </StrictMode>,
);
