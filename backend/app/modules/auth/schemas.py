from pydantic import BaseModel, Field


class TeamSummary(BaseModel):
    id: str
    name: str
    company_id: str


class SeededUserSummary(BaseModel):
    id: str
    name: str
    email: str
    role: str
    company_id: str
    team_ids: list[str]


class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    company_id: str
    company_name: str
    company_timezone: str
    teams: list[TeamSummary]


class AuthSwitchRequest(BaseModel):
    user_id: str | None = Field(default=None, min_length=1)
    email: str | None = Field(default=None, min_length=1)


class AuthRefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class AuthTokenBundle(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
