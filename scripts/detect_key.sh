#!/bin/bash
# Wrapper to find the right python3 (with numpy) and run detect_key.py
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Expand PATH for Electron's limited environment
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Source shell profile to pick up pyenv, conda, etc.
for RC in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  [ -f "$RC" ] && source "$RC" 2>/dev/null || true
done

# On Apple Silicon, Electron runs arm64. Force Python to also run arm64
# so it loads the arm64 numpy. Using an array avoids word-splitting bugs.
MACHINE="$(uname -m)"
if [ "$MACHINE" = "arm64" ] && command -v arch >/dev/null 2>&1; then
  ARCH=(arch -arm64)
else
  ARCH=()
fi

# Try known Python locations in order of preference
for PY in \
  /Library/Frameworks/Python.framework/Versions/3.14/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
  /opt/homebrew/bin/python3 \
  /usr/local/bin/python3 \
  /usr/bin/python3 \
  "$HOME/.pyenv/shims/python3" \
  "$HOME/Library/Python/3.12/bin/python3" \
  "$HOME/Library/Python/3.11/bin/python3" \
  "$HOME/Library/Python/3.10/bin/python3" \
  python3; do
  if [ -f "$PY" ] || command -v "$PY" >/dev/null 2>&1; then
    if "${ARCH[@]}" "$PY" -c "import numpy; numpy.array([1.0])" >/dev/null 2>&1; then
      exec "${ARCH[@]}" "$PY" "$SCRIPT_DIR/detect_key.py" "$@"
    fi
  fi
done

# Try installing numpy automatically — respects ARCH array
for PY in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 python3; do
  if [ -f "$PY" ] || command -v "$PY" >/dev/null 2>&1; then
    "${ARCH[@]}" "$PY" -m pip install numpy --break-system-packages -q 2>&1 && \
      exec "${ARCH[@]}" "$PY" "$SCRIPT_DIR/detect_key.py" "$@"
  fi
done

echo '{"error":"No python3 with numpy found. Run: arch -arm64 pip3 install numpy --break-system-packages"}'
exit 1
