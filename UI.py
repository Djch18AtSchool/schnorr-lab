"""Schnorr Lab: interfaz gráfica sencilla que muestra el protocolo con notación matemática.

Uso:
    python UI.py

Usa la misma lógica que demo.py (protocol/, attacks/) y dibuja las fórmulas con
matplotlib (mathtext), de modo que las potencias, fracciones y congruencias se ven
como en el escrito y no como texto plano.
"""

import io
import subprocess
import sys
import tkinter as tk
from contextlib import redirect_stdout
from pathlib import Path
from tkinter import ttk

import matplotlib

matplotlib.use("Agg")
from matplotlib.figure import Figure

from attacks import impostor, nonce_reuse, simulator
from protocol import TOY_GROUP, get_group, validate_params
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import VerifyResult

ROOT = Path(__file__).resolve().parent
USER_ID = "cliente01"
EXAMPLE_X, EXAMPLE_R, EXAMPLE_C = 7, 5, 3      # transcripción del escrito
AVAILABLE_GROUPS = ("toy", "safe-256", "safe-512", "safe-1024")
MAX_PLAIN_DIGITS = 20

BG, CARD, ACCENT, TEXT, MUTED = "#f4f6fb", "#ffffff", "#2f5bea", "#1d2433", "#6b7385"
OK, FAIL = "#1f9d55", "#d64545"
FONT = "Segoe UI"


# ------------------------------------------------------------------ dibujo de fórmulas

def render_formula(latex: str, size: int = 17, color: str = TEXT) -> tk.PhotoImage:
    """Convierte una fórmula en notación TeX (mathtext) en una imagen para Tkinter."""
    fig = Figure(figsize=(0.01, 0.01), dpi=110)
    fig.patch.set_alpha(0)
    fig.text(0, 0, f"${latex}$", fontsize=size, color=color)
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight", pad_inches=0.06, transparent=True)
    return tk.PhotoImage(data=buffer.getvalue())


def num(n: int, full: bool = False) -> str:
    """Abrevia enteros grandes para que quepan en pantalla (igual que demo.py)."""
    text = str(n)
    if full or len(text) <= MAX_PLAIN_DIGITS:
        return text
    return rf"{text[:8]}\ldots{text[-6:]}\ (\mathrm{{{n.bit_length()}\ bits}})"


# ------------------------------------------------------------------------ aplicación

class SchnorrUI(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Schnorr Lab")
        self.geometry("1040x720")
        self.minsize(820, 560)
        self.configure(bg=BG)
        self._images: list[tk.PhotoImage] = []    # Tkinter necesita conservar las referencias
        self.verbose = tk.BooleanVar(value=False)
        self.group = tk.StringVar(value="toy")
        self._build_sidebar()
        self._build_content()
        self.show_example()

    # -------------------------------------------------------------- estructura

    def _build_sidebar(self) -> None:
        side = tk.Frame(self, bg=TEXT, width=250)
        side.pack(side="left", fill="y")
        side.pack_propagate(False)
        tk.Label(side, text="Schnorr Lab", bg=TEXT, fg="white",
                 font=(FONT, 18, "bold")).pack(anchor="w", padx=20, pady=(24, 0))
        tk.Label(side, text="Identificación sin revelar\nla clave secreta", bg=TEXT, fg="#aab3c5",
                 font=(FONT, 10), justify="left").pack(anchor="w", padx=20, pady=(2, 22))

        for label, command in (("1 · Ejemplo con p = 23", self.show_example),
                               ("2 · Autenticación aleatoria", self.show_interactive),
                               ("4 · Laboratorio de ataques", self.show_attacks),
                               ("7 · Ejecutar pruebas", self.show_tests)):
            tk.Button(side, text=label, command=command, anchor="w", relief="flat", bd=0,
                      bg="#2a3346", fg="white", activebackground=ACCENT, activeforeground="white",
                      font=(FONT, 11), padx=14, pady=9, cursor="hand2").pack(fill="x", padx=16, pady=4)

        tk.Label(side, text="Grupo (opción 2)", bg=TEXT, fg="#aab3c5",
                 font=(FONT, 10)).pack(anchor="w", padx=20, pady=(20, 2))
        ttk.Combobox(side, textvariable=self.group, values=AVAILABLE_GROUPS,
                     state="readonly", width=18).pack(anchor="w", padx=20)
        tk.Checkbutton(side, text="Mostrar pasos intermedios", variable=self.verbose,
                       bg=TEXT, fg="white", selectcolor=TEXT, activebackground=TEXT,
                       activeforeground="white", font=(FONT, 10)).pack(anchor="w", padx=16, pady=12)

        tk.Label(side, text="Modelo educativo · Matemática Discreta 2\nUniversidad CENFOTEC",
                 bg=TEXT, fg="#6f7a90", font=(FONT, 8), justify="left").pack(side="bottom", anchor="w",
                                                                             padx=20, pady=16)

    def _build_content(self) -> None:
        outer = tk.Frame(self, bg=BG)
        outer.pack(side="left", fill="both", expand=True)
        self.canvas = tk.Canvas(outer, bg=BG, highlightthickness=0)
        bar = ttk.Scrollbar(outer, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=bar.set)
        bar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.body = tk.Frame(self.canvas, bg=BG)
        window = self.canvas.create_window((0, 0), window=self.body, anchor="nw")
        self.body.bind("<Configure>", lambda _e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure(window, width=e.width))
        self.bind_all("<MouseWheel>", lambda e: self.canvas.yview_scroll(int(-e.delta / 120), "units"))

    # ------------------------------------------------------------ piezas visuales

    def clear(self, title: str, subtitle: str) -> None:
        for child in self.body.winfo_children():
            child.destroy()
        self._images.clear()
        self.canvas.yview_moveto(0)
        tk.Label(self.body, text=title, bg=BG, fg=TEXT, font=(FONT, 20, "bold")).pack(anchor="w",
                                                                                     padx=32, pady=(26, 0))
        tk.Label(self.body, text=subtitle, bg=BG, fg=MUTED, font=(FONT, 11)).pack(anchor="w",
                                                                                 padx=32, pady=(2, 14))

    def card(self, step: str, *formulas: str, note: str = "", trace: list[str] | None = None) -> None:
        """Una tarjeta por paso del protocolo: título, fórmulas renderizadas y nota opcional."""
        frame = tk.Frame(self.body, bg=CARD, highlightbackground="#e2e6ef", highlightthickness=1)
        frame.pack(fill="x", padx=32, pady=7)
        tk.Frame(frame, bg=ACCENT, width=5).pack(side="left", fill="y")
        inner = tk.Frame(frame, bg=CARD)
        inner.pack(side="left", fill="both", expand=True, padx=18, pady=12)
        tk.Label(inner, text=step.upper(), bg=CARD, fg=ACCENT, font=(FONT, 9, "bold")).pack(anchor="w")
        for latex in formulas:
            image = render_formula(latex)
            self._images.append(image)
            tk.Label(inner, image=image, bg=CARD).pack(anchor="w", pady=3)
        if note:
            tk.Label(inner, text=note, bg=CARD, fg=MUTED, font=(FONT, 10),
                     wraplength=640, justify="left").pack(anchor="w", pady=(2, 0))
        for line in trace or []:
            tk.Label(inner, text=f"·  {line}", bg=CARD, fg=MUTED, font=("Consolas", 9),
                     wraplength=660, justify="left").pack(anchor="w")

    def banner(self, result: VerifyResult) -> None:
        color = OK if result.accepted else FAIL
        text = "✔  ACCESO CONCEDIDO" if result.accepted else f"✘  ACCESO RECHAZADO: {result.reason}"
        tk.Label(self.body, text=text, bg=color, fg="white", font=(FONT, 14, "bold"),
                 pady=12).pack(fill="x", padx=32, pady=(12, 24))

    def console(self, text: str) -> None:
        box = tk.Text(self.body, bg="#111827", fg="#e5e7eb", font=("Consolas", 10), relief="flat",
                      padx=14, pady=12, height=max(10, min(text.count("\n") + 2, 40)), wrap="word")
        box.insert("1.0", text)
        box.configure(state="disabled")
        box.pack(fill="x", padx=32, pady=(4, 24))

    def _trace(self) -> list[str] | None:
        return [] if self.verbose.get() else None

    # ---------------------------------------------------------------- opciones

    def show_example(self) -> None:
        """Opción 1: transcripción del escrito con p = 23, x = 7, r = 5, c = 3."""
        gp, x, r = TOY_GROUP, EXAMPLE_X, EXAMPLE_R
        self.clear("Ejemplo paso a paso", "Transcripción del escrito con p = 23, x = 7, r = 5 y c = 3")
        y_steps, t_steps, v_steps = self._trace(), self._trace(), self._trace()
        valid = r"\checkmark" if not validate_params(gp) else r"\times"

        self.card("Parámetros públicos",
                  rf"p = {gp.p} \qquad q = \frac{{p-1}}{{2}} = {gp.q} \qquad g = {gp.g}",
                  rf"g^{{q}} = {gp.g}^{{{gp.q}}} \equiv 1 \ (\mathrm{{mod}}\ {gp.p}) \quad {valid}")

        bank, client = Bank(gp), Client(USER_ID, gp, x=x, trace=y_steps)
        bank.register(*client.register_payload())
        y = client.y
        self.card("Registro", rf"x = {x} \quad (\mathrm{{secreta}})",
                  rf"y = g^{{x}} \ \mathrm{{mod}}\ p = {gp.g}^{{{x}}} \ \mathrm{{mod}}\ {gp.p} = {y}",
                  note="El banco guarda solo y; la clave x nunca sale del cliente.", trace=y_steps)

        t = client.commit(r=r, trace=t_steps)
        self.card("Compromiso", rf"t = g^{{r}} \ \mathrm{{mod}}\ p = {gp.g}^{{{r}}} \ \mathrm{{mod}}\ {gp.p} = {t}",
                  note=f"El cliente elige r = {r} al azar y envía solo t.", trace=t_steps)

        challenge = bank.challenge(USER_ID, t, c=EXAMPLE_C)
        if isinstance(challenge, VerifyResult):
            self.banner(challenge)
            return
        session_id, c = challenge
        self.card("Reto", rf"c = {c}", note="El banco responde con un número c al azar.")

        s = client.respond(c)
        self.card("Respuesta", rf"s = r + c \cdot x \ \mathrm{{mod}}\ q = {r} + {c} \cdot {x} \ \mathrm{{mod}}\ {gp.q} = {s}",
                  rf"{r} + {c * x} = {r + c * x} \equiv {s} \ (\mathrm{{mod}}\ {gp.q})")

        result = bank.verify(session_id, s, v_steps)
        d = result.details
        if result.transcript is not None and d:
            same = d["t_rec"] == t
            self.card("Verificación",
                      rf"g^{{s}} = {gp.g}^{{{s}}} \ \mathrm{{mod}}\ {gp.p} = {d['gs']}",
                      rf"t \cdot y^{{c}} = {t} \cdot {y}^{{{c}}} \ \mathrm{{mod}}\ {gp.p} = {d['tyc']}",
                      rf"\frac{{g^{{s}}}}{{y^{{c}}}} = g^{{s}} \cdot (y^{{c}})^{{-1}} = "
                      rf"{d['gs']} \cdot {d['yc']}^{{-1}} = {d['gs']} \cdot {d['yc_inv']} \equiv {d['t_rec']}"
                      rf" {'=' if same else r'\neq'} t \quad {r'\checkmark' if same else r'\times'}",
                      note=f"El inverso ({d['yc']})⁻¹ = {d['yc_inv']} se calcula con el algoritmo "
                           "extendido de Euclides.", trace=v_steps)
        self.banner(result)

    def show_interactive(self) -> None:
        """Opción 2: x, r y c aleatorios en el grupo elegido, y luego el bloqueo por intentos."""
        try:
            gp = get_group(self.group.get())
        except (NotImplementedError, ValueError) as error:
            self.clear("Autenticación aleatoria", "")
            self.console(str(error))
            return
        full = self.verbose.get()
        self.clear("Autenticación aleatoria",
                   f"Grupo {gp.name}: p de {gp.bits} bits; x, r y c se eligen al azar con secrets")
        self.card("Parámetros públicos", rf"p = {num(gp.p, full)}", rf"q = {num(gp.q, full)}",
                  rf"g = {gp.g} \qquad g^{{q}} \equiv 1 \ (\mathrm{{mod}}\ p) \quad \checkmark")

        bank, client = Bank(gp), Client(USER_ID, gp)
        bank.register(*client.register_payload())
        self.card("Registro", rf"x = {num(client.x, full)} \quad (\mathrm{{secreta}})",
                  rf"y = g^{{x}} \ \mathrm{{mod}}\ p = {num(client.y, full)}")
        t = client.commit()
        self.card("Compromiso", rf"t = g^{{r}} \ \mathrm{{mod}}\ p = {num(t, full)}")
        session_id, c = bank.challenge(USER_ID, t)
        self.card("Reto", rf"c = {num(c, full)}")
        s = client.respond(c)
        self.card("Respuesta", rf"s = r + c \cdot x \ \mathrm{{mod}}\ q = {num(s, full)}")
        result = bank.verify(session_id, s)
        d = result.details
        self.card("Verificación", rf"g^{{s}} = {num(d['gs'], full)}",
                  rf"t \cdot y^{{c}} = {num(d['tyc'], full)}",
                  rf"g^{{s}} \equiv t \cdot y^{{c}} \ (\mathrm{{mod}}\ p) \quad "
                  rf"{r'\checkmark' if result.accepted else r'\times'}")
        self.banner(result)

        lines = []
        for attempt in range(1, bank.max_attempts + 1):
            sid, ch = bank.challenge(USER_ID, client.commit())
            res = bank.verify(sid, (client.respond(ch) + 1) % gp.q)
            lines.append(f"Intento {attempt}: s alterado → {res.reason} (quedan {res.attempts_left})")
        final = bank.challenge(USER_ID, client.commit())
        reason = final.reason if isinstance(final, VerifyResult) else "reto entregado (no debería ocurrir)"
        lines.append(f"Intento {bank.max_attempts + 1} (con la clave correcta): el banco no entrega reto → {reason}")
        self.card("Bloqueo por intentos", rf"s' = s + 1 \ \mathrm{{mod}}\ q",
                  note=f"Se envían {bank.max_attempts} respuestas falsas y luego la correcta.", trace=lines)

    def show_attacks(self) -> None:
        """Opción 4: ataques funcionales con p = 23 (misma salida que demo.py)."""
        self.clear("Laboratorio de ataques", "Reutilización de nonce, simulador e impostor con p = 23")
        self.card("Idea clave del ataque por nonce repetido",
                  r"x \equiv \frac{s_1 - s_2}{c_1 - c_2} \ (\mathrm{mod}\ q)",
                  note="Si el cliente usa el mismo r dos veces, cualquiera puede despejar la clave secreta.")
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            for attack in (nonce_reuse, simulator, impostor):
                attack.run(verbose=True)
                print()
            print("[Repetición de pruebas (Fiat-Shamir)] Disponible en el informe final.")
            print("[Base de datos robada (BSGS)] Disponible en el informe final.")
        self.console(buffer.getvalue())

    def show_tests(self) -> None:
        """Opción 7: ejecuta pytest sin las pruebas lentas y muestra la salida."""
        self.clear("Pruebas automáticas", "pytest -m \"not slow\"  ·  ejecutando…")
        self.update_idletasks()
        done = subprocess.run([sys.executable, "-m", "pytest", "-m", "not slow"], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        self.clear("Pruebas automáticas", f"pytest terminó con código {done.returncode}")
        self.console(done.stdout + done.stderr)


if __name__ == "__main__":
    SchnorrUI().mainloop()
