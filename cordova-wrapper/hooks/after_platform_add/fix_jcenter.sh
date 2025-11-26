#!/bin/bash

# Fix JCenter shutdown issues in Cordova Android builds
# This script patches the Android platform files to use Maven Central instead of JCenter
# and applies other compatibility fixes for legacy Cordova projects.

echo "Applying JCenter migration fixes..."

CORDOVA_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd ../.. && pwd )"
ANDROID_PLATFORM="$CORDOVA_DIR/platforms/android"
NODE_MODULES="$CORDOVA_DIR/node_modules/cordova-android"

# Only run for Android platform
if [ ! -d "$ANDROID_PLATFORM" ]; then
    echo "Android platform not found, skipping JCenter fixes"
    exit 0
fi

echo "Fixing repository configurations..."

# Fix 1: Add mavenCentral() to all repositories.gradle files
for file in \
    "$ANDROID_PLATFORM/repositories.gradle" \
    "$ANDROID_PLATFORM/CordovaLib/repositories.gradle" \
    "$ANDROID_PLATFORM/app/repositories.gradle" \
    "$NODE_MODULES/bin/templates/project/repositories.gradle" \
    "$NODE_MODULES/bin/templates/project/app/repositories.gradle" \
    "$NODE_MODULES/framework/repositories.gradle"
do
    if [ -f "$file" ]; then
        # Check if mavenCentral() is already present
        if ! grep -q "mavenCentral()" "$file"; then
            # Add mavenCentral() before google()
            sed -i.bak 's/google()/mavenCentral()\n    google()/' "$file"
            echo "  ✓ Updated: $file"
        fi
    fi
done

echo "Fixing versioncompare dependency..."

# Fix 2: Update versioncompare dependency in cordova.gradle
for file in \
    "$ANDROID_PLATFORM/CordovaLib/cordova.gradle" \
    "$NODE_MODULES/framework/cordova.gradle"
do
    if [ -f "$file" ]; then
        # Update import statement
        sed -i.bak 's/import com\.g00fy2\.versioncompare\.Version/import io.github.g00fy2.versioncompare.Version/' "$file"

        # Update dependency and add mavenCentral to buildscript
        sed -i.bak "s/classpath 'com\.g00fy2:versioncompare:1\.3\.4@jar'/classpath 'io.github.g00fy2:versioncompare:1.5.0'/" "$file"
        sed -i.bak '/buildscript {/,/repositories {/ { /repositories {/a\
        mavenCentral()
}' "$file"

        echo "  ✓ Updated: $file"
    fi
done

echo "Disabling bintray plugin..."

# Fix 3: Comment out bintray plugin in CordovaLib build.gradle
for file in \
    "$ANDROID_PLATFORM/CordovaLib/build.gradle" \
    "$NODE_MODULES/framework/build.gradle"
do
    if [ -f "$file" ]; then
        # Comment out bintray classpath
        sed -i.bak "s/classpath 'com\.jfrog\.bintray\.gradle:gradle-bintray-plugin:1\.7\.3'/\/\/ Disabled: JCenter shutdown - classpath 'com.jfrog.bintray.gradle:gradle-bintray-plugin:1.7.3'/" "$file"

        # Comment out bintray plugin
        sed -i.bak "s/apply plugin: 'com\.jfrog\.bintray'/\/\/ Disabled: JCenter shutdown - apply plugin: 'com.jfrog.bintray'/" "$file"

        echo "  ✓ Updated: $file"
    fi
done

echo "Setting build tools version..."

# Fix 4: Set compatible build tools version in gradle.properties
GRADLE_PROPS="$ANDROID_PLATFORM/gradle.properties"
if [ -f "$GRADLE_PROPS" ]; then
    if ! grep -q "cdvBuildToolsVersion" "$GRADLE_PROPS"; then
        echo "cdvBuildToolsVersion=30.0.3" >> "$GRADLE_PROPS"
        echo "  ✓ Added cdvBuildToolsVersion to gradle.properties"
    fi
fi

# Fix 5: Update CordovaLib build.gradle to respect build tools override
for file in \
    "$ANDROID_PLATFORM/CordovaLib/build.gradle" \
    "$NODE_MODULES/framework/build.gradle"
do
    if [ -f "$file" ]; then
        # Check if already patched
        if ! grep -q "project.hasProperty('cdvBuildToolsVersion')" "$file"; then
            # Replace the line that sets cdvBuildToolsVersion
            sed -i.bak '/cdvBuildToolsVersion = privateHelpers\.findLatestInstalledBuildTools()/c\
    if (project.hasProperty('\''cdvBuildToolsVersion'\'')) {\
        cdvBuildToolsVersion = cdvBuildToolsVersion\
        println '\''[Cordova] cdvBuildToolsVersion is overridden to '\'' + cdvBuildToolsVersion\
    } else {\
        cdvBuildToolsVersion = privateHelpers.findLatestInstalledBuildTools()\
    }' "$file"
            echo "  ✓ Updated: $file"
        fi
    fi
done

# Clean up backup files
find "$ANDROID_PLATFORM" -name "*.bak" -delete 2>/dev/null
find "$NODE_MODULES" -name "*.bak" -delete 2>/dev/null

echo "✓ JCenter migration fixes applied successfully!"
echo ""
echo "Note: These fixes address:"
echo "  - JCenter repository shutdown (migrated to Maven Central)"
echo "  - versioncompare dependency update (1.3.4 -> 1.5.0)"
echo "  - Bintray publishing plugin removal"
echo "  - Build tools version compatibility"
