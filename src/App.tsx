import { lazy, Suspense, useEffect, useState } from "react";
import { HomeScreen } from "./home/HomeScreen";

const EditorApp = lazy(() =>
  import("./editor/EditorApp").then((module) => ({ default: module.EditorApp })),
);
const PlayerApp = lazy(() =>
  import("./player/PlayerApp").then((module) => ({ default: module.PlayerApp })),
);

function LoadingWorkspace() {
  return (
    <div className="workspace-loading" role="status">
      <div className="brand-mark" aria-hidden="true" />
      <p>正在准备创作空间…</p>
    </div>
  );
}

export function isPlayerRoute(): boolean {
  return (
    window.location.hash.startsWith("#/player") || window.location.pathname.startsWith("/player")
  );
}

export function App() {
  const [player, setPlayer] = useState(isPlayerRoute);
  const [enteredEditor, setEnteredEditor] = useState(false);
  useEffect(() => {
    const sync = () => setPlayer(isPlayerRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  if (player) {
    return (
      <Suspense fallback={<LoadingWorkspace />}>
        <PlayerApp />
      </Suspense>
    );
  }
  if (!enteredEditor) {
    return (
      <HomeScreen
        onOpened={() => {
          setEnteredEditor(true);
        }}
      />
    );
  }
  return (
    <Suspense fallback={<LoadingWorkspace />}>
      <EditorApp
        onBackHome={() => {
          setEnteredEditor(false);
        }}
      />
    </Suspense>
  );
}
