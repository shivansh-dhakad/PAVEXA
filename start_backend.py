"""
start_backend.py
Convenience script to launch the FastAPI backend from the project root.

Usage:
    python start_backend.py

Or with auto-reload for development:
    uvicorn ml_service.main:app --reload --port 8000
"""
import subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).parent
cmd = [
    sys.executable, "-m", "uvicorn",
    "ml_service.main:app",
    "--host", "0.0.0.0",
    "--port", "8000",
    "--reload",
]
print("Starting PAVEXA backend…")
print(" ".join(cmd))
subprocess.run(cmd, cwd=str(ROOT))
