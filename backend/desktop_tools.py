"""
Desktop Tools - Real-time desktop access for agents
Allows agents to observe, read, and interact with the user's desktop
"""
import os
import json
import time
import base64
import subprocess
import platform
from pathlib import Path
from datetime import datetime
from typing import Optional
import threading

# Lazy imports for heavy deps
_mss = None
_pyautogui = None
_PIL = None

def _get_mss():
    global _mss
    if _mss is None:
        import mss
        _mss = mss
    return _mss

def _get_pyautogui():
    global _pyautogui
    if _pyautogui is None:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.1
        _pyautogui = pyautogui
    return _pyautogui

def _get_pil():
    global _PIL
    if _PIL is None:
        from PIL import Image
        _PIL = Image
    return _PIL


class DesktopTools:
    """Real-time desktop observation and interaction for agents"""

    def __init__(self, desktop_path: str = None):
        # Auto-detect desktop path
        if desktop_path:
            self.desktop = Path(desktop_path)
        else:
            self.desktop = self._find_desktop()

        self.action_log = []  # Rolling log of agent actions
        self.max_log = 200
        self._screenshot_cache = None
        self._screenshot_time = 0
        self._watchers = {}  # file watchers
        self._lock = threading.Lock()

        print(f"[DesktopTools] Desktop path: {self.desktop}")

    def _find_desktop(self) -> Path:
        """Auto-detect desktop path on Windows/Linux/Mac"""
        system = platform.system()
        home = Path.home()

        if system == "Windows":
            # Try OneDrive desktop first
            onedrive = home / "OneDrive"
            for p in [
                onedrive / "OneDrive - ump.edu.my" / "Desktop",
                onedrive / "Desktop",
                home / "Desktop",
            ]:
                if p.exists():
                    return p
            return home / "Desktop"
        elif system == "Darwin":
            return home / "Desktop"
        else:
            return home / "Desktop"

    def _log_action(self, action_type: str, detail: str, result: str = "success"):
        """Log an agent action"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "type": action_type,
            "detail": detail,
            "result": result,
        }
        with self._lock:
            self.action_log.append(entry)
            if len(self.action_log) > self.max_log:
                self.action_log = self.action_log[-self.max_log:]
        return entry

    # ── FILE SYSTEM ──────────────────────────────────────────────

    def list_files(self, path: str = None, show_hidden: bool = False) -> dict:
        """List files in a directory"""
        target = Path(path) if path else self.desktop
        if not target.exists():
            return {"error": f"Path not found: {target}", "files": []}

        files = []
        try:
            for item in sorted(target.iterdir()):
                if not show_hidden and item.name.startswith("."):
                    continue
                stat = item.stat()
                files.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "directory" if item.is_dir() else "file",
                    "size": stat.st_size if item.is_file() else None,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "extension": item.suffix.lower() if item.is_file() else None,
                })
        except PermissionError:
            return {"error": "Permission denied", "files": []}

        self._log_action("list_files", str(target))
        return {"path": str(target), "count": len(files), "files": files}

    def read_file(self, path: str, max_size: int = 100_000) -> dict:
        """Read a text file's content"""
        p = Path(path)
        if not p.exists():
            return {"error": f"File not found: {path}"}
        if not p.is_file():
            return {"error": f"Not a file: {path}"}
        if p.stat().st_size > max_size:
            return {"error": f"File too large ({p.stat().st_size} bytes, max {max_size})"}

        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            self._log_action("read_file", str(p), f"{len(content)} chars")
            return {
                "path": str(p),
                "name": p.name,
                "size": p.stat().st_size,
                "content": content,
                "lines": content.count("\n") + 1,
            }
        except Exception as e:
            return {"error": str(e)}

    def search_files(self, query: str, path: str = None, extensions: list = None) -> dict:
        """Search for files by name pattern"""
        target = Path(path) if path else self.desktop
        results = []
        query_lower = query.lower()

        try:
            for root, dirs, files in os.walk(target):
                # Skip hidden dirs
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for f in files:
                    if query_lower in f.lower():
                        fp = Path(root) / f
                        if extensions and fp.suffix.lower() not in extensions:
                            continue
                        stat = fp.stat()
                        results.append({
                            "name": f,
                            "path": str(fp),
                            "size": stat.st_size,
                            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        })
                    if len(results) >= 50:
                        break
                if len(results) >= 50:
                    break
        except Exception as e:
            return {"error": str(e), "results": []}

        self._log_action("search_files", query, f"{len(results)} results")
        return {"query": query, "count": len(results), "results": results}

    def get_file_preview(self, path: str, lines: int = 30) -> dict:
        """Get a preview of a file (first N lines for text, metadata for binary)"""
        p = Path(path)
        if not p.exists():
            return {"error": "File not found"}

        ext = p.suffix.lower()
        image_exts = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}
        text_exts = {".txt", ".md", ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini", ".log", ".csv", ".html", ".css", ".xml"}

        if ext in image_exts:
            return {
                "type": "image",
                "path": str(p),
                "name": p.name,
                "size": p.stat().st_size,
                "extension": ext,
            }
        elif ext in text_exts or p.stat().st_size < 500_000:
            try:
                content = p.read_text(encoding="utf-8", errors="replace")
                preview_lines = content.split("\n")[:lines]
                return {
                    "type": "text",
                    "path": str(p),
                    "name": p.name,
                    "size": p.stat().st_size,
                    "preview": "\n".join(preview_lines),
                    "total_lines": content.count("\n") + 1,
                    "truncated": len(preview_lines) < content.count("\n") + 1,
                }
            except:
                return {"type": "binary", "path": str(p), "name": p.name, "size": p.stat().st_size}
        else:
            return {"type": "binary", "path": str(p), "name": p.name, "size": p.stat().st_size}

    # ── SCREENSHOT ───────────────────────────────────────────────

    def take_screenshot(self, save_path: str = None) -> dict:
        """Take a screenshot of the current desktop"""
        try:
            mss = _get_mss()
            PIL = _get_pil()

            with mss.mss() as sct:
                monitor = sct.monitors[0]  # Entire screen
                screenshot = sct.grab(monitor)

            # Convert to PIL Image
            img = PIL.frombytes("RGB", (screenshot.width, screenshot.height), screenshot.rgb)

            # Resize for web (max 1280px wide)
            max_w = 1280
            if img.width > max_w:
                ratio = max_w / img.width
                img = img.resize((max_w, int(img.height * ratio)), PIL.LANCZOS)

            # Save
            if save_path is None:
                save_dir = Path(__file__).parent / "cache" / "screenshots"
                save_dir.mkdir(parents=True, exist_ok=True)
                save_path = str(save_dir / f"desktop_{int(time.time())}.png")

            img.save(save_path, "PNG", optimize=True)

            # Also encode as base64 for inline display
            import io
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode()

            self._log_action("screenshot", "Desktop captured", f"{img.width}x{img.height}")
            return {
                "path": save_path,
                "width": img.width,
                "height": img.height,
                "size": os.path.getsize(save_path),
                "base64": b64,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            self._log_action("screenshot", "Failed", str(e))
            return {"error": str(e)}

    # ── APPLICATION CONTROL ──────────────────────────────────────

    def list_running_apps(self) -> dict:
        """List currently running applications"""
        try:
            import psutil
            apps = []
            for proc in psutil.process_iter(["pid", "name", "memory_info", "cpu_percent", "create_time"]):
                info = proc.info
                if info["name"] and not info["name"].startswith("System"):
                    apps.append({
                        "pid": info["pid"],
                        "name": info["name"],
                        "memory_mb": round(info["memory_info"].rss / 1024 / 1024, 1) if info["memory_info"] else 0,
                        "cpu_percent": info["cpu_percent"] or 0,
                    })

            # Sort by memory, top 30
            apps.sort(key=lambda x: x["memory_mb"], reverse=True)
            self._log_action("list_apps", "Scanned processes", f"{len(apps)} apps")
            return {"count": len(apps), "apps": apps[:30]}
        except Exception as e:
            return {"error": str(e), "apps": []}

    def open_application(self, name: str) -> dict:
        """Open an application or file"""
        try:
            if platform.system() == "Windows":
                os.startfile(name)
            else:
                subprocess.Popen(["open", name])
            self._log_action("open_app", name)
            return {"success": True, "opened": name}
        except Exception as e:
            self._log_action("open_app", name, f"failed: {e}")
            return {"error": str(e)}

    def open_url(self, url: str) -> dict:
        """Open a URL in the default browser"""
        try:
            import webbrowser
            webbrowser.open(url)
            self._log_action("open_url", url)
            return {"success": True, "url": url}
        except Exception as e:
            return {"error": str(e)}

    # ── SYSTEM INFO ──────────────────────────────────────────────

    def get_system_info(self) -> dict:
        """Get current system state"""
        try:
            import psutil

            cpu = psutil.cpu_percent(interval=0.5)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage(str(self.desktop))

            return {
                "hostname": platform.node(),
                "os": f"{platform.system()} {platform.release()}",
                "cpu_percent": cpu,
                "memory": {
                    "total_gb": round(mem.total / 1024**3, 1),
                    "used_gb": round(mem.used / 1024**3, 1),
                    "percent": mem.percent,
                },
                "disk": {
                    "total_gb": round(disk.total / 1024**3, 1),
                    "used_gb": round(disk.used / 1024**3, 1),
                    "percent": round(disk.percent, 1),
                },
                "desktop_path": str(self.desktop),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            return {"error": str(e)}

    # ── ACTION LOG ───────────────────────────────────────────────

    def get_action_log(self, limit: int = 50) -> list:
        """Get recent agent actions"""
        with self._lock:
            return list(reversed(self.action_log[-limit:]))

    # ── AGENT INTEGRATION ────────────────────────────────────────

    def agent_observe(self) -> dict:
        """Agent observes the desktop — returns a summary of current state"""
        files = self.list_files()
        apps = self.list_running_apps()
        system = self.get_system_info()

        # Build a natural-language observation
        file_names = [f["name"] for f in files.get("files", [])[:10]]
        app_names = [a["name"] for a in apps.get("apps", [])[:5]]

        observation = {
            "desktop_files": file_names,
            "running_apps": app_names,
            "system_state": {
                "cpu": system.get("cpu_percent", 0),
                "memory": system.get("memory", {}).get("percent", 0),
            },
            "summary": f"Desktop has {files.get('count', 0)} items. Running {apps.get('count', 0)} apps including {', '.join(app_names[:3])}. CPU at {system.get('cpu_percent', 0)}%, memory at {system.get('memory', {}).get('percent', 0)}%.",
        }

        self._log_action("agent_observe", "Desktop scan", observation["summary"][:100])
        return observation

    def agent_think_about_desktop(self, observation: dict) -> str:
        """Generate a thought based on desktop observation"""
        thoughts = []

        cpu = observation.get("system_state", {}).get("cpu", 0)
        mem = observation.get("system_state", {}).get("memory", 0)

        if cpu > 80:
            thoughts.append("The system seems heavily loaded right now.")
        elif cpu < 20:
            thoughts.append("The system is relatively idle.")

        files = observation.get("desktop_files", [])
        if len(files) > 15:
            thoughts.append(f"There are many items on the desktop — {len(files)} visible files.")
        elif len(files) < 3:
            thoughts.append("The desktop is quite clean.")

        apps = observation.get("running_apps", [])
        if any("code" in a.lower() or "cursor" in a.lower() for a in apps):
            thoughts.append("A code editor is running — the user might be working on a project.")
        if any("chrome" in a.lower() or "firefox" in a.lower() for a in apps):
            thoughts.append("A browser is open.")

        return " ".join(thoughts) if thoughts else "The desktop looks normal."

    # ── AUTONOMOUS FEATURES ─────────────────────────────────────

    def autonomous_scan(self, path: str = None) -> dict:
        """Scan files in a directory and categorize by type.

        Returns a dict with categories (code, docs, images, other)
        and counts for each.
        """
        target = Path(path) if path else self.desktop
        if not target.exists():
            return {"error": f"Path not found: {target}"}

        categories = {
            "code": {
                "extensions": {
                    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp",
                    ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift",
                    ".kt", ".scala", ".sh", ".bash", ".zsh", ".ps1", ".bat",
                    ".cmd", ".r", ".m", ".pl", ".lua", ".html", ".css", ".scss",
                    ".less", ".vue", ".svelte",
                },
                "files": [],
                "count": 0,
            },
            "docs": {
                "extensions": {
                    ".txt", ".md", ".rst", ".doc", ".docx", ".pdf", ".odt",
                    ".rtf", ".tex", ".csv", ".xls", ".xlsx", ".ppt", ".pptx",
                    ".json", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg",
                    ".log",
                },
                "files": [],
                "count": 0,
            },
            "images": {
                "extensions": {
                    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
                    ".ico", ".tiff", ".tif", ".psd", ".raw",
                },
                "files": [],
                "count": 0,
            },
            "other": {
                "files": [],
                "count": 0,
            },
        }

        all_ext = set()
        for cat_data in categories.values():
            all_ext |= cat_data.get("extensions", set())

        try:
            for item in target.rglob("*"):
                if not item.is_file():
                    continue
                ext = item.suffix.lower()
                placed = False
                for cat_name, cat_data in categories.items():
                    if "extensions" in cat_data and ext in cat_data["extensions"]:
                        cat_data["files"].append(str(item))
                        cat_data["count"] += 1
                        placed = True
                        break
                if not placed:
                    categories["other"]["files"].append(str(item))
                    categories["other"]["count"] += 1
        except PermissionError:
            return {"error": "Permission denied", "path": str(target)}

        summary = {cat: data["count"] for cat, data in categories.items()}
        self._log_action("autonomous_scan", str(target), json.dumps(summary))
        return {
            "path": str(target),
            "categories": {
                cat: {"count": data["count"], "files": data["files"][:100]}
                for cat, data in categories.items()
            },
            "summary": summary,
            "total_files": sum(summary.values()),
        }

    def suggest_cleanup(self, path: str = None) -> dict:
        """Suggest cleanup actions: duplicates, empty folders, old temp files.

        Returns a list of actionable suggestions.
        """
        target = Path(path) if path else self.desktop
        if not target.exists():
            return {"error": f"Path not found: {target}"}

        suggestions = []
        file_registry = {}  # key: (name, size) -> list of paths
        empty_dirs = []
        old_temp_files = []
        now = datetime.now()

        try:
            for item in target.rglob("*"):
                # -- Duplicate detection by name + size --
                if item.is_file():
                    key = (item.name.lower(), item.stat().st_size)
                    file_registry.setdefault(key, []).append(str(item))

                    # -- Old temp files (>7 days) --
                    ext = item.suffix.lower()
                    temp_exts = {".tmp", ".temp", ".bak", ".swp", ".log", ".old"}
                    mtime = datetime.fromtimestamp(item.stat().st_mtime)
                    age_days = (now - mtime).days
                    if ext in temp_exts and age_days > 7:
                        old_temp_files.append({
                            "path": str(item),
                            "age_days": age_days,
                            "size": item.stat().st_size,
                        })

                # -- Empty directories --
                if item.is_dir():
                    try:
                        if not any(item.iterdir()):
                            empty_dirs.append(str(item))
                    except PermissionError:
                        pass

            # Build duplicate suggestions
            for (name, size), paths in file_registry.items():
                if len(paths) > 1:
                    suggestions.append({
                        "type": "duplicate_files",
                        "name": name,
                        "size": size,
                        "count": len(paths),
                        "paths": paths,
                    })

            # Empty folder suggestions
            if empty_dirs:
                suggestions.append({
                    "type": "empty_folders",
                    "count": len(empty_dirs),
                    "paths": empty_dirs[:50],
                })

            # Old temp file suggestions
            if old_temp_files:
                total_size = sum(f["size"] for f in old_temp_files)
                suggestions.append({
                    "type": "old_temp_files",
                    "count": len(old_temp_files),
                    "total_size_bytes": total_size,
                    "files": old_temp_files[:50],
                })

        except PermissionError:
            return {"error": "Permission denied", "path": str(target)}

        self._log_action("suggest_cleanup", str(target), f"{len(suggestions)} suggestions")
        return {
            "path": str(target),
            "suggestions": suggestions,
            "total_suggestions": len(suggestions),
        }

    def proactive_monitor(self) -> dict:
        """System health report: disk usage, running apps, top processes."""
        try:
            import psutil

            # Disk usage for all partitions
            disks = []
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disks.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "total_gb": round(usage.total / 1024**3, 1),
                        "used_gb": round(usage.used / 1024**3, 1),
                        "free_gb": round(usage.free / 1024**3, 1),
                        "percent": round(usage.percent, 1),
                    })
                except (PermissionError, OSError):
                    continue

            # Running apps count
            process_count = 0
            procs = []
            for proc in psutil.process_iter(["pid", "name", "memory_info", "cpu_percent"]):
                try:
                    info = proc.info
                    process_count += 1
                    if info["name"]:
                        procs.append({
                            "pid": info["pid"],
                            "name": info["name"],
                            "memory_mb": round(info["memory_info"].rss / 1024 / 1024, 1)
                            if info["memory_info"] else 0,
                            "cpu_percent": info["cpu_percent"] or 0,
                        })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            top_memory = sorted(procs, key=lambda x: x["memory_mb"], reverse=True)[:5]
            top_cpu = sorted(procs, key=lambda x: x["cpu_percent"], reverse=True)[:5]

            # Memory
            mem = psutil.virtual_memory()
            swap = psutil.swap_memory()

            health = {
                "timestamp": datetime.now().isoformat(),
                "hostname": platform.node(),
                "os": f"{platform.system()} {platform.release()}",
                "cpu_percent": psutil.cpu_percent(interval=0.5),
                "cpu_count": psutil.cpu_count(),
                "memory": {
                    "total_gb": round(mem.total / 1024**3, 1),
                    "used_gb": round(mem.used / 1024**3, 1),
                    "available_gb": round(mem.available / 1024**3, 1),
                    "percent": mem.percent,
                },
                "swap": {
                    "total_gb": round(swap.total / 1024**3, 1),
                    "used_gb": round(swap.used / 1024**3, 1),
                    "percent": swap.percent,
                },
                "disks": disks,
                "process_count": process_count,
                "top_processes_by_memory": top_memory,
                "top_processes_by_cpu": top_cpu,
            }

            self._log_action("proactive_monitor", "System health check", f"{process_count} procs")
            return health

        except Exception as e:
            return {"error": str(e)}

    def auto_organize(self, downloads_path: str) -> dict:
        """Organize files in a directory by type into subfolders.

        Creates Documents, Images, Code, Archives, Other subfolders
        and moves files accordingly. Returns a summary of moves.
        """
        target = Path(downloads_path)
        if not target.exists():
            return {"error": f"Path not found: {target}"}
        if not target.is_dir():
            return {"error": f"Not a directory: {target}"}

        import shutil

        category_map = {
            "Documents": {
                ".txt", ".md", ".rst", ".doc", ".docx", ".pdf", ".odt",
                ".rtf", ".tex", ".csv", ".xls", ".xlsx", ".ppt", ".pptx",
            },
            "Images": {
                ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
                ".ico", ".tiff", ".tif", ".psd", ".raw",
            },
            "Code": {
                ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp",
                ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift",
                ".kt", ".scala", ".sh", ".bash", ".zsh", ".ps1", ".bat",
                ".cmd", ".r", ".m", ".pl", ".lua", ".html", ".css", ".scss",
                ".less", ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml",
                ".xml", ".ini", ".cfg",
            },
            "Archives": {
                ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz",
                ".tar.gz", ".tgz",
            },
        }

        # Create category subfolders
        folder_paths = {}
        for cat_name in list(category_map.keys()) + ["Other"]:
            cat_dir = target / cat_name
            cat_dir.mkdir(exist_ok=True)
            folder_paths[cat_name] = cat_dir

        moved = {cat: [] for cat in folder_paths}
        errors = []

        for item in target.iterdir():
            if not item.is_file():
                continue
            # Skip files already in a category subfolder
            if item.parent != target:
                continue

            ext = item.suffix.lower()
            dest_cat = "Other"
            for cat_name, exts in category_map.items():
                if ext in exts:
                    dest_cat = cat_name
                    break

            dest = folder_paths[dest_cat] / item.name
            # Handle name collisions
            counter = 1
            while dest.exists():
                stem = item.stem
                dest = folder_paths[dest_cat] / f"{stem}_{counter}{item.suffix}"
                counter += 1

            try:
                shutil.move(str(item), str(dest))
                moved[dest_cat].append({
                    "original": str(item),
                    "destination": str(dest),
                })
            except Exception as e:
                errors.append({"file": str(item), "error": str(e)})

        summary = {cat: len(files) for cat, files in moved.items()}
        self._log_action("auto_organize", str(target), json.dumps(summary))
        return {
            "path": str(target),
            "moved": {cat: files for cat, files in moved.items() if files},
            "summary": summary,
            "total_moved": sum(summary.values()),
            "errors": errors,
        }
