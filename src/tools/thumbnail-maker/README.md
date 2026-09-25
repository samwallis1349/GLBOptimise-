# Thumbnail studio

Use a built-in look or save, import and export your own presets. Transparent PNGs can include a soft ground shadow. Choose a shared camera angle, resolution, lighting and exposure before generating.

Batch limit: 200 self-contained GLBs, 200 MB per file, 1 GB combined. Processing is sequential; cancel pauses after the current model and Generate resumes. Failed models can be retried. Results are temporary: download before leaving the page.

Exports:
- Individual PNGs or ZIP parts.
- Labelled sprite sheets, automatically paginated within 4096 px bounds, with JSON frame coordinates.
- Searchable offline HTML catalogue, PNGs, manifest and optional unchanged original GLBs. Extract each ZIP and open index.html. Edit labels before exporting.

ZIP parts target 128 MiB input data; a single larger original gets its own part. Device memory and browser storage still constrain complex files. 200 small GLBs were verified in the browser, including pause and resume; this is not a guarantee for 200 heavy models.

Validation: production build; queue limits, sequential execution, failure isolation, retry and cancellation; sheet bounds; preset validation; catalogue escaping, duplicate filenames and unchanged source bytes.
