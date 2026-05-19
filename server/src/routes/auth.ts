import { Router, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/prisma";
import { getSession } from "../middleware/auth";
import { triggerSync } from "../services/syncService";

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !FRONTEND_URL) {
  // Fail fast to make configuration issues obvious.
  throw new Error(
    "Missing one or more env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, FRONTEND_URL"
  );
}

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

router.get("/spotify", (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString("hex");
  const session = getSession(req);

  const origin = (req.headers.origin as string | undefined) ?? FRONTEND_URL;

  session.oauthState = state;
  session.oauthOrigin = origin;

  res.redirect(
    `${SPOTIFY_AUTHORIZE_URL}?` +
      new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
      }).toString()
  );
});

router.get("/spotify/callback", async (req: Request, res: Response) => {
  const session = getSession(req);

  const { code, state, error } = req.query;

  if (error) {
    res.status(400).send({ error });
    return;
  }

  if (!code || typeof code !== "string" || !state || typeof state !== "string") {
    res.status(400).send({ error: "Missing code or state" });
    return;
  }

  if (!session.oauthState || state !== session.oauthState) {
    res.status(400).send({ error: "Invalid state" });
    return;
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const tokenResponse = await axios.post(
    SPOTIFY_TOKEN_URL,
    new URLSearchParams({
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  }: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  } = tokenResponse.data;

  const meResponse = await axios.get(SPOTIFY_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const spotifyUser = meResponse.data as {
    id: string;
    display_name?: string;
    email?: string;
    images?: Array<{ url: string }>;
  };

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  const user = await prisma.user.upsert({
    where: { spotifyId: spotifyUser.id },
    update: {
      accessToken,
      refreshToken,
      tokenExpiresAt,
      displayName: spotifyUser.display_name ?? null,
      email: spotifyUser.email ?? null,
      imageUrl: spotifyUser.images?.[0]?.url ?? null,
    },
    create: {
      spotifyId: spotifyUser.id,
      displayName: spotifyUser.display_name ?? null,
      email: spotifyUser.email ?? null,
      imageUrl: spotifyUser.images?.[0]?.url ?? null,
      accessToken,
      refreshToken,
      tokenExpiresAt,
    },
  });

  session.userId = user.id;

  // Trigger sync in background (don't await).
  void triggerSync(user.id);

  res.redirect(`${FRONTEND_URL}/dashboard`);
});

router.get("/me", async (req: Request, res: Response) => {
  const session = getSession(req);

  if (!session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Return user without tokens.
  res.json({
    id: user.id,
    spotifyId: user.spotifyId,
    displayName: user.displayName,
    email: user.email,
    imageUrl: user.imageUrl,
    tokenExpiresAt: user.tokenExpiresAt,
    lastSyncedAt: user.lastSyncedAt,
    createdAt: user.createdAt,
  });
});

router.post("/logout", (req: Request, res: Response) => {
  const session = getSession(req);

  session.destroy(() => {
    res.status(200).json({ success: true });
  });
});

export default router;

