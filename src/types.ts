export interface Team {
  id: string;
  team_name: string;
  description: string | null;
  leader_id: string | null;
  is_active: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Contribution {
  id: string;
  person_id: string;
  amount: number;
  contribution_month: string;
  method: string;
  notes: string | null;
  created_at: string;
}

export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'main_leader'
  | 'core_team'
  | 'team_leader'
  | 'minister'
  | 'member'
  | 'newcomer';

export type PersonStatus =
  | 'newcomer'
  | 'follow_up'
  | 'ready'
  | 'member'
  | 'minister'
  | 'inactive';

export const LEADER_ROLES: AppRole[] = [
  'super_admin',
  'admin',
  'main_leader',
  'core_team',
  'team_leader',
];

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female' | null;
  age_group: string | null;
  address: string | null;
  role: AppRole;
  status: PersonStatus;
  first_visit_date: string | null;
  member_since: string | null;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  date_of_birth: string | null;
  baptized: boolean;
  baptism_date: string | null;
  salvation_date: string | null;
  account_approved: boolean;
  follow_up_role?: 'leader' | 'assistant_leader' | 'member' | null;
}

export interface NewComer {
  id: string;
  person_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  registered_date: string;
  source: 'walk_in' | 'referral' | 'event' | 'other';
  invited_by: string | null;
  assigned_followup_leader_id: string | null;
  status: 'active' | 'ready' | 'moved' | 'inactive';
  notes: string | null;
  person?: Profile;
}

export interface FollowUpUpdate {
  id: string;
  new_comer_id: string;
  followed_by: string;
  follow_up_date: string;
  contacted: 'yes' | 'no';
  came_to_church: 'yes' | 'no' | null;
  needs_prayer: 'yes' | 'no' | null;
  interested_in_bible_study: 'yes' | 'no' | null;
  notes: string | null;
  next_action: string | null;
  contact_method: 'call' | 'text' | 'visit' | 'other' | null;
  next_follow_up_date: string | null;
  created_at: string;
}

export interface G5Group {
  id: string;
  group_name: string;
  leader_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  size_limit: number;
  is_active: boolean;
  leader?: Profile;
  members?: { person: Profile }[];
}

export interface BibleStudyGroup {
  id: string;
  group_name: string;
  leader_id: string | null;
  book_being_studied: string | null;
  start_date: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  online_link: string | null;
  is_active: boolean;
  leader?: Profile;
  members?: { person: Profile }[];
}
