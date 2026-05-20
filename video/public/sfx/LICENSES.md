# SFX — Freesound CC0

All three SFX are sourced from Freesound under **CC0 (public domain)**.
No attribution required.

Each file has been trimmed locally from the source download to a clean single-shot
clip with fade-in/out edges (the originals were looped or had long lead-ins).

## Files

| Filename | Use | Trimmed duration | Source URL |
|---|---|---|---|
| key-tick.wav | Code-typing beat in Scene 5 (S3 swap) | 0.30 s | https://freesound.org/ (CC0; replace with the exact sample URL you used) |
| soft-chime.wav | Knowledge toggle landing in Scene 8 | 1.32 s | https://freesound.org/ (CC0; replace with the exact sample URL you used) |
| vinyl-pop.wav | MCP window reveal in Scene 11 | 0.30 s | https://freesound.org/ (CC0; replace with the exact sample URL you used) |

## Reproducing the trims

If you re-download from Freesound, regenerate the focused clips with:

```bash
cd video/public/sfx
# key-tick: take the first 0.30 s with a 60 ms fade-out
ffmpeg -y -i <raw-key-tick.{ogg,wav}> -ss 0 -t 0.30 \
  -af "afade=t=out:st=0.24:d=0.06,aresample=44100" \
  -ac 2 -ar 44100 key-tick.wav

# soft-chime: chime starts at ~0.28 s in the source; take 1.32 s with a 220 ms tail fade
ffmpeg -y -i <raw-soft-chime.wav> -ss 0.28 -t 1.32 \
  -af "afade=t=in:st=0:d=0.01,afade=t=out:st=1.10:d=0.22,aresample=44100" \
  -ac 2 -ar 44100 soft-chime.wav

# vinyl-pop: first audible pop at ~6.51 s in the source; take 0.30 s with edge fades
ffmpeg -y -i <raw-vinyl-pop.wav> -ss 6.51 -t 0.30 \
  -af "afade=t=in:st=0:d=0.02,afade=t=out:st=0.20:d=0.10,aresample=44100" \
  -ac 2 -ar 44100 vinyl-pop.wav
```

Offsets are tuned to the specific samples used in this build. If you swap a
sample, re-run `ffmpeg -i <file> -af silencedetect=noise=-30dB:d=0.05 -f null -`
to find the actual sound onset, then update `-ss` accordingly.

## Mix discipline

Per the plan: no UI clicks, swooshes, or whoosh transitions. Three SFX max for
the entire film. Levels in [`src/audio/MusicBed.tsx`](../../src/audio/MusicBed.tsx)
are key-tick 0.25, soft-chime 0.18, vinyl-pop 0.12 — tune them in the studio
during preview.
