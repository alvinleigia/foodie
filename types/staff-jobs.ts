import type { StaffPermission } from "@/lib/staff-permissions";

export type StaffJobRecord = {
  id: string;
  name: string;
  description: string | null;
  permissions: StaffPermission[];
  sortOrder: number;
  isActive: boolean;
  assignedStaffCount: number;
};

export type StaffJobAssignment = {
  currency: string;
  jobIds: string[];
  payrollEmployeeReference: string | null;
  payRates: Array<{
    hourlyRateMinor: number | null;
    jobId: string;
  }>;
  primaryJobId: string | null;
};

export type StaffJobConfiguration = {
  jobs: StaffJobRecord[];
  assignments: Array<{
    membershipId: string;
    jobId: string;
    isPrimary: boolean;
    hourlyRateMinor: number | null;
  }>;
};
