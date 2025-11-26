#!/bin/bash

# Detect operating system
OS_TYPE=$(uname -s)

# Save original PATH before any modifications
ORIGINAL_PATH="$PATH"

# Load SDKMAN for Java version management
SDKMAN_AVAILABLE=0
if [ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
    source "$HOME/.sdkman/bin/sdkman-init.sh"
    SDKMAN_AVAILABLE=1
fi

# Load nvm and use LTS Node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use --lts > /dev/null 2>&1 || echo "Warning: nvm not available, using system Node"

# Save the Node.js path after nvm is loaded (so we can preserve it during Java switches)
NVM_NODE_PATH=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN=$(command -v node)
    NVM_NODE_PATH=$(dirname "$NODE_BIN")
fi

# Function to switch Java version
switch_java_version() {
    local version=$1
    local java_major=$(echo $version | cut -d. -f1)

    echo "Switching to Java $version (major: $java_major)..."

    # Reset PATH to original to avoid accumulating Java paths
    export PATH="$ORIGINAL_PATH"

    # Restore nvm Node.js to PATH if it was loaded (to avoid reverting to old system Node)
    if [ -n "$NVM_NODE_PATH" ]; then
        export PATH="$NVM_NODE_PATH:$PATH"
    fi

    # On macOS with Java 8, prefer java_home utility over SDKMAN
    # (palm-package works better with system JDKs than SDKMAN OpenJDK)
    if [ "$OS_TYPE" = "Darwin" ] && [ "$java_major" = "8" ] && [ -x "/usr/libexec/java_home" ]; then
        echo "Trying macOS java_home utility for Java 8 (preferred for webOS builds)..."

        detected_java_home=$(/usr/libexec/java_home -v "1.8" 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$detected_java_home" ] && [ -d "$detected_java_home" ]; then
            export JAVA_HOME="$detected_java_home"
            export PATH="$JAVA_HOME/bin:$PATH"
            echo "Found Java via java_home utility"
            echo "JAVA_HOME=$JAVA_HOME"
            echo "Java version: $(java -version 2>&1 | head -1)"
            return 0
        else
            echo "java_home could not find Java 8, trying SDKMAN..."
        fi
    fi

    # Try SDKMAN candidate path (works on both Linux and macOS)
    if [ $SDKMAN_AVAILABLE -eq 1 ] && [ -d "$HOME/.sdkman/candidates/java/$version" ]; then
        export JAVA_HOME="$HOME/.sdkman/candidates/java/$version"
        export PATH="$JAVA_HOME/bin:$PATH"
        echo "Using SDKMAN Java at $JAVA_HOME"
        echo "Java version: $(java -version 2>&1 | head -1)"
        return 0
    fi

    # On macOS (for non-Java-8), try java_home utility for system JDKs
    if [ "$OS_TYPE" = "Darwin" ] && [ -x "/usr/libexec/java_home" ]; then
        echo "SDKMAN version not found, trying macOS java_home utility for Java $java_major..."

        # Map major version to java_home version string
        if [ "$java_major" = "8" ]; then
            java_home_version="1.8"
        else
            java_home_version="$java_major"
        fi

        # Try to find the requested Java version
        detected_java_home=$(/usr/libexec/java_home -v "$java_home_version" 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$detected_java_home" ] && [ -d "$detected_java_home" ]; then
            export JAVA_HOME="$detected_java_home"
            export PATH="$JAVA_HOME/bin:$PATH"
            echo "Found Java via java_home utility"
            echo "JAVA_HOME=$JAVA_HOME"
            echo "Java version: $(java -version 2>&1 | head -1)"
            return 0
        else
            echo "java_home could not find Java $java_major"
        fi
    fi

    echo "ERROR: Could not find Java $version"

    # Show debugging info
    echo ""
    echo "Debug information:"
    echo "  SDKMAN_AVAILABLE=$SDKMAN_AVAILABLE"
    if [ $SDKMAN_AVAILABLE -eq 1 ]; then
        echo "  Checked path: $HOME/.sdkman/candidates/java/$version"
        echo "  Path exists: $([ -d "$HOME/.sdkman/candidates/java/$version" ] && echo 'yes' || echo 'no')"
        echo ""
        echo "  Available SDKMAN Java versions:"
        if [ -d "$HOME/.sdkman/candidates/java" ]; then
            ls -1 "$HOME/.sdkman/candidates/java" | grep "^[0-9]" | head -10
        else
            echo "    SDKMAN java directory not found"
        fi
    fi

    if [ "$OS_TYPE" = "Darwin" ]; then
        echo ""
        echo "  System Java installations (via java_home):"
        /usr/libexec/java_home -V 2>&1 | grep -v "^Matching" || echo "    None found"
    fi

    echo ""
    if [ $SDKMAN_AVAILABLE -eq 1 ]; then
        echo "To install: sdk install java $version"
    else
        echo "Please install JDK $java_major or install SDKMAN"
    fi
    echo "Current Java (if any): $(java -version 2>&1 | head -1 || echo 'none found')"
    return 1
}

mydir=$(cd `dirname $0` && pwd)
mkdir -p $mydir/bin/

if [ "$1" = "clean" ]; then
    echo -n "Cleaning up..."
    rm -rf $mydir/bin/*
    rm -rf $mydir/enyo-app/deploy/*
    rm -rf $mydir/enyo-app/build/*
    rm -rf $mydir/cordova-wrapper/www/*
    echo "Done!"
    exit
fi

www=0
webOS=0
android=0
verbose=
argcordova=
for arg in "$@"; do
    if [ "$arg" = "webos" ]; then
        webOS=1
    fi
    if [ "$arg" = "luneos" ]; then
        webOS=1
    fi
    if [ "$arg" = "android" ]; then
        android=1
    fi
    if [ "$arg" = "www" ]; then
        www=1
    fi
    if [ "$arg" = "web" ]; then
        www=1
    fi
    if [ "$arg" = "-v" ]; then
        verbose="-v"
    fi
    if [ "$arg" = "--release" ]; then
    echo "adding release flag"
        argcordova="$argcordova--release "
    fi
    if [ "$arg" = "--prod" ]; then
    echo "adding prod flag"
        argcordova="$argcordova--prod "
    fi
done

if [[ $www -eq 0 ]] && [[ $webOS -eq 0 ]] && [[ $android -eq 0 ]] ; then
    echo "No build target specified"
    echo "Allowed: webos luneos www android"
    echo "(or any combination)"
    echo "Or to clean-up all build folders, you can pass: clean"
    exit
fi

if [ $webOS -eq 1 ]; then
    echo "Building for LuneOS/webOS..."
    # webOS requires Java 8

    # On Linux, check for Oracle JDK first (palm-package prefers it)
    if [ "$OS_TYPE" = "Linux" ] && [ -d "/opt/jdk/jdk1.8.0_471" ]; then
        echo "Using Oracle JDK 8 for webOS (Linux)..."
        # Reset PATH to original to avoid accumulating Java paths
        export PATH="$ORIGINAL_PATH"
        # Restore nvm Node.js to PATH if it was loaded
        if [ -n "$NVM_NODE_PATH" ]; then
            export PATH="$NVM_NODE_PATH:$PATH"
        fi
        export JAVA_HOME="/opt/jdk/jdk1.8.0_471"
        export PATH="$JAVA_HOME/bin:$PATH"
        echo "JAVA_HOME=$JAVA_HOME"
        echo "Using Java $(java -version 2>&1 | head -1)"
    else
        # On macOS and other systems, use switch_java_version
        # which will use java_home utility on macOS or SDKMAN elsewhere
        switch_java_version "8.0.432-zulu"
    fi
    rm -rf $mydir/bin/*.ipk
    rm -rf $mydir/bin/www/*
    #swap in old cordova
    cp -f $mydir/cordova-webos.js $mydir/enyo-app/cordova.js
    #build
    $mydir/enyo-app/tools/deploy.sh -w $verbose
    #stub out old cordova
    echo "/* For backward compatibility with webOS, do not delete */" > $mydir/enyo-app/cordova.js
    cp -f $mydir/enyo-app/cordova.js $mydir/enyo-app/deploy/cordova.js
    #copy build output
    mv -f $mydir/enyo-app/deploy/bin/*.ipk $mydir/bin
else
    echo "Building for www..."
    $mydir/enyo-app/tools/deploy.sh $verbose
fi

if [ $android -eq 1 ]; then
    echo "Building for Android..."
    # Android requires Java 17
    switch_java_version "17.0.13-tem"
    rm -rf $mydir/bin/*.apk
    rm -rf $mydir/bin/*.aab
    dirname=$mydir/cordova-wrapper
    cd $mydir/cordova-wrapper
    mkdir -p $mydir/cordova-wrapper/www
    rm -rf $mydir/cordova-wrapper/www/*

    # Copy icons first so they're available during platform add
    echo "Copying icons to Cordova www..."
    cp $mydir/enyo-app/icon.png $mydir/cordova-wrapper/www/
    cp $mydir/enyo-app/icon-256.png $mydir/cordova-wrapper/www/

    # Remove old Android platform if it exists
    if [ -d "platforms/android" ]; then
        echo "Removing old Android platform..."
        npx cordova platform remove android
    fi

    echo "Adding Android platform..."
    npx cordova platform add android

    echo "Copying to Cordova..."
    cp -R $mydir/enyo-app/deploy/* $mydir/cordova-wrapper/www
    cd $mydir/cordova-wrapper
    echo "Building Cordova..."
    #echo "using args $argcordova"
    #read -p "Press key to continue.. " -n1 -s
    npx cordova build android $argcordova

    # Extract app name from package.json and rename APK
    appname=$(grep '"name"' $mydir/cordova-wrapper/package.json | head -1 | sed 's/.*"name": *"\([^"]*\)".*/\1/')
    cp $mydir/cordova-wrapper/platforms/android/app/build/outputs/apk/debug/*.apk $mydir/bin/${appname}-debug.apk 2>/dev/null
    cp $mydir/cordova-wrapper/platforms/android/app/build/outputs/bundle/release/*.aab $mydir/bin/${appname}-debug.aab 2>/dev/null

fi

echo "Cleaning up..."
if [ $www -eq 1 ]; then
    mkdir -p $mydir/bin/www
    cp -R $mydir/enyo-app/deploy/* $mydir/bin/www/
else
    rm -rf $mydir/bin/www
fi
rm -rf $mydir/enyo-app/deploy/*
rm -rf $mydir/enyo-app/build/*

echo
echo "Build output at: $mydir/bin/"
ls $mydir/bin/

#read -p "Press key to continue.. " -n1 -s