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


class DialogueShowCue(BaseCue):
    type: Literal["dialogue.show"]
    speaker: str
    subtitle: str | None = None
    text: str
    typing_cps: int = Field(default=36, gt=0)
    wait_for_advance: bool = True


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
    ]
    duration_ms: int = Field(default=900, ge=240)
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


class Scene(SchemaModel):
    id: str
    title: str
    kind: Literal["dialogue", "direction", "choice"]
    auto_advance_ms: int | None = Field(default=None, ge=250)
    next_scene_id: str | None = None
    cues: list[StoryCue]


class Chapter(SchemaModel):
    id: str
    title: str
    scenes: list[Scene]


class StoryProject(SchemaModel):
    schema_version: Literal[1]
    project_id: str
    title: str
    entry_scene_id: str
    created_at: datetime
    updated_at: datetime
    chapters: list[Chapter]
