import { useEffect, useState } from "react";
import { EditorApp } from "./editor/EditorApp";
import { PlayerApp } from "./player/PlayerApp";

export function isPlayerRoute(): boolean {
  return (
    window.location.hash.startsWith("#/player") || window.location.pathname.startsWith("/player")
  );
}

export function App() {
  const [player, setPlayer] = useState(isPlayerRoute);
  useEffect(() => {
    const sync = () => setPlayer(isPlayerRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return player ? <PlayerApp /> : <EditorApp />;
}
