// Shared background music toggle for all pages.

const SOUND_KEY = 'echo-sound-on';
const TIME_KEY = 'echo-audio-time';
const VOLUME = 0.2;

export function initSound() {
  const audio = document.getElementById('bg-music');
  const button = document.getElementById('sound-toggle');

  if (!audio || !button) return;

  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

  audio.volume = VOLUME;
  audio.loop = true;

  function updateButton() {
    button.textContent = soundOn ? 'sound: on' : 'sound: off';
    button.setAttribute('aria-pressed', String(soundOn));
  }

  function saveTime() {
    localStorage.setItem(TIME_KEY, String(audio.currentTime || 0));
  }

  function restoreTime() {
    const saved = Number(localStorage.getItem(TIME_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      audio.currentTime = saved % (audio.duration || saved);
    }
  }

  function playMusic() {
    if (!soundOn) return;

    try {
      restoreTime();
      audio.play().catch(() => {});
    } catch {
      // If the browser blocks playback, just stay silent.
    }
  }

  function pauseMusic() {
    saveTime();
    audio.pause();
  }

  button.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    updateButton();

    if (soundOn) {
      playMusic();
    } else {
      pauseMusic();
    }
  });

  // Save the rough playback position so another page can resume near it.
  setInterval(() => {
    if (!audio.paused) saveTime();
  }, 1000);

  window.addEventListener('pagehide', saveTime);
  audio.addEventListener('loadedmetadata', restoreTime);

  // Browsers often block autoplay, so try again after the first user action.
  document.addEventListener('pointerdown', playMusic, { once: true });
  document.addEventListener('keydown', playMusic, { once: true });

  updateButton();
  playMusic();
}
