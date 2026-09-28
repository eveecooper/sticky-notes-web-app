# Threadboard

A local idea board with editable sticky notes and pin-to-pin strings. Notes, connections, colors, sizes, and positions save automatically in this browser's local storage.

## Run locally

From this directory, run:

```bash
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173) in your browser. Stop the server with Ctrl+C.

## Controls

- Add a colored note with the left toolbar. Type directly in a note.
- Drag a note by its top edge. Resize it from the bottom right corner.
- Click or drag from a pin to another note's pin to connect notes. Click a string and press Delete to remove it.
- Drag empty board space to pan. Scroll to pan, or use Ctrl/⌘ + scroll or the buttons to zoom.
- Use the note's ⋯ menu to change color or delete it. Press N to add a yellow note.

Board data stays in the browser profile on the device used. Clearing site data removes it.
