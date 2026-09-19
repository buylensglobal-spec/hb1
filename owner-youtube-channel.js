import { database, push, ref } from './firebase.js';

if (localStorage.getItem('hackbridge-role') !== 'owner') {
  window.location.replace('login.html');
} else {
  document.querySelector('#owner-logout').addEventListener('click', () => {
    localStorage.removeItem('hackbridge-role');
    window.location.replace('login.html');
  });

  setupChannelForm();
}

function setupChannelForm() {
  const form = document.querySelector('#add-youtube-channel-form');
  const status = form.querySelector('[data-channel-status]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const channelUrl = formData.get('channelUrl').trim();
    if (!isYouTubeChannelUrl(channelUrl)) {
      status.textContent = 'Enter a valid YouTube channel link.';
      return;
    }

    status.textContent = 'Saving channel...';
    try {
      await push(ref(database, 'youtubeChannels'), {
        channelName: formData.get('channelName').trim(),
        channelUrl
      });
      form.reset();
      status.textContent = 'YouTube channel added successfully.';
    } catch (error) {
      status.textContent = 'Could not save the YouTube channel. Please try again.';
      console.error('Could not save YouTube channel', error);
    }
  });
}

function isYouTubeChannelUrl(value) {
  try {
    const url = new URL(value);
    return ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
