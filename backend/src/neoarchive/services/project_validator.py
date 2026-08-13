from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from neoarchive.domain import StoryProject


@dataclass(frozen=True, slots=True)
class ProjectDiagnostic:
    severity: Literal["error", "warning"]
    code: str
    message: str
    pointer: str


class ProjectValidator:
    def validate(self, project: StoryProject) -> list[ProjectDiagnostic]:
        diagnostics: list[ProjectDiagnostic] = []
        scenes: dict[str, str] = {}
        cue_ids: set[str] = set()

        for chapter_index, chapter in enumerate(project.chapters):
            if not chapter.scenes:
                diagnostics.append(
                    ProjectDiagnostic(
                        severity="warning",
                        code="EMPTY_CHAPTER",
                        message=f"章节“{chapter.title}”没有场景。",
                        pointer=f"/chapters/{chapter_index}/scenes",
                    )
                )
            for scene_index, scene in enumerate(chapter.scenes):
                scene_pointer = f"/chapters/{chapter_index}/scenes/{scene_index}"
                if scene.id in scenes:
                    diagnostics.append(
                        ProjectDiagnostic(
                            severity="error",
                            code="DUPLICATE_SCENE_ID",
                            message=f"场景 ID“{scene.id}”重复。",
                            pointer=f"{scene_pointer}/id",
                        )
                    )
                else:
                    scenes[scene.id] = scene_pointer

                if not scene.cues:
                    diagnostics.append(
                        ProjectDiagnostic(
                            severity="warning",
                            code="EMPTY_SCENE",
                            message=f"场景“{scene.title}”没有剧本模块。",
                            pointer=f"{scene_pointer}/cues",
                        )
                    )

                for cue_index, cue in enumerate(scene.cues):
                    cue_pointer = f"{scene_pointer}/cues/{cue_index}"
                    if cue.id in cue_ids:
                        diagnostics.append(
                            ProjectDiagnostic(
                                severity="error",
                                code="DUPLICATE_CUE_ID",
                                message=f"Cue ID“{cue.id}”重复。",
                                pointer=f"{cue_pointer}/id",
                            )
                        )
                    cue_ids.add(cue.id)

        if project.entry_scene_id not in scenes:
            diagnostics.append(
                ProjectDiagnostic(
                    severity="error",
                    code="ENTRY_SCENE_NOT_FOUND",
                    message=f"入口场景“{project.entry_scene_id}”不存在。",
                    pointer="/entrySceneId",
                )
            )

        for chapter_index, chapter in enumerate(project.chapters):
            for scene_index, scene in enumerate(chapter.scenes):
                scene_pointer = f"/chapters/{chapter_index}/scenes/{scene_index}"
                if scene.next_scene_id and scene.next_scene_id not in scenes:
                    diagnostics.append(
                        ProjectDiagnostic(
                            severity="error",
                            code="NEXT_SCENE_NOT_FOUND",
                            message=f"后继场景“{scene.next_scene_id}”不存在。",
                            pointer=f"{scene_pointer}/nextSceneId",
                        )
                    )
                for cue_index, cue in enumerate(scene.cues):
                    if cue.type != "choice.show":
                        continue
                    for option_index, option in enumerate(cue.options):
                        if option.target_scene_id and option.target_scene_id not in scenes:
                            diagnostics.append(
                                ProjectDiagnostic(
                                    severity="error",
                                    code="CHOICE_TARGET_NOT_FOUND",
                                    message=f"选项目标场景“{option.target_scene_id}”不存在。",
                                    pointer=(
                                        f"{scene_pointer}/cues/{cue_index}/options/"
                                        f"{option_index}/targetSceneId"
                                    ),
                                )
                            )

        return diagnostics
