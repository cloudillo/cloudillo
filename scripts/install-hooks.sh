#!/bin/bash

# Install git hooks for the project

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
PRE_COMMIT="$HOOKS_DIR/pre-commit"

echo "Installing git hooks..."

cat > "$PRE_COMMIT" << 'EOF'
#!/bin/bash

echo "Running format check..."

if ! pnpm format:check; then
    echo ""
    echo "Format check failed. Please run 'pnpm format' to fix formatting issues."
    exit 1
fi
EOF

chmod +x "$PRE_COMMIT"

echo "Pre-commit hook installed successfully."
