"use client";

import { useState } from "react";
import { PencilLineIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api-client";
import {
  staffPermissionDefinitions,
  type StaffPermission,
} from "@/lib/staff-permissions";
import type {
  StaffJobConfiguration,
  StaffJobRecord,
} from "@/types/staff-jobs";

type StaffJobDraft = {
  id: string | null;
  name: string;
  description: string;
  permissions: StaffPermission[];
  sortOrder: string;
  isActive: boolean;
};

type StaffJobField = "description" | "isActive" | "name" | "permissions" | "sortOrder";

const permissionGroups = [
  "Orders",
  "Payments",
  "Customers",
  "Workforce",
  "Administration",
] as const;

const emptyDraft: StaffJobDraft = {
  id: null,
  name: "",
  description: "",
  permissions: [],
  sortOrder: "0",
  isActive: true,
};

export function StaffJobManager({
  initialJobs,
}: {
  initialJobs: StaffJobRecord[];
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [draft, setDraft] = useState<StaffJobDraft>(emptyDraft);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<StaffJobField>();

  function openCreateDialog() {
    const nextSortOrder =
      jobs.reduce((highest, job) => Math.max(highest, job.sortOrder), -1) + 1;

    setDraft({ ...emptyDraft, sortOrder: String(nextSortOrder) });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function openEditDialog(job: StaffJobRecord) {
    setDraft({
      id: job.id,
      name: job.name,
      description: job.description ?? "",
      permissions: job.permissions,
      sortOrder: String(job.sortOrder),
      isActive: job.isActive,
    });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function updateField<Field extends StaffJobField>(
    field: Field,
    value: StaffJobDraft[Field],
  ) {
    validation.clearFieldError(field);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function togglePermission(permission: StaffPermission, checked: boolean) {
    updateField(
      "permissions",
      checked
        ? [...draft.permissions, permission]
        : draft.permissions.filter((item) => item !== permission),
    );
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const result = await requestJson<StaffJobConfiguration>(
        draft.id
          ? `/api/tenant/admin/staff-jobs/${draft.id}`
          : "/api/tenant/admin/staff-jobs",
        {
          method: draft.id ? "PATCH" : "POST",
          body: {
            name: draft.name,
            description: draft.description,
            permissions: draft.permissions,
            sortOrder: draft.sortOrder,
            isActive: draft.isActive,
          },
        },
      );

      setJobs(result.jobs);
      setIsDialogOpen(false);
      toast.success(draft.id ? "Staff job updated." : "Staff job added.");
    } catch (caught) {
      const result = validation.applyCaught(caught);

      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
  }

  return (
    <>
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h3 className="text-2xl font-semibold text-stone-950">Staff jobs</h3>
            <p className="text-sm text-stone-500">
              Reuse a named permission set across restaurant staff.
            </p>
          </div>
          <Button type="button" onClick={openCreateDialog}>
            <ButtonLabel icon={PlusIcon}>Add job</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {jobs.length ? (
            <div className="divide-y divide-stone-200 border-y border-stone-200">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-950">{job.name}</p>
                      {!job.isActive ? (
                        <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    {job.description ? (
                      <p className="mt-1 text-sm text-stone-600">
                        {job.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-stone-500">
                      {job.permissions.length} permission
                      {job.permissions.length === 1 ? "" : "s"} / {job.assignedStaffCount}{" "}
                      assigned / Display order {job.sortOrder}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openEditDialog(job)}
                  >
                    <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-200 px-4 py-5">
              <p className="font-medium text-stone-800">No staff jobs yet</p>
              <p className="mt-1 text-sm text-stone-500">
                Add jobs such as Shift Manager, Server or Cashier, then assign
                them from each staff profile.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">
              {draft.id ? "Edit staff job" : "Add staff job"}
            </DialogTitle>
            <DialogDescription>
              The primary job supplies the permission baseline for assigned staff.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 px-6 pb-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
              <FormField
                label="Job name"
                error={validation.getError("name")}
                errorId="staff-job-name-error"
              >
                <Input
                  value={draft.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Shift Manager"
                />
              </FormField>
              <FormField
                label="Display order"
                error={validation.getError("sortOrder")}
                errorId="staff-job-sort-order-error"
              >
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={draft.sortOrder}
                  onChange={(event) =>
                    updateField("sortOrder", event.target.value)
                  }
                />
              </FormField>
            </div>

            <FormField
              label="Description (optional)"
              error={validation.getError("description")}
              errorId="staff-job-description-error"
            >
              <Textarea
                value={draft.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                maxLength={240}
                rows={3}
                placeholder="Supervises service and approves sensitive actions."
              />
            </FormField>

            <div className="grid gap-4 border-t border-stone-200 pt-4">
              <div>
                <h4 className="font-semibold text-stone-950">Permissions</h4>
                <p className="mt-1 text-sm text-stone-500">
                  Individual staff overrides can still grant or remove actions.
                </p>
              </div>
              {permissionGroups.map((group) => (
                <fieldset key={group} className="grid gap-3">
                  <legend className="text-sm font-semibold text-stone-800">
                    {group}
                  </legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    {staffPermissionDefinitions
                      .filter((definition) => definition.group === group)
                      .map((definition) => (
                        <label
                          key={definition.permission}
                          className="flex min-w-0 items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
                        >
                          <Checkbox
                            checked={draft.permissions.includes(
                              definition.permission,
                            )}
                            onCheckedChange={(checked) =>
                              togglePermission(
                                definition.permission,
                                checked === true,
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-stone-900">
                              {definition.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-stone-500">
                              {definition.description}
                            </span>
                          </span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              ))}
              {validation.getError("permissions") ? (
                <p className="text-sm text-rose-600">
                  {validation.getError("permissions")}
                </p>
              ) : null}
            </div>

            {draft.id ? (
              <label className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={draft.isActive}
                  onCheckedChange={(checked) =>
                    updateField("isActive", checked === true)
                  }
                />
                Active and available for staff assignment
              </label>
            ) : null}

            {validation.formError ? (
              <p className="text-sm text-rose-600">{validation.formError}</p>
            ) : null}
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void save()}>
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save job"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
