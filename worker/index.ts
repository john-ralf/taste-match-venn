/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { ListenerProfile, MusicItem, MusicKind } from "../lib/music";
import type { RoomPayload, RoomSaveRequest } from "../lib/rooms";

interface Env {
  ASSETS: Fetcher;
  ROOMS?: KVNamespace;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const ROOM_TTL_SECONDS = 60 * 60 * 24 * 30;
const ROOM_ID_PATTERN = /^[A-Z0-9]{6,12}$/;
const MAX_TRACKS_PER_LISTENER = 10;

type SpotifyImage = {
  url?: string;
};

type SpotifyArtist = {
  id: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
  external_urls?: {
    spotify?: string;
  };
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists?: { id?: string; name: string }[];
  album?: {
    images?: SpotifyImage[];
  };
  external_urls?: {
    spotify?: string;
  };
};

type SpotifySearchResponse = {
  artists?: {
    items?: SpotifyArtist[];
  };
  tracks?: {
    items?: SpotifyTrack[];
  };
};

type SpotifyArtistsResponse = {
  artists?: SpotifyArtist[];
};

let cachedSpotifyToken: { value: string; expiresAt: number } | null = null;

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" || url.pathname.startsWith("/api/rooms/")) {
      return handleRoomRequest(request, env);
    }

    if (url.pathname === "/api/spotify/search") {
      return handleSpotifySearchRequest(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

async function handleSpotifySearchRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kind: MusicKind = url.searchParams.get("type") === "track" ? "track" : "artist";

  if (!query) {
    return spotifySearchResponse([]);
  }

  try {
    const token = await getSpotifyToken(env);
    if (!token) {
      return spotifySearchResponse([], "Spotify is not configured.", 503);
    }

    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", kind);
    searchUrl.searchParams.set("limit", "8");
    searchUrl.searchParams.set("market", "US");

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return spotifySearchResponse([], "Spotify search failed.", 502);
    }

    const payload = (await response.json()) as SpotifySearchResponse;
    const items =
      kind === "artist"
        ? mapSpotifyArtists(payload.artists?.items ?? [])
        : await mapSpotifyTracks(payload.tracks?.items ?? [], token);

    return json({
      provider: "spotify",
      items,
    });
  } catch {
    return spotifySearchResponse([], "Spotify search failed.", 502);
  }
}

async function getSpotifyToken(env: Env) {
  if (cachedSpotifyToken && Date.now() < cachedSpotifyToken.expiresAt) {
    return cachedSpotifyToken.value;
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    return null;
  }

  cachedSpotifyToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 3600) - 60) * 1000,
  };

  return cachedSpotifyToken.value;
}

function spotifySearchResponse(items: MusicItem[], error?: string, status = 200) {
  return json({
    provider: "spotify",
    items,
    ...(error ? { error } : {}),
  }, status);
}

function mapSpotifyArtists(artists: SpotifyArtist[]): MusicItem[] {
  return artists.map((artist) => ({
    id: `spotify:artist:${artist.id}`,
    kind: "artist",
    name: artist.name,
    genres: artist.genres ?? [],
    image: artist.images?.[0]?.url,
    externalUrl: artist.external_urls?.spotify,
    source: "spotify",
  }));
}

async function mapSpotifyTracks(tracks: SpotifyTrack[], token: string): Promise<MusicItem[]> {
  const genresByArtistId = await getSpotifyArtistGenres(token, tracks);

  return tracks.map((track) => {
    const artistNames = track.artists?.map((artist) => artist.name).filter(Boolean) ?? [];
    const genres = uniqueStrings(
      (track.artists ?? []).flatMap((artist) => (artist.id ? (genresByArtistId.get(artist.id) ?? []) : []))
    );

    return {
      id: `spotify:track:${track.id}`,
      kind: "track",
      name: track.name,
      subtitle: artistNames.join(", "),
      artistNames,
      genres,
      image: track.album?.images?.[0]?.url,
      externalUrl: track.external_urls?.spotify,
      source: "spotify",
    };
  });
}

async function getSpotifyArtistGenres(token: string, tracks: SpotifyTrack[]) {
  const artistIds = uniqueStrings(tracks.flatMap((track) => track.artists?.map((artist) => artist.id).filter(Boolean) ?? []));
  const genresByArtistId = new Map<string, string[]>();

  for (let index = 0; index < artistIds.length; index += 50) {
    const batch = artistIds.slice(index, index + 50);
    if (!batch.length) {
      continue;
    }

    const artistsUrl = new URL("https://api.spotify.com/v1/artists");
    artistsUrl.searchParams.set("ids", batch.join(","));

    const response = await fetch(artistsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as SpotifyArtistsResponse;
    for (const artist of payload.artists ?? []) {
      genresByArtistId.set(artist.id, artist.genres ?? []);
    }
  }

  return genresByArtistId;
}

function uniqueStrings(values: (string | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).slice(0, 12);
}

async function handleRoomRequest(request: Request, env: Env) {
  if (!env.ROOMS) {
    return json({ error: "Room storage is not configured yet." }, 503);
  }

  const url = new URL(request.url);
  const roomId = url.pathname.split("/").filter(Boolean)[2]?.toUpperCase();

  if (url.pathname === "/api/rooms" && request.method === "POST") {
    const body = await readRoomSaveRequest(request);
    const now = new Date().toISOString();
    const id = await createUniqueRoomId(env.ROOMS);
    const room: RoomPayload = {
      id,
      listeners: sanitizeListeners(body.listeners),
      createdAt: now,
      updatedAt: now,
    };

    await env.ROOMS.put(roomKey(id), JSON.stringify(room), { expirationTtl: ROOM_TTL_SECONDS });
    return json(room, 201);
  }

  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
    return json({ error: "Room not found." }, 404);
  }

  if (request.method === "GET") {
    const room = await readRoom(env.ROOMS, roomId);
    return room ? json(room) : json({ error: "Room not found." }, 404);
  }

  if (request.method === "PUT") {
    const existing = await readRoom(env.ROOMS, roomId);
    if (!existing) {
      return json({ error: "Room not found." }, 404);
    }

    const body = await readRoomSaveRequest(request);
    const room: RoomPayload = {
      ...existing,
      listeners: sanitizeListeners(body.listeners),
      updatedAt: new Date().toISOString(),
    };

    await env.ROOMS.put(roomKey(room.id), JSON.stringify(room), { expirationTtl: ROOM_TTL_SECONDS });
    return json(room);
  }

  return json({ error: "Method not allowed." }, 405);
}

async function readRoom(kv: KVNamespace, id: string) {
  const raw = await kv.get(roomKey(id), "json");
  return isRoomPayload(raw) ? raw : null;
}

async function readRoomSaveRequest(request: Request): Promise<RoomSaveRequest> {
  try {
    const body = await request.json();
    return typeof body === "object" && body ? (body as RoomSaveRequest) : {};
  } catch {
    return {};
  }
}

async function createUniqueRoomId(kv: KVNamespace) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = createRoomId();
    if (!(await kv.get(roomKey(id)))) {
      return id;
    }
  }

  return createRoomId(10);
}

function createRoomId(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function roomKey(id: string) {
  return `room:${id}`;
}

function sanitizeListeners(listeners: unknown): ListenerProfile[] {
  if (!Array.isArray(listeners)) {
    return [];
  }

  return listeners.slice(0, 4).map((listener, index) => {
    const source = isRecord(listener) ? listener : {};
    return {
      id: getString(source.id, `listener-${index + 1}`),
      name: getString(source.name, `Listener ${index + 1}`).slice(0, 48),
      color: getString(source.color, ["#0f766e", "#c2410c", "#7c3aed", "#2563eb"][index] ?? "#0f766e"),
      artists: [],
      tracks: sanitizeItems(source.tracks, "track"),
    };
  });
}

function sanitizeItems(items: unknown, kind: MusicItem["kind"]): MusicItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => isRecord(item) && item.source === "spotify")
    .slice(0, MAX_TRACKS_PER_LISTENER)
    .map((item, index) => {
      const source = isRecord(item) ? item : {};
      const name = getString(source.name, `${kind === "artist" ? "Artist" : "Song"} ${index + 1}`).slice(0, 100);
      const subtitle = source.subtitle ? getString(source.subtitle, "").slice(0, 100) : undefined;
      const artistNames = Array.isArray(source.artistNames)
        ? source.artistNames.map((artistName) => String(artistName).slice(0, 100)).slice(0, 6)
        : subtitle
          ? [subtitle]
          : [];

      return {
        id: getString(source.id, `room:${kind}:${index}:${name}`).slice(0, 180),
        kind,
        name,
        subtitle,
        artistNames,
        genres: Array.isArray(source.genres) ? source.genres.map((genre) => String(genre).slice(0, 48)).slice(0, 12) : [],
        image: source.image ? getString(source.image, "").slice(0, 500) : undefined,
        externalUrl: source.externalUrl ? getString(source.externalUrl, "").slice(0, 500) : undefined,
        source: "spotify",
      };
    });
}

function isRoomPayload(value: unknown): value is RoomPayload {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.listeners);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
