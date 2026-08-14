import type { StageTransitionPreset } from "../project-schema/types";

export const transitionPresets: Array<{
  value: StageTransitionPreset;
  label: string;
  description: string;
}> = [
  { value: "fade-black", label: "黑幕淡化", description: "安静换幕、时间流逝与章节转折" },
  { value: "fade-white", label: "白幕闪回", description: "回忆、冲击与强光切换" },
  {
    value: "archive-shutter",
    label: "档案闸门",
    description: "NeoArchive 独有的上下档案页闭合过场",
  },
  {
    value: "halo-iris",
    label: "光环收束",
    description: "以学院光环为灵感的圆形聚焦换幕",
  },
  {
    value: "chromatic-slice",
    label: "时序轮盘",
    description: "由真实本地日期与时间驱动的双向曲面档案轮",
  },
  { value: "none", label: "无过渡", description: "立刻切到下一幕，不播放过场" },
];
