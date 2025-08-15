#!/bin/bash

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
    cordova platform add android
    echo "Copying to Cordova..."
    cp -R $mydir/enyo-app/deploy/* $mydir/cordova-wrapper/www
    cd $mydir/cordova-wrapper
    echo "Building Cordova..."
    #echo "using args $argcordova"
    #read -p "Press key to continue.. " -n1 -s
    cordova build android $argcordova
    cp $mydir/cordova-wrapper/platforms/android/app/build/outputs/apk/debug/*.apk $mydir/bin/ 2>/dev/null
    cp $mydir/cordova-wrapper/platforms/android/app/build/outputs/bundle/release/*.aab $mydir/bin/ 2>/dev/null
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