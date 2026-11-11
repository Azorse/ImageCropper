# Batch Image Cropper

Crops a batch of photos to exact pixel sizes for eLearning courses. You give it a photo list (a CSV) and the photos themselves. You line up each crop by hand, and it hands back a ZIP of finished photos at the right sizes.

Everything runs in your browser. Photos are never uploaded anywhere, and your originals are never changed.

## 1. Open the app

Go to **https://azorse.github.io/ImageCropper/** in Chrome or Edge.

There's nothing to install. Bookmark the page so it's easy to find next time.

The moon or sun button in the top bar switches between light and dark mode. The app remembers your choice.

## 2. Fill in the photo list

1. On the **Setup** page, under "Swapping photos in a course?", download the **photo list** (CSV) and the **photo guide** (image) for your course.
2. Use the photo guide to see which photo each code refers to.
3. Open the photo list in Excel. In the `your_photo` column, type the filename of your new photo next to each code you're replacing, for example `elbow_closeup.jpg`.
4. Leave every other column as it is, and leave `your_photo` blank for photos you're not replacing.
5. Save it as a CSV.

## 3. Load everything

On the **Setup** page:

1. **Choose CSV** and pick your photo list.
2. **Choose folder** (or **Choose ZIP**) and pick where your photos are. Filenames have to match the CSV, but capital letters don't matter.
3. Read the check under step 3. It lists anything that's missing, too small or listed twice. Fix those, or carry on without them.
4. Click **Start cropping**.

## 4. Crop each photo

The frame is locked to the right shape, so you only choose what shows inside it.

- **Drag** the photo to move it.
- **Scroll** or use the slider to zoom. Zoom stops before the photo would get blurry.
- **Red outlines** are the slide's clickable hotspots. Line up the matching body parts inside them. If they won't fit, crop as well as you can and note it for Dan.
- The **Final image** preview on the right shows exactly what will be exported.
- Click **Confirm & next** when it looks right. **Previous** and **Skip for now** move between photos.

Only confirmed photos are exported. Skipped photos wait for you on the Review page.

**Progress is saved automatically in your browser.** If you close the tab, load the same CSV and photos again and your confirmed crops come back. Saved progress is kept for 60 days.

## 5. Review and download

1. On the **Review & export** page, check the list. Tick "Only show photos that need attention" to see what's left.
2. Click **Crop** or **Adjust** next to any photo to fix it.
3. Click **Download ZIP**.

The ZIP contains:

- `Production/`: photos that go into the published course
- `Storyline/`: photos Dan places in Storyline
- `instructions.csv`: where each photo goes
- `export_report.txt`: what was exported and anything left out

Files are named by code and slides, for example `PEC05-2_1.17-5.17.jpg`.

## Problems

| What you see | What to do |
|---|---|
| A red message saying the app can't run from a file on your computer | You opened a downloaded copy of `index.html`. Use the link in step 1 instead. |
| A photo is listed as missing | The filename in the CSV doesn't match the file. Check the spelling and the extension (`.jpg` vs `.jpeg`). |
| A photo is listed as too small | It's smaller than the size it needs. Find a larger version. Photos are never stretched. |
| My saved crops didn't come back | The CSV has to be exactly the same file. Any edit to it starts a fresh batch. |
