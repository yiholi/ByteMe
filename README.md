# Localhost Parasite

A digital organism that lives inside your computer. Its body is made of your folders, its behavior is driven by your CPU, RAM, and GPU, and it eats your JPG files.


---

## Quick Start

### Step 1: Check Requirements

- **Python 3.8+** ([Download](https://www.python.org/downloads/) — check "Add to PATH" during install)
- A modern browser (Chrome)

### Step 2: Install Python Packages

```bash
pip install websockets watchdog psutil gputil --break-system-packages
```

> `gputil` is optional if you don't have an NVIDIA GPU — the GPU bar will simply show 0%.

### Step 3: Verify File Structure After Downloading

```
localhost-parasite/
├── folder_monitor.py
├── sketch.js
├── index.html
├── style.css
└── README.md
```

### Step 4: Start the Python Monitor

```bash
python folder_monitor.py
```

You should see:
```
🚀 WebSocket running: ws://localhost:8765
💡 Visit: http://localhost:8000
```

### Step 5: Start the Web Server (in a new terminal)

```bash
python -m http.server 8000
```

### Step 6: Open Your Browser

Go to `http://localhost:8000`

> ⚠️ You must use `http://localhost:8000`. **Do not** open `index.html` directly by double-clicking — the WebSocket connection will fail.
> ⚠️ Do not use VS Code's Go Live (Live Server), it auto-refreshes the page whenever a folder is created or deleted, which will interrupt the animation.

---

## 🎮 How to Interact

Once running, a `monitored_folder` directory is created automatically. **All interactions happen inside it:**

| Action | Effect |
|--------|--------|
| Create a subfolder inside `monitored_folder` | Caterpillar grows one segment |
| Delete a subfolder | Caterpillar shrinks one segment |
| Drop a JPG into any subfolder | Caterpillar will eat it (destroy its HEX data) |

---

## 🧬 Concept

Each segment corresponds to a real folder on your machine. The caterpillar has genuine hunger, driven entirely by system resources:

- **High CPU usage** → hunger builds faster
- **High RAM usage** → feeding threshold lowers, easier to trigger
- **More segments (folders)** → larger body, higher energy demand

Once hunger crosses the threshold, the caterpillar autonomously scans the subfolders, picks a JPG, reads the first 256 bytes as HEX data into its body, then completely overwrites the file with a `00 01` pattern — unrecoverable. Those HEX traces remain permanently on the segment, visible on hover.

> ⚠️ Any JPG placed inside `monitored_folder` subfolders **may be permanently destroyed**. Do not use files you care about.

---

## ⚙️ Configuration

### Changing Ports

Default WebSocket port is `8765`, web server is `8000`. If there's a conflict, update both files:

`folder_monitor.py`:
```python
WEBSOCKET_PORT = 8765
```

`sketch.js`:
```javascript
const WS_URL = 'ws://localhost:8765';
```

### Adjusting Feeding Speed

In `folder_monitor.py`, inside the `feeding_loop()` function:

```python
hunger_rate = 5 + (stats['cpu'] / 10) + (folder_count * 0.5)
# Higher values = gets hungry faster

threshold = max(80, 200 - stats['ram'])
# 200 is the base threshold — lower = feeds more easily
```

---

## 🐛 Troubleshooting

**Page shows Disconnected (red dot)**
- Make sure `folder_monitor.py` is still running
- Make sure you're using `http://localhost:8000`, not opening the HTML file directly
- Refresh the page or check the browser Console for error messages

**`ModuleNotFoundError`**
```bash
pip install websockets watchdog psutil --break-system-packages
```

**Port already in use**
- Change `WEBSOCKET_PORT` in `folder_monitor.py` and `WS_URL` in `sketch.js` to another port (e.g. `8766`)

**JPG dropped in but not eaten**
- The caterpillar takes time to build hunger. Run a heavier program to raise CPU usage and speed things up.

**GPU always shows 0%**
- Requires an NVIDIA GPU with `gputil` installed. AMD and Intel GPUs are not currently supported.

---

## 🔒 Safety

All file operations are strictly confined to the `monitored_folder` directory. Before reading or corrupting any file, Python verifies the absolute path is inside that folder and refuses to proceed if it isn't. Nothing outside `monitored_folder` is ever touched.

---

## 📦 Tech Stack

- **Python** — `watchdog` for folder monitoring, `psutil` for system stats, `websockets` for real-time communication
- **p5.js WEBGL** — 3D caterpillar rendering, Perlin Noise autonomous movement, Inverse Kinematics chain following
- **WebSocket** — bidirectional real-time data transfer between Python and the browser (JSON)
