/*
SoundPlayer for Enyo2
 Version 1.0
 Created: 2025
 Author: Jon W
 License: MIT
 Description: Apple mobile devices don't play nice with the HTML audio control underlying Enyo's audio kinds --
    The audio will play, but with a delay, and it will interupt any other audio playback. This abstraction checks
    if the device supports the newer WebAudio API, and tries to use that -- falling back to Enyo if it can't for
    any reason.
    Playing sound is similar to Enyo, but the modified sound components can't be loaded into the Enyo component tree, 
    so instead of calling this.$.mySound.Play, include the parent, like this.$.mySoundPlayer.mySound.Play();
    or this.$.mySoundPlayer.PlaySound("mySound")
*/
enyo.kind({
	name: "SoundPlayer",
    useWebAudio: false,
    myAudioContext: null,
    loadPos: 0,
    soundBuffers: [],
    audioReady: false,
    interactionListenersAdded: false,
    published: {
        sounds: [
            //Sounds can be hard-coded here, as an array of Enyo audio kinds, eg:
            //  {kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'},
            // Or set by the calling code by passing the same in the declaration, eg:
            //  {kind: 'soundplayer', name:"mySoundPlayer", sounds: [{kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'}]}
            // Or set programmatically, by calling SetSounds passing an array of enyoAudio kinds, eg:
            //  mysoundplayer.SetSounds([{kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'}])
        ]
    },
    getId: function () {
        return '';
    },
	create: function() {
        this.inherited(arguments);
        enyo.log("SoundPlayer created");
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.myAudioContext = new AudioContext();
            //throw "Forced Enyo Audio Test";
            this.useWebAudio = true;
            this.setupAudioContextHandling();
        } catch (e) {
            if (e == "Forced Enyo Audio Test")
                enyo.log("Forcing Enyo audio for testing.");
            else
                enyo.warn("No Web Audio API support, using Enyo audio.");
            this.useWebAudio = false;
        }
        if (this.sounds.length > 0)
            this.loadSoundsAbstracted();
	},
    loadSoundsAbstracted: function() {
        enyo.log("SoundPlayer loading " + this.sounds.length + " sounds on this: " + this.name);
        for (var i=0;i<this.sounds.length;i++) {
            enyo.log("Updating sound: " + this.sounds[i].name);
            this.sounds[i].Play = this.Play;
            this.sounds[i].owner = this;
            //Add a proxy to the parent
            this[this.sounds[i].name] = this.sounds[i];
        }
        if (this.useWebAudio)
            this.loadSoundsWebAudio();
        else
            this.loadSoundsEnyo();
    },
    loadSoundsEnyo: function() {
        this.createComponents(this.sounds, {owner: this});
    },
    setupAudioContextHandling: function() {
        var self = this;
        
        // Handle audio context state changes
        if (this.myAudioContext) {
            this.myAudioContext.addEventListener('statechange', function() {
                enyo.log('AudioContext state changed to: ' + self.myAudioContext.state);
                if (self.myAudioContext.state === 'running') {
                    self.audioReady = true;
                }
            });
            
            // Set up user interaction listeners for modern browsers
            this.enableAudioOnInteraction();
        }
    },
    enableAudioOnInteraction: function() {
        if (this.interactionListenersAdded) return;
        
        var self = this;
        var enableAudio = function() {
            if (self.useWebAudio && self.myAudioContext && self.myAudioContext.state === 'suspended') {
                self.myAudioContext.resume().then(function() {
                    enyo.log("Audio context resumed after user interaction");
                    self.audioReady = true;
                }).catch(function(err) {
                    enyo.warn("Failed to resume audio context: " + err);
                });
            }
            // Remove listeners after first interaction
            document.removeEventListener('touchstart', enableAudio);
            document.removeEventListener('click', enableAudio);
            document.removeEventListener('keydown', enableAudio);
            self.interactionListenersAdded = false;
        };
        
        document.addEventListener('touchstart', enableAudio, {passive: true});
        document.addEventListener('click', enableAudio);
        document.addEventListener('keydown', enableAudio);
        this.interactionListenersAdded = true;
    },
    loadSoundsWebAudio: function() {
        if (this.loadPos < this.sounds.length) {
            enyo.log("Trying to buffer sound: " + this.sounds[this.loadPos].src);
            var request = new XMLHttpRequest();
            request.open('GET', this.sounds[this.loadPos].src, true);
            request.responseType = 'arraybuffer';
            request.onload = function() {
                if (request.response) {
                    this.myAudioContext.decodeAudioData(request.response, function(buffer) {
                        enyo.log("Successfully loaded sound buffer for: " + this.sounds[this.loadPos].name);
                        this.soundBuffers[this.loadPos] = buffer;
                        this.loadPos++;
                        this.loadSoundsWebAudio();
                    }.bind(this), function(err) {
                        enyo.error("An error occurred loading sound for WebAudio: " + err);
                        this.loadPos++;
                        this.loadSoundsWebAudio();
                    }.bind(this));
                } else {
                    enyo.error("Empty response for sound: " + this.sounds[this.loadPos].src);
                    this.loadPos++;
                    this.loadSoundsWebAudio();
                }
            }.bind(this);
            request.onerror = function() {
                enyo.error("Network error loading sound: " + this.sounds[this.loadPos].src);
                this.loadPos++;
                this.loadSoundsWebAudio();
            }.bind(this);
            request.send();
        } else {
            //Check if we need to fall back to Enyo audio
            if (this.soundBuffers.length == 0 && this.sounds.length > 0) {
                enyo.warn("Could not load any WebAudio buffers, falling back to Enyo!");
                this.useWebAudio = false;
                this.loadSoundsEnyo();
            } else {
                enyo.log("Successfully loaded " + this.soundBuffers.length + " WebAudio buffers");
            }
        }
    },
    setSounds: function(soundsArray) {
        //Overload the Enyo-generated function
        this.SetSounds(soundsArray);
    },
    SetSounds: function(soundsArray) {
        if (soundsArray)
            this.sounds = soundsArray;
        this.loadSoundsAbstracted();
    },
    Play: function() {
        enyo.log("Playing sound: " + this.name + " on this: " + this.owner.name);
        this.owner.PlaySound(this.name);
    },
    findSoundIndex: function(name) {
        for (var i = 0; i < this.sounds.length; i++) {
            if (this.sounds[i].name == name) {
                return i;
            }
        }
        return -1;
    },
    ensureAudioReady: function() {
        if (!this.useWebAudio) return true;
        
        // Handle modern browser autoplay restrictions
        if (this.myAudioContext.state === 'suspended') {
            if (!this.interactionListenersAdded) {
                this.enableAudioOnInteraction();
            }
            return false;
        }
        return this.myAudioContext.state === 'running';
    },
    PlaySound: function(name) {
        if (this.useWebAudio) {
            // Check if audio context is ready
            if (!this.ensureAudioReady()) {
                enyo.log("Audio context not ready, will retry after user interaction");
                var self = this;
                // Retry after brief delay for context resume
                setTimeout(function() {
                    self.PlaySound(name);
                }, 100);
                return false;
            }
            
            // Look-up sound by name
            var soundPos = this.findSoundIndex(name);
            if (soundPos < 0) {
                enyo.error("Could not find sound to play with name: " + name);
                return false;
            }
            
            // Fetch sound buffer and play via WebAudio API
            var buffer = this.soundBuffers[soundPos];
            if (!buffer) {
                enyo.warn("Sound buffer not loaded for: " + name + ", falling back to Enyo audio");
                return this.playWithEnyoAudio(name);
            }
            
            try {
                var source = this.myAudioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.myAudioContext.destination);
                source.onended = function() {
                    // Cleanup reference
                    source = null;
                };
                enyo.log("Playing sound " + name + " with WebAudio API");
                source.start(0);
                return true;
            } catch (e) {
                enyo.error("WebAudio playback failed for " + name + ": " + e.message);
                return this.playWithEnyoAudio(name);
            }
        } else {
            return this.playWithEnyoAudio(name);
        }
    },
    playWithEnyoAudio: function(name) {
        // Look-up sound as component
        var components = this.getComponents();
        for (var i = 0; i < components.length; i++) {
            if (components[i].name == name && components[i].kind == "enyo.Audio") {
                enyo.log("Playing sound " + name + " with Enyo Audio");
                try {
                    components[i].play();
                    return true;
                } catch (e) {
                    enyo.error("Enyo Audio playback failed for " + name + ": " + e.message);
                    return false;
                }
            }
        }
        enyo.error("Could not find Enyo Audio component with name: " + name);
        return false;
    },
});
