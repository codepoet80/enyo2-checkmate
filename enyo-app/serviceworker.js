// Check Mate HD - Progressive Web App Service Worker
// Provides offline functionality and image caching for cross-platform compatibility

const CACHE_NAME = 'checkmate-v1.2';
const DYNAMIC_CACHE = 'checkmate-dynamic-v1.2';

// Critical app assets to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './debug.html',
    './manifest.json',
    './favicon.ico',
    './icon.png',
    './icon-256.png',
    './icon-splash.png',
    './build/enyo.js',
    './build/app.js',
    './build/enyo.css',
    './build/app.css'
];

// Core app images to cache on install
const CORE_IMAGES = [
    './assets/bg.png',
    './assets/delete.png',
    './assets/info.png',
    './assets/maximize.png',
    './assets/offline.png',
    './assets/plus.png',
    './assets/sweep.png',
    './assets/sync.png',
    './assets/sync-spin.gif',
    './assets/undo.png'
];

// Essential app icons to cache on install
const ESSENTIAL_ICONS = [
    './icons/16.png',
    './icons/32.png',
    './icons/48.png',
    './icons/96.png',
    './icons/144.png',
    './icons/192.png',
    './icons/256.png',
    './icons/512.png'
];

// Audio files to cache for offline functionality
const AUDIO_FILES = [
    './assets/check.mp3',
    './assets/delete.mp3',
    './assets/sweep.mp3',
    './assets/uncheck.mp3'
];

// Install event - cache critical assets
self.addEventListener('install', function(event) {
    console.log('Service Worker: Installing and caching app shell and core assets');
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(CACHE_NAME).then(function(cache) {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS.concat(CORE_IMAGES, ESSENTIAL_ICONS, AUDIO_FILES));
            }),
            // Skip waiting to activate immediately
            self.skipWaiting()
        ]).catch(function(error) {
            console.error('Service Worker: Install failed', error);
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
    console.log('Service Worker: Activating and cleaning up old caches');
    
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ])
    );
});

// Fetch event - serve from cache with network fallback and dynamic caching
self.addEventListener('fetch', function(event) {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip external requests (except for same-origin images)
    if (url.origin !== location.origin) {
        return;
    }
    
    event.respondWith(
        caches.match(request).then(function(cachedResponse) {
            // Return cached version if available
            if (cachedResponse) {
                console.log('Service Worker: Serving from cache:', request.url);
                return cachedResponse;
            }
            
            // Not in cache, fetch from network
            return fetch(request).then(function(networkResponse) {
                // Only cache successful responses
                if (networkResponse.status === 200) {
                    // Cache images and other assets dynamically
                    if (shouldCacheDynamically(request.url)) {
                        cacheResource(request, networkResponse.clone());
                    }
                }
                return networkResponse;
            }).catch(function(error) {
                console.log('Service Worker: Network fetch failed, serving offline fallback');
                
                // Provide offline fallbacks for critical requests
                if (request.destination === 'document') {
                    return caches.match('./index.html');
                }
                
                // For images, try to serve a fallback icon
                if (request.destination === 'image') {
                    return caches.match('./assets/offline.png') || 
                           caches.match('./icon.png');
                }
                
                throw error;
            });
        })
    );
});

// Helper function to determine if a resource should be cached dynamically
function shouldCacheDynamically(url) {
    // Cache images (PNG, JPG, GIF, SVG, ICO)
    if (url.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)) {
        return true;
    }
    
    // Cache audio files
    if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        return true;
    }
    
    // Cache CSS and JS files
    if (url.match(/\.(css|js)$/i)) {
        return true;
    }
    
    return false;
}

// Helper function to cache resources dynamically with size limits
function cacheResource(request, response) {
    caches.open(DYNAMIC_CACHE).then(function(cache) {
        // Check cache size and clean if necessary
        cache.keys().then(function(keys) {
            if (keys.length > 100) { // Limit dynamic cache to 100 items
                console.log('Service Worker: Dynamic cache full, removing oldest entries');
                // Remove first 20 entries (FIFO cleanup)
                for (var i = 0; i < 20; i++) {
                    if (keys[i]) {
                        cache.delete(keys[i]);
                    }
                }
            }
        });
        
        console.log('Service Worker: Caching dynamically:', request.url);
        cache.put(request, response);
    }).catch(function(error) {
        console.error('Service Worker: Failed to cache resource', request.url, error);
    });
}

// Message handling for cache updates and status
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_CACHE_STATUS') {
        Promise.all([
            caches.open(CACHE_NAME).then(cache => cache.keys()),
            caches.open(DYNAMIC_CACHE).then(cache => cache.keys())
        ]).then(function(results) {
            event.ports[0].postMessage({
                staticCacheSize: results[0].length,
                dynamicCacheSize: results[1].length,
                totalCached: results[0].length + results[1].length
            });
        });
    }
});
  