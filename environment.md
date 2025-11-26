# Development Environment Setup

This guide describes how to set up a development environment for building Check Mate HD from a clean OS install. The build system requires different Java versions for different platforms and uses version managers to switch between them automatically.

## Overview

The build system supports three target platforms:
- **webOS/LuneOS**: Legacy HP/Palm devices (requires Java 8)
- **Android**: Modern Android devices (requires Java 17)
- **Web**: Browser-based deployment (requires Node.js only)

## Prerequisites

All platforms require:
- **Node.js 24.x LTS** (managed via nvm)
- **Java 8** for webOS builds
- **Java 17** for Android builds
- **Git** for version control

## Linux Setup

### 1. Install SDKMAN (Java Version Manager)

```bash
# Install SDKMAN
curl -s "https://get.sdkman.io" | bash

# Open a new terminal or source the init script
source "$HOME/.sdkman/bin/sdkman-init.sh"

# Verify installation
sdk version
```

### 2. Install Java Versions

**For webOS builds (Java 8):**

The build script prefers Oracle JDK 8 on Linux (palm-package tool compatibility). Download Oracle JDK 8 from Oracle's website and install to `/opt/jdk/jdk1.8.0_471` (or similar), or use SDKMAN as fallback:

```bash
# Option A: Install OpenJDK 8 via SDKMAN (fallback)
sdk install java 8.0.432-zulu

# Option B: Oracle JDK 8 (preferred)
# Download from Oracle and extract to /opt/jdk/jdk1.8.0_471
# The build script will automatically detect it
```

**For Android builds (Java 17):**

```bash
sdk install java 17.0.13-tem
```

### 3. Install nvm (Node Version Manager)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Open a new terminal or source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 24 LTS
nvm install --lts
nvm use --lts

# Verify
node --version  # Should show v24.x.x
```

### 4. Install Android SDK (for Android builds)

```bash
# Install Android command line tools
# Download from: https://developer.android.com/studio#command-tools

# Extract to a location like ~/Android/Sdk
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Install required SDK components
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# Add to ~/.bashrc or ~/.zshrc:
echo 'export ANDROID_HOME="$HOME/Android/Sdk"' >> ~/.bashrc
echo 'export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.bashrc
```

### 5. Install webOS SDK (for webOS builds)

```bash
# Download webOS SDK from webOS Archive
# Follow webOS SDK installation instructions for palm-package tool
# Ensure palm-package is in your PATH
```

### 6. Install Project Dependencies

```bash
cd enyo2-checkmate/cordova-wrapper
npm install
cd ..
```

## macOS Setup

### 1. Install Homebrew (if not already installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install SDKMAN (Java Version Manager)

```bash
# Install SDKMAN
curl -s "https://get.sdkman.io" | bash

# Open a new terminal or source the init script
source "$HOME/.sdkman/bin/sdkman-init.sh"

# Verify installation
sdk version
```

### 3. Install Java Versions

**For webOS builds (Java 8):**

On macOS, the build script prefers system-installed JDKs (via `/usr/libexec/java_home`) over SDKMAN for Java 8, as they work better with palm-package:

```bash
# Option A: Install via SDKMAN (works, but system JDK preferred)
sdk install java 8.0.432-zulu

# Option B: Install system JDK 8 (preferred)
# Download JDK 8 from Oracle or Adoptium
# Install to /Library/Java/JavaVirtualMachines/
# The build script will detect it via java_home utility
```

**For Android builds (Java 17):**

```bash
sdk install java 17.0.13-tem
```

### 4. Install nvm (Node Version Manager)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Open a new terminal or source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 24 LTS
nvm install --lts
nvm use --lts

# Verify
node --version  # Should show v24.x.x
```

### 5. Install Android SDK (for Android builds)

```bash
# Install via Homebrew
brew install android-commandlinetools

# Or download manually from:
# https://developer.android.com/studio#command-tools

# Set up environment
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Install required SDK components
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# Add to ~/.zshrc (or ~/.bash_profile):
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
echo 'export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.zshrc
```

### 6. Install webOS SDK (for webOS builds)

```bash
# Download webOS SDK from webOS Archive
# Follow webOS SDK installation instructions for palm-package tool
# Ensure palm-package is in your PATH
```

### 7. Install Project Dependencies

```bash
cd enyo2-checkmate/cordova-wrapper
npm install
cd ..
```

## Windows Setup

**Note**: The build script (`build.sh`) is a Bash script designed for Linux and macOS. To build on Windows, you have two options:

### Option 1: Windows Subsystem for Linux (WSL) - Recommended

Install WSL2 with Ubuntu and follow the Linux setup instructions above:

```powershell
# In PowerShell (Administrator)
wsl --install
```

After installation, launch Ubuntu from the Start menu and follow the Linux setup steps.

### Option 2: Git Bash / MSYS2

Install Git for Windows (includes Git Bash) or MSYS2, then follow Linux-style setup:

1. Install Git for Windows: https://git-scm.com/download/win
2. Install SDKMAN, nvm, and Java as described in Linux section
3. Install Android SDK for Windows
4. Note: webOS builds may have limited support on Windows

## Verification

After setup, verify your environment:

```bash
# Check Node.js
node --version     # Should show v24.x.x
npm --version

# Check SDKMAN and Java installations
sdk version
sdk list java | grep installed

# Check Java 8 (for webOS)
sdk use java 8.0.432-zulu
java -version      # Should show 1.8.0_432

# Check Java 17 (for Android)
sdk use java 17.0.13-tem
java -version      # Should show 17.0.13

# Check Android SDK (if building for Android)
echo $ANDROID_HOME
sdkmanager --list | grep "build-tools;35"

# Check webOS SDK (if building for webOS)
which palm-package
```

## Environment Variables Summary

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.bash_profile`):

```bash
# nvm (usually added automatically by nvm installer)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# SDKMAN (usually added automatically by SDKMAN installer)
export SDKMAN_DIR="$HOME/.sdkman"
[ -s "$SDKMAN_DIR/bin/sdkman-init.sh" ] && source "$SDKMAN_DIR/bin/sdkman-init.sh"

# Android SDK (adjust path as needed)
# Linux:
export ANDROID_HOME="$HOME/Android/Sdk"
# macOS:
# export ANDROID_HOME="$HOME/Library/Android/sdk"

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

## Building the Project

Once your environment is set up, you can build for any platform:

```bash
# Build for web only
./build.sh www

# Build for Android only
./build.sh android

# Build for webOS only
./build.sh webos

# Build for multiple platforms
./build.sh webos android www

# Clean build artifacts
./build.sh clean
```

**Note**: The build script automatically switches between Java versions as needed. You don't need to manually change Java versions between builds.

## How Java Version Switching Works

The build script automatically manages Java versions:

1. **webOS builds**: Automatically uses Java 8
   - Linux: Uses Oracle JDK at `/opt/jdk/jdk1.8.0_471` if available, otherwise SDKMAN
   - macOS: Uses system JDK via `java_home` utility if available, otherwise SDKMAN

2. **Android builds**: Automatically uses Java 17 from SDKMAN

3. **Node.js**: Always uses the nvm-managed LTS version across all builds

You can verify which versions the build script detects by running a build and observing the output:

```bash
./build.sh webos android
# Output will show:
# "Using Oracle JDK 8 for webOS (Linux)..." or
# "Found Java via java_home utility" (macOS) or
# "Using SDKMAN Java at..."
# "Switching to Java 17.0.13-tem..."
```

## Troubleshooting

### "java not installed" error on webOS build

**Linux**: Ensure Oracle JDK 8 is installed at `/opt/jdk/jdk1.8.0_471` or install via SDKMAN:
```bash
sdk install java 8.0.432-zulu
```

**macOS**: Ensure you have a JDK 8 installed that `java_home` can find:
```bash
/usr/libexec/java_home -V
```

### "Dependency requires at least JVM runtime version 11" on Android build

The build script didn't successfully switch to Java 17. Verify installation:
```bash
ls -la ~/.sdkman/candidates/java/ | grep 17
```

Install if missing:
```bash
sdk install java 17.0.13-tem
```

### "Unexpected token '??='" error

Node.js version is too old. Ensure nvm is using the LTS version:
```bash
nvm install --lts
nvm use --lts
node --version  # Should be v24.x.x
```

### Build script shows wrong Java version

The script automatically switches versions. If it fails to switch:
- Verify SDKMAN is properly initialized in your shell
- Check that the requested Java version is installed: `sdk list java | grep installed`
- Try running in a fresh terminal session

### Android SDK not found

Verify ANDROID_HOME is set:
```bash
echo $ANDROID_HOME
ls -la $ANDROID_HOME
```

If not set, add to your shell profile and restart terminal.

## Next Steps

After setting up your environment:

1. Review the main [README.md](./README.md) for project documentation
2. Check [CLAUDE.md](./CLAUDE.md) for development guidelines
3. Run `./build.sh www` for a quick test build
4. See [UPGRADE.md](./UPGRADE.md) for details on the recent modernization

## Additional Resources

- **SDKMAN**: https://sdkman.io/
- **nvm**: https://github.com/nvm-sh/nvm
- **Android SDK**: https://developer.android.com/studio#command-tools
- **webOS Archive**: https://webosarchive.org/
- **Cordova**: https://cordova.apache.org/
