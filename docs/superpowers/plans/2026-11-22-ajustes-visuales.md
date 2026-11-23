# Ajustes visuales del Escenario y la Consola — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un Escenario con el lienzo como protagonista (sin barra superior, controles flotantes, tarjeta en posición fija por actor) y una Consola con más aire y menos texto de relleno.

**Architecture:** La posición de la tarjeta deja de elegirse por `bestFit` entre varias opciones y pasa a ser función pura del actor (`cardFor`); la cámara se encuadra alrededor de esa posición. La barra superior se elimina y «Dirección» pasa a un botón flotante. El transporte sale de la franja inferior y se vuelve una píldora flotante anclada al borde superior izquierdo de `.board`. La Consola se ajusta solo con CSS y poda de JSX, guiada por capturas.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, CSS plano, lucide-react. Playwright (MCP) para verificar lo visual.

**Spec:** `docs/superpowers/specs/2026-11-22-ajustes-visuales-design.md`

## Global Constraints

- No cambiar actos, protocolo, API ni atajos de teclado (`→`, `Espacio`, `←`, `R`, `D`, `C`, `Esc`).
- No cambiar colores ni tipografía; solo espaciado, posición y presencia de elementos.
- Posiciones de tarjeta: Ana → `right`, Eve → `left`, banco y red → `top` (arriba a la izquierda).
- Mismo margen de la tarjeta a los bordes en las tres posiciones: constante `NOTE_MARGIN = 32` (px).
- Los botones del transporte conservan `aria-label` (anterior, siguiente/reproducir/pausar, reiniciar); sin texto visible.
- Textos de la interfaz en español.
- `web/dist` está versionado: se recompila al final y el diff lo incluirá.
- No hacer commit ni push sin que Dylan lo pida.

## Review Focus

- Pantalla corta (1280×720): la tarjeta a la izquierda, centrada verticalmente, no debe solaparse con la píldora de transporte ni con «Dirección».
- Pantalla angosta (≤760 px): sin barra, la tarjeta pasa abajo y la píldora y «Dirección» siguen visibles y pulsables.
- Tarjeta alta (muchas filas de matemáticas, p. ej. el acto `r_repetido`) en posición fija: no debe salirse de la pantalla; con `max-height` y scroll interno.
- Revisión de un paso anterior (clic en una diapositiva) y plano general (`C`): la tarjeta usa también posición fija y no salta.
- Acto con y sin Eve: con `cast` sin Eve nada debe quedar reservado a la izquierda para ella.

---

### Task 1: Posición fija de la tarjeta por actor

**Files:**
- Modify: `web/src/escenario/model/camera.ts` (`CardPos`, `regionFor`, nuevo `cardFor`, constante `NOTE_MARGIN`)
- Modify: `web/src/escenario/components/cameraDom.ts:86-122` (`ShotGeometry.cards` → `card`)
- Modify: `web/src/escenario/components/useCamera.ts:110` (llamada a `bestFit`)
- Modify: `web/src/escenario/styles/stage.css:52-61` (posiciones y margen)
- Test: `web/src/escenario/model/camera.test.ts`

**Interfaces:**
- Produces: `export const NOTE_MARGIN = 32`; `export function cardFor(shot: Shot): CardPos`; `ShotGeometry` pasa a `{ rect: Rect; card: CardPos; max: number; frame: Rect | null }`.
- Consumes: `Shot` y `CardPos` ya existentes.

- [ ] **Step 1: Escribir las pruebas que fallan** en `camera.test.ts`:
  - `cardFor({ kind: "focus", focus: "ana", ... })` devuelve `"right"`; `focus: "eve"` → `"left"`; `focus: "bank"` y `focus: "net"` → `"top"`.
  - `cardFor({ kind: "wide" })`, `{ kind: "summary" }` y `{ kind: "review", stepIndex: 0 }` → `"top"`.
  - `regionFor("left", vp)` y `regionFor("right", vp)` son simétricas: con `vp = { vw: 1280, vh: 720, noteH: 200 }`, `left.x === 32 + 440 + 28` y `right.x + right.w === 1280 - 32 - 440 - 28`, y ambas con el mismo `y` y `h`.
- [ ] **Step 2: Ejecutar** `cd web && npx vitest run src/escenario/model/camera.test.ts` — esperado: FALLA (`cardFor` no existe).
- [ ] **Step 3: Implementar** `cardFor` con un `switch` por `shot.kind` y, para `focus`, por `shot.focus`. Reescribir `regionFor` para que `right` sea el espejo de `left` usando `NOTE_MARGIN`, y que el margen superior e inferior de la región sea el mismo (`NOTE_MARGIN - 4` arriba y abajo) ahora que no hay barra superior; la rama `top` usa `NOTE_MARGIN` como `top` de la tarjeta.
- [ ] **Step 4: Cambiar** `ShotGeometry.cards` por `card: CardPos` en `cameraDom.ts` (cada rama devuelve `card: cardFor(shot)`; `focusGeometry` recibe `card` en lugar de `cards`), y en `useCamera.ts` llamar `bestFit(geo.rect, [geo.card], viewport, geo.max)`.
- [ ] **Step 5: CSS** en `stage.css`: `.note[data-pos="right"] { top: 50%; right: 32px; left: auto; transform: translateY(-50%); }`, `left` con `left: 32px`, `top` con `top: 32px; left: 32px`; en las tres, `max-height: calc(100% - 64px); overflow-y: auto`. Añadir `right` a la `transition` ya existente.
- [ ] **Step 6: Ejecutar** `cd web && npm test && npm run typecheck` — esperado: todo en verde.

### Task 2: Quitar la barra superior; «Dirección» flotante

**Files:**
- Delete: `web/src/escenario/components/TopBar.tsx`
- Create: `web/src/escenario/components/DirectionButton.tsx`
- Modify: `web/src/escenario/Scenario.tsx` (reemplazar `<TopBar …/>`)
- Modify: `web/src/escenario/styles/tokens.css:33-71` (`.app`, quitar `.topbar`, `.slate`, `.cast`, `.chip*`; conservar `.dir-btn` y `.sim-badge`)
- Modify: `web/src/escenario/styles/chrome.css` (reglas de `.app` y `.topbar` en las dos consultas `@media`)

**Interfaces:**
- Produces: `export function DirectionButton(props: { simulated: boolean; drawerOpen: boolean; onDirection: () => void }): JSX.Element` — contenedor `position: absolute; top: 16px; right: 16px; z-index: 20` con la insignia «Simulación» (si `simulated`) y el botón (icono `SlidersHorizontal`, texto «Dirección» y `<kbd>D</kbd>`, `aria-controls="drawer"`, `aria-expanded`).

- [ ] **Step 1: Crear** `DirectionButton.tsx` conservando el markup del botón actual de `TopBar.tsx`, con el estilo más discreto: fondo `color-mix(in srgb, var(--surface) 82%, transparent)` y `backdrop-filter: blur(8px)`.
- [ ] **Step 2: En `Scenario.tsx`** quitar la importación y el uso de `TopBar`; renderizar `<DirectionButton simulated={source.kind === "simulada"} drawerOpen={drawerOpen} onDirection={keys.toggleDrawer} />` dentro de `.app`. Borrar `TopBar.tsx`.
- [ ] **Step 3: CSS**: `.app { grid-template-rows: minmax(0, 1fr) auto; }` en `tokens.css`, y lo mismo en las dos consultas `@media` de `chrome.css`; eliminar las reglas huérfanas de `.topbar`, `.slate`, `.cast`, `.chip`. En ≤760 px ocultar `.dir-btn .lbl` y `kbd` como ya se hacía.
- [ ] **Step 4: Ejecutar** `cd web && npm run typecheck && npm test` — esperado: verde, sin referencias a `TopBar`. `grep -rn "TopBar\|\.topbar\|\.chip" src/escenario` no debe devolver nada.

### Task 3: Transporte como píldora flotante

**Files:**
- Modify: `web/src/escenario/components/Board.tsx` (bloque `.transport`)
- Modify: `web/src/escenario/styles/chrome.css:3-14, 86-95` (`.board`, `.transport`, `.tbtn`, versión angosta)

**Interfaces:**
- Consumes: las props actuales de `Board` (sin cambios de firma).

- [ ] **Step 1: En `Board.tsx`** quitar `.act` (título y «Paso x de y»). Dejar `.transport` con tres botones solo con icono: anterior (`ChevronLeft`), el principal (`Play`/`Pause`, sin `<span>` de texto; `aria-label={playLabel(...)}` y `title` iguales) y reiniciar (`RotateCcw`). Conservar `aria-keyshortcuts`.
- [ ] **Step 2: CSS**: `.board { position: relative; grid-template-columns: minmax(0, 1fr); }` y `.transport { position: absolute; left: 16px; bottom: calc(100% + 16px); flex-direction: row; gap: 4px; padding: 6px; min-width: 0; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 86%, transparent); backdrop-filter: blur(8px); box-shadow: var(--shadow-lg); }`. Botones circulares de 34 px, sin borde, con `:hover` suave; el principal conserva el fondo `var(--ink)`. Quitar `border-right` y `min-width: 236px`.
- [ ] **Step 3: Ajustar** `regionFor` de la Task 1 si la píldora tapa la región libre: reservar `bottom` extra de 56 px solo en la rama `left` (la única que comparte esquina con la píldora). Añadir una prueba en `camera.test.ts` que fije ese valor.
- [ ] **Step 4: Ejecutar** `cd web && npm test && npm run typecheck` — esperado: verde.

### Task 4: Consola — espaciado y poda de texto

**Files:**
- Modify: `web/src/consola/styles/*.css` (`base.css`, `sections.css`, `lab.css`, `resumen.css`, `actividad.css`, `frame.css`, `responsive.css`)
- Modify: `web/src/consola/views/**` (podar subtítulos y datos de poca relevancia, empezando por `laboratorio/`)
- Modify: `web/src/consola/test/` solo si una prueba afirma texto que se elimina.

- [ ] **Step 1: Capturas «antes»** con Playwright de las 7 secciones (Resumen, Actividad, Seguridad, Clientes, Laboratorio con 3 experimentos distintos, Pruebas, Sistema), en 1280×720 y 1920×1080. Guardar en el scratchpad de la sesión.
- [ ] **Step 2: Elaborar la lista** de textos a quitar (subtítulos, notas al pie, datos repetidos) y de pares de elementos demasiado juntos, por sección, con captura. **Presentar la lista a Dylan y esperar su visto bueno** antes de borrar nada.
- [ ] **Step 3: Espaciado**: unificar en `base.css` una escala de espaciado (variables `--gap-1..--gap-5`) y aplicarla a tarjetas, encabezados de vista, filas de tabla y bloques de Laboratorio. Criterio: mínimo 16 px entre bloques hermanos y 24 px entre secciones de una vista; nada de texto pegado a bordes (padding interior ≥ 16 px en tarjetas).
- [ ] **Step 4: Podar** lo aprobado en el Step 2 en los `.tsx`, y retirar las reglas CSS que queden sin uso.
- [ ] **Step 5: Ejecutar** `cd web && npm test && npm run typecheck` — esperado: verde; corregir pruebas que afirmaran el texto eliminado.
- [ ] **Step 6: Capturas «después»** de las mismas vistas y comparar con las de «antes»; ninguna sección debe verse vacía ni tener scroll horizontal nuevo.

### Task 5: Compilar y verificar de punta a punta

**Files:**
- Modify (generado): `web/dist/**`

- [ ] **Step 1: Ejecutar** `cd web && npm ci && npm test && npm run build` — esperado: tests en verde y build sin errores.
- [ ] **Step 2: Reiniciar** el laboratorio (`lab.py`) para servir la web nueva: detener los procesos por puerto y volver a arrancar.
- [ ] **Step 3: Playwright, Escenario** (1920×1080, 1280×720 y 390×844): sin barra superior; «Dirección» arriba a la derecha y abre el drawer con `D`; la píldora abajo a la izquierda funciona (siguiente, anterior, reiniciar); recorrer `login`, `espia_respuesta` y `r_repetido` completos comprobando que la tarjeta usa solo `right` (Ana), `left` (Eve) y `top` (banco, red) y que no se solapa con la píldora, con «Dirección» ni se sale de la pantalla. Comprobar también la revisión de un paso anterior y el plano general (`C`).
- [ ] **Step 4: Playwright, Consola**: recorrer las 7 secciones; sin errores de consola salvo el `favicon.ico`.
- [ ] **Step 5: Ejecutar** `uv run pytest -q` desde la raíz — esperado: 376 aprobadas. Restaurar `results/tests.json` con `git checkout`.
- [ ] **Step 6: Reportar** a Dylan con capturas y el estado de `git status`; no hacer commit sin su orden.
