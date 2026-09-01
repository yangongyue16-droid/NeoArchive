from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class SchemaModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class CharacterTransform(SchemaModel):
    x: float
    y: float
    scale: float = Field(gt=0)


class CharacterTransformPatch(SchemaModel):
    x: float | None = None
    y: float | None = None
    scale: float | None = Field(default=None, gt=0)


class BaseCue(SchemaModel):
    id: str = Field(min_length=1)
    at_ms: int = Field(ge=0)


class BackgroundSetCue(BaseCue):
    type: Literal["background.set"]
    asset_ref: str
    transition_ms: int | None = Field(default=None, ge=0)
    wait_for_media_end: bool | None = None


class CharacterEnterCue(BaseCue):
    type: Literal["character.enter"]
    character_ref: str
    animation: str
    delay_ms: int = Field(default=400, ge=0)
    enter_duration_ms: int = Field(default=420, ge=0)
    transform: CharacterTransform


class CharacterUpdateCue(BaseCue):
    type: Literal["character.update"]
    character_ref: str
    animation: str | None = None
    transform: CharacterTransformPatch | None = None


class CharacterExitCue(BaseCue):
    type: Literal["character.exit"]
    character_ref: str


class AdvanceWhen(SchemaModel):
    text: bool = True
    voice: bool = False
    background_video: bool = False


class DialogueShowCue(BaseCue):
    type: Literal["dialogue.show"]
    speaker: str
    subtitle: str | None = None
    text: str
    typing_cps: int | None = Field(default=None, ge=0)
    wait_for_advance: bool = True
    voice_asset_ref: str | None = None
    voice_start_ms: int | None = Field(default=None, ge=0)
    hold_after_ms: int | None = Field(default=None, ge=0)
    voice_hold_ms: int | None = Field(default=None, ge=0)
    advance_when: AdvanceWhen | None = None


class AudioPlayCue(BaseCue):
    type: Literal["audio.play"]
    asset_ref: str
    channel: Literal["bgm", "voice", "sfx"]
    loop: bool = False
    volume: float = Field(default=1, ge=0, le=1)


class AudioStopCue(BaseCue):
    type: Literal["audio.stop"]
    channel: Literal["bgm", "voice", "sfx"]


class ChoiceOption(SchemaModel):
    id: str
    label: str
    target_scene_id: str | None = None


class ChoiceShowCue(BaseCue):
    type: Literal["choice.show"]
    prompt: str | None = None
    options: list[ChoiceOption] = Field(min_length=1)


class WaitCue(BaseCue):
    type: Literal["wait"]
    duration_ms: int | None = Field(default=None, ge=0)
    wait_for_advance: bool = False


class TimeWheelConfig(SchemaModel):
    source: Literal["system", "custom"] = "system"
    custom_date_time: str | None = None
    precision: Literal["day", "hour", "minute", "second"] = "second"
    show_date: bool = True
    show_weekday: bool = True
    show_time: bool = True
    show_timezone: bool = True


class TransitionPlayCue(BaseCue):
    type: Literal["transition.play"]
    preset: Literal[
        "archive-shutter",
        "chromatic-slice",
        "fade-black",
        "fade-white",
        "halo-iris",
        "none",
    ]
    duration_ms: int = Field(default=900, ge=0)
    hold_ms: int = Field(default=0, ge=0)
    intensity: float = Field(default=1, ge=0.1, le=2)
    time_wheel: TimeWheelConfig | None = None


StoryCue = Annotated[
    BackgroundSetCue
    | CharacterEnterCue
    | CharacterUpdateCue
    | CharacterExitCue
    | DialogueShowCue
    | AudioPlayCue
    | AudioStopCue
    | ChoiceShowCue
    | TransitionPlayCue
    | WaitCue,
    Field(discriminator="type"),
]


class SceneExitTransition(SchemaModel):
    preset: Literal[
        "archive-shutter",
        "chromatic-slice",
        "fade-black",
        "fade-white",
        "halo-iris",
        "none",
    ] = "none"
    duration_ms: int = Field(default=900, ge=0)
    hold_ms: int = Field(default=0, ge=0)
    intensity: float = Field(default=1, ge=0.1, le=2)


class Scene(SchemaModel):
    id: str
    title: str
    kind: Literal["dialogue", "direction", "choice"]
    auto_advance_ms: int | None = Field(default=None, ge=250)
    next_scene_id: str | None = None
    exit_transition: SceneExitTransition | None = None
    entry_transition: SceneExitTransition | None = None
    ending_transition: SceneExitTransition | None = None
    cues: list[StoryCue]


class Chapter(SchemaModel):
    id: str
    title: str
    scenes: list[Scene]


class StageSettings(SchemaModel):
    aspect: Literal["16:9", "21:9", "4:3", "3:2", "1:1", "9:16", "custom"] = "16:9"
    width: int = Field(default=1920, ge=320, le=7680)
    height: int = Field(default=1080, ge=240, le=4320)
    background_fit: Literal["contain", "cover", "fill"] = "contain"


class DialogueRegionStyle(SchemaModel):
    font_size: float = Field(default=24, ge=8, le=120)
    x: float = Field(default=8, ge=0, le=100)
    y: float = Field(default=16, ge=0, le=100)


class DialogueRuleStyle(SchemaModel):
    x: float = Field(default=8, ge=0, le=100)
    y: float = Field(default=36, ge=0, le=100)
    width: float = Field(default=72, ge=4, le=100)


class DialogueBoxSettings(SchemaModel):
    height_percent: float = Field(default=46, ge=18, le=80)
    speaker: DialogueRegionStyle = Field(default_factory=DialogueRegionStyle)
    subtitle: DialogueRegionStyle = Field(default_factory=DialogueRegionStyle)
    text: DialogueRegionStyle = Field(default_factory=DialogueRegionStyle)
    rule: DialogueRuleStyle = Field(default_factory=DialogueRuleStyle)


class StoryProject(SchemaModel):
    schema_version: Literal[1]
    project_id: str
    title: str
    entry_scene_id: str
    created_at: datetime
    updated_at: datetime
    dialogue_font_ref: str | None = None
    dialogue_hold_ms: int | None = Field(default=None, ge=0)
    dialogue_typing_cps: int | None = Field(default=None, ge=1)
    stage: StageSettings | None = None
    dialogue_box: DialogueBoxSettings | None = None
    chapters: list[Chapter]
