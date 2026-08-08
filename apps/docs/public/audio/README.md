# Demo Audio Assets

These eight-second samples are generated locally by `apps/docs/scripts/generate-demo-audio.mjs`. Regenerate all formats together with `pnpm --filter @gaudio/docs run audio:samples` after changing the source definitions.

Generation requires `ffmpeg` on `PATH` with MP3, AAC, and Opus encoders plus the HLS and DASH muxers. Run `ffmpeg -version` to record the installed version before investigating output differences. The script stages a complete set before replacing these files, and its bit-exact OGG flags keep repeated output stable on the same ffmpeg build.

No third-party recordings or compositions are used. The generated demo assets are distributed under the repository MIT license.
