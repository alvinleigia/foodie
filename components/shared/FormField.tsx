"use client";

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  className?: string;
  description?: ReactNode;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
};

export function FormField({
  label,
  htmlFor,
  className,
  description,
  error,
  errorId,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const childArray = Children.toArray(children);
  const firstChild = childArray[0];
  const childId =
    isValidElement<{ id?: string }>(firstChild) && typeof firstChild.props.id === "string"
      ? firstChild.props.id
      : undefined;
  const resolvedHtmlFor = htmlFor ?? childId ?? generatedId;
  const resolvedChildren =
    !htmlFor && !childId && isValidElement(firstChild)
      ? [
          cloneElement(firstChild as ReactElement<{ id?: string }>, { id: resolvedHtmlFor }),
          ...childArray.slice(1),
        ]
      : children;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={resolvedHtmlFor} className="text-sm text-stone-700">
        {label}
      </Label>
      {resolvedChildren}
      {description ? <p className="text-sm text-stone-500">{description}</p> : null}
      {error ? (
        <p id={errorId} className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
