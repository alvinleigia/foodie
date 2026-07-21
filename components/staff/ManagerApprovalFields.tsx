import { Input } from "@/components/ui/input";

export type ManagerApprovalCredentials = {
  identifier: string;
  password: string;
};

export function hasManagerApprovalCredentials(
  credentials: ManagerApprovalCredentials,
) {
  return Boolean(credentials.identifier.trim() && credentials.password);
}

export function ManagerApprovalFields({
  credentials,
  disabled,
  idPrefix,
  onChange,
  required,
}: {
  credentials: ManagerApprovalCredentials;
  disabled?: boolean;
  idPrefix: string;
  onChange: (credentials: ManagerApprovalCredentials) => void;
  required: boolean;
}) {
  if (!required) {
    return null;
  }

  return (
    <section className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-950">Manager approval</p>
        <p className="mt-1 text-xs text-stone-600">
          An active restaurant manager must approve this action.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label
            htmlFor={`${idPrefix}-manager-identifier`}
            className="text-xs font-medium text-stone-700"
          >
            Manager username or email
          </label>
          <Input
            id={`${idPrefix}-manager-identifier`}
            autoComplete="username"
            disabled={disabled}
            value={credentials.identifier}
            onChange={(event) =>
              onChange({ ...credentials, identifier: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <label
            htmlFor={`${idPrefix}-manager-password`}
            className="text-xs font-medium text-stone-700"
          >
            Manager password
          </label>
          <Input
            id={`${idPrefix}-manager-password`}
            type="password"
            autoComplete="current-password"
            disabled={disabled}
            value={credentials.password}
            onChange={(event) =>
              onChange({ ...credentials, password: event.target.value })
            }
          />
        </div>
      </div>
    </section>
  );
}
