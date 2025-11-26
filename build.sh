#!/bin/bash

# Load SDKMAN for Java 17
if [ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
    source "$HOME/.sdkman/bin/sdkman-init.sh"
    sdk use java 17.0.13-tem > /dev/null 2>&1 || echo "Warning: Could not load Java 17"
fi

# Load nvm and use LTS Node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use --lts > /dev/null 2>&1 || echo "Warning: nvm not available, using system Node"

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