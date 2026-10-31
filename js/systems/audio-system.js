class AudioSystem {
    constructor() {
        this.context = null;
        this.enabled = true;
        this.volume = 0.35;
    }

    unlock() {
        if (!this.enabled) return;

        const AudioContext =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContext) return;

        if (!this.context) {
            this.context = new AudioContext();
        }

        if (this.context.state === "suspended") {
            this.context.resume();
        }
    }

    playTone(frequency, duration, type = "sine", volume = 1) {
        if (!this.enabled) return;

        this.unlock();

        if (!this.context) return;

        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();

        const now = this.context.currentTime;

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);

        gain.gain.setValueAtTime(
            Math.max(0.0001, this.volume * volume),
            now
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + duration
        );

        oscillator.connect(gain);
        gain.connect(this.context.destination);

        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    playClick() {
        this.playTone(620, 0.07, "sine", 0.35);
    }

    playPull() {
        this.playTone(280, 0.18, "triangle", 0.6);

        setTimeout(() => {
            this.playTone(420, 0.2, "triangle", 0.5);
        }, 100);
    }

    playReveal(rarity) {
        const melodies = {
            gypsy: [330],
            common: [392, 494],
            rare: [440, 554, 659],
            epic: [523, 659, 784, 988],
            legendary: [523, 659, 784, 1046, 1318]
        };

        const notes = melodies[rarity] ?? melodies.common;

        notes.forEach((frequency, index) => {
            setTimeout(() => {
                this.playTone(
                    frequency,
                    0.35,
                    "sine",
                    rarity === "legendary" ? 0.8 : 0.55
                );
            }, index * 120);
        });
    }

    playSuccess() {
        [523, 659, 784].forEach((frequency, index) => {
            setTimeout(() => {
                this.playTone(frequency, 0.2, "sine", 0.6);
            }, index * 100);
        });
    }

    playError() {
        this.playTone(180, 0.2, "triangle", 0.5);
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
    }

    setVolume(volume) {
        this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    }
}

export const audioSystem = new AudioSystem();
