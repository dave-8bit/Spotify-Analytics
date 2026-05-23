import { useEffect, useState } from "react";

import type { User } from "../types";
import { getMe } from "../services/api";

type AxiosLikeError = {
  response?: { status?: number };
  message?: string;
};

export default function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        const axiosErr = err as AxiosLikeError;
        const status = axiosErr.response?.status;

        if (status === 401) {
          if (!cancelled) setUser(null);
        } else {
          if (!cancelled) setError(axiosErr.message ?? "Failed to load user");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, error };
}

