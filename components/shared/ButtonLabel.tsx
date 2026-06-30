import type { ComponentType, ReactNode } from "react";

type ButtonLabelIcon = ComponentType<{ className?: string }>;

type ButtonLabelProps = {
  children: ReactNode;
  icon: ButtonLabelIcon;
};

export function ButtonLabel({ children, icon: Icon }: ButtonLabelProps) {
  return (
    <>
      <Icon data-icon="inline-start" className="size-4" />
      <span>{children}</span>
    </>
  );
}
