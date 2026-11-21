/** El Escenario completo: dirección del acto, cámara, tira, drawer y atajos de teclado. */
import { useState } from "react";
import { Banner } from "./components/Banner";
import { Board } from "./components/Board";
import { Drawer } from "./components/Drawer";
import { IconSprite } from "./components/icons";
import { MotionContext } from "./components/motion";
import { Stage } from "./components/Stage";
import { TopBar } from "./components/TopBar";
import type { ScenarioSource, SourceKind } from "./data/source";
import { phaseNumbers } from "./model/diagram";
import { usePrefs } from "./state/prefs";
import { useBankEvents } from "./state/useBankEvents";
import { useDirector } from "./state/useDirector";
import { useMotion } from "./state/useMotion";
import { usePlayback, useScene, useShortcuts } from "./state/usePresenter";

interface ScenarioProps {
  source: ScenarioSource;
  onSource: (kind: SourceKind) => void;
  onRetry: () => void;
}

export function Scenario({ source, onSource, onRetry }: ScenarioProps) {
  const [prefs, setPrefs] = usePrefs();
  const [state, ctl] = useDirector(source);
  const feed = useBankEvents(source, state.status === "ready");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const act = state.config?.acts.find((a) => a.id === state.actId) ?? null;
  const scene = useScene(state, act, prefs, feed.store);
  const { togglePlay, holdMs } = usePlayback({ state, ctl, prefs, scene });
  const keys = useShortcuts({ ctl, prefs, setPrefs, togglePlay, drawerOpen, setDrawerOpen });
  const motion = useMotion(prefs.motion, prefs.speed);
  const wideCam = prefs.cam === "wide" && state.review === null;
  const appClass = ["app", prefs.dim && !wideCam ? "dimming" : "", prefs.math ? "" : "hide-math"].filter(Boolean).join(" ");
  const reviewN = state.run && state.review !== null ? phaseNumbers(state.run).get(state.review) ?? null : null;

  return (
    <MotionContext.Provider value={motion}>
      <IconSprite />
      <div className={appClass}>
        <TopBar cast={state.run?.cast ?? []} hasEve={scene?.hasEve ?? false} focus={scene?.focus ?? "wide"} simulated={source.kind === "simulada"} drawerOpen={drawerOpen} onDirection={keys.toggleDrawer} />
        {scene ? (
          <Stage scene={scene} group={state.run?.group ?? ""} bankOnline={feed.online} wide={prefs.cam === "wide"} speed={prefs.speed} reviewN={reviewN} animate={state.animate} onReview={ctl.review} onBack={() => ctl.review(null)} />
        ) : (
          <main className="stage loading"><p>{state.status === "offline" ? "Sin conexión con el laboratorio" : "Preparando el acto…"}</p></main>
        )}
        {scene && (
          <Board
            actTitle={act?.title ?? state.run?.title ?? ""} frames={scene.frames} index={scene.index} hasEve={scene.hasEve}
            pending={state.pending} atEnd={scene.atEnd} auto={prefs.mode === "auto"} playing={state.playing} holdMs={holdMs}
            onPrev={keys.prev} onPlay={togglePlay} onRestart={ctl.restart}
            onJump={(i) => { ctl.setPlaying(false); ctl.jumpTo(i); }}
          />
        )}
      </div>
      <Banner offline={state.status === "offline"} message={state.notice} canSimulate={source.kind === "real"} onSimulate={() => onSource("simulada")} onRetry={onRetry} onDismiss={ctl.dismissNotice} />
      <Drawer
        open={drawerOpen} config={state.config} actId={state.actId} prefs={prefs} source={source.kind}
        onClose={() => setDrawerOpen(false)} onAct={ctl.selectAct} onGroup={ctl.selectGroup} onPrefs={setPrefs} onSource={onSource}
      />
    </MotionContext.Provider>
  );
}
