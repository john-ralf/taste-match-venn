"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import {
  MAX_ITEMS_PER_KIND,
  SAMPLE_TRACKS,
  createDemoListeners,
  createEmptyListener,
  createManualItem,
  filterCatalog,
  getAllItems,
  isSameItem,
  itemKey,
  normalizeMusicKey,
  uniqueGenres,
  type ListenerProfile,
  type MusicItem,
  type MusicKind,
} from "@/lib/music";

type Mode = "all" | "artists" | "tracks";

type PairOverlap = {
  a: number;
  b: number;
  shared: MusicItem[];
  score: number;
};

type MatchStats = {
  score: number;
  commonItems: MusicItem[];
  commonGenres: string[];
  unionCount: number;
  onlyByListener: MusicItem[][];
  pairOverlaps: PairOverlap[];
};

type Recommendation = {
  item: MusicItem;
  score: number;
  reasons: string[];
};

const modeOptions: { value: Mode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "artists", label: "Bands" },
  { value: "tracks", label: "Songs" },
];

export default function Home() {
  const [listeners, setListeners] = useState<ListenerProfile[]>(() => createDemoListeners());
  const [mode, setMode] = useState<Mode>("all");

  const stats = useMemo(() => computeStats(listeners, mode), [listeners, mode]);
  const recommendations = useMemo(() => buildRecommendations(listeners), [listeners]);
  const totalItems = listeners.reduce((sum, listener) => sum + listener.artists.length + listener.tracks.length, 0);

  function updateListener(id: string, updater: (listener: ListenerProfile) => ListenerProfile) {
    setListeners((current) => current.map((listener) => (listener.id === id ? updater(listener) : listener)));
  }

  function addItem(listenerId: string, kind: MusicKind, item: MusicItem) {
    updateListener(listenerId, (listener) => {
      const field = kind === "artist" ? "artists" : "tracks";
      const current = listener[field];

      if (current.length >= MAX_ITEMS_PER_KIND || current.some((existing) => isSameItem(existing, item))) {
        return listener;
      }

      return { ...listener, [field]: [...current, item] };
    });
  }

  function removeItem(listenerId: string, kind: MusicKind, item: MusicItem) {
    updateListener(listenerId, (listener) => {
      const field = kind === "artist" ? "artists" : "tracks";
      return {
        ...listener,
        [field]: listener[field].filter((existing) => !isSameItem(existing, item)),
      };
    });
  }

  function addListener() {
    setListeners((current) => (current.length >= 4 ? current : [...current, createEmptyListener(current.length)]));
  }

  function removeListener(id: string) {
    setListeners((current) => (current.length <= 2 ? current : current.filter((listener) => listener.id !== id)));
  }

  function clearAll() {
    setListeners((current) => current.map((listener) => ({ ...listener, artists: [], tracks: [] })));
  }

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="top-bar">
          <div className="brand-lockup">
            <div className="record-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <p className="eyebrow">Music Venn</p>
              <h1>Taste Match</h1>
            </div>
          </div>

          <div className="top-actions">
            <Metric label="Match" value={`${stats.score}%`} />
            <Metric label="Picks" value={String(totalItems)} />
            <button className="ghost-button" type="button" onClick={() => setListeners(createDemoListeners())}>
              Demo
            </button>
            <button className="ghost-button" type="button" onClick={clearAll}>
              Clear
            </button>
          </div>
        </header>

        <div className="workbench">
          <section className="listener-column" aria-label="Listener inputs">
            <div className="listener-grid">
              {listeners.map((listener, index) => (
                <ListenerPanel
                  key={listener.id}
                  listener={listener}
                  index={index}
                  canRemove={listeners.length > 2}
                  onNameChange={(name) => updateListener(listener.id, (current) => ({ ...current, name }))}
                  onAddItem={(kind, item) => addItem(listener.id, kind, item)}
                  onRemoveItem={(kind, item) => removeItem(listener.id, kind, item)}
                  onRemove={() => removeListener(listener.id)}
                />
              ))}
            </div>

            <div className="listener-actions">
              <button className="primary-button" type="button" onClick={addListener} disabled={listeners.length >= 4}>
                Add listener
              </button>
              <span>{listeners.length}/4 listeners</span>
            </div>
          </section>

          <section className="diagram-column" aria-label="Similarity chart">
            <div className="diagram-toolbar">
              <div>
                <p className="section-kicker">Similarity</p>
                <h2>Live Venn</h2>
              </div>
              <div className="segmented" aria-label="Chart mode">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={mode === option.value ? "active" : ""}
                    type="button"
                    onClick={() => setMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <VennDiagram listeners={listeners} stats={stats} />

            <div className="stat-row">
              <Metric label="Exact overlap" value={String(stats.commonItems.length)} />
              <Metric label="Shared genres" value={String(stats.commonGenres.length)} />
              <Metric label="Compared" value={String(stats.unionCount)} />
            </div>

            <OverlapDetails listeners={listeners} stats={stats} />
          </section>

          <section className="recommendation-column" aria-label="Recommendations">
            <div className="recommendation-header">
              <div>
                <p className="section-kicker">For the room</p>
                <h2>Bridge Picks</h2>
              </div>
              <span>{recommendations.length}</span>
            </div>

            <div className="recommendation-list">
              {recommendations.map((recommendation) => (
                <RecommendationCard key={recommendation.item.id} recommendation={recommendation} />
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ListenerPanel({
  listener,
  index,
  canRemove,
  onNameChange,
  onAddItem,
  onRemoveItem,
  onRemove,
}: {
  listener: ListenerProfile;
  index: number;
  canRemove: boolean;
  onNameChange: (name: string) => void;
  onAddItem: (kind: MusicKind, item: MusicItem) => void;
  onRemoveItem: (kind: MusicKind, item: MusicItem) => void;
  onRemove: () => void;
}) {
  return (
    <article className="listener-panel" style={{ "--listener-color": listener.color } as CSSProperties}>
      <div className="listener-heading">
        <div className="listener-title">
          <span className="listener-swatch" aria-hidden="true" />
          <label htmlFor={`listener-name-${listener.id}`}>Listener {index + 1}</label>
        </div>
        {canRemove ? (
          <button className="icon-button" type="button" onClick={onRemove} aria-label={`Remove ${listener.name}`}>
            x
          </button>
        ) : null}
      </div>

      <input
        id={`listener-name-${listener.id}`}
        className="name-input"
        value={listener.name}
        onChange={(event) => onNameChange(event.target.value)}
        aria-label={`Listener ${index + 1} name`}
      />

      <SearchPicker
        kind="artist"
        label="Favorite bands"
        owner={listener.name}
        selected={listener.artists}
        onAdd={(item) => onAddItem("artist", item)}
        onRemove={(item) => onRemoveItem("artist", item)}
      />

      <SearchPicker
        kind="track"
        label="Favorite songs"
        owner={listener.name}
        selected={listener.tracks}
        onAdd={(item) => onAddItem("track", item)}
        onRemove={(item) => onRemoveItem("track", item)}
      />
    </article>
  );
}

function SearchPicker({
  kind,
  label,
  owner,
  selected,
  onAdd,
  onRemove,
}: {
  kind: MusicKind;
  label: string;
  owner: string;
  selected: MusicItem[];
  onAdd: (item: MusicItem) => void;
  onRemove: (item: MusicItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteSearch, setRemoteSearch] = useState<{
    query: string;
    provider: "spotify" | "sample";
    items: MusicItem[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const full = selected.length >= MAX_ITEMS_PER_KIND;
  const trimmedQuery = query.trim();
  const localResults = useMemo(() => filterCatalog(kind, trimmedQuery), [kind, trimmedQuery]);
  const shouldSearch = trimmedQuery.length >= 2 && !full;
  const activeRemoteSearch = shouldSearch && remoteSearch?.query === trimmedQuery ? remoteSearch : null;
  const results = activeRemoteSearch ? mergeResults(activeRemoteSearch.items, localResults) : localResults;
  const source: "spotify" | "sample" | "loading" = shouldSearch ? (activeRemoteSearch?.provider ?? "loading") : "sample";

  useEffect(() => {
    if (!shouldSearch) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/spotify/search?type=${kind}&q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const payload = (await response.json()) as {
          provider?: "spotify" | "sample";
          items?: MusicItem[];
        };
        setRemoteSearch({
          query: trimmedQuery,
          provider: payload.provider === "spotify" ? "spotify" : "sample",
          items: payload.items ?? [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setRemoteSearch({ query: trimmedQuery, provider: "sample", items: [] });
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [kind, shouldSearch, trimmedQuery]);

  function choose(item: MusicItem) {
    if (full) {
      return;
    }

    onAdd(item);
    setQuery("");
    setOpen(false);
  }

  function addTypedValue() {
    const trimmed = query.trim();
    if (!trimmed || full) {
      return;
    }

    choose(results[0] ?? createManualItem(kind, trimmed));
  }

  return (
    <div className="picker">
      <div className="picker-label-row">
        <label htmlFor={inputId}>{label}</label>
        <span>{selected.length}/5</span>
      </div>

      <div className="search-control">
        <input
          id={inputId}
          value={query}
          disabled={full}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTypedValue();
            }
          }}
          placeholder={full ? "Full" : kind === "artist" ? "Search a band" : "Search a song"}
          aria-label={`${owner} ${label}`}
        />
        <button type="button" onClick={addTypedValue} disabled={full || !query.trim()}>
          Add
        </button>
      </div>

      {open && !full && query.trim() ? (
        <div className="result-menu" role="listbox">
          <div className="result-source">{source === "loading" ? "Searching" : source === "spotify" ? "Spotify" : "Sample"}</div>
          {results.slice(0, 6).map((item) => (
            <button key={item.id} className="result-option" type="button" onClick={() => choose(item)}>
              <ItemArtwork item={item} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.subtitle || item.genres.slice(0, 2).join(", ") || item.source}</small>
              </span>
            </button>
          ))}
          <button className="result-option manual-option" type="button" onClick={() => choose(createManualItem(kind, query))}>
            <span className="manual-mark">+</span>
            <span>
              <strong>{query.trim()}</strong>
              <small>Manual pick</small>
            </span>
          </button>
        </div>
      ) : null}

      <div className="pill-list">
        {selected.map((item) => (
          <MusicPill key={itemKey(item)} item={item} onRemove={() => onRemove(item)} />
        ))}
      </div>
    </div>
  );
}

function VennDiagram({ listeners, stats }: { listeners: ListenerProfile[]; stats: MatchStats }) {
  const layout = getCircleLayout(listeners.length, stats.score);

  return (
    <div className="venn-wrap">
      <svg className="venn-svg" viewBox="0 0 220 180" role="img" aria-label={`Music taste similarity ${stats.score}%`}>
        <rect width="220" height="180" rx="8" fill="#faf7f0" />
        {layout.map((circle, index) => (
          <g key={listeners[index].id}>
            <circle
              cx={circle.cx}
              cy={circle.cy}
              r={circle.r}
              fill={listeners[index].color}
              fillOpacity="0.32"
              stroke={listeners[index].color}
              strokeWidth="2.5"
            />
            <text x={circle.labelX} y={circle.labelY} textAnchor="middle" className="venn-label">
              {listeners[index].name || `Listener ${index + 1}`}
            </text>
          </g>
        ))}
        <g>
          <circle cx="110" cy="90" r="28" fill="#ffffff" stroke="#292524" strokeWidth="1.5" />
          <text x="110" y="84" textAnchor="middle" className="venn-score">
            {stats.score}%
          </text>
          <text x="110" y="101" textAnchor="middle" className="venn-caption">
            match
          </text>
        </g>
      </svg>
    </div>
  );
}

function OverlapDetails({ listeners, stats }: { listeners: ListenerProfile[]; stats: MatchStats }) {
  return (
    <div className="overlap-grid">
      <DetailGroup title="Everyone" items={stats.commonItems} empty="No exact match" />

      {listeners.length === 2 ? (
        <>
          <DetailGroup title={`Only ${listeners[0].name}`} items={stats.onlyByListener[0]} empty="Even field" />
          <DetailGroup title={`Only ${listeners[1].name}`} items={stats.onlyByListener[1]} empty="Even field" />
        </>
      ) : (
        <div className="detail-group pair-grid">
          <h3>Pairs</h3>
          {stats.pairOverlaps.map((pair) => (
            <div key={`${pair.a}-${pair.b}`} className="pair-line">
              <span>
                {listeners[pair.a].name} + {listeners[pair.b].name}
              </span>
              <strong>{pair.shared.length}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="detail-group">
        <h3>Genre overlap</h3>
        <div className="mini-chip-row">
          {stats.commonGenres.length ? (
            stats.commonGenres.slice(0, 8).map((genre) => <span key={genre}>{genre}</span>)
          ) : (
            <em>No shared genre tags</em>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailGroup({ title, items, empty }: { title: string; items: MusicItem[]; empty: string }) {
  return (
    <div className="detail-group">
      <h3>{title}</h3>
      <div className="mini-chip-row">
        {items.length ? (
          items.slice(0, 8).map((item) => <span key={itemKey(item)}>{formatItem(item)}</span>)
        ) : (
          <em>{empty}</em>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const item = recommendation.item;

  return (
    <article className="recommendation-card">
      <ItemArtwork item={item} />
      <div>
        <div className="recommendation-title">
          <h3>{item.name}</h3>
          <span>{recommendation.score}</span>
        </div>
        <p>{item.subtitle}</p>
        <div className="mini-chip-row">
          {recommendation.reasons.slice(0, 3).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
        {item.externalUrl ? (
          <a href={item.externalUrl} target="_blank" rel="noreferrer">
            Spotify
          </a>
        ) : null}
      </div>
    </article>
  );
}

function MusicPill({ item, onRemove }: { item: MusicItem; onRemove: () => void }) {
  return (
    <span className="music-pill">
      <ItemArtwork item={item} />
      <span className="pill-copy">
        <strong>{item.name}</strong>
        <small>{item.subtitle || item.genres[0] || item.source}</small>
      </span>
      {item.externalUrl ? (
        <a href={item.externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.name} on Spotify`}>
          Spotify
        </a>
      ) : null}
      <button type="button" onClick={onRemove} aria-label={`Remove ${formatItem(item)}`}>
        x
      </button>
    </span>
  );
}

function ItemArtwork({ item }: { item: MusicItem }) {
  const initials = item.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span className="artwork" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Spotify thumbnails use varied CDN URLs. */}
      {item.image ? <img src={item.image} alt="" /> : initials || "M"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function computeStats(listeners: ListenerProfile[], mode: Mode): MatchStats {
  const itemSets = listeners.map((listener) => new Map(getAllItems(listener, mode).map((item) => [itemKey(item), item])));
  const unionKeys = new Set(itemSets.flatMap((set) => Array.from(set.keys())));
  const commonKeys = itemSets.length
    ? Array.from(itemSets[0].keys()).filter((key) => itemSets.every((set) => set.has(key)))
    : [];
  const commonItems = commonKeys.map((key) => itemSets[0].get(key)).filter((item): item is MusicItem => Boolean(item));
  const onlyByListener = itemSets.map((set, index) =>
    Array.from(set.entries())
      .filter(([key]) => itemSets.every((otherSet, otherIndex) => otherIndex === index || !otherSet.has(key)))
      .map(([, item]) => item)
  );

  const genreSets = listeners.map((listener) => new Set(uniqueGenres(getAllItems(listener, mode))));
  const genreUnion = new Set(genreSets.flatMap((set) => Array.from(set)));
  const commonGenres = genreSets.length
    ? Array.from(genreSets[0]).filter((genre) => genreSets.every((set) => set.has(genre)))
    : [];

  const exactRatio = unionKeys.size ? commonItems.length / unionKeys.size : 0;
  const genreRatio = genreUnion.size ? commonGenres.length / genreUnion.size : 0;
  const score = Math.round(Math.min(100, exactRatio * 55 + genreRatio * 45));

  const pairOverlaps: PairOverlap[] = [];
  for (let a = 0; a < itemSets.length; a += 1) {
    for (let b = a + 1; b < itemSets.length; b += 1) {
      const aSet = itemSets[a];
      const bSet = itemSets[b];
      const pairUnion = new Set([...aSet.keys(), ...bSet.keys()]);
      const shared = Array.from(aSet.entries())
        .filter(([key]) => bSet.has(key))
        .map(([, item]) => item);
      pairOverlaps.push({
        a,
        b,
        shared,
        score: Math.round((shared.length / Math.max(1, pairUnion.size)) * 100),
      });
    }
  }

  return {
    score,
    commonItems,
    commonGenres,
    unionCount: unionKeys.size,
    onlyByListener,
    pairOverlaps,
  };
}

function buildRecommendations(listeners: ListenerProfile[]): Recommendation[] {
  const selectedItems = listeners.flatMap((listener) => [...listener.artists, ...listener.tracks]);
  if (!selectedItems.length) {
    return [];
  }

  const selectedKeys = new Set(selectedItems.map(itemKey));
  const selectedArtistNames = new Set(
    selectedItems.flatMap((item) =>
      item.kind === "artist" ? [normalizeMusicKey(item.name)] : (item.artistNames ?? []).map(normalizeMusicKey)
    )
  );
  const listenerGenreSets = listeners.map((listener) => new Set(uniqueGenres([...listener.artists, ...listener.tracks])));
  const genreCounts = new Map<string, number>();

  for (const genreSet of listenerGenreSets) {
    for (const genre of genreSet) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  const sharedGenreSet = new Set(
    Array.from(genreCounts.entries())
      .filter(([, count]) => count >= Math.min(2, listeners.length))
      .map(([genre]) => genre)
  );
  const unionGenreSet = new Set(Array.from(genreCounts.keys()));

  return SAMPLE_TRACKS.filter((trackItem) => !selectedKeys.has(itemKey(trackItem)))
    .map((trackItem) => {
      const normalizedArtists = (trackItem.artistNames ?? []).map(normalizeMusicKey);
      const directArtistHit = normalizedArtists.some((artistName) => selectedArtistNames.has(artistName));
      const sharedGenres = trackItem.genres.filter((genre) => sharedGenreSet.has(genre));
      const relatedGenres = trackItem.genres.filter((genre) => unionGenreSet.has(genre));
      const score = sharedGenres.length * 14 + relatedGenres.length * 5 + (directArtistHit ? 18 : 0);
      const reasons = [
        ...sharedGenres.slice(0, 2).map((genre) => genre),
        ...(directArtistHit ? ["artist bridge"] : []),
        ...relatedGenres.filter((genre) => !sharedGenres.includes(genre)).slice(0, 1),
      ];

      return {
        item: trackItem,
        score,
        reasons: reasons.length ? reasons : ["wild card"],
      };
    })
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 6);
}

function getCircleLayout(count: number, score: number) {
  if (count <= 2) {
    const separation = 54 - score * 0.22;
    return [
      { cx: 110 - separation / 2, cy: 88, r: 56, labelX: 72, labelY: 154 },
      { cx: 110 + separation / 2, cy: 88, r: 56, labelX: 148, labelY: 154 },
    ];
  }

  if (count === 3) {
    return [
      { cx: 82, cy: 76, r: 51, labelX: 54, labelY: 154 },
      { cx: 138, cy: 76, r: 51, labelX: 166, labelY: 154 },
      { cx: 110, cy: 116, r: 51, labelX: 110, labelY: 168 },
    ];
  }

  return [
    { cx: 78, cy: 72, r: 47, labelX: 43, labelY: 154 },
    { cx: 142, cy: 72, r: 47, labelX: 177, labelY: 154 },
    { cx: 82, cy: 118, r: 47, labelX: 68, labelY: 168 },
    { cx: 138, cy: 118, r: 47, labelX: 152, labelY: 168 },
  ];
}

function mergeResults(primary: MusicItem[], fallback: MusicItem[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatItem(item: MusicItem) {
  return item.subtitle ? `${item.name} - ${item.subtitle}` : item.name;
}
