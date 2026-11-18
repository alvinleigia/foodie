"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";

export type AccountDeletionTarget = { userId: string; membershipId: string; name: string; email: string };

export function DeleteUserAccountDialog({ target, onClose, onDeleted }: {
  target: AccountDeletionTarget;
  onClose: () => void;
  onDeleted: (userId: string) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = email.trim().toLowerCase() === target.email.toLowerCase();

  async function deleteAccount() {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const result = await requestJson<{ deletedUserId: string }>(`/api/users/${target.membershipId}/account`, {
        method: "DELETE", body: { confirmationEmail: email.trim() },
      });
      onDeleted(result.deletedUserId);
      toast.success("User account deleted.");
      router.refresh();
      onClose();
    } catch (caught) {
      setError(getCaughtErrorMessage(caught));
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !isDeleting) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target.name}&apos;s account?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently delete this login and all its company and restaurant access.
            This cannot be undone. Accounts with linked activity cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormField label="Confirm email address" description={`Enter ${target.email}`} className="my-4" tone="themed">
          <Input type="email" autoComplete="off" value={email} disabled={isDeleting}
            onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!confirmed || isDeleting}
            onClick={(event) => { event.preventDefault(); void deleteAccount(); }}>
            <ButtonLabel icon={Trash2Icon}>{isDeleting ? "Deleting..." : "Delete account"}</ButtonLabel>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
