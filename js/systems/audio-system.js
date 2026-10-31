
class AudioSystem {
    constructor() {
        this.context = null;
        this.enabled = true;
        this.volume = 0.35;
        this.unlocking = null;
    }

    async unlock() {
        if (!this.enabled) return false;

        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            console.warn("目前瀏覽器不支援 Web Audio API。");
            return false;
        }

        try {
            if (!this.context) {
                this.context = new AudioContextClass();
            }

            if (this.context.state === "suspended") {
                if (!this.unlocking) {
                    this.unlocking = this.context.resume().finally(() => {
                        this.unlocking = null;
                    });
                }

                await this.unlocking;
            }

            return this.context.state === "running";
        } catch (error) {
            console.error("音訊啟動失敗：", error);
            return false;
        }
    }

    async playTone(
        frequency,
        duration,
        type = "sine",
        volume = 1,
        delay = 0
    ) {
        if (!this.enabled) return;

        const ready = await this.unlock();

        if (!ready || !this.context) return;

        try {
            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();

            const startTime = this.context.currentTime + delay;

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(
                frequency,
                startTime
            );

            gain.gain.setValueAtTime(
                Math.max(0.0001, this.volume * volume),
                startTime
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startTime + duration
            );

            oscillator.connect(gain);
            gain.connect(this.context.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        } catch (error) {
            console.error("音效播放失敗：", error);
        }
    }

    playClick() {
        this.playTone(620, 0.07, "sine", 0.35);
    }

    playPull() {
        this.playTone(280, 0.18, "triangle", 0.6);
        this.playTone(420, 0.2, "triangle", 0.5, 0.1);
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
            this.playTone(
                frequency,
                0.35,
                "sine",
                rarity === "legendary" ? 0.8 : 0.55,
                index * 0.12
            );
        });
    }

    playSuccess() {
        [523, 659, 784].forEach((frequency, index) => {
            this.playTone(
                frequency,
                0.2,
                "sine",
                0.6,
                index * 0.1
            );
        });
    }

    playError() {
        this.playTone(180, 0.2, "triangle", 0.5);
    }

    playTest() {
        this.playSuccess();
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
    }

    setVolume(volume) {
        this.volume = Math.min(
            1,
            Math.max(0, Number(volume) || 0)
        );
    }
}

export const audioSystem = new AudioSystem();
