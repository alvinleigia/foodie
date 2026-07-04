import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  className?: string;
  description?: React.ReactNode;
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
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
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-sm text-stone-700">
        {label}
      </Label>
      {children}
      {description ? <p className="text-sm text-stone-500">{description}</p> : null}
      {error ? (
        <p id={errorId} className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
