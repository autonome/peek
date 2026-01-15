#!/bin/bash
# Wrapper script that times any command and shows duration at the end
# Usage: ./scripts/timed.sh <command> [args...]
#
# Example: ./scripts/timed.sh yarn build
# Output: [command output]
#         ⏱ 2.34s

start=$(date +%s.%N)

# Run the command
"$@"
exit_code=$?

end=$(date +%s.%N)

# Calculate duration (using bc for floating point, with fallback)
if command -v bc &> /dev/null; then
  duration=$(echo "$end - $start" | bc)
else
  # Fallback to integer seconds if bc not available
  duration=$((${end%.*} - ${start%.*}))
fi

# Format output nicely
printf '\n⏱ %ss\n' "$duration"

exit $exit_code
