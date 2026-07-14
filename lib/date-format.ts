import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";

export const APP_DATE_LOCALE = DEFAULT_LOCALE;
export const APP_TIME_ZONE = DEFAULT_TIMEZONE;

export function formatAppDate(value: string | Date) {
  return new Intl.DateTimeFormat(APP_DATE_LOCALE, {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function formatAppDateTime(value: string | Date) {
  return new Intl.DateTimeFormat(APP_DATE_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}
