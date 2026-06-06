// shared background music toggle for all pages
// this file makes the sound button work on every page
// it also remembers whether sound was on/off and where the song stopped

const SOUND_KEY = 'echo-sound-on';
const TIME_KEY = 'echo-audio-time';
const VOLUME = 0.2; // volume of the background music

export function initSound() {
  const audio = document.getElementById('bg-music');
  const button = document.getElementById('sound-toggle');

  // sound is on by default unless the user turned it off before
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  
  audio.volume = VOLUME;
  audio.loop = true;

  // update the text on the button
  function updateButton() {
    if (soundOn) {
      button.textContent = 'sound: on';
    } else {
      button.textContent = 'sound: off';
    }

    // helps screen readers know this is an on/off button
    button.setAttribute('aria-pressed', String(soundOn));
  }

  // save where the music currently is
  function saveCurrentTime() {
    localStorage.setItem(TIME_KEY, String(audio.currentTime || 0));
  }

  // move the music back to the saved time
  function restoreSavedTime() {
    const savedTime = Number(localStorage.getItem(TIME_KEY));

    // only restore if the saved value is a real number
    if (Number.isFinite(savedTime) && savedTime > 0) {
      // if duration exists, wrap around so we do not go past the song length
      audio.currentTime = savedTime % (audio.duration || savedTime);
    }
  }

  // try to start the music
  function playMusic() {
    if (!soundOn) return;

    restoreSavedTime();

    // browsers may block autoplay, so ignore the error if that happens
    audio.play().catch(() => {});
  }

  // stop the music and remember where it stopped
  function pauseMusic() {
    saveCurrentTime();
    audio.pause();
  }

  // when the user clicks the sound button, switch on/off
  button.addEventListener('click', () => {
    soundOn = !soundOn;

    // remember the setting across pages
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');

    updateButton();

    if (soundOn) {
      playMusic();
    } else {
      pauseMusic();
    }
  });

  // save the song position every second while it is playing
  setInterval(() => {
    if (!audio.paused) {
      saveCurrentTime();
    }
  }, 1000);

  // save time when the user leaves the page
  window.addEventListener('pagehide', saveCurrentTime);

  // once the audio file loads, restore the old time
  audio.addEventListener('loadedmetadata', restoreSavedTime);

  // many browsers block autoplay until the user interacts with the page
  // so we try again after the first click/tap or key press
  document.addEventListener('pointerdown', playMusic, { once: true });
  document.addEventListener('keydown', playMusic, { once: true });

  // set the starting button state
  updateButton();

  // try to play right away, but browser may block it
  playMusic();
}