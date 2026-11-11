# Batch Image Cropper

Prepares batches of photos for eLearning courses. A CSV lists each photo and the size it needs. You position and confirm each crop by hand, and the app exports a ZIP of photos at the exact pixel sizes.

Everything runs in the browser. Photos are never uploaded anywhere.

## Two ways to use it

**Course photo swaps (the main use).** Each course has a template in `templates/`: a photo list (CSV) and a photo guide (image). A consultant downloads both from the setup page, writes the filename of each new photo in the `your_photo` column next to its code, and leaves every other row blank. The cropper then crops each photo to the exact size and file type of the image it replaces, shows the course's hotspots as red ovals, and exports a ZIP with:

- `Production/`: photos the swap tool drops into the published course
- `Storyline/`: photos Dan places in Storyline (hotspot slides and buttons Storyline flattens)
- `instructions.csv`: where every photo goes
- `export_report.txt`: what was exported and anything left out

Output files are named by code and slides, for example `PEC05-2_1.17.jpg`.

**General batches.** Any CSV with `filename,preset` columns crops to the six size presets in Settings, as before.

## Project layout

```
index.html          Page markup
favicon.svg         Tab icon
presets.json        Team default sizes (edit this to change everyone's defaults)
css/styles.css      All styling
js/
  main.js           Entry point, wires everything up
  boot-check.js     Warns if the page was opened from disk instead of a server
  config.js         Presets and output settings, loading and validation
  state.js          Shared app state
  batch.js          CSV parsing, photo loading, row checks
  crop-math.js      Crop geometry (no DOM)
  workspace.js      Crop screen: drawing, drag, zoom, keyboard
  review.js         Review screen
  exporter.js       Rendering final images and building the ZIP
  settings.js       Settings dialog
  progress.js       Saving crop progress in the browser
  nav.js            Switching screens
  utils.js          Small shared helpers
templates/
  index.json        List of course templates shown on the setup page
  PEC/              Position Elbows Closer photo list and guide
vendor/             Papa Parse 5.4.1 and JSZip 3.10.1, with their licenses
```

No build step. Edit a file, refresh the browser.

## Running it on your computer

The JavaScript uses ES modules, which browsers won't load from a file opened by double-clicking. Run a small local server from the project folder instead:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. (The VS Code "Live Server" extension also works.)

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo, with index.html at the top level.
2. In the repo, go to Settings > Pages, set the source to the main branch and the root folder.
3. The site appears at `https://<username>.github.io/<repo-name>/`.

Updates go live a minute or so after each push.

## Changing the sizes

There are two places:

- **presets.json** sets the defaults for everyone. Edit it and push.
- **Settings in the app** lets one person override them in their own browser. Settings > Export settings downloads a presets.json you can commit.

A browser that has saved its own settings keeps them until that person clicks Restore team defaults and saves.

Preset IDs (`square1`, `landscape2`, etc.) never change. The CSV can use the ID or the display name, ignoring case and spaces.

## Course template format

```
code,slides,your_photo,width,height,format,manual_in_storyline,storyline_name,hotspot_guide
PEC03-1,"Slides 1.12, 5.12",,768,1024,jpg,yes: hotspots,Image.jpeg,"0.1875,0.375,..."
```

Consultants only fill in `your_photo`. Slide numbers are written as text ("Slide 1.10") so Excel can't change 1.10 into 1.1. Templates are generated from a published course, so don't edit the sizes by hand.

## Preset CSV format

```
filename,preset,output_filename
Photo_001.jpg,Square 1,
Photo_002.jpg,landscape2,
Photo_003.png,Portrait 1,
Photo_003.png,Landscape 1,Photo_003_wide.jpg
```

`output_filename` is optional. The same photo can appear on more than one row if each row has its own output name.

## Rules the app enforces

- Crop shape is locked to the preset. Photos are never stretched.
- Photos smaller than the preset are rejected. Zoom stops before it would need to upscale.
- Missing photos, unknown presets, duplicate rows and unreadable files are listed before cropping starts and again in `export_report.txt` inside the ZIP.
- Only confirmed crops are exported.
- Confirmed crops are saved in the browser per CSV. Loading the same CSV and photos again restores them. Saved progress older than 60 days is cleared automatically.

## Updating the libraries

Download the new minified files and replace the ones in `vendor/`:

- Papa Parse: https://www.papaparse.com
- JSZip: https://stuk.github.io/jszip/
