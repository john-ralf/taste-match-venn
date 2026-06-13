# Taste Match

An interactive music taste Venn diagram. Each listener chooses 10 favorite Spotify songs, then the app charts exact song overlap, artist signals from those songs, shared genres, and bridge recommendations.

## Spotify Search

The app requires Spotify search so song choices use consistent spellings and include artist genre data. Create a local `.env` with:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

Spotify credentials stay on the server route at `app/api/spotify/search/route.ts`; the browser never receives the secret.

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

- The search route uses Spotify's Client Credentials flow and the `/v1/search` catalog endpoint.
- Spotify's recommendations and related-artist endpoints are currently marked deprecated, so this app computes taste matching locally from selected tracks and shared genres.
