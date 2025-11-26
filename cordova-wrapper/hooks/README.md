# Cordova Hooks

This directory contains Cordova hooks that run automatically during the build process.

## after_platform_add/fix_jcenter.sh

**Purpose:** Fixes JCenter repository shutdown issues in Cordova-Android builds.

**When it runs:** Automatically after `cordova platform add android`

**What it does:**
- Migrates repository configurations from JCenter to Maven Central
- Updates versioncompare dependency to Maven Central version
- Disables bintray publishing plugin (not needed for building)
- Sets compatible Android Build Tools version

**Manual execution:**
```bash
# From project root
./fix-android-build.sh

# Or directly
bash cordova-wrapper/hooks/after_platform_add/fix_jcenter.sh
```

## Background

JCenter (bintray.com) was shut down in 2021, but Cordova-Android 9.x still references dependencies hosted there. This hook ensures builds work on fresh clones without manual intervention.

For more details, see the "Android Build Troubleshooting" section in the main CLAUDE.md file.
