# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cross-platform to-do list application called "Check Mate HD" built with EnyoJS 2, designed to work on legacy webOS devices, LuneOS, Android, and modern web browsers. The project is part of the webOS Archive ecosystem and maintains compatibility with retro devices.

## Build Commands

The project uses a custom shell-based build system with platform-specific targets:

- **Build for multiple platforms**: `./build.sh webos www android`
- **Build for specific platform**: `./build.sh webos` (or `luneos`, `www`, `web`, `android`)
- **Clean build artifacts**: `./build.sh clean`
- **Development server**: `grunt serve` (runs on port 8282)
- **Lint code**: `grunt jshint`

Additional build flags:
- `--release`: Build release version for mobile platforms
- `--prod`: Production build
- `-v`: Verbose output

## Build Requirements (Updated 2025)

The project has been upgraded to modern tooling while maintaining backward compatibility with legacy webOS targets:

### Required Software:
- **Node.js**: v24.11.1 LTS (managed via nvm)
- **Java**: JDK 17 or higher (managed via SDKMAN)
- **Cordova**: 13.0.0+ (now installed locally via npm)
- **cordova-android**: 14.0.1 (supports Android 12+ / API level 35)
- **Android SDK Build Tools**: 35.0.0
- **webOS SDK**: For legacy webOS/LuneOS builds only

### First-Time Setup:

1. **Install nvm (Node Version Manager):**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc  # or restart terminal
   nvm install --lts
   ```

2. **Install SDKMAN (Java Version Manager):**
   ```bash
   curl -s "https://get.sdkman.io" | bash
   source ~/.sdkman/bin/sdkman-init.sh  # or restart terminal
   sdk install java 17.0.13-tem
   ```

3. **Install Android SDK Build Tools 35.0.0:**
   ```bash
   # Using Android SDK Manager (adjust path as needed)
   $ANDROID_HOME/tools/bin/sdkmanager "build-tools;35.0.0"
   ```

4. **Install Cordova dependencies:**
   ```bash
   cd cordova-wrapper
   npm install
   cd ..
   ```

5. **Build the project:**
   ```bash
   ./build.sh android  # or www, webos, etc.
   ```

The build script automatically loads the correct Node.js and Java versions via nvm and SDKMAN.

## Architecture

The application follows EnyoJS 2 framework conventions with a component-based architecture:

### Core Structure
- **Entry point**: `enyo-app/source/app.js` - Defines the main Application kind
- **Main view**: `enyo-app/source/views/main.js` - Primary UI container with panels layout
- **Detail view**: `enyo-app/source/views/detail.js` - Task editing interface
- **API layer**: `enyo-app/source/api/checkmate.js` - Server communication

### Key Components
- **Panels Layout**: Uses CollapsingArranger for responsive design between list and detail views
- **Task List**: Reorderable list with swipe gestures for edit/delete
- **Sound Player**: Audio feedback for user interactions
- **Auto-updater**: Checks for app updates on supported platforms

### Data Flow
1. Authentication via chess notation-based credentials system
2. RESTful API communication with Check Mate service
3. Local queue management for offline task updates
4. Background sync with configurable refresh intervals

### Dependencies
- **EnyoJS 2**: Core framework located in `enyo-app/enyo/`
- **Layout Library**: Advanced layouts in `enyo-app/lib/layout/`
- **Onyx UI**: Material-style components in `enyo-app/lib/onyx/`

## Platform-Specific Notes

### webOS/LuneOS
- Uses palm-package for IPK generation
- Requires special Cordova shim (`cordova-webos.js`)
- Build output: `.ipk` files in `bin/`

### Web
- Standard web deployment
- Output directory: `bin/www/`
- Served via HTTP server on development

### Android
- Uses Cordova wrapper in `cordova-wrapper/`
- Build output: `.apk` and `.aab` files in `bin/`
- Requires Android SDK and platform tools
- **JCenter Migration**: Cordova-Android 9.x uses dependencies from JCenter (shut down in 2021)
  - Automatic fix: Hook script runs after `cordova platform add android`
  - Manual fix: Run `./fix-android-build.sh` if build fails
  - See "Android Build Troubleshooting" section below

## EnyoJS Framework Conventions

This project uses EnyoJS 2, a legacy JavaScript framework designed for cross-platform compatibility including older devices with pre-ES5 JavaScript engines. **Critical limitations and conventions:**

### JavaScript Limitations
- **No async/await, Promises, or arrow functions** - Use callback patterns only
- **No const/let** - Use `var` declarations only
- **No template literals** - Use string concatenation: `"Hello " + name`
- **No destructuring** - Access object properties directly
- **No modern Array methods** - Avoid `forEach`, `map`, `filter` in favor of traditional for loops

### Kind System (Class Definition)
```javascript
enyo.kind({
    name: "MyComponent",
    kind: "enyo.Control",  // inheritance
    published: {           // auto-generates getters/setters
        value: "default"
    },
    components: [],        // child components
    create: function() {   // constructor
        this.inherited(arguments);
    },
    myMethod: function() {
        this.inherited(arguments); // call super method
    }
});
```

### Event Handling
- Events use string names with handlers: `{ontap: "handleTap"}`
- Use `enyo.bind(this, method)` for context binding (not `.bind()`)
- Bubble events manually: `this.bubble("onCustomEvent", eventData)`

### Async Patterns
- **Ajax**: Use `enyo.Ajax` with callback methods:
  ```javascript
  var request = new enyo.Ajax({url: "...", method: "GET"});
  request.response(this, "handleSuccess");
  request.error(this, "handleError");
  request.go();
  ```
- **Timing**: Use `enyo.job()` for throttled execution, `setTimeout()` for delays
- **Chaining**: All async operations must use callback patterns

### Component Architecture
- Components declared in `components` array, accessed via `this.$.componentName`
- Use `this.createComponent()` for dynamic creation
- Component lifecycle: `create()` → `render()` → `destroy()`
- Published properties auto-generate `getValue()`/`setValue()` methods

### Data Binding (Limited)
- Use `enyo.BindingSupport` mixin for two-way data binding
- Observers: `this.addObserver("propertyName", "handlerMethod")`
- Manual updates required for complex data changes

## Development Workflow

1. Make changes in `enyo-app/source/`
2. Test with `grunt serve` for web development
3. Build with `./build.sh www` for quick web testing
4. Build platform-specific versions as needed
5. Check output in `bin/` directory
6. **Always test on target devices** - modern JS features will break on legacy platforms

The application automatically handles responsive design, switching between narrow (mobile) and wide (desktop) layouts based on screen width (600px breakpoint).

## Android Build Troubleshooting

### Cordova 14 Upgrade Notes (2025)

The project has been upgraded from Cordova 10 / cordova-android 9.x to **Cordova 13 / cordova-android 14.x**. This brings:

- **Android 12+ Support**: Target SDK 35 (Android 14), minimum SDK 24 (Android 7)
- **Modern Build Tools**: Gradle 8.13, Android Build Tools 35.0.0
- **Java 17 Requirement**: Older Java versions (8, 11) are no longer supported
- **JCenter Migration**: Cordova 14 no longer uses JCenter, so the old fix scripts are obsolete

### Common Build Issues

**Issue: "Dependency requires at least JVM runtime version 11"**

Solution: Install Java 17 via SDKMAN (see First-Time Setup above). The build script automatically loads Java 17 if SDKMAN is configured.

**Issue: "No usable Android build tools found"**

Solution: Install Android SDK Build Tools 35.0.0:
```bash
$ANDROID_HOME/tools/bin/sdkmanager "build-tools;35.0.0"
```

**Issue: Old Node.js version causes syntax errors**

Solution: Use Node.js 24+ via nvm. The project includes `.nvmrc` files to automatically select the correct version. Run `nvm use` in the project directory.

### Legacy JCenter Fix Script

The `fix-android-build.sh` script is **no longer needed** with Cordova 14, as it uses Maven Central by default. The script has been retained for reference but is not used in the build process.