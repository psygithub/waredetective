#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# As this script is run as root (the default user), we can create directories and change ownership.
echo "Ensuring volume directories exist and have correct permissions..."
mkdir -p /app/data
mkdir -p /app/output
mkdir -p /app/config
chown -R nextjs:nodejs /app/data
chown -R nextjs:nodejs /app/output
chown -R nextjs:nodejs /app/config
echo "Permissions updated."

# Drop privileges and execute the main command as the 'nextjs' user.
echo "Executing command as 'nextjs' user: $@"
exec gosu nextjs "$@"
