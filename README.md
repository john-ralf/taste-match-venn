# Taste Match

An interactive music taste Venn diagram. Each listener can enter up to five favorite bands/artists and five favorite songs, then the app charts exact overlap, shared genre signals, and bridge recommendations.

## Spotify Search

The app works without credentials by using the built-in sample catalog. To use Spotify search for consistent artist and song spellings, create a local `.env` with:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

Spotify credentials stay on the server route at `app/api/spotify/search/route.ts`; the browser never receives the secret.

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

- The search route uses Spotify's Client Credentials flow and the `/v1/search` catalog endpoint.
- Spotify's recommendations and related-artist endpoints are currently marked deprecated, so this app computes recommendations locally from selected artists, selected tracks, and shared genres.
- Local sample data lives in `lib/music.ts`.
