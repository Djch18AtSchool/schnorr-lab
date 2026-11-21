/** El Escenario completo: dirección del acto, cámara, tira, drawer y atajos de teclado. */
import { useCallback, useMemo, useState } from "react";
import { Banner } from "./components/Banner";
import { Board } from "./components/Board";
import { Drawer } from "./components/Drawer";
import { IconSprite } from "./components/icons";
import { MotionContext, prefersReducedMotion } from "./components/motion";
import { Stage } from "./components/Stage";
import { TopBar } from "./components/TopBar";
import type { ScenarioSource, SourceKind } from "./data/source";
import { phaseNumbers } from "./model/diagram";
import { usePrefs } from "./state/prefs";
import { buildScene } from "./state/scene";
import { useAutoPlay } from "./state/useAutoPlay";
import { useBankEvents } from "./state/useBankEvents";
import { useDirector } from "./state/useDirector";
import { useKeyboard } from "./state/useKeyboard";

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
  const motion = useMemo(() => ({ speed: prefs.speed, reduced: prefersReducedMotion() }), [prefs.speed]);

  const scene = useMemo(
    () =>
      state.run
        ? buildScene({ run: state.run, act, index: state.index, exhausted: state.exhausted, review: state.review, animate: state.animate, cam: prefs.cam, store: feed.store })
        : null,
    [state.run, act, state.index, state.exhausted, state.review, state.animate, prefs.cam, feed.store],
  );

  const auto = prefs.mode === "auto";
  const stopPlaying = useCallback(() => ctl.setPlaying(false), [ctl]);
  const togglePlay = useCallback(() => {
    if (!auto) return ctl.next();
    if (state.playing) return ctl.setPlaying(false);
    ctl.setPlaying(true);
    ctl.next();
  }, [auto, state.playing, ctl]);
  const holdMs = useAutoPlay({
    active: auto && state.playing && !state.pending && state.review === null && scene !== null,
    beatKey: scene ? `${state.run?.id}:${scene.beat.id}` : "",
    speed: prefs.speed,
    waiting: scene?.terminal.waiting ?? false,
    atEnd: scene?.atEnd ?? false,
    next: ctl.next,
    stop: stopPlaying,
  });

  const keyHandlers = useMemo(
    () => ({
      next: () => {
        ctl.setPlaying(false);
        ctl.next();
      },
      togglePlay,
      prev: () => {
        ctl.setPlaying(false);
        ctl.prev();
      },
      restart: ctl.restart,
      toggleDrawer: () => setDrawerOpen((open) => !open),
      toggleCam: () => setPrefs({ cam: prefs.cam === "follow" ? "wide" : "follow" }),
      toggleMath: () => setPrefs({ math: !prefs.math }),
      escape: () => (drawerOpen ? setDrawerOpen(false) : ctl.review(null)),
    }),
    [ctl, togglePlay, setPrefs, prefs.cam, prefs.math, drawerOpen],
  );
  useKeyboard(keyHandlers);

  const wideCam = prefs.cam === "wide" && state.review === null;
  const appClass = ["app", prefs.dim && !wideCam ? "dimming" : "", prefs.math ? "" : "hide-math"].filter(Boolean).join(" ");
  const reviewN = state.run && state.review !== null ? phaseNumbers(state.run).get(state.review) ?? null : null;

  return (
    <MotionContext.Provider value={motion}>
      <IconSprite />
      <div className={appClass}>
        <TopBar cast={state.run?.cast ?? []} hasEve={scene?.hasEve ?? false} focus={scene?.focus ?? "wide"} simulated={source.kind === "simulada"} drawerOpen={drawerOpen} onDirection={() => setDrawerOpen((o) => !o)} />
        {scene ? (
          <Stage scene={scene} group={state.run?.group ?? ""} bankOnline={feed.online} wide={prefs.cam === "wide"} speed={prefs.speed} reviewN={reviewN} animate={state.animate} onReview={ctl.review} onBack={() => ctl.review(null)} />
        ) : (
          <main className="stage loading"><p>{state.status === "offline" ? "Sin conexión con el laboratorio" : "Preparando el acto…"}</p></main>
        )}
        {scene && (
          <Board
            actTitle={act?.title ?? state.run?.title ?? ""} frames={scene.frames} index={scene.index} hasEve={scene.hasEve}
            pending={state.pending} atEnd={scene.atEnd} auto={auto} playing={state.playing} holdMs={holdMs}
            onPrev={keyHandlers.prev} onPlay={togglePlay} onRestart={ctl.restart}
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
