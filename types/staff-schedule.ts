export type StaffScheduleStatus = "PUBLISHED" | "CANCELLED";
export type StaffTimeOffStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "CANCELLED";

export type StaffTimeOffRecord = {
  id: string;
  membershipId: string;
  staffName: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: StaffTimeOffStatus;
  reviewNote: string | null;
};

export type StaffAvailabilityDay = {
  dayOfWeek: number;
  isAvailable: boolean;
  startsMinute: number | null;
  endsMinute: number | null;
};

export type StaffWeeklyAvailability = {
  configured: boolean;
  days: StaffAvailabilityDay[];
};

export type StaffScheduleJobOption = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type StaffScheduleMemberOption = {
  membershipId: string;
  staffName: string;
  jobs: StaffScheduleJobOption[];
  availability: StaffWeeklyAvailability;
};

export type StaffScheduleJob = {
  id: string;
  name: string;
};

export type StaffScheduledShiftRecord = {
  id: string;
  membershipId: string | null;
  staffName: string | null;
  jobId: string;
  jobName: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  status: StaffScheduleStatus;
  note: string | null;
  availabilityOverrideReason: string | null;
};

export type StaffScheduleConfiguration = {
  timezone: string;
  jobs: StaffScheduleJob[];
  members: StaffScheduleMemberOption[];
  shifts: StaffScheduledShiftRecord[];
  timeOffRequests: StaffTimeOffRecord[];
};

export type StaffShiftCoverClaimRecord = {
  id: string;
  membershipId: string;
  staffName: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";
};

export type StaffShiftCoverRequestRecord = {
  id: string;
  scheduledShiftId: string;
  kind: "OPEN_SHIFT" | "COVER_REQUEST";
  status: "OPEN" | "FILLED" | "CANCELLED";
  requestedByMembershipId: string | null;
  requestedByName: string | null;
  reason: string | null;
  membershipId: string | null;
  staffName: string | null;
  jobId: string;
  jobName: string;
  startsAt: string;
  endsAt: string;
  claims: StaffShiftCoverClaimRecord[];
};

export type StaffShiftCoverBoard = {
  requests: StaffShiftCoverRequestRecord[];
  timezone: string;
};
