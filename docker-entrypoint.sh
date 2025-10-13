#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# As this script is run as root (the default user), we can change ownership.
echo "Updating permissions for volume directories..."
chown -R nextjs:nodejs /app/data
chown -R nextjs:nodejs /app/output
chown -R nextjs:nodejs /app/config
echo "Permissions updated."

# Drop privileges and execute the main command as the 'nextjs' user.
echo "Executing command as 'nextjs' user: $@"
exec gosu nextjs "$@"
