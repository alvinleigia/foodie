import { cn } from "@/lib/utils";
import { controlStyles, type ControlSize } from "@/components/ui/control-styles";

export function NativeSelect({
  className,
  density = "default",
  controlSize = density,
  ...props
}: React.ComponentProps<"select"> & {
  density?: "compact" | "default";
  controlSize?: ControlSize;
}) {
  return (
    <select
      data-slot="native-select"
      data-control-size={controlSize}
      className={cn(
        controlStyles({ controlSize }),
        "max-w-full text-base md:text-sm",
        (controlSize === "lg" || controlSize === "xl") && "md:text-base",
        className,
      )}
      {...props}
    />
  );
}
