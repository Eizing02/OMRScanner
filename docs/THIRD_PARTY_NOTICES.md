# Third-party notices — 8 October 2026

ตรวจจากแพ็กเกจที่ติดตั้งจริงและ package-lock.json. เป็นบันทึกที่มา/notice สำหรับ delivery นี้ **ไม่ใช่ comprehensive transitive license หรือ legal audit**; เก็บ licenses/notices ของทุก dependency ที่ถูกแจกจ่ายเมื่อทำ release

## Direct runtime packages

| Package | Installed version | Upstream license | Use |
|---|---|---|---|
| next | 16.4.0 | MIT | App Router/SSR |
| react / react-dom | 19.3.0 | MIT | UI |
| @supabase/ssr | 0.12.7 | MIT | cookie-based server/browser clients |
| @supabase/supabase-js | 2.117.3 | MIT | Auth/Postgres client |
| @radix-ui/react-dialog | 1.2.0 | MIT | accessible modal primitive |
| lucide-react | 1.53.0 | ISC + Feather-derived MIT icons | icons; preserve both notices |
| @fontsource/noto-sans-thai | 5.3.0 | OFL-1.1 | locally hosted UI font |
| jscanify | 1.4.3 | MIT | browser client/corner ordering helper |
| @techstark/opencv-js | 5.0.0-release.1 | Apache-2.0 | local document edge detection/warp |
| jspdf | 4.2.1 | MIT | vector print PDF |
| qrcode | 1.5.4 | MIT | per-sheet opaque QR generation |
| xlsx / SheetJS CE | 0.20.3 | Apache-2.0 | roster parser / demo XLSX/CSV |
| zod | 4.6.5 | MIT | API/domain validation |

Full direct package license texts/available notices collected verbatim in `docs/licenses/RUNTIME-LICENSES.txt`. jscanify MIT ©2023 ColonelParrot retained separately in JSCANIFY-LICENSE.txt. SheetJS Apache license retained in SHEETJS-LICENSE.txt. No copied shadcn registry/react-konva/ZXing code is present; these proposed components remain TODO

SheetJS tarball is locked from the [official Node installation distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) at `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; do not substitute the stale npm xlsx 0.18.5 package without compatibility/security review

## OpenCV browser runtime asset

`public/omr-assets/opencv.js` is an **unmodified** copy of `node_modules/@techstark/opencv-js/dist/opencv.js` for lazy browser loading. SHA-256:

`B873C8211421DA7B9BF41AE157A923F05A46A0B8D3E5904C44C6F3AD6D39A1BD`

The copied runtime and source package are equal in the verification run. Retain `public/omr-assets/OPENCV-LICENSE.txt`. Source: [TechStark OpenCV.js](https://github.com/TechStark/opencv-js). If lockfile changes, update/verify the asset, license and hash together before release. Upstream notices embedded in the artifact remain intact

## PDF font source and modification

- Source: [Google Fonts Noto Sans Thai directory](https://github.com/google/fonts/tree/main/ofl/notosansthai), `NotoSansThai[wdth,wght].ttf` downloaded to `public/omr-assets/NotoSansThai-Variable.ttf`
- Copyright 2022 The Noto Project Authors; [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/notosansthai/OFL.txt) retained verbatim as `public/omr-assets/FONT-LICENSE.txt`
- Local modification: generate a static instance at wght=400, wdth=100 with fontTools 4.66.1 for jsPDF compatibility. Output: `NotoSansThai-Regular.ttf`; 426 glyphs, including Thai, Latin and digits. Not a new designed typeface, no endorsement implied
- Original variable SHA-256: `5A1C559BB539583C8A1FD99D1C5B9491E5E14478C9CD2BD0970D5C3096CC9EF8`
- Derived static SHA-256: `EB8582214ED7D11E7527FB90500A645E7A72C89C664B66DBFECA2B81A1E42761`
- Retain original/derived font with the OFL notice. The local fontTools installation lives in ignored `.impeccable/font-tools`, is a build-time transformation only, not an application runtime dependency. FontTools MIT license remains with that installation

An earlier Thai-only TTF failed the rendered digit check and was replaced. PDF tests now assert digit/Thai cmap and actual rendered sample was inspected; this does not certify every Thai shaping case

## OMRChecker — reviewed, not vendored or executed

[Udayraj123/OMRChecker pinned tree](https://github.com/Udayraj123/OMRChecker/tree/5cf44a5a9c7a49e2e541c6e19aefd09a41a4d494), proposed SHA `5cf44a5a9c7a49e2e541c6e19aefd09a41a4d494`. git ls-remote corroborated upstream HEAD during review; [pinned LICENSE](https://github.com/Udayraj123/OMRChecker/blob/5cf44a5a9c7a49e2e541c6e19aefd09a41a4d494/LICENSE) MIT and code references inspected

No clone/source incorporation/Python adapter/health/pytest/real-image run in this delivery. Once the worker architecture is authorized, preserve full upstream MIT attribution/notice in the vendored source, install pinned Python dependencies, validate candidate template through upstream parser and record actual checked-out SHA. A reference to this SHA is not proof of integration

Scanic/alternative document scanners are proposals only, not installed/bundled/benchmarked. No third-party performance claims have been adopted as our measurements

## Tooling, not product runtime

Impeccable is installed as the design skill/CLI under .agents/.impeccable, not a Next.js dependency or grading engine; upstream [pbakaus/impeccable](https://github.com/pbakaus/impeccable) Apache-2.0. Playwright/axe/PGlite/Vitest/TypeScript/ESLint/Prettier/Tailwind are development dependencies, locked in package-lock.json; keep their respective package notices in any distributed tooling environment. Poppler and bundled Python were used to inspect PDF output, not shipped inside the application

## Dependency security note

Production audit: zero known findings at the recorded check. Full audit still has a development-only braces advisory chain (five package entries); see TEST_RESULTS.md. Locking versions is reproducibility, not a guarantee of license/security/OMR correctness
