// Spotify HTTP client: token refresh + authenticated GETs + 429/Retry-After
// handling (ARCHITECTURE.md §4.1). Persisting refreshed credentials is allowed
// here (Ingestion → DB is a permitted dependency, §2.2).
//
// During M2 the User table's legacy token columns are dual-written on refresh so
// nothing that still reads them (e.g. GET /auth/me) observes a change; they are
// dropped in a later milestone (§6.3).

import axios, { AxiosError } from "axios";
import prisma from "../../../config/prisma";
import type {
  ProviderAccountRecord,
  ProviderCredentials,
} from "../../types";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const REFRESH_BUFFER_SECONDS = 60 * 5; // refresh when within 5 minutes
const MAX_RETRY_AFTER_SECONDS = 30; // never stall a request longer than this

const getSpotifyClientCreds = (): { clientId: string; clientSecret: string } => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  return { clientId, clientSecret };
};

const isExpiringSoon = (tokenExpiresAt: Date): boolean => {
  return tokenExpiresAt.getTime() - Date.now() <= REFRESH_BUFFER_SECONDS * 1000;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const refreshCredentials = async (
  account: ProviderAccountRecord
): Promise<ProviderCredentials> => {
  if (!account.refreshToken) {
    throw new Error(
      `[ingestion:spotify] userId=${account.userId} missing refresh token`
    );
  }

  const { clientId, clientSecret } = getSpotifyClientCreds();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await axios.post(
    SPOTIFY_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return {
    accessToken: response.data.access_token as string,
    refreshToken:
      (response.data.refresh_token as string | undefined) ??
      account.refreshToken,
    tokenExpiresAt: new Date(
      Date.now() + (response.data.expires_in as number) * 1000
    ),
  };
};

const persistCredentials = async (
  account: ProviderAccountRecord,
  creds: ProviderCredentials
): Promise<void> => {
  await prisma.providerAccount.update({
    where: { id: account.id },
    data: {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      tokenExpiresAt: creds.tokenExpiresAt,
    },
  });

  // Legacy mirror (M2 transition only, ARCHITECTURE.md §6.3).
  await prisma.user.update({
    where: { id: account.userId },
    data: {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      tokenExpiresAt: creds.tokenExpiresAt,
    },
  });
};

export const getValidAccessToken = async (
  account: ProviderAccountRecord
): Promise<string> => {
  if (
    account.accessToken &&
    account.tokenExpiresAt &&
    !isExpiringSoon(account.tokenExpiresAt)
  ) {
    return account.accessToken;
  }

  const creds = await refreshCredentials(account);
  await persistCredentials(account, creds);
  return creds.accessToken;
};

export const spotifyGet = async <T>(
  account: ProviderAccountRecord,
  endpoint: string,
  params?: Record<string, string>
): Promise<T> => {
  const accessToken = await getValidAccessToken(account);
  const url = `${SPOTIFY_API_BASE}${endpoint}`;
  const config = {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
  };

  try {
    const response = await axios.get<T>(url, config);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 429) {
      const retryAfterSeconds = Math.min(
        Number(axiosError.response.headers?.["retry-after"] ?? 1),
        MAX_RETRY_AFTER_SECONDS
      );
      console.warn(
        `[ingestion:spotify] userId=${account.userId} rate limited, retrying in ${retryAfterSeconds}s`
      );
      await sleep(retryAfterSeconds * 1000);
      const response = await axios.get<T>(url, config);
      return response.data;
    }
    throw error;
  }
};

// ── Legacy userId-based helpers ──────────────────────────────────────────────
// Existing REST routes (top-tracks / top-artists proxies) call Spotify keyed by
// userId. They resolve the user's ProviderAccount here so all credential
// reads/writes go through ProviderAccount. These helpers are re-exported by the
// services/spotifyService.ts shim and retire when those routes move to
// snapshot reads (M6).

export const getSpotifyAccountForUser = async (
  userId: number
): Promise<ProviderAccountRecord> => {
  const account = await prisma.providerAccount.findFirst({
    where: { userId, provider: "spotify" },
  });

  if (!account) {
    throw new Error(`[ingestion:spotify] no spotify account for user ${userId}`);
  }

  return account;
};

export const spotifyGetForUser = async <T>(
  userId: number,
  endpoint: string,
  params?: Record<string, string>
): Promise<T> => {
  const account = await getSpotifyAccountForUser(userId);
  return spotifyGet<T>(account, endpoint, params);
};

export const getValidAccessTokenForUser = async (
  userId: number
): Promise<string> => {
  const account = await getSpotifyAccountForUser(userId);
  return getValidAccessToken(account);
};
