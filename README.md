# Taste Match

An interactive music taste Venn diagram. Each listener chooses 10 favorite songs, then the app charts exact song overlap, artist signals from those songs, shared genres, and bridge recommendations.

## Music Search

The app searches Spotify first, then falls back to Last.fm for song results and tag-based genre data. Create a local `.env` with:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
LASTFM_API_KEY=your_lastfm_api_key
```

API credentials stay on the server route at `app/api/spotify/search/route.ts`; the browser never receives the secrets.

In Cloudflare, add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `LASTFM_API_KEY` as production variables/secrets.

## Shared Rooms

The app can create shareable room links when a Cloudflare KV namespace is bound as `ROOMS`. In Cloudflare, create a KV namespace, copy its namespace ID, and add this build environment variable before redeploying:

```bash
ROOMS_KV_NAMESPACE_ID=your_kv_namespace_id
```

Once deployed with KV, use **Create room** in the app, then **Copy invite** to share the room link.

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

- The search route uses Spotify's Client Credentials flow and the `/v1/search` catalog endpoint, with Last.fm `track.search` and `track.getTopTags` as a fallback.
- Spotify's recommendations and related-artist endpoints are currently marked deprecated, so this app computes taste matching locally from selected tracks and shared genres.
