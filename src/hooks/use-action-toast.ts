"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type ActionToastState = {
  success: boolean;
  message?: string;
};

export function useActionToast(state: ActionToastState) {
  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      return;
    }

    toast.error(state.message);
  }, [state]);
}
