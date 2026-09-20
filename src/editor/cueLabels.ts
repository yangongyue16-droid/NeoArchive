import type { StoryCue } from "../project-schema/types";

export const cueLabels: Record<StoryCue["type"], string> = {
  "audio.play": "音频",
  "audio.stop": "停止音频",
  "background.set": "背景",
  "character.enter": "角色入场",
  "character.exit": "角色退场",
  "character.update": "角色更新",
  "choice.show": "选择",
  "dialogue.show": "对白",
  "transition.play": "过场",
  wait: "等待",
};
