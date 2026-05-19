import prisma from "../config/prisma";
import { spotifyGet } from "./spotifyService";

type RecentlyPlayedResponse = {
  items: Array<{
    track: {
      id: string;
      name: string;
      artists: Array<{ id: string; name: string }>;
      album: {
        id: string;
        name: string;
        images: Array<{ url: string }>;
      };
      duration_ms: number;
    };
    played_at: string;
  }>;
};

export const syncRecentlyPlayed = async (userId: number): Promise<void> => {
  const response = await spotifyGet<RecentlyPlayedResponse>(
    userId,
    "/me/player/recently-played",
    { limit: "50" }
  );

  let syncedCount = 0;

  for (const item of response.items) {
    const track = item.track;
    const playedAt = new Date(item.played_at);

    const primaryArtist = track.artists[0];
    const albumImage = track.album.images?.[0]?.url ?? null;

    await prisma.playEvent.upsert({
      where: {
        userId_playedAt: {
          userId,
          playedAt,
        },
      },
      update: {
        trackId: track.id,
        trackName: track.name,
        artistId: primaryArtist?.id,
        artistName: primaryArtist?.name,
        albumId: track.album.id,
        albumName: track.album.name,
        albumImage,
        durationMs: track.duration_ms,
      },
      create: {
        userId,
        trackId: track.id,
        trackName: track.name,
        artistId: primaryArtist?.id,
        artistName: primaryArtist?.name,
        albumId: track.album.id,
        albumName: track.album.name,
        albumImage,
        playedAt,
        durationMs: track.duration_ms,
      },
    });

    syncedCount += 1;
  }

  console.log(`Synced ${syncedCount} recently played events`);
};

export const triggerSync = async (userId: number): Promise<void> => {
  try {
    await syncRecentlyPlayed(userId);

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSyncedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(error);
  }
};

