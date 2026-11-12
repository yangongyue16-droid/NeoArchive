import { Buffer } from "node:buffer";

function wave(seconds: number, frequency: number): string {
  const samples = seconds * 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    wav.writeInt16LE(Math.round(Math.sin((i / 8000) * Math.PI * frequency * 2) * 1000), 44 + i * 2);
  }
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

export function audioProject() {
  const music = wave(8, 220);
  const voice = wave(3, 440);
  const line = (id: string, text: string) => ({
    id,
    type: "dialogue.show",
    atMs: 0,
    speaker: "音频测试",
    text,
    waitForAdvance: true,
  });
  return {
    schemaVersion: 1,
    projectId: "audio-playback-test",
    title: "音频回归",
    entrySceneId: "scene",
    createdAt: "2026-11-13T00:00:00Z",
    updatedAt: "2026-11-13T00:00:00Z",
    dialogueTypingCps: 200,
    dialogueHoldMs: 600000,
    voiceHoldMs: 600000,
    chapters: [
      {
        id: "chapter",
        title: "测试",
        scenes: [
          {
            id: "scene",
            title: "音频测试",
            kind: "dialogue",
            cues: [
              {
                id: "music",
                type: "audio.play",
                atMs: 0,
                channel: "bgm",
                assetRef: music,
                loop: true,
                volume: 0.2,
              },
              {
                ...line("intro", "音乐与语音同时播放"),
                voiceAssetRef: voice,
                voiceStartMs: 500,
                voiceEndMs: 1500,
              },
              { id: "blank", type: "wait", atMs: 0, blank: true, durationMs: 1600 },
              line("after-blank", "空白页结束"),
              {
                id: "volume",
                type: "audio.play",
                atMs: 0,
                channel: "bgm",
                assetRef: music,
                loop: true,
                volume: 0.6,
              },
              line("louder", "音乐音量已改变"),
              { id: "stop", type: "audio.stop", atMs: 0, channel: "bgm" },
              {
                id: "sound",
                type: "audio.play",
                atMs: 0,
                channel: "sfx",
                assetRef: voice,
                loop: false,
                volume: 0.15,
              },
              line("stopped", "音乐已停止，单次音效"),
            ],
          },
        ],
      },
    ],
  };
}
