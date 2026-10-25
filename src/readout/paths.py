"""Where readout keeps its data. The mod (hooks/register.tsx) resolves the same default."""

import os
from pathlib import Path


def data_dir():
    """READOUT_DIR, else ~/.claude/readout; read on every call so a process can redirect it."""
    return Path(os.environ.get("READOUT_DIR") or Path.home() / ".claude" / "readout")
