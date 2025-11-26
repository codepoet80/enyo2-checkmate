## What is This?

<img src="https://raw.githubusercontent.com/codepoet80/enyo2-checkmate/main/enyo-app/icon.png">

This is a cross-platform app for my [Check Mate To Do List](https://github.com/codepoet80/checkmate-service) service. 

This was built to work on a variety of devices by using [EnyoJS](https://github.com/codepoet80/enyo2), starting from a [Bootplate](https://github.com/codepoet80/enyo2-bootplate).

EnyoJS (Enyo2) was a Javascript toolkit that evolved out of Palm/HPs webOS mobile platform. I built this as a way to explore creating apps that will work on both old and new devices -- something that the Check Mate service has done since I first made it (it even works on OpenStep, Classic MacOS and Windows 95!)

## Releases

You can find the app for webOS in the [App Museum](http://appcatalog.webosarchive.org), and download Android builds from GitHub. You can also use this app (or the retro-friendly version) in virtually any web browser at [http://checkmate.wosa.link](http://checkmate.wosa.link).

If none of those options work for you, find binaries and a web-hostable zip periodically updated in the Release section of this repo, or pull the repo and build from source.

## Dependencies

Read [environment.md](environment.md) for details about the modernized build system.

You will need to get the webOS SDK working. Details are at [sdk.webosarchive.org](http://sdk.webosarchive.org).

## Building

This app is based on [Enyo2](http://sdk.webosarchive.org), a legacy Javascript framework originally for webOS, and the [enyo2-bootplate](https://github.com/webosarchive/enyo2-bootplate) from webOS Archive.

You create your app by modifying and updating the contents of the `enyo-app` folder.

The build script will help you build the app for different platforms. You specify which platforms to build for with command line arguments to the build script.

Ensure the script is executable: `chmod +x build.sh`

Call the script, passing a list of the platforms you want to build, with a space between each one:

`./build.sh webos www android`

If you prefer to be in control, check out the other docs in this folder for platform-specific details.

## Why

Aside from being a fan of retro platforms, including webOS, the author thinks consumers have lost out now that the smart phone ecosystem has devolved into a duopoly. Apple and Google take turns copying each other, and consumers line up to buy basically the same new phone every year. The era when webOS, Blackberry and Windows Phone were serious competitors was marked by creativity in form factor and software development, which has been lost. This app represents a (futile) attempt to keep webOS mobile devices useful for as long as possible.

The website [http://www.webosarchive.org](http://www.webosarchive.org) recovers, archives and maintains material related to development, and hosts services that restore functionality to webOS devices. A small but active community of users take advantage of these services to keep their retro devices alive.
