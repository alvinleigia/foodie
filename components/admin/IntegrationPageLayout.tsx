import { SectionHeader } from "@/components/shared/SectionHeader";

type IntegrationPageLayoutProps = {
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function IntegrationPageLayout({
  children,
  description,
  eyebrow,
  title,
}: IntegrationPageLayoutProps) {
  return (
    <div>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        className="mb-6"
        tone="themed"
      />
      {children}
    </div>
  );
}
