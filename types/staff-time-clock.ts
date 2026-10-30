export type StaffTimeClockJob = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type StaffShiftRecord = {
  id: string;
  membershipId: string;
  staffName: string;
  jobId: string;
  jobName: string;
  scheduledShiftId: string | null;
  clockedInAt: string;
  clockedOutAt: string | null;
  breakStartedAt: string | null;
  breakMinutes: number;
  durationMinutes: number;
  workedMinutes: number;
  hourlyRateMinor: number | null;
  payCurrency: string | null;
  grossPayMinor: number | null;
  approvalStatus: "PENDING" | "APPROVED";
  approvedAt: string | null;
  approvedByName: string | null;
};

export type StaffTimeClockScheduledShift = {
  id: string;
  jobId: string;
  jobName: string;
  startsAt: string;
  endsAt: string;
};

export type StaffTimeClockSnapshot = {
  assignedJobs: StaffTimeClockJob[];
  activeShift: StaffShiftRecord | null;
  upcomingScheduledShifts: StaffTimeClockScheduledShift[];
  recentShifts: StaffShiftRecord[];
};
