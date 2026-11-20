"use client";

import { useState } from "react";
import { SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceButton } from "@/components/ui/choice-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { Combobox } from "@/components/shared/Combobox";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { PhoneNumberInput } from "@/components/shared/PhoneNumberInput";
import { ThemeSelector } from "@/components/shared/ThemeSelector";
import { FormActions } from "@/components/shared/FormActions";

export default function UiControlsPreview({ customer = false }: { customer?: boolean }) {
  const [choice, setChoice] = useState("Takeaway");
  const [station, setStation] = useState("kitchen");
  const [currency, setCurrency] = useState("GBP");
  const [timezone, setTimezone] = useState("Europe/London");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<"GB" | "IN">("GB");
  const [submitted, setSubmitted] = useState(false);
  return (
    <main data-customer-storefront={customer ? "" : undefined} className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid max-w-4xl gap-6">
        <h1 className="text-2xl font-semibold">Shared controls</h1>
        <ThemeSelector />
        <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Name" description="Name for the order"><Input required defaultValue="Demo guest" /></FormField>
            <FormField label="Native select"><NativeSelect defaultValue="DINE_IN"><option value="DINE_IN">Dine-in</option><option value="PICKUP">Takeaway</option></NativeSelect></FormField>
            <FormField label="Select"><Select defaultValue="DINE_IN"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent data-customer-storefront={customer ? "" : undefined}><SelectItem value="DINE_IN">Dine-in</SelectItem><SelectItem value="PICKUP">Takeaway</SelectItem></SelectContent></Select></FormField>
            <FormField label="Searchable select"><Combobox tone={customer ? "customer" : "default"} options={[{ label: "Kitchen", value: "kitchen" }, { label: "Drinks", value: "drinks" }]} value={station} onValueChange={setStation} /></FormField>
            <FormField label="Currency"><CurrencySelect tone={customer ? "customer" : "default"} value={currency} onValueChange={setCurrency} /></FormField>
            <FormField label="Timezone"><TimezoneSelect tone={customer ? "customer" : "default"} value={timezone} onValueChange={setTimezone} /></FormField>
            <FormField label="Phone"><PhoneNumberInput tone={customer ? "customer" : "default"} countryCode={country} onCountryCodeChange={(next) => { if (next === "GB" || next === "IN") setCountry(next); }} value={phone} onValueChange={setPhone} /></FormField>
            <FormField label="Invalid email" description="Use a valid address" error="Enter a valid email"><Input type="email" defaultValue="invalid" aria-describedby="additional-email-help" /></FormField>
            <p id="additional-email-help" className="sr-only">Extra email help</p>
            <FormField label="Disabled field"><Input disabled value="Unavailable" readOnly /></FormField>
            <FormField label="Notes"><Textarea defaultValue="No onions" /></FormField>
            <FormField label="Nested control" htmlFor="nested-control" description="Wrapper help"><div><Input /></div></FormField>
          </div>
          <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Order type</legend><div className="grid grid-cols-3 gap-2">{["Dine-in", "Takeaway", "Delivery"].map((value) => <ChoiceButton key={value} selected={choice === value} onClick={() => setChoice(value)}>{value}</ChoiceButton>)}</div></fieldset>
          <Label className="flex items-center gap-2"><Checkbox />Send updates</Label>
          <div className="flex gap-4"><Label className="flex items-center gap-2"><Radio name="baseline" defaultChecked />Standard</Label><Label className="flex items-center gap-2"><Radio name="baseline" />Alternative</Label></div>
          <div className="flex flex-wrap gap-2">{(["default", "outline", "tinted", "secondary", "ghost", "destructive", "destructive-outline", "success", "warning", "success-outline", "warning-outline", "info-outline"] as const).map((variant) => <Button key={variant} type="button" variant={variant}>{variant}</Button>)}<Button disabled type="button">Disabled action</Button></div>
          <Dialog><DialogTrigger asChild><Button type="button" variant="outline">Open dialog</Button></DialogTrigger><DialogContent aria-describedby={undefined} data-customer-storefront={customer ? "" : undefined}><DialogTitle>Edit details</DialogTitle><FormField label="Dialog name"><Input defaultValue="Guest" /></FormField></DialogContent></Dialog>
          <FormActions><Button type="submit"><SaveIcon />Save</Button><Button type="button" variant="outline">Cancel</Button></FormActions>
          {submitted ? <p role="status">Saved</p> : null}
        </form>
      </div>
    </main>
  );
}
