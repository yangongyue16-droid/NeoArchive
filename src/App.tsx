import { EditorApp } from "./editor/EditorApp";
import { PlayerApp } from "./player/PlayerApp";

export function App() {
  return window.location.pathname.startsWith("/player") ? <PlayerApp /> : <EditorApp />;
}
