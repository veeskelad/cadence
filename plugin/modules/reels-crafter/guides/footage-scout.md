# Footage scout (справка)

Когда: Pick fresh clips and photos for a reel from the creator's own footage in a local folder (a phone dump copied to the computer) and use only what the edit needs. Catalogues the album, checks candidates at full size, makes contact sheets, picks in/out points per beat, skips private details, and keeps a used-footage log so no clip is reused. Use when asked to "find shots for this reel", "take new footage", "use my album", "бери тільки потрібне відео", or when the editor needs B-roll for a script.

Input: an approved script / beat map (see `reel-director`). Output: `<reel-dir>/src/<what>_<id>.<ext>` files, contact sheets, and a list "beat → clip → ss/dur".

## Rules
- **Fresh only.** Read `used_footage.md` (in the reels workspace) first; never reuse a clip listed there unless the creator asks. Append every clip you use, with what is in it.
- **Copy only what you use** into `<reel-dir>/src/`. Disks fill up: 4K HEVC is ~3 MB/s. Long clips can be trimmed later.
- **Privacy pass at full resolution** before a clip goes in: other people's faces (ask first), messages and DMs on screens, private dashboards / numbers, car plates, street names and house numbers, ID documents. Skip those seconds or reframe with `crop`.
- Footage comes only from folders the person names; photo libraries and albums are copied into the work folder by the person.

## From a local folder
```bash
reel sheet path/to/clips/*.MOV -o sheets/   # 10 frames per clip, prints the timestamps
```
Read the strips, pick `ss` for each beat, copy the chosen files into `<reel-dir>/src/`.

## Picking in/out points
- One beat = one clip section; match the picture to the words (literal where possible).
- Start a clip on movement, not on a still moment; avoid the first and last 0.3 s of phone clips (shake).
- Faces: keep eyes out of the zones where cards and subtitles will sit (top ~280 px, bottom ~420 px, card area ~1000–1450 px).
- For `cover` and `orbit` choose shots with the head clearly separated from the background (Vision masks work best on a single person).
- Short usable part? Use `rate` (slow motion) instead of including the bad seconds.
