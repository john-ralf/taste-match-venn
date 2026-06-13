export type MusicKind = "artist" | "track";
export type MusicSource = "spotify" | "sample" | "manual";

export type MusicItem = {
  id: string;
  kind: MusicKind;
  name: string;
  subtitle?: string;
  artistNames?: string[];
  genres: string[];
  image?: string;
  externalUrl?: string;
  source: MusicSource;
};

export type ListenerProfile = {
  id: string;
  name: string;
  color: string;
  artists: MusicItem[];
  tracks: MusicItem[];
};

export const MAX_ITEMS_PER_KIND = 5;

export const SAMPLE_ARTISTS: MusicItem[] = [
  artist("radiohead", "Radiohead", ["alternative rock", "art rock", "electronic"]),
  artist("beyonce", "Beyonce", ["pop", "r&b", "dance"]),
  artist("kendrick-lamar", "Kendrick Lamar", ["hip hop", "jazz rap", "conscious rap"]),
  artist("taylor-swift", "Taylor Swift", ["pop", "folk pop", "songwriter"]),
  artist("fleetwood-mac", "Fleetwood Mac", ["classic rock", "soft rock", "pop rock"]),
  artist("daft-punk", "Daft Punk", ["electronic", "dance", "french house"]),
  artist("sza", "SZA", ["r&b", "neo soul", "alternative r&b"]),
  artist("tame-impala", "Tame Impala", ["psychedelic pop", "indie rock", "neo-psychedelia"]),
  artist("phoebe-bridgers", "Phoebe Bridgers", ["indie folk", "songwriter", "indie rock"]),
  artist("bad-bunny", "Bad Bunny", ["reggaeton", "latin trap", "latin pop"]),
  artist("the-strokes", "The Strokes", ["indie rock", "garage rock", "post-punk revival"]),
  artist("aphex-twin", "Aphex Twin", ["electronic", "idm", "ambient"]),
  artist("mitski", "Mitski", ["indie rock", "art pop", "songwriter"]),
  artist("frank-ocean", "Frank Ocean", ["alternative r&b", "r&b", "soul"]),
  artist("talking-heads", "Talking Heads", ["new wave", "art punk", "funk"]),
  artist("charli-xcx", "Charli XCX", ["hyperpop", "dance pop", "electropop"]),
  artist("tyler-the-creator", "Tyler, The Creator", ["hip hop", "neo soul", "alternative hip hop"]),
  artist("the-cure", "The Cure", ["post-punk", "new wave", "gothic rock"]),
  artist("joni-mitchell", "Joni Mitchell", ["folk", "songwriter", "soft rock"]),
  artist("lcd-soundsystem", "LCD Soundsystem", ["dance-punk", "electronic", "indie dance"]),
  artist("japanese-breakfast", "Japanese Breakfast", ["indie pop", "dream pop", "indie rock"]),
  artist("arctic-monkeys", "Arctic Monkeys", ["indie rock", "garage rock", "alternative rock"]),
  artist("a-tribe-called-quest", "A Tribe Called Quest", ["hip hop", "jazz rap", "golden age hip hop"]),
  artist("bjork", "Bjork", ["art pop", "electronic", "experimental"]),
];

export const SAMPLE_TRACKS: MusicItem[] = [
  track("everything-in-its-right-place", "Everything In Its Right Place", "Radiohead", [
    "alternative rock",
    "art rock",
    "electronic",
  ]),
  track("get-lucky", "Get Lucky", "Daft Punk", ["electronic", "dance", "funk"]),
  track("dreams", "Dreams", "Fleetwood Mac", ["classic rock", "soft rock", "pop rock"]),
  track("good-days", "Good Days", "SZA", ["r&b", "neo soul", "alternative r&b"]),
  track("redbone", "Redbone", "Childish Gambino", ["funk", "soul", "alternative r&b"]),
  track("pink-white", "Pink + White", "Frank Ocean", ["alternative r&b", "soul", "r&b"]),
  track("the-less-i-know-the-better", "The Less I Know The Better", "Tame Impala", [
    "psychedelic pop",
    "indie rock",
    "funk",
  ]),
  track("dancing-on-my-own", "Dancing On My Own", "Robyn", ["dance pop", "electropop", "pop"]),
  track("motion-sickness", "Motion Sickness", "Phoebe Bridgers", [
    "indie folk",
    "songwriter",
    "indie rock",
  ]),
  track("levitating", "Levitating", "Dua Lipa", ["dance pop", "pop", "disco"]),
  track("mr-brightside", "Mr. Brightside", "The Killers", ["indie rock", "new wave", "pop rock"]),
  track("supercut", "Supercut", "Lorde", ["pop", "electropop", "songwriter"]),
  track("sweet-disposition", "Sweet Disposition", "The Temper Trap", ["indie rock", "dream pop", "pop rock"]),
  track("electric-feel", "Electric Feel", "MGMT", ["psychedelic pop", "indie pop", "electropop"]),
  track("a-punk", "A-Punk", "Vampire Weekend", ["indie rock", "indie pop", "afro-pop"]),
  track("midnight-city", "Midnight City", "M83", ["synthpop", "dream pop", "electronic"]),
  track("time-to-pretend", "Time To Pretend", "MGMT", ["psychedelic pop", "indie pop", "electronic"]),
  track("no-one-knows", "No One Knows", "Queens of the Stone Age", ["alternative rock", "garage rock", "hard rock"]),
  track("juicy", "Juicy", "The Notorious B.I.G.", ["hip hop", "golden age hip hop", "east coast hip hop"]),
  track("sweet-life", "Sweet Life", "Frank Ocean", ["alternative r&b", "soul", "r&b"]),
  track("delete-forever", "Delete Forever", "Grimes", ["art pop", "electronic", "experimental"]),
  track("obstacle-1", "Obstacle 1", "Interpol", ["post-punk revival", "indie rock", "garage rock"]),
  track("maps", "Maps", "Yeah Yeah Yeahs", ["indie rock", "garage rock", "post-punk revival"]),
  track("cellophane", "Cellophane", "FKA twigs", ["art pop", "alternative r&b", "experimental"]),
  track("all-caps", "All Caps", "Madvillain", ["hip hop", "abstract hip hop", "underground hip hop"]),
  track("age-of-consent", "Age Of Consent", "New Order", ["new wave", "post-punk", "dance rock"]),
  track("only-shallow", "Only Shallow", "My Bloody Valentine", ["shoegaze", "dream pop", "alternative rock"]),
  track("paper-planes", "Paper Planes", "M.I.A.", ["dance", "alternative hip hop", "electropop"]),
];

export const SAMPLE_CATALOG = [...SAMPLE_ARTISTS, ...SAMPLE_TRACKS];

export function createDemoListeners(): ListenerProfile[] {
  return [
    {
      id: "listener-a",
      name: "Alex",
      color: "#0f766e",
      artists: pickArtists(["radiohead", "fleetwood-mac", "tame-impala", "frank-ocean", "the-strokes"]),
      tracks: pickTracks([
        "everything-in-its-right-place",
        "dreams",
        "the-less-i-know-the-better",
        "pink-white",
        "maps",
      ]),
    },
    {
      id: "listener-b",
      name: "Sam",
      color: "#c2410c",
      artists: pickArtists(["sza", "tame-impala", "frank-ocean", "daft-punk", "japanese-breakfast"]),
      tracks: pickTracks(["good-days", "get-lucky", "the-less-i-know-the-better", "sweet-life", "midnight-city"]),
    },
  ];
}

export function createEmptyListener(index: number): ListenerProfile {
  const colors = ["#0f766e", "#c2410c", "#7c3aed", "#2563eb"];
  return {
    id: `listener-${Date.now()}-${index}`,
    name: `Listener ${index + 1}`,
    color: colors[index % colors.length],
    artists: [],
    tracks: [],
  };
}

export function normalizeMusicKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function itemKey(item: MusicItem) {
  const artistPart =
    item.kind === "track" ? `:${normalizeMusicKey(item.artistNames?.join(" ") ?? item.subtitle ?? "")}` : "";
  return `${item.kind}:${normalizeMusicKey(item.name)}${artistPart}`;
}

export function isSameItem(a: MusicItem, b: MusicItem) {
  return itemKey(a) === itemKey(b);
}

export function createManualItem(kind: MusicKind, rawName: string): MusicItem {
  const [name, subtitle] =
    kind === "track" && rawName.includes("-")
      ? rawName.split("-").map((part) => part.trim()).slice(0, 2)
      : [rawName.trim(), undefined];

  const cleanedName = name || rawName.trim();

  return {
    id: `manual:${kind}:${normalizeMusicKey(`${cleanedName}-${subtitle ?? ""}`)}`,
    kind,
    name: cleanedName,
    subtitle,
    artistNames: subtitle ? [subtitle] : [],
    genres: [],
    source: "manual",
  };
}

export function filterCatalog(kind: MusicKind, query: string, limit = 8) {
  const normalized = normalizeMusicKey(query);
  if (!normalized) {
    return (kind === "artist" ? SAMPLE_ARTISTS : SAMPLE_TRACKS).slice(0, limit);
  }

  const terms = normalized.split(" ");

  return (kind === "artist" ? SAMPLE_ARTISTS : SAMPLE_TRACKS)
    .map((item) => {
      const haystack = normalizeMusicKey(
        [item.name, item.subtitle, item.artistNames?.join(" "), item.genres.join(" ")].filter(Boolean).join(" ")
      );
      const starts = haystack.startsWith(normalized) ? 4 : 0;
      const includes = haystack.includes(normalized) ? 3 : 0;
      const termScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
      return { item, score: starts + includes + termScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function getAllItems(listener: ListenerProfile, mode: "all" | "artists" | "tracks") {
  if (mode === "artists") {
    return listener.artists;
  }

  if (mode === "tracks") {
    return listener.tracks;
  }

  return [...listener.artists, ...listener.tracks];
}

export function uniqueGenres(items: MusicItem[]) {
  return Array.from(new Set(items.flatMap((item) => item.genres.map((genre) => genre.toLowerCase())))).sort();
}

function artist(id: string, name: string, genres: string[]): MusicItem {
  return {
    id: `sample:artist:${id}`,
    kind: "artist",
    name,
    genres,
    source: "sample",
  };
}

function track(id: string, name: string, artistName: string, genres: string[]): MusicItem {
  return {
    id: `sample:track:${id}`,
    kind: "track",
    name,
    subtitle: artistName,
    artistNames: [artistName],
    genres,
    source: "sample",
  };
}

function pickArtists(ids: string[]) {
  return ids
    .map((id) => SAMPLE_ARTISTS.find((artistItem) => artistItem.id === `sample:artist:${id}`))
    .filter((item): item is MusicItem => Boolean(item));
}

function pickTracks(ids: string[]) {
  return ids
    .map((id) => SAMPLE_TRACKS.find((trackItem) => trackItem.id === `sample:track:${id}`))
    .filter((item): item is MusicItem => Boolean(item));
}
