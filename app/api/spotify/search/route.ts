import { filterCatalog, type MusicItem, type MusicKind } from "@/lib/music";

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

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("type") === "track" ? "track" : "artist";

  if (!query) {
    return Response.json({ provider: "sample", items: filterCatalog(kind, "") });
  }

  try {
    const token = await getSpotifyToken();
    if (!token) {
      return sampleResponse(kind, query);
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
      return sampleResponse(kind, query);
    }

    const payload = (await response.json()) as SpotifySearchResponse;
    const items =
      kind === "artist" ? mapArtists(payload.artists?.items ?? []) : await mapTracks(payload.tracks?.items ?? [], token);

    return Response.json({
      provider: "spotify",
      items: items.length ? items : filterCatalog(kind, query),
    });
  } catch {
    return sampleResponse(kind, query);
  }
}

async function getSpotifyToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBase64(`${clientId}:${clientSecret}`)}`,
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

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 3600) - 60) * 1000,
  };

  return cachedToken.value;
}

function sampleResponse(kind: MusicKind, query: string) {
  return Response.json({
    provider: "sample",
    items: filterCatalog(kind, query),
  });
}

function mapArtists(artists: SpotifyArtist[]): MusicItem[] {
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

async function mapTracks(tracks: SpotifyTrack[], token: string): Promise<MusicItem[]> {
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

function toBase64(value: string) {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value).toString("base64");
}
