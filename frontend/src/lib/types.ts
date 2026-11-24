export interface ResponseMeta {
  request_id: string;
  timestamp: string;
  next_cursor: string | null;
  has_more: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: unknown;
  request_id: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  company_id: string;
}

export interface SeededUserSummary {
  id: string;
  name: string;
  email: string;
  role: "admin" | "team_member" | "observer";
  company_id: string;
  team_ids: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "team_member" | "observer";
  company_id: string;
  company_name: string;
  company_timezone: string;
  teams: TeamSummary[];
}

export interface AuthTokenBundle {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface GoalRead {
  type: "at_least" | "at_most" | "between" | "exactly";
  value: number | null;
  min: number | null;
  max: number | null;
}

export interface ScoreCellRead {
  score_id: string | null;
  measurable_id: string;
  week_start: string;
  value: number | null;
  status: "on_track" | "off_track" | "pending";
  version: number | null;
  updated_at: string | null;
  unsolved_issue_id: string | null;
}

export interface MeasurableRowRead {
  id: string;
  team_id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  unit: string;
  goal: GoalRead;
  cells: Record<string, ScoreCellRead>;
}

export interface ScorecardRead {
  team_id: string;
  weeks: string[];
  current_week: string;
  last_closed_week: string;
  measurables: MeasurableRowRead[];
}

export interface IssueSourceRead {
  type: "measurable" | "rock" | "todo";
  measurable_id?: string | null;
  measurable_name?: string | null;
  week_start?: string | null;
  rock_id?: string | null;
  rock_title?: string | null;
  todo_id?: string | null;
  todo_title?: string | null;
}

export interface IssueRead {
  id: string;
  team_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  priority: number | null;
  created_at: string;
  solved_at: string | null;
  resolution_note: string | null;
  solved_in_meeting_id: string | null;
  version: number;
  source: IssueSourceRead | null;
}

export interface MakeIssueResult {
  created: boolean;
  issue: IssueRead;
}

export interface TodoRead {
  id: string;
  team_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  due_date: string;
  done_at: string | null;
  is_overdue: boolean;
  source_issue_id: string | null;
  source_issue_title: string | null;
  created_in_meeting_id: string | null;
  created_at: string;
  unsolved_issue_id: string | null;
}

export interface TodoCompletionStatsRead {
  week_start: string;
  due: number;
  done: number;
  rate_percent: number | null;
  meets_target: boolean | null;
}

export interface TodosListResponse {
  items: TodoRead[];
  last_closed_week: TodoCompletionStatsRead;
}

export interface MilestoneRead {
  id: string;
  rock_id: string;
  title: string;
  due_date: string;
  done: boolean;
  is_past_due: boolean;
}

export interface RockRead {
  id: string;
  team_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  quarter: string;
  seeded_status: string;
  status: "on_track" | "off_track" | "complete";
  progress_percent: number;
  unsolved_issue_id: string | null;
  milestones: MilestoneRead[];
}

export interface MeetingSectionTimerRead {
  current_section: string;
  section_label: string;
  allocated_seconds: number;
  elapsed_seconds: number;
  remaining_seconds: number;
  is_overtime: boolean;
  overtime_seconds: number;
}

export interface MeetingAttendeeRead {
  user_id: string;
  name: string;
  role: string;
  joined_at: string;
}

export interface MeetingRatingRead {
  user_id: string;
  name: string;
  rating: number;
  updated_at: string;
}

export interface MeetingActiveRead {
  id: string;
  team_id: string;
  facilitator_id: string;
  facilitator_name: string;
  status: string;
  current_section: "scorecard" | "ids" | "conclude" | "ended";
  scorecard_week: string;
  started_at: string;
  section_started_at: string;
  timer: MeetingSectionTimerRead;
  attendees: MeetingAttendeeRead[];
  ratings: MeetingRatingRead[];
  average_rating: number | null;
  issues_solved_ids: string[];
  todos_created_ids: string[];
  agenda: Array<{ key: string; label: string; duration_seconds: number }>;
}

export interface MeetingListItemRead {
  id: string;
  team_id: string;
  facilitator_id: string;
  facilitator_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  rating: number | null;
}

export interface MeetingSummaryRead {
  meeting_id: string;
  team_id: string;
  facilitator_id: string;
  facilitator_name: string;
  started_at: string;
  ended_at: string;
  scorecard_week: string;
  measurable_status: Record<string, string>;
  issues_solved: string[];
  todos_created: string[];
  attendee_ids: string[];
  rating: number | null;
  measurables_detail: Array<{
    measurable_id: string;
    name: string;
    owner_name: string;
    unit: string;
    score_value: number | null;
    status: string;
  }>;
  issues_solved_detail: Array<{
    id: string;
    title: string;
    owner_name: string;
    resolution_note: string | null;
    solved_at: string | null;
  }>;
  todos_created_detail: Array<{
    id: string;
    title: string;
    owner_name: string;
    due_date: string;
    created_at: string;
  }>;
  attendees_detail: MeetingAttendeeRead[];
}

export interface EligibleOwnerRead {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TeamDetailRead {
  id: string;
  name: string;
  company_id: string;
  company_name: string;
  company_timezone: string;
  current_user_role: "admin" | "team_member" | "observer";
  can_write: boolean;
  today: string;
  eligible_owners: EligibleOwnerRead[];
  active_meeting: MeetingActiveRead | null;
}

export interface TeamOverviewRead {
  team: TeamDetailRead;
  scorecard: ScorecardRead;
  unsolved_issues: IssueRead[];
  todos: TodosListResponse;
  rocks: RockRead[];
  ended_meetings: MeetingListItemRead[];
}

export interface AuditLogDetailRead {
  label: string;
  value?: string | null;
  before?: string | null;
  after?: string | null;
}

export interface AuditLogRead {
  id: string;
  team_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  action_label?: string;
  entity_type: string;
  entity_id: string;
  entity_label?: string;
  summary?: string;
  details?: AuditLogDetailRead[];
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}
