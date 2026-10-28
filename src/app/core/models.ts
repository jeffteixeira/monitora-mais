export type SessionStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus = 'booked' | 'checked_in' | 'reviewed' | 'cancelled' | 'no_show';
export type SessionMode = 'presencial' | 'online';
export type RewardKind = 'horas_complementares' | 'acesso' | 'vantagem';

export interface Department {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  name: string;
  department_id: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  difficulty: number;
  department_id: string;
}

export type OrgRole = 'owner' | 'admin' | 'member';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  invite_code: string;
  welcome_credits: number;
}

/** Identidade global do usuário. */
export interface Profile {
  id: string;
  full_name: string;
  bio: string | null;
  avatar_url: string | null;
}

/** Participação do usuário em uma organização, com estatísticas próprias dela. */
export interface Membership {
  org: Organization;
  role: OrgRole;
  course_id: string | null;
  xp: number;
  hours_given: number;
  rating_sum: number;
  rating_count: number;
}

export interface OrgMember {
  user_id: string;
  full_name: string;
  bio: string | null;
  role: OrgRole;
  xp: number;
  hours_given: number;
  rating_sum: number;
  rating_count: number;
}

export interface InvitePreview {
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  already_member: boolean;
}

export interface MonitorSummary {
  id: string;
  full_name: string;
  xp: number;
  rating_sum: number;
  rating_count: number;
}

export interface Session {
  id: string;
  monitor_id: string;
  subject_id: string;
  starts_at: string;
  ends_at: string;
  mode: SessionMode;
  location: string;
  capacity: number;
  in_app_call: boolean;
  status: SessionStatus;
  subject: Pick<Subject, 'id' | 'name' | 'code'>;
  monitor: MonitorSummary;
  taken: number;
}

export interface Booking {
  id: string;
  session_id: string;
  student_id: string;
  status: BookingStatus;
  exam_at: string | null;
  session: Omit<Session, 'taken'>;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  kind: 'initial_grant' | 'hold' | 'hold_release' | 'earning' | 'redemption';
  note: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  kind: RewardKind;
  cost: number;
}

export interface Redemption {
  id: string;
  cost: number;
  verification_code: string;
  created_at: string;
  reward: Pick<Reward, 'title' | 'kind'>;
}

export interface Badge {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  course_name: string | null;
  level: number;
  hours: number;
  avg_rating: number | null;
  review_count: number;
}

export interface Review {
  id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  created_at: string;
}

export interface StudentReview {
  id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  created_at: string;
  subject_name: string;
  monitor_name: string;
}

export interface StudentReputation {
  user_id: string;
  rating_sum: number;
  rating_count: number;
}

export interface PendingStudentReview {
  booking_id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  subject_name: string;
  ended_at: string;
}
