from typing import TypedDict


class AgendaSectionConfig(TypedDict):
    key: str
    label: str
    duration_seconds: int


MEETING_AGENDA_CONFIG: list[AgendaSectionConfig] = [
    {"key": "scorecard", "label": "Scorecard", "duration_seconds": 300},
    {"key": "ids", "label": "IDS", "duration_seconds": 3600},
    {"key": "conclude", "label": "Conclude", "duration_seconds": 600},
]

SECTION_BY_KEY: dict[str, AgendaSectionConfig] = {
    s["key"]: s for s in MEETING_AGENDA_CONFIG
}

NEXT_SECTION_MAP: dict[str, str] = {
    MEETING_AGENDA_CONFIG[idx]["key"]: MEETING_AGENDA_CONFIG[idx + 1]["key"]
    for idx in range(len(MEETING_AGENDA_CONFIG) - 1)
}
