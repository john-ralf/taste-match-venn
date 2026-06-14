import type { MusicItem } from "@/lib/music";

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

type LastFmImage = {
  "#text"?: string;
  size?: string;
};

type LastFmTrack = {
  name?: string;
  artist?: string | { name?: string };
  url?: string;
  mbid?: string;
  image?: LastFmImage[];
};

type LastFmSearchResponse = {
  results?: {
    trackmatches?: {
      track?: LastFmTrack | LastFmTrack[];
    };
  };
  error?: number;
  message?: string;
};

type LastFmTag = {
  name?: string;
  count?: number;
};

type LastFmTopTagsResponse = {
  toptags?: {
    tag?: LastFmTag | LastFmTag[];
  };
  error?: number;
  message?: string;
};

type SearchResult = {
  error?: string;
  items: MusicItem[];
  provider: "spotify" | "lastfm";
  status?: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("type") === "track" ? "track" : "artist";

  if (!query) {
    return musicSearchResponse("spotify", []);
  }

  const spotify = await searchSpotify(kind, query);
  if (spotify.items.length || kind !== "track") {
    return musicSearchResponse("spotify", spotify.items, spotify.error, spotify.status);
  }

  const lastFm = await searchLastFmTracks(query);
  if (lastFm.items.length || lastFm.error) {
    return musicSearchResponse("lastfm", lastFm.items, lastFm.error, lastFm.status);
  }

  return musicSearchResponse("spotify", [], spotify.error ?? "No music search results found.", spotify.status);
}

async function searchSpotify(kind: "artist" | "track", query: string): Promise<SearchResult> {
  try {
    const token = await getSpotifyToken();
    if (!token) {
      return { provider: "spotify", items: [], error: "Spotify is not configured.", status: 503 };
    }

    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", kind);
    searchUrl.searchParams.set("limit", "8");

    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return {
        provider: "spotify",
        items: [],
        error: await getSpotifyErrorMessage(response, "Spotify search failed."),
        status: 502,
      };
    }

    const payload = (await response.json()) as SpotifySearchResponse;
    const items =
      kind === "artist" ? mapArtists(payload.artists?.items ?? []) : await mapTracks(payload.tracks?.items ?? [], token);

    return {
      provider: "spotify",
      items,
    };
  } catch {
    return { provider: "spotify", items: [], error: "Spotify search failed.", status: 502 };
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
      Accept: "application/json",
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

function musicSearchResponse(provider: "spotify" | "lastfm", items: MusicItem[], error?: string, status = 200) {
  return Response.json({
    provider,
    items,
    ...(error ? { error } : {}),
  }, { status });
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
        Accept: "application/json",
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

async function searchLastFmTracks(query: string): Promise<SearchResult> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return { provider: "lastfm", items: [], error: "Last.fm is not configured.", status: 503 };
  }

  try {
    const searchUrl = new URL("https://ws.audioscrobbler.com/2.0/");
    searchUrl.searchParams.set("method", "track.search");
    searchUrl.searchParams.set("track", query);
    searchUrl.searchParams.set("api_key", apiKey);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("limit", "6");

    const response = await fetch(searchUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return { provider: "lastfm", items: [], error: `Last.fm search failed. (${response.status})`, status: 502 };
    }

    const payload = (await response.json()) as LastFmSearchResponse;
    if (payload.error) {
      return {
        provider: "lastfm",
        items: [],
        error: `Last.fm search failed. (${payload.error}: ${payload.message ?? "unknown error"})`,
        status: 502,
      };
    }

    const tracks = asArray(payload.results?.trackmatches?.track).slice(0, 6);
    const items = await Promise.all(tracks.map((track) => mapLastFmTrack(track, apiKey)));
    return { provider: "lastfm", items: items.filter((item): item is MusicItem => Boolean(item)) };
  } catch {
    return { provider: "lastfm", items: [], error: "Last.fm search failed.", status: 502 };
  }
}

async function mapLastFmTrack(track: LastFmTrack, apiKey: string): Promise<MusicItem | null> {
  const name = track.name?.trim();
  const artistName = getLastFmArtistName(track);
  if (!name || !artistName) {
    return null;
  }

  return {
    id: `lastfm:track:${track.mbid || encodeURIComponent(`${artistName}:${name}`)}`,
    kind: "track",
    name,
    subtitle: artistName,
    artistNames: [artistName],
    genres: await getLastFmTrackTags(apiKey, artistName, name),
    image: getLastFmImage(track.image),
    externalUrl: track.url,
    source: "lastfm",
  };
}

async function getLastFmTrackTags(apiKey: string, artist: string, track: string) {
  try {
    const tagUrl = new URL("https://ws.audioscrobbler.com/2.0/");
    tagUrl.searchParams.set("method", "track.getTopTags");
    tagUrl.searchParams.set("artist", artist);
    tagUrl.searchParams.set("track", track);
    tagUrl.searchParams.set("autocorrect", "1");
    tagUrl.searchParams.set("api_key", apiKey);
    tagUrl.searchParams.set("format", "json");

    const response = await fetch(tagUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as LastFmTopTagsResponse;
    if (payload.error) {
      return [];
    }

    return uniqueStrings(
      asArray(payload.toptags?.tag)
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .map((tag) => tag.name?.toLowerCase())
    );
  } catch {
    return [];
  }
}

function getLastFmArtistName(track: LastFmTrack) {
  return typeof track.artist === "string" ? track.artist.trim() : track.artist?.name?.trim();
}

function getLastFmImage(images: LastFmImage[] | undefined) {
  if (!images) {
    return undefined;
  }

  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index]["#text"];
    if (image) {
      return image;
    }
  }

  return undefined;
}

function asArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function getSpotifyErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    const message = payload.error?.message;
    return message ? `${fallback} (${response.status}: ${message})` : `${fallback} (${response.status})`;
  } catch {
    return `${fallback} (${response.status})`;
  }
}

function toBase64(value: string) {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value).toString("base64");
}
