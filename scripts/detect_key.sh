#!/bin/bash
# Wrapper to find the right python3 (with numpy) and run detect_key.py
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Expand PATH for Electron's limited environment
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Source shell profile to pick up pyenv, conda, etc.
for RC in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  [ -f "$RC" ] && source "$RC" 2>/dev/null || true
done

# Try each Python in its native architecture — no arch forcing.
# This works whether Python is arm64 (Homebrew) or x86_64 (Python.framework via Rosetta).
for PY in \
  /opt/homebrew/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.14/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
  /usr/local/bin/python3 \
  /usr/bin/python3 \
  "$HOME/.pyenv/shims/python3" \
  "$HOME/Library/Python/3.12/bin/python3" \
  "$HOME/Library/Python/3.11/bin/python3" \
  "$HOME/Library/Python/3.10/bin/python3" \
  python3; do
  if [ -f "$PY" ] || command -v "$PY" >/dev/null 2>&1; then
    if "$PY" -c "import numpy; numpy.array([1.0])" >/dev/null 2>&1; then
      exec "$PY" "$SCRIPT_DIR/detect_key.py" "$@"
    fi
  fi
done

# Try installing numpy automatically, then re-test before exec
for PY in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 python3; do
  if [ -f "$PY" ] || command -v "$PY" >/dev/null 2>&1; then
    "$PY" -m pip install --force-reinstall numpy --break-system-packages -q 2>/dev/null
    if "$PY" -c "import numpy; numpy.array([1.0])" >/dev/null 2>&1; then
      exec "$PY" "$SCRIPT_DIR/detect_key.py" "$@"
    fi
  fi
done

echo '{"error":"No python3 with numpy found. Run: pip3 install numpy --break-system-packages"}'
exit 1
