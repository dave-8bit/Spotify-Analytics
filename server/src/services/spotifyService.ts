import axios from "axios";
import prisma from "../config/prisma";
import type { User } from "@prisma/client";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const REFRESH_BUFFER_SECONDS = 60 * 5; // refresh when within 5 minutes

const getSpotifyClientCreds = (): { clientId: string; clientSecret: string } => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  return { clientId, clientSecret };
};

const isExpiringSoon = (tokenExpiresAt: Date): boolean => {
  const now = Date.now();
  const expiresAt = tokenExpiresAt.getTime();
  return expiresAt - now <= REFRESH_BUFFER_SECONDS * 1000;
};

export const getValidAccessToken = async (userId: number): Promise<string> => {
  const user = (await prisma.user.findUnique({ where: { id: userId } })) as
    | User
    | null;

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (!user.refreshToken) {
    throw new Error(`Missing refresh token for user: ${userId}`);
  }

  if (user.tokenExpiresAt && user.accessToken && !isExpiringSoon(user.tokenExpiresAt)) {
    return user.accessToken;
  }

  const { clientId, clientSecret } = getSpotifyClientCreds();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: user.refreshToken,
  });

  const response = await axios.post(
    SPOTIFY_TOKEN_URL,
    body.toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const newAccessToken: string = response.data.access_token;
  const newRefreshToken: string = response.data.refresh_token ?? user.refreshToken;
  const expiresInSeconds: number = response.data.expires_in;

  const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiresAt,
    },
  });

  return newAccessToken;
};

export const spotifyGet = async <T>(
  userId: number,
  endpoint: string,
  params?: Record<string, string>
): Promise<T> => {
  const accessToken = await getValidAccessToken(userId);

  const url = `${SPOTIFY_API_BASE}${endpoint}`;

  const response = await axios.get<T>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params,
  });

  return response.data;
};

