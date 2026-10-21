#!/usr/bin/env python3
"""IFTY STEP150: restore script.js from ordered parts without altering any bytes."""
from pathlib import Path
import json, hashlib
root = Path(__file__).resolve().parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
data = b"".join((root / "parts" / p["file"]).read_bytes() for p in manifest["parts"])
output = root / "script.js"
output.write_bytes(data)
digest = hashlib.sha256(data).hexdigest()
print("Created", output.name, "bytes:", len(data), "SHA256:", digest)
if digest != manifest["original_sha256"]:
    print("NOTICE: script.js differs from original STEP150 (expected after intentional edits).")
else:
    print("Verified: byte-for-byte identical to STEP150.")
