import { useEffect, useState } from "react";
import { EditorApp } from "./editor/EditorApp";
import { HomeScreen } from "./home/HomeScreen";
import { PlayerApp } from "./player/PlayerApp";

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
    return <PlayerApp />;
  }
  if (!enteredEditor) {
    return <HomeScreen onOpened={() => setEnteredEditor(true)} />;
  }
  return <EditorApp onBackHome={() => setEnteredEditor(false)} />;
}
