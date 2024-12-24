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
            throw "Forced Enyo Audio Test";
            this.useWebAudio = true;
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
    loadSoundsWebAudio: function() {
        if (this.loadPos < this.sounds.length) {
            enyo.log("Trying to buffer sound: " + this.sounds[this.loadPos].src);
            request = new XMLHttpRequest();
            request.open('GET', this.sounds[this.loadPos].src, true);
            request.responseType = 'arraybuffer';
            request.onload = function() {
                enyo.log(request.response);
                this.myAudioContext.decodeAudioData(request.response, function(buffer) {
                    enyo.log(buffer);
                    this.soundBuffers[this.loadPos] = buffer;
                    this.loadPos++;
                    this.loadSoundsWebAudio();
                }.bind(this), function() {
                    enyo.error("An error occurred loading sound for WebAudio");
                    this.loadPos++;
                    this.loadSoundsWebAudio();
                }.bind(this));
            }.bind(this)
            request.send();
        } else {
            //Check if we need to fall back to Enyo audio
            if (this.soundBuffers.length == 0 && this.sounds.length > 0) {
                enyo.warn("Could not load any WebAudio buffers, falling back to Enyo!");
                this.useWebAudio = false;
                this.loadSoundsEnyo();
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
    PlaySound: function(name) {
        if (this.useWebAudio) {
            //Look-up sound by name
            soundPos = -1;
            for (var i=0;i<this.sounds.length;i++) {
                if (this.sounds[i].name == name)
                    soundPos = i;
            }
            if (soundPos < 0) {
                enyo.error("Could not find sound to play with name: " + name);
                return false;
            }
            //Fetch sound buffer and play via WebAudio API
            buffer = this.soundBuffers[soundPos];
            source = this.myAudioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.myAudioContext.destination);
            source.loop = false;
            enyo.log("Playing sound " + name + " with WebAudio API");
            source.start();     
            return true;       
        } else {
            //Look-up sound as component
            components = this.getComponents();
            var found = false;
            for (var i=0;i<components.length;i++) {
                if (components[i].name == name && components[i].kind == "enyo.Audio") {
                    enyo.log("Playing sound " + name + " with Enyo Audio");
                    components[i].play();
                    return true;
                }
            }
            if (!found) {
                enyo.error("Could not find sound to play with name: " + name);
                return false;
            }
        }
    },
});
