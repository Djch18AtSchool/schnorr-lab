import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { SCRIPTED_ACTS } from "../data/simulated/acts";
import { buildBeats } from "./beats";
import { EMPTY_STORE } from "./events";
import { formulaRow, noteView, reviewNote, toneOf, valueRow } from "./note";

describe("reviewNote", () => {
  test("resume la fase revisada con su explicación y el resultado", async () => {
    const { final } = await playAct("login");

    expect(reviewNote(final, 2, 3)).toMatchObject({
      who: "Revisando el paso 3 del diagrama",
      title: "Viaja el compromiso t",
      text: expect.stringContaining("reto c = 3"),
    });
  });
});

const actInfo = (id: string) => SCRIPTED_ACTS.find((a) => a.info.id === id)?.info ?? null;

async function notes(actId: string, store = true) {
  const played = await playAct(actId);
  const beats = buildBeats(played.final);
  return (id: string) => noteView(played.final, actInfo(actId), beats.find((b) => b.id === id) ?? beats[0], store ? played.store : EMPTY_STORE);
}

describe("filas de matemáticas", () => {
  test("separa la etiqueta del valor y su aclaración", () => {
    expect(valueRow("r (aleatorio, de un solo uso)", "5")).toEqual({ term: "r = 5", detail: "aleatorio, de un solo uso", tone: "plain" });
    expect(valueRow("t", "12")).toEqual({ term: "t = 12", detail: "", tone: "plain" });
  });

  test("parte la fórmula entre la definición y la cuenta", () => {
    expect(formulaRow("t = g^r mod p = 4^5 mod 23 = 12")).toEqual({ term: "t = g^r mod p", detail: "4^5 mod 23 = 12", tone: "plain" });
    expect(formulaRow("t·y^c = 12·8^3 mod 23 = 3 ✓").tone).toBe("ok");
    expect(formulaRow("c = 3")).toEqual({ term: "c = 3", detail: "", tone: "plain" });
    expect(toneOf("✗ no")).toBe("bad");
  });
});

describe("noteView", () => {
  test("el plano general presenta el acto", async () => {
    const note = await notes("login");

    expect(note("intro")).toMatchObject({ focus: "wide", who: "Plano general", title: "Inicio de sesión" });
  });

  test("un cálculo muestra valores y cuentas del paso", async () => {
    const note = await notes("login");

    const compute = note("s1:compute");

    expect(compute).toMatchObject({ focus: "ana", who: "Celular de Ana", title: "El celular elige r y calcula su compromiso" });
    expect(compute.math.map((m) => m.term)).toEqual(["r = 5", "t = 12", "t = g^r mod p"]);
  });

  test("el servidor usa los títulos y matemáticas que mandó el banco", async () => {
    const note = await notes("login");

    const server = note("s4:x0:srv");

    expect(server).toMatchObject({ focus: "bank", title: "g^s ≡ t·y^c (mod p) ✔ → acceso concedido", text: "El banco recibe la respuesta s" });
    expect(server.math).toHaveLength(4);
  });

  test("sin eventos el servidor explica igual qué atiende", async () => {
    const note = await notes("login", false);

    expect(note("s2:x0:srv")).toMatchObject({ title: "El banco atiende POST /commit", math: [{ term: "t ∈ subgrupo de orden q" }] });
  });

  test("mensajes y respuestas hablan de lo que viaja", async () => {
    const note = await notes("espia_respuesta");

    expect(note("s2:x0:req").text).toContain("Eve está escuchando la red");
    expect(note("s2:x0:res").title).toBe("Viaja la respuesta: c = 3");
    expect(note("s6:x0:req").title).toBe("Viaja POST /respond");
    expect(note("s6:x0:res").title).toBe("Viaja la decisión: Sesión inválida");
  });

  test("desenlace y resumen", async () => {
    const espia = await notes("espia_respuesta");
    const registro = await notes("registro");

    expect(espia("outcome")).toMatchObject({ focus: "eve", title: "El ataque no funcionó" });
    expect(espia("summary").math.find((m) => m.term === "por la red")?.detail).toContain("t = 12");
    expect(espia("summary").math.find((m) => m.term === "decisión")).toMatchObject({ tone: "bad" });
    expect(registro("outcome").title).toBe("La cuenta de Ana quedó creada");
    expect(registro("summary").title).toBe("Ana quedó registrada");
  });
});
