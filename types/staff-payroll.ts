export type StaffPayrollExportRun = {
  id: string;
  provider: "GENERIC_CSV";
  periodFrom: string;
  periodTo: string;
  rowCount: number;
  currency: string;
  grossPayMinor: number;
  generatedByName: string;
  createdAt: string;
};
