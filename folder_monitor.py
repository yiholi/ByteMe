#!/usr/bin/env python3
"""
Folder Monitor - Tracks folder count in real-time and broadcasts via WebSocket
New: Sends folder names, system stats (CPU/RAM/GPU), and handles jpg feeding behavior.
"""
import os
import json
import asyncio
import websockets
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import psutil
 
# Try to import GPUtil for NVIDIA GPU stats
try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False
    print("⚠️  GPUtil not found. Run: pip install gputil --break-system-packages")
 
# ========== Configuration ==========
WATCH_PATH = "./monitored_folder"  # Path of the folder to monitor
WEBSOCKET_HOST = "localhost"
WEBSOCKET_PORT = 8765
CHECK_INTERVAL = 0.5   # Folder check interval in seconds
STATS_INTERVAL = 1.0   # System stats broadcast interval in seconds
# ====================================
 
connected_clients = set()
last_folder_count = 0
 
# ========== Safety: Ensure all file ops stay inside WATCH_PATH ==========
WATCH_PATH_ABS = os.path.abspath(WATCH_PATH)
 
def is_safe_path(path):
    """Verify a path is strictly inside WATCH_PATH. Prevents escaping to other folders."""
    return os.path.abspath(path).startswith(WATCH_PATH_ABS + os.sep)
 
# ========== Folder Helpers ==========
 
def get_folders():
    """Returns list of folder names inside WATCH_PATH (ignores hidden folders)."""
    try:
        items = os.listdir(WATCH_PATH)
        return [d for d in items
                if os.path.isdir(os.path.join(WATCH_PATH, d)) and not d.startswith('.')]
    except FileNotFoundError:
        return []
 
def count_folders():
    return len(get_folders())
 
# ========== System Stats ==========
 
def get_system_stats():
    """Read CPU, RAM, GPU usage. Returns dict with values 0-100."""
    cpu = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory().percent
 
    gpu = 0
    if GPU_AVAILABLE:
        try:
            gpus = GPUtil.getGPUs()
            if gpus:
                gpu = gpus[0].load * 100  # Convert 0-1 to 0-100
        except Exception:
            pass
 
    return {"cpu": round(cpu, 1), "ram": round(ram, 1), "gpu": round(gpu, 1)}
 
# ========== JPG Feeding ==========
 
def is_jpg_intact(path):
    """Check if a jpg still has a valid header (FF D8). Returns False if already corrupted."""
    try:
        with open(path, 'rb') as f:
            header = f.read(2)
        return header == b'\xFF\xD8'
    except Exception:
        return False
 
def find_jpgs_in_watch_path():
    """
    Scans all subfolders inside WATCH_PATH for jpg files.
    SAFETY: Only looks inside WATCH_PATH. Will never touch files outside.
    Returns list of absolute paths to jpg files.
    """
    found = []
    for folder_name in get_folders():
        folder_path = os.path.join(WATCH_PATH_ABS, folder_name)
        try:
            for fname in os.listdir(folder_path):
                if fname.lower().endswith('.jpg') or fname.lower().endswith('.jpeg'):
                    full_path = os.path.join(folder_path, fname)
                    # Double-check: only proceed if path is safely inside WATCH_PATH
                    if is_safe_path(full_path) and is_jpg_intact(full_path):
                        found.append(full_path)
        except Exception:
            pass
    return found
 
def read_jpg_bytes(path, num_bytes=256):
    """
    Read the first N bytes of a jpg as hex strings.
    Returns list of hex strings like ['FF', 'D8', 'FF', ...]
    """
    try:
        with open(path, 'rb') as f:
            raw = f.read(num_bytes)
        return [format(b, '02X') for b in raw]
    except Exception:
        return []
 
def corrupt_jpg(path):
    """
    Corrupts a jpg by overwriting the entire file with 00 01 alternating pattern.
    This completely destroys all image data so it can't be opened or recovered.
    SAFETY: Checks path is inside WATCH_PATH before touching anything.
    """
    if not is_safe_path(path):
        print(f"🚫 BLOCKED: Attempted to corrupt file outside WATCH_PATH: {path}")
        return False
    try:
        file_size = os.path.getsize(path)
        pattern = bytes([0x00, 0x01] * ((file_size // 2) + 1))  # 00 01 repeating, covers full file size
        with open(path, 'wb') as f:
            f.write(pattern[:file_size])  # Write exactly file_size bytes
        print(f"💀 Corrupted: {path} ({file_size} bytes overwritten with 00 01 pattern)")
        return True
    except Exception as e:
        print(f"❌ Failed to corrupt {path}: {e}")
        return False
 
# ========== Broadcast ==========
 
async def broadcast(data: dict):
    """Send a JSON message to all connected WebSocket clients."""
    if connected_clients:
        message = json.dumps(data)
        websockets.broadcast(connected_clients, message)
 
async def broadcast_state():
    """Broadcast full state: folder list + system stats."""
    folders = get_folders()
    stats = get_system_stats()
    await broadcast({
        "count": len(folders),
        "folders": folders,
        "system": stats
    })
    print(f"📤 State: {len(folders)} folders | CPU {stats['cpu']}% RAM {stats['ram']}% GPU {stats['gpu']}%")
 
async def broadcast_feeding_event(folder_name, hex_bytes, filename):
    """Broadcast a feeding event so p5.js can animate the node."""
    await broadcast({
        "event": "feed",
        "folder": folder_name,   # Which node (folder name) is eating
        "hex": hex_bytes,        # The absorbed bytes
        "filename": filename     # Name of the consumed jpg
    })
    print(f"🐛 Feed event: node '{folder_name}' eating '{filename}'")
 
async def broadcast_corrupted_event(folder_name, filename, corrupted_hex):
    """Broadcast after corruption is done so the frontend knows the file is dead."""
    await broadcast({
        "event": "corrupted",
        "folder": folder_name,
        "filename": filename,
        "hex": corrupted_hex   # The 00 01 pattern bytes, replaces background wall data
    })
    print(f"💀 Corrupted event: node '{folder_name}' finished eating '{filename}'")
 
# ========== Watchdog ==========
 
class FolderHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop
 
    def on_created(self, event):
        if event.is_directory:
            print(f"✅ Folder Created: {event.src_path}")
            asyncio.run_coroutine_threadsafe(broadcast_state(), self.loop)
 
    def on_deleted(self, event):
        if event.is_directory:
            print(f"❌ Folder Deleted: {event.src_path}")
            asyncio.run_coroutine_threadsafe(broadcast_state(), self.loop)
 
# ========== Periodic Tasks ==========
 
async def periodic_folder_check():
    """Catch any folder changes watchdog may have missed."""
    global last_folder_count
    while True:
        await asyncio.sleep(CHECK_INTERVAL)
        current_count = count_folders()
        if current_count != last_folder_count:
            print(f"🔄 [Periodic Check] {last_folder_count} → {current_count}")
            last_folder_count = current_count
            await broadcast_state()
 
async def periodic_stats_broadcast():
    """Broadcast system stats every second so the dashboard stays live."""
    while True:
        await asyncio.sleep(STATS_INTERVAL)
        await broadcast_state()
 
async def feeding_loop():
    """
    The caterpillar's autonomous feeding behavior.
    
    Hunger logic:
    - Hunger accumulates every second
    - CPU usage speeds up hunger accumulation
    - RAM usage lowers the threshold needed to trigger feeding
    - When hunger exceeds threshold AND a jpg exists → feed
    """
    hunger = 0.0
    while True:
        await asyncio.sleep(1.0)
 
        if not connected_clients:
            continue
 
        stats = get_system_stats()
        folder_count = count_folders()
 
        # Hunger grows faster when CPU is high, and faster with more segments
        # Base rate: 5 per second. CPU boost: up to +10. Segment boost: +0.5 per node.
        hunger_rate = 5 + (stats['cpu'] / 10) + (folder_count * 0.5)
        hunger += hunger_rate
 
        # Threshold shrinks when RAM is high (more RAM pressure = easier to trigger)
        # Base threshold: 200. RAM at 80% reduces it to 120.
        threshold = max(80, 200 - stats['ram'])
 
        print(f"🍽️  Hunger: {hunger:.1f} / {threshold:.1f} (rate: {hunger_rate:.1f}/s)")
 
        if hunger >= threshold:
            hunger = 0  # Reset hunger after eating
            jpgs = find_jpgs_in_watch_path()
 
            if not jpgs:
                print("🐛 Hungry but no jpg found to eat.")
                continue
 
            # Pick a random jpg to consume
            import random
            chosen_path = random.choice(jpgs)
            filename = os.path.basename(chosen_path)
 
            # Figure out which folder (node) this jpg lives in
            # e.g. monitored_folder/project_a/photo.jpg → folder_name = "project_a"
            folder_name = os.path.basename(os.path.dirname(chosen_path))
 
            print(f"🐛 Caterpillar is hungry! Eating: {chosen_path}")
 
            # Step 1: Read bytes BEFORE corrupting
            hex_bytes = read_jpg_bytes(chosen_path, 256)
 
            # Step 2: Broadcast feeding event to p5.js (animation starts)
            await broadcast_feeding_event(folder_name, hex_bytes, filename)
 
            # Step 3: Wait 3 seconds (let the animation play)
            await asyncio.sleep(3)
 
            # Step 4: Corrupt the file (SAFETY CHECK inside corrupt_jpg)
            corrupt_jpg(chosen_path)
 
            # Step 5: Read back the corrupted bytes (00 01 pattern) and broadcast to frontend
            corrupted_hex = read_jpg_bytes(chosen_path, 256)
            await broadcast_corrupted_event(folder_name, filename, corrupted_hex)
 
# ========== WebSocket Handler ==========
 
async def websocket_handler(websocket):
    connected_clients.add(websocket)
    client_info = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    print(f"🔗 New client connected: {client_info}")
 
    # Send full state immediately on connection
    folders = get_folders()
    stats = get_system_stats()
    await websocket.send(json.dumps({
        "count": len(folders),
        "folders": folders,
        "system": stats
    }))
 
    try:
        async for message in websocket:
            pass  # Currently no messages expected from client
    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 Client disconnected: {client_info}")
    finally:
        connected_clients.discard(websocket)
 
# ========== Main ==========
 
async def main():
    global last_folder_count
 
    if not os.path.exists(WATCH_PATH):
        os.makedirs(WATCH_PATH, exist_ok=True)
        print(f"✨ Created monitored directory: {WATCH_PATH}")
    else:
        print(f"✅ Monitored directory ready: {WATCH_PATH}")
 
    print(f"📁 Absolute path: {WATCH_PATH_ABS}")
    print(f"🔒 Safety lock: all file ops restricted to this path")
 
    last_folder_count = count_folders()
    print(f"📊 Initial folder count: {last_folder_count}")
 
    loop = asyncio.get_running_loop()
    event_handler = FolderHandler(loop)
    observer = Observer()
    observer.schedule(event_handler, WATCH_PATH, recursive=False)
    observer.start()
    print("👀 Folder monitoring started")
 
    asyncio.create_task(periodic_folder_check())
    asyncio.create_task(periodic_stats_broadcast())
    asyncio.create_task(feeding_loop())
    print(f"⏰ Periodic tasks started")
 
    async with websockets.serve(websocket_handler, WEBSOCKET_HOST, WEBSOCKET_PORT):
        print(f"🚀 WebSocket running: ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
        print(f"💡 Visit: http://localhost:8000")
        print("=" * 60)
        await asyncio.Future()
 
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Program stopped")
 