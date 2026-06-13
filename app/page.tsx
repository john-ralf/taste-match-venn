"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  MAX_TRACKS_PER_LISTENER,
  createEmptyListener,
  getAllItems,
  isSameItem,
  itemKey,
  normalizeMusicKey,
  uniqueGenres,
  type ListenerProfile,
  type MusicItem,
  type MusicKind,
} from "@/lib/music";
import type { RoomPayload } from "@/lib/rooms";

type PairOverlap = {
  a: number;
  b: number;
  shared: MusicItem[];
  score: number;
};

type MatchStats = {
  score: number;
  exactScore: number;
  genreScore: number;
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

type VennCircleLayout = {
  cx: number;
  cy: number;
  r: number;
  labelX: number;
  labelY: number;
};

type VennMarker = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  color: string;
  shared: boolean;
};

type RoomStatus = "idle" | "loading" | "saving" | "saved" | "error";

export default function Home() {
  const [listeners, setListeners] = useState<ListenerProfile[]>(() => createInitialListeners());
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [roomMessage, setRoomMessage] = useState("Solo screen");
  const [copied, setCopied] = useState(false);
  const [localListenerId, setLocalListenerId] = useState<string | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastRemoteUpdatedAtRef = useRef<string | null>(null);
  const hasLoadedRoomRef = useRef(false);

  const stats = useMemo(() => computeStats(listeners), [listeners]);
  const activeListener = roomId && localListenerId ? listeners.find((listener) => listener.id === localListenerId) : null;
  const activeListenerComplete = activeListener ? isListenerComplete(activeListener) : false;
  const roomPrivacyLocked = Boolean(roomId && (!activeListener || !activeListenerComplete));
  const visibleListenerEntries = useMemo(() => {
    const visibleListeners = roomPrivacyLocked && activeListener ? [activeListener] : roomPrivacyLocked ? [] : listeners;
    return visibleListeners.map((listener) => ({
      listener,
      index: Math.max(0, listeners.findIndex((candidate) => candidate.id === listener.id)),
    }));
  }, [activeListener, listeners, roomPrivacyLocked]);
  const recommendations = useMemo(() => (roomPrivacyLocked ? [] : buildRecommendations(listeners)), [listeners, roomPrivacyLocked]);
  const totalItems = visibleListenerEntries.reduce(
    (sum, entry) => sum + entry.listener.tracks.length,
    0
  );
  const roomLink = roomId && typeof window !== "undefined" ? `${window.location.origin}/?room=${roomId}` : "";

  function updateListener(id: string, updater: (listener: ListenerProfile) => ListenerProfile) {
    setListeners((current) => current.map((listener) => (listener.id === id ? updater(listener) : listener)));
  }

  function addItem(listenerId: string, kind: MusicKind, item: MusicItem) {
    updateListener(listenerId, (listener) => {
      if (kind !== "track") {
        return listener;
      }

      const current = listener.tracks;
      if (
        item.source !== "spotify" ||
        current.length >= MAX_TRACKS_PER_LISTENER ||
        current.some((existing) => isSameItem(existing, item))
      ) {
        return listener;
      }

      return { ...listener, artists: [], tracks: [...current, item] };
    });
  }

  function removeItem(listenerId: string, kind: MusicKind, item: MusicItem) {
    updateListener(listenerId, (listener) => {
      if (kind !== "track") {
        return listener;
      }

      return {
        ...listener,
        tracks: listener.tracks.filter((existing) => !isSameItem(existing, item)),
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
    if (roomId && !localListenerId) {
      return;
    }

    setListeners((current) =>
      current.map((listener) =>
        roomId && localListenerId && listener.id !== localListenerId ? listener : { ...listener, artists: [], tracks: [] }
      )
    );
  }

  async function createRoom() {
    setRoomStatus("loading");
    setRoomMessage("Creating room");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listeners }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const room = (await response.json()) as RoomPayload;
      lastRemoteUpdatedAtRef.current = room.updatedAt;
      hasLoadedRoomRef.current = true;
      setRoomId(room.id);
      setLocalListenerId(listeners[0]?.id ?? null);
      saveStoredRoomListenerId(room.id, listeners[0]?.id ?? null);
      setRoomStatus("saved");
      setRoomMessage(`Room ${room.id} ready`);
      window.history.replaceState(null, "", `?room=${room.id}`);
    } catch (error) {
      setRoomStatus("error");
      setRoomMessage(error instanceof Error ? error.message : "Room creation failed");
    }
  }

  async function loadRoom(id: string) {
    setRoomStatus("loading");
    setRoomMessage(`Joining room ${id}`);

    try {
      const room = await fetchRoom(id);
      applyingRemoteRef.current = true;
      setListeners(room.listeners.length >= 2 ? room.listeners : createInitialListeners());
      setLocalListenerId(readStoredRoomListenerId(room.id, room.listeners));
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
      lastRemoteUpdatedAtRef.current = room.updatedAt;
      hasLoadedRoomRef.current = true;
      setRoomId(room.id);
      setRoomStatus("saved");
      setRoomMessage(`Room ${room.id} joined`);
    } catch (error) {
      applyingRemoteRef.current = false;
      setRoomStatus("error");
      setRoomMessage(error instanceof Error ? error.message : "Room not found");
    }
  }

  async function refreshRoom(id: string) {
    try {
      const room = await fetchRoom(id);
      if (room.updatedAt === lastRemoteUpdatedAtRef.current) {
        return;
      }

      applyingRemoteRef.current = true;
      setListeners(room.listeners);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
      lastRemoteUpdatedAtRef.current = room.updatedAt;
      setRoomStatus("saved");
      setRoomMessage(`Room ${room.id} updated`);
    } catch {
      setRoomStatus("error");
      setRoomMessage("Room refresh failed");
    }
  }

  async function copyInviteLink() {
    if (!roomLink) {
      return;
    }

    await navigator.clipboard.writeText(roomLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("room")?.toUpperCase();
    if (id) {
      window.setTimeout(() => {
        void loadRoom(id);
      }, 0);
    }
  }, []);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshRoom(roomId);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !localListenerId) {
      return;
    }

    saveStoredRoomListenerId(roomId, localListenerId);
  }, [localListenerId, roomId]);

  useEffect(() => {
    if (!roomId || applyingRemoteRef.current || !hasLoadedRoomRef.current) {
      return;
    }

    setRoomStatus("saving");
    setRoomMessage(`Saving room ${roomId}`);

    const timer = window.setTimeout(async () => {
      try {
        const room = await saveRoom(roomId, listeners);
        lastRemoteUpdatedAtRef.current = room.updatedAt;
        setRoomStatus("saved");
        setRoomMessage(`Room ${room.id} saved`);
      } catch (error) {
        setRoomStatus("error");
        setRoomMessage(error instanceof Error ? error.message : "Room save failed");
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [listeners, roomId]);

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
            <Metric label="Match" value={roomPrivacyLocked ? "Locked" : `${stats.score}%`} />
            <Metric label="Picks" value={String(totalItems)} />
            <div className={`room-chip ${roomStatus}`}>
              <span>{roomId ? `Room ${roomId}` : "No room"}</span>
              <strong>{roomMessage}</strong>
            </div>
            {roomId ? (
              <button className="ghost-button" type="button" onClick={copyInviteLink}>
                {copied ? "Copied" : "Copy invite"}
              </button>
            ) : (
              <button className="primary-button" type="button" onClick={createRoom} disabled={roomStatus === "loading"}>
                Create room
              </button>
            )}
            <button className="ghost-button" type="button" onClick={clearAll} disabled={Boolean(roomId && !localListenerId)}>
              Clear
            </button>
          </div>
        </header>

        <div className="workbench">
          <section className="listener-column" aria-label="Listener inputs">
            {roomId ? (
              <RoomIdentityPicker
                listeners={listeners}
                activeListenerId={localListenerId}
                activeListenerComplete={activeListenerComplete}
                onSelect={setLocalListenerId}
              />
            ) : null}

            <div className="listener-grid">
              {visibleListenerEntries.map(({ listener, index }) => (
                <ListenerPanel
                  key={listener.id}
                  listener={listener}
                  index={index}
                  canRemove={!roomPrivacyLocked && listeners.length > 2}
                  onNameChange={(name) => updateListener(listener.id, (current) => ({ ...current, name }))}
                  onAddItem={(kind, item) => addItem(listener.id, kind, item)}
                  onRemoveItem={(kind, item) => removeItem(listener.id, kind, item)}
                  onRemove={() => removeListener(listener.id)}
                />
              ))}
            </div>

            <div className="listener-actions">
              <button
                className="primary-button"
                type="button"
                onClick={addListener}
                disabled={listeners.length >= 4}
              >
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
            </div>

            {roomPrivacyLocked ? (
              <PrivacyGate activeListener={activeListener} />
            ) : (
              <>
                <VennDiagram listeners={listeners} stats={stats} />

                <div className="stat-row">
                  <Metric label="Exact score" value={`${stats.exactScore}%`} />
                  <Metric label="Genre score" value={`${stats.genreScore}%`} />
                  <Metric label="Compared" value={String(stats.unionCount)} />
                </div>

                <OverlapDetails listeners={listeners} stats={stats} />
              </>
            )}
          </section>

          {!roomPrivacyLocked ? (
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
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function fetchRoom(id: string) {
  const response = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as RoomPayload;
}

async function saveRoom(id: string, listeners: ListenerProfile[]) {
  const response = await fetch(`/api/rooms/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listeners }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as RoomPayload;
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Room request failed";
  } catch {
    return "Room request failed";
  }
}

function RoomIdentityPicker({
  listeners,
  activeListenerId,
  activeListenerComplete,
  onSelect,
}: {
  listeners: ListenerProfile[];
  activeListenerId: string | null;
  activeListenerComplete: boolean;
  onSelect: (listenerId: string) => void;
}) {
  return (
    <div className="room-identity">
      <div>
        <p className="section-kicker">You are</p>
        <div className="identity-options" aria-label="Choose your room slot">
          {listeners.map((listener) => (
            <button
              key={listener.id}
              className={listener.id === activeListenerId ? "active" : ""}
              type="button"
              onClick={() => onSelect(listener.id)}
              style={{ "--listener-color": listener.color } as CSSProperties}
            >
              <span aria-hidden="true" />
              {listener.name}
            </button>
          ))}
        </div>
      </div>
      <strong>{activeListenerComplete ? "Ready" : "Hidden"}</strong>
    </div>
  );
}

function PrivacyGate({ activeListener }: { activeListener: ListenerProfile | null }) {
  const progress = activeListener ? getListenerProgress(activeListener) : null;

  return (
    <div className="privacy-gate">
      <div className="privacy-disc" aria-hidden="true">
        <span />
      </div>
      <h3>Room hidden</h3>
      <p>{progress ? `${progress.tracks}/10 songs` : "Choose your room slot"}</p>
    </div>
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
        kind="track"
        label="10 favorite songs"
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
    error?: string;
    items: MusicItem[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const full = selected.length >= MAX_TRACKS_PER_LISTENER;
  const trimmedQuery = query.trim();
  const shouldSearch = trimmedQuery.length >= 2 && !full;
  const activeRemoteSearch = shouldSearch && remoteSearch?.query === trimmedQuery ? remoteSearch : null;
  const results = activeRemoteSearch?.items ?? [];
  const sourceLabel = !shouldSearch
    ? "Spotify required"
    : activeRemoteSearch?.error
      ? activeRemoteSearch.error
      : activeRemoteSearch
        ? "Spotify"
        : "Searching";

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

        const payload = (await response.json()) as {
          error?: string;
          items?: MusicItem[];
        };
        setRemoteSearch({
          query: trimmedQuery,
          error: response.ok ? payload.error : (payload.error ?? "Spotify unavailable"),
          items: (payload.items ?? []).filter((item) => item.source === "spotify"),
        });
      } catch {
        if (!controller.signal.aborted) {
          setRemoteSearch({ query: trimmedQuery, error: "Spotify unavailable", items: [] });
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
    if (full || !results[0]) {
      return;
    }

    choose(results[0]);
  }

  return (
    <div className="picker">
      <div className="picker-label-row">
        <label htmlFor={inputId}>{label}</label>
        <span>{selected.length}/10</span>
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
          placeholder={full ? "Full" : "Search Spotify songs"}
          aria-label={`${owner} ${label}`}
        />
        <button type="button" onClick={addTypedValue} disabled={full || !results[0]}>
          Add
        </button>
      </div>

      {open && !full && query.trim() ? (
        <div className="result-menu" role="listbox">
          <div className="result-source">{sourceLabel}</div>
          {results.slice(0, 6).map((item) => (
            <button key={item.id} className="result-option" type="button" onClick={() => choose(item)}>
              <ItemArtwork item={item} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.subtitle || item.genres.slice(0, 2).join(", ") || item.source}</small>
              </span>
            </button>
          ))}
          {activeRemoteSearch && !results.length ? <div className="result-empty">No Spotify choices found</div> : null}
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
  const markers = getVennMarkers(listeners, layout);

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
          {markers.map((marker) => (
            <g key={marker.key} transform={`translate(${marker.x} ${marker.y})`}>
              <rect
                x={-marker.width / 2}
                y="-7"
                width={marker.width}
                height="14"
                rx="5"
                fill="rgba(255, 255, 255, 0.9)"
                stroke={marker.color}
                strokeWidth="1.2"
                strokeDasharray={marker.shared ? "0" : "2 2"}
              />
              <text
                fill="#292524"
                fontSize="5.5"
                fontWeight="900"
                letterSpacing="0"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {marker.label}
              </text>
            </g>
          ))}
        </g>
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

function createInitialListeners() {
  return [createEmptyListener(0), createEmptyListener(1)];
}

function isListenerComplete(listener: ListenerProfile) {
  return listener.tracks.length >= MAX_TRACKS_PER_LISTENER;
}

function getListenerProgress(listener: ListenerProfile) {
  return {
    tracks: Math.min(listener.tracks.length, MAX_TRACKS_PER_LISTENER),
  };
}

function readStoredRoomListenerId(roomId: string, listeners: ListenerProfile[]) {
  if (typeof window === "undefined") {
    return null;
  }

  const storedId = window.localStorage.getItem(roomListenerStorageKey(roomId));
  return storedId && listeners.some((listener) => listener.id === storedId) ? storedId : null;
}

function saveStoredRoomListenerId(roomId: string, listenerId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  const key = roomListenerStorageKey(roomId);
  if (listenerId) {
    window.localStorage.setItem(key, listenerId);
  } else {
    window.localStorage.removeItem(key);
  }
}

function roomListenerStorageKey(roomId: string) {
  return `taste-match:${roomId}:listener`;
}

function computeStats(listeners: ListenerProfile[]): MatchStats {
  const itemSets = listeners.map((listener) => new Map(getAllItems(listener, "tracks").map((item) => [itemKey(item), item])));
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

  const genreSets = listeners.map((listener) => new Set(uniqueGenres(getAllItems(listener, "tracks"))));
  const commonGenres = genreSets.length
    ? Array.from(genreSets[0]).filter((genre) => genreSets.every((set) => set.has(genre)))
    : [];

  const exactRatio = unionKeys.size ? commonItems.length / unionKeys.size : 0;
  const exactScore = Math.round(exactRatio * 100);
  const genreScore = Math.round(getPairwiseGenreScore(genreSets));
  const score = Math.round(Math.min(100, exactScore * 0.35 + genreScore * 0.65));

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
    exactScore,
    genreScore,
    commonItems,
    commonGenres,
    unionCount: unionKeys.size,
    onlyByListener,
    pairOverlaps,
  };
}

function getPairwiseGenreScore(genreSets: Set<string>[]) {
  if (genreSets.length < 2) {
    return 0;
  }

  const scores: number[] = [];
  for (let a = 0; a < genreSets.length; a += 1) {
    for (let b = a + 1; b < genreSets.length; b += 1) {
      scores.push(jaccard(genreSets[a], genreSets[b]) * 100);
    }
  }

  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

function getVennMarkers(listeners: ListenerProfile[], layout: VennCircleLayout[]): VennMarker[] {
  const center = { x: 110, y: 90 };
  const markerMap = new Map<
    string,
    {
      label: string;
      ownerIndexes: Set<number>;
      genres: Set<string>;
      artistPick: boolean;
    }
  >();
  const listenerGenreSets = listeners.map((listener) => new Set(uniqueGenres(listener.tracks)));

  listeners.forEach((listener, listenerIndex) => {
    const markerItems = [
      ...listener.tracks.flatMap((item) =>
        (item.artistNames?.length ? item.artistNames : item.subtitle ? [item.subtitle] : []).map((label) => ({
          label,
          item,
          artistPick: false,
        }))
      ),
    ];

    for (const markerItem of markerItems) {
      const normalizedLabel = normalizeMusicKey(markerItem.label);
      if (!normalizedLabel) {
        continue;
      }

      const key = `artist-label:${normalizedLabel}`;
      const marker = markerMap.get(key) ?? {
        label: markerItem.label,
        ownerIndexes: new Set<number>(),
        genres: new Set<string>(),
        artistPick: false,
      };

      marker.ownerIndexes.add(listenerIndex);
      marker.artistPick = marker.artistPick || markerItem.artistPick;
      for (const genre of markerItem.item.genres.map((genre) => genre.toLowerCase())) {
        marker.genres.add(genre);
      }
      markerMap.set(key, marker);
    }
  });

  return Array.from(markerMap.entries())
    .sort(([, a], [, b]) => {
      const ownerDelta = b.ownerIndexes.size - a.ownerIndexes.size;
      if (ownerDelta !== 0) {
        return ownerDelta;
      }

      if (a.artistPick !== b.artistPick) {
        return a.artistPick ? -1 : 1;
      }

      return b.genres.size - a.genres.size || a.label.localeCompare(b.label);
    })
    .slice(0, 14)
    .map(([key, marker], markerIndex) => {
      const ownerIndexes = Array.from(marker.ownerIndexes);
      const markerGenres = marker.genres;
      const shared = ownerIndexes.length > 1;
      const label = truncateLabel(marker.label);
      const width = Math.min(64, Math.max(28, label.length * 4.1 + 11));

      if (shared) {
        const angle = (markerIndex / Math.max(1, markerMap.size)) * Math.PI * 2 - Math.PI / 2;
        const distance = 34 + (markerIndex % 3) * 7;
        return {
          key,
          label,
          x: clamp(center.x + Math.cos(angle) * distance, 34, 186),
          y: clamp(center.y + Math.sin(angle) * distance, 34, 146),
          width,
          color: "#292524",
          shared,
        };
      }

      const ownerIndex = ownerIndexes[0] ?? 0;
      const ownerCircle = layout[ownerIndex] ?? layout[0];
      const ownerGenres = listenerGenreSets[ownerIndex] ?? new Set<string>();
      const otherGenreAffinity = listenerGenreSets
        .filter((_, index) => index !== ownerIndex)
        .reduce((best, genreSet) => Math.max(best, jaccard(markerGenres, genreSet)), 0);
      const selfGenreAffinity = jaccard(markerGenres, ownerGenres);
      const affinity = Math.max(otherGenreAffinity, selfGenreAffinity * 0.2);
      const vector = normalizeVector(ownerCircle.cx - center.x, ownerCircle.cy - center.y);
      const tangent = { x: -vector.y, y: vector.x };
      const jitter = ((hashString(key) % 100) / 100 - 0.5) * 22;
      const distance = 18 + (1 - affinity) * 38;

      return {
        key,
        label,
        x: clamp(center.x + vector.x * distance + tangent.x * jitter, 28, 192),
        y: clamp(center.y + vector.y * distance + tangent.y * jitter, 28, 152),
        width,
        color: listeners[ownerIndex]?.color ?? "#292524",
        shared,
      };
    });
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) {
    return 0;
  }

  const intersection = Array.from(a).filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function normalizeVector(x: number, y: number) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function truncateLabel(value: string) {
  return value.length > 14 ? `${value.slice(0, 12)}.` : value;
}

function buildRecommendations(listeners: ListenerProfile[]): Recommendation[] {
  void listeners;
  return [];
}

function getCircleLayout(count: number, score: number) {
  const closeness = score / 100;

  if (count <= 2) {
    const separation = 84 - closeness * 56;
    return [
      { cx: 110 - separation / 2, cy: 88, r: 56, labelX: 72, labelY: 154 },
      { cx: 110 + separation / 2, cy: 88, r: 56, labelX: 148, labelY: 154 },
    ];
  }

  if (count === 3) {
    const spread = 40 - closeness * 22;
    return [
      { cx: 110 - spread, cy: 78, r: 51, labelX: 54, labelY: 154 },
      { cx: 110 + spread, cy: 78, r: 51, labelX: 166, labelY: 154 },
      { cx: 110, cy: 102 + spread * 0.8, r: 51, labelX: 110, labelY: 168 },
    ];
  }

  const spread = 43 - closeness * 24;
  return [
    { cx: 110 - spread, cy: 90 - spread * 0.58, r: 47, labelX: 43, labelY: 154 },
    { cx: 110 + spread, cy: 90 - spread * 0.58, r: 47, labelX: 177, labelY: 154 },
    { cx: 110 - spread, cy: 90 + spread * 0.58, r: 47, labelX: 68, labelY: 168 },
    { cx: 110 + spread, cy: 90 + spread * 0.58, r: 47, labelX: 152, labelY: 168 },
  ];
}

function formatItem(item: MusicItem) {
  return item.subtitle ? `${item.name} - ${item.subtitle}` : item.name;
}
