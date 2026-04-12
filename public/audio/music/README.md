# Battle Music

Drop your looping battle track here as:

  `battle-theme.mp3`  (or .ogg / .webm)

The audio system will automatically load and loop this file when a battle starts.
If the file is absent the game runs silently — no errors.

## Tips
- Keep the track under ~4 MB for fast initial load.
- Aim for a seamless loop (match the end sample to the start).
- Adjust volume per-fighter-type by editing `BATTLE_MUSIC_SRC` in
  `src/features/audio/useAudio.ts`.
