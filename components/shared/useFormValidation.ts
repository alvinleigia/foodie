"use client";

import { useState } from "react";

import {
  type FieldErrors,
  getCaughtValidationErrors,
  getFieldError,
  getFirstFieldError,
  hasFieldErrors as getHasFieldErrors,
} from "@/lib/api-client";

type AppliedValidation<TField extends string> = {
  fieldErrors: FieldErrors<TField>;
  formError: string | null;
  hasFieldErrors: boolean;
  message: string;
};

export function useFormValidation<TField extends string = string>() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TField>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function clearErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  function clearFieldError(field: TField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function setFieldError(field: TField, message: string) {
    setFieldErrors({ [field]: message } as FieldErrors<TField>);
    setFormError(null);
  }

  function applyCaught(
    caught: unknown,
    fallback = "Action failed.",
  ): AppliedValidation<TField> {
    const validation = getCaughtValidationErrors<TField>(caught, fallback);
    const hasFieldErrors = getHasFieldErrors(validation.fieldErrors);
    const message =
      validation.formError ?? getFirstFieldError(validation.fieldErrors) ?? fallback;

    setFieldErrors(validation.fieldErrors);
    setFormError(validation.formError);

    return {
      ...validation,
      hasFieldErrors,
      message,
    };
  }

  return {
    applyCaught,
    clearErrors,
    clearFieldError,
    fieldErrors,
    formError,
    getError: (field: TField) => getFieldError(fieldErrors, field),
    hasFieldErrors: getHasFieldErrors(fieldErrors),
    setFieldError,
    setFormError,
  };
}
