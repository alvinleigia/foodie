import { Card, CardContent, CardHeader } from "@/components/ui/card";

type SummaryCardsProps = {
  cards: Array<{
    label: string;
    value: number;
    helper: string;
  }>;
};

export function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} tone="themed" className="rounded-xl border-border bg-card">
          <CardHeader className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
              {card.label}
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-semibold text-card-foreground">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
