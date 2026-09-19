import { database, get, push, ref, set } from './firebase.js';

if (localStorage.getItem('hackbridge-role') !== 'owner') {
  window.location.replace('login.html');
} else {
  document.querySelector('#owner-logout').addEventListener('click', () => {
    localStorage.removeItem('hackbridge-role');
    window.location.replace('login.html');
  });

  setupYouTubeForm();
  migrateLegacyVideos();
}

async function migrateLegacyVideos() {
  const videosSnapshot = await get(ref(database, 'youtubeVideos'));
  const videosByLanguage = videosSnapshot.val() || {};

  for (const [languageKey, value] of Object.entries(videosByLanguage)) {
    if (!value || !value.videoUrl) continue;

    const migratedKey = push(ref(database, `youtubeVideos/${languageKey}`)).key;
    await set(ref(database, `youtubeVideos/${languageKey}`), {
      [migratedKey]: value
    });
  }
}

function setupYouTubeForm() {
  const form = document.querySelector('#add-youtube-form');
  const languageInput = form.querySelector('[name="language"]');
  const status = form.querySelector('[data-youtube-status]');

  form.querySelectorAll('[data-youtube-language]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.youtubeLanguage;
      languageInput.value = selected;
      form.querySelectorAll('[data-youtube-language]').forEach((option) => {
        const isSelected = option === button;
        option.classList.toggle('selected', isSelected);
        option.setAttribute('aria-pressed', String(isSelected));
      });
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!languageInput.value) {
      status.textContent = 'Choose a computer language first.';
      return;
    }

    const formData = new FormData(form);
    const videoUrl = formData.get('videoUrl').trim();
    if (!isYouTubeUrl(videoUrl)) {
      status.textContent = 'Enter a valid YouTube video link.';
      return;
    }

    status.textContent = 'Saving video...';
    try {
      const language = languageInput.value;
      await push(ref(database, `youtubeVideos/${getLanguageKey(language)}`), {
        language,
        videoUrl,
        channelName: formData.get('channelName').trim(),
        description: formData.get('description').trim()
      });
      form.reset();
      form.querySelectorAll('[data-youtube-language]').forEach((button) => {
        button.classList.remove('selected');
        button.setAttribute('aria-pressed', 'false');
      });
      status.textContent = 'YouTube video added successfully.';
    } catch (error) {
      status.textContent = 'Could not save the YouTube video. Please try again.';
      console.error('Could not save YouTube video', error);
    }
  });
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value);
    return ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getLanguageKey(language) {
  return encodeURIComponent(language);
}
