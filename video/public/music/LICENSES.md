# Music — Pixabay Content License

Three of the four tracks are sourced from Pixabay under the Pixabay Content License.
The fourth (Track D) is synthesized locally from Track B's tail with `ffmpeg` and
inherits Track B's license.

> Pixabay Terms of Service (verbatim):
> "Under the Pixabay License you are granted an irrevocable, worldwide, non-exclusive
> and royalty free right to use, download, copy, modify or adapt the Content for
> commercial or non-commercial purposes. Attribution of the photographer,
> videographer, musician or Pixabay is not required but is always appreciated."

Commercial use is permitted. No attribution is required.

## Tracks

| Slot | Filename | Title | Contributor | Source | License | Duration |
|---|---|---|---|---|---|---|
| A | track-a-cold-open.mp3 | Cinematic Ambient Feeling — Ambient Piano Music For Videos | music_for_video | https://pixabay.com/music/ambient-cinematic-ambient-feeling-ambient-piano-music-for-videos-7767/ | Pixabay | 95.0 s |
| B | track-b-build.mp3 | Emotional Depth | Grand_Project | https://pixabay.com/music/ambient-emotional-depth-323009/ | Pixabay | 172.0 s |
| C | track-c-climax.mp3 | Hero's End — Cinematic Soundscape | NaturesEye | https://pixabay.com/music/ambient-hero39s-end-cinematic-soundscape-13978/ | Pixabay | 151.6 s |
| D | track-d-outro.mp3 | *Emotional Depth* — outro fragment (synthesized: last 30 s of Track B with 2.5 s fade-in and 6 s fade-out) | Grand_Project (derivative) | Derived from Track B; recipe below | Pixabay (same as Track B) | 30.0 s |

## Reproducing Track D

If you re-download Track B and want to regenerate Track D from scratch:

```bash
cd video/public/music
ffmpeg -y -i track-b-build.mp3 -ss 142 -t 30 \
  -af "afade=t=in:st=0:d=2.5,afade=t=out:st=24:d=6,aresample=44100" \
  -ac 2 -ar 44100 -b:a 192k track-d-outro.mp3
```

## YouTube Content ID — fallback path

If a Content ID claim hits the upload, file a YouTube dispute citing the
Pixabay license URL above. As a documented fallback, swap to **Bensound's
*Endo — Reflective Ambient*** (https://bensound.com/royalty-free-music/track/endo-reflective-ambient).
Bensound's free license requires an on-screen attribution line; the Pixabay
tracks do not.
