enyo.kind({
	name: "soundplayer",
    useWebAudio: false,
    myAudioContext: null,
    loadPos: 0,
    soundBuffers: [],
    events: {
        onSomeEvent: "",
    },
    published: {
        SomeProperty: ""
    },
    sounds: [
        {kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'},
		{kind: 'enyo.Audio', name:"soundCheck", src: 'assets/check.mp3'},
		{kind: 'enyo.Audio', name:"soundUncheck", src: 'assets/uncheck.mp3'},
		{kind: 'enyo.Audio', name:"soundDelete", src: 'assets/delete.mp3'},
    ],
	create: function() {
        this.inherited(arguments);
        enyo.log("Soundplayer created");
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.myAudioContext = new AudioContext();
            //throw "Forced Enyo Audio Test";
            this.useWebAudio = true;
            this.loadSoundsWebAudio();
        } catch (e) {
            if (e == "Forced Enyo Audio Test")
                enyo.log("Forcing Enyo audio for testing...");
            else
                enyo.warn("No Web Audio API support, using Enyo audio controls.");
            this.loadSoundsEnyo();
        }
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
            //fetch sound buffer and play via WebAudio API
            buffer = this.soundBuffers[soundPos];
            source = this.myAudioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.myAudioContext.destination);
            source.loop = false;
            enyo.log("Playing sound " + name + " with WebAudio API");
            source.start();     
            return true;       
        } else {
            //lookup sound as component
            components = this.getComponents();
            var found = false;
            for (var i=0;i<components.length;i++) {
                if (components[i].name == name) {
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
