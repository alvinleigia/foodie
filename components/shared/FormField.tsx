"use client";

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  className?: string;
  description?: ReactNode;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
  tone?: "light" | "themed";
};

type FieldControlProps = {
  id?: string;
  children?: ReactNode;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
};

function isControlWrapper(child: ReactElement<FieldControlProps>) {
  return child.type === Select || (
    typeof child.type === "string" &&
    !["input", "textarea", "select", "button"].includes(child.type)
  );
}

function controlId(children: ReactNode): string | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<FieldControlProps>(child)) continue;
    if (!isControlWrapper(child)) return child.props.id;
    const nestedId = controlId(child.props.children);
    if (nestedId) return nestedId;
  }
}

// Select roots and layout wrappers are not labelable; connect their actual control.
function connectControl(
  children: ReactNode,
  fieldId: string,
  describedBy: string,
  invalid: boolean,
): ReactNode {
  let connected = false;
  function visit(child: ReactNode): ReactNode {
    if (connected || !isValidElement<FieldControlProps>(child)) return child;
    if (isControlWrapper(child)) {
      const nested = Children.map(child.props.children, visit);
      return connected ? cloneElement(child, { children: nested }) : child;
    }
    connected = true;
    const descriptionIds = [child.props["aria-describedby"], describedBy]
      .filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
    return cloneElement(child, {
      id: child.props.id ?? fieldId,
      "aria-describedby": [...new Set(descriptionIds)].join(" ") || undefined,
      "aria-invalid": invalid ? true : child.props["aria-invalid"],
    });
  }
  return Children.map(children, visit);
}

export function FormField({
  label,
  htmlFor,
  className,
  description,
  error,
  errorId,
  children,
  tone = "themed",
}: FormFieldProps) {
  const generatedId = useId();
  const resolvedHtmlFor = htmlFor ?? controlId(children) ?? generatedId;
  const descriptionId = `${resolvedHtmlFor}-description`;
  const resolvedErrorId = errorId ?? `${resolvedHtmlFor}-error`;
  const resolvedChildren = connectControl(
    children,
    resolvedHtmlFor,
    [description ? descriptionId : null, error ? resolvedErrorId : null].filter(Boolean).join(" "),
    Boolean(error),
  );

  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label
        htmlFor={resolvedHtmlFor}
        className={cn(
          "text-sm",
          tone === "themed" ? "text-foreground" : "text-stone-700",
        )}
      >
        {label}
      </Label>
      {resolvedChildren}
      {description ? (
        <p
          id={descriptionId}
          className={cn(
            "text-sm",
            tone === "themed" ? "text-muted-foreground" : "text-stone-500",
          )}
        >
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={resolvedErrorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
