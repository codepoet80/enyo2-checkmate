#!/bin/bash

# Standalone script to fix JCenter shutdown issues in Cordova Android builds
# Run this if you encounter build errors related to JCenter or versioncompare

# Change to script directory
cd "$(dirname "$0")"

# Run the hook script
if [ -f "cordova-wrapper/hooks/after_platform_add/fix_jcenter.sh" ]; then
    bash cordova-wrapper/hooks/after_platform_add/fix_jcenter.sh
else
    echo "Error: Hook script not found!"
    echo "Expected: cordova-wrapper/hooks/after_platform_add/fix_jcenter.sh"
    exit 1
fi
