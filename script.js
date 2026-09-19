import {
  database,
  get,
  getDownloadURL,
  onValue,
  push,
  ref,
  set,
  storage,
  storageRef,
  uploadBytes
} from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
  const profileId = getProfileId();
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link');

  updateProfileChip(profileId);

  navLinks.forEach((link) => {
    const pageName = link.getAttribute('data-page');
    if (pageName === currentPage || (currentPage === '' && pageName === 'index.html')) {
      link.classList.add('active');
    }
  });

  const searchInput = document.querySelector('[data-search]');
  const cards = document.querySelectorAll('[data-card-name]');

  if (searchInput && cards.length) {
    searchInput.addEventListener('input', (event) => {
      const query = event.target.value.trim().toLowerCase();

      cards.forEach((card) => {
        const name = (card.dataset.cardName || '').toLowerCase();
        const visible = !query || name.includes(query);
        card.style.display = visible ? '' : 'none';
      });
    });
  }

  const joinButtons = document.querySelectorAll('[data-join]');
  const joinsRef = ref(database, `students/${profileId}/joins`);

  onValue(joinsRef, (snapshot) => {
    const joins = snapshot.val() || {};
    joinButtons.forEach((button) => {
      const title = button.closest('[data-card-name]')?.dataset.cardName;
      const joinKey = encodeURIComponent(title || '');
      if (joins[joinKey]) markJoined(button, title);
    });
  });

  joinButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const title = button.closest('[data-card-name]')?.dataset.cardName || 'this opportunity';
      const joinKey = encodeURIComponent(title);

      try {
        await set(ref(database, `users/${profileId}/joins/${joinKey}`), {
          title,
          joinedAt: Date.now()
        });
        markJoined(button, title);
      } catch (error) {
        console.error('Could not save opportunity join', error);
      }
    });
  });

  const askForm = document.querySelector('#ask-question-form');
  const forumFeed = document.querySelector('#forum-feed');

  setupAuthentication();
  setupPasswordToggles();
  setupYouTubeDirectory();
  setupProjectEditor(profileId);
  loadStudentProjects(profileId);
  setupProfileEditor(profileId);

  if (forumFeed) {
    onValue(ref(database, 'questions'), (snapshot) => {
      forumFeed.querySelectorAll('[data-firebase-question]').forEach((question) => question.remove());
      const questions = Object.values(snapshot.val() || {}).sort((a, b) => b.createdAt - a.createdAt);
      questions.reverse().forEach((question) => renderQuestion(forumFeed, question));
    });
  }

  if (askForm) {
    askForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = askForm.querySelector('input');
      const textarea = askForm.querySelector('textarea');
      const text = (textarea?.value || input?.value || '').trim();
      if (!text) return;

      try {
        await push(ref(database, 'questions'), {
          topic: (input?.value || 'New question').trim(),
          text,
          createdAt: Date.now()
        });
        askForm.reset();
      } catch (error) {
        console.error('Could not save question', error);
      }
    });
  }
});

function getProfileId() {
  const storageKey = 'hackbridge-profile-id';
  let profileId = localStorage.getItem(storageKey);
  if (!profileId) {
    profileId = crypto.randomUUID();
    localStorage.setItem(storageKey, profileId);
  }
  return profileId;
}

function setupAuthentication() {
  const signInForm = document.querySelector('#sign-in-form');
  const loginForm = document.querySelector('#login-form');

  if (signInForm) {
    signInForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(signInForm);
      const name = form.get('name').trim();
      const email = form.get('email').trim();
      const password = form.get('password');
      const submitButton = signInForm.querySelector('button[type="submit"]');

      setAuthState(submitButton, 'Creating account...');
      try {
        const studentsRef = ref(database, 'students');
        const existingStudents = await get(studentsRef);
        if (findUserByEmail(existingStudents.val(), email)) {
          throw new Error('email-already-exists');
        }

        const accountRef = ref(database, `students/${getStudentKey(email)}`);
        await set(accountRef, {
          name,
          email,
          password
        });
        localStorage.setItem('hackbridge-profile-id', accountRef.key);
        window.location.href = 'index.html';
      } catch (error) {
        setAuthState(submitButton, getAuthErrorMessage(error));
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(loginForm);
      const email = form.get('email').trim();
      const password = form.get('password');
      const submitButton = loginForm.querySelector('button[type="submit"]');

      setAuthState(submitButton, 'Logging in...');
      try {
        const ownerSnapshot = await get(ref(database, 'Owner'));
        const owner = ownerSnapshot.val();
        if (owner && String(owner.email).trim() === email && String(owner.password) === password) {
          localStorage.setItem('hackbridge-role', 'owner');
          localStorage.removeItem('hackbridge-profile-id');
          window.location.href = 'owner-dashboard.html';
          return;
        }

        const studentsSnapshot = await get(ref(database, 'students'));
        const account = findUserByEmail(studentsSnapshot.val(), email);
        if (!account || account.value.password !== password) {
          throw new Error('invalid-credentials');
        }

        localStorage.setItem('hackbridge-role', 'student');
        localStorage.setItem('hackbridge-profile-id', account.key);
        window.location.href = 'index.html';
      } catch (error) {
        setAuthState(submitButton, getAuthErrorMessage(error));
      }
    });
  }
}

function setupPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
    const input = document.getElementById(toggle.dataset.passwordToggle);
    if (!input) return;

    toggle.addEventListener('click', () => {
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      toggle.setAttribute('aria-pressed', String(!isVisible));
    });
  });
}

async function setupProfileEditor(profileId) {
  const form = document.querySelector('#edit-profile-form');
  if (!form || !profileId) return;

  const status = form.querySelector('[data-profile-status]');
  const currentSnapshot = await get(ref(database, `students/${profileId}`));
  const currentStudent = currentSnapshot.val();
  if (!currentStudent) {
    status.textContent = 'Student profile could not be found.';
    return;
  }

  Object.entries(currentStudent).forEach(([field, value]) => {
    const input = form.elements[field];
    if (input && field !== 'password') input.value = value || '';
  });
  setupLanguageButtons(form, currentStudent.programmingLanguages || '');
  setupProfileImagePreview(form, currentStudent.profileImageUrl);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const updatedEmail = formData.get('email').trim();
    const updatedStudent = {
      name: formData.get('name').trim(),
      email: updatedEmail,
      password: currentStudent.password,
      programmingLanguages: formData.get('programmingLanguages').trim(),
      collegeName: formData.get('collegeName').trim(),
      branch: formData.get('branch').trim(),
      profileImageUrl: currentStudent.profileImageUrl || ''
    };

    status.textContent = 'Saving details...';
    try {
      const updatedKey = getStudentKey(updatedEmail);
      const selectedImage = form.elements.profileImage.files[0];
      let imageUploadMessage = '';
      if (selectedImage) {
        try {
          const imageRef = storageRef(storage, `profile-pictures/${updatedKey}`);
          const upload = await uploadBytes(imageRef, selectedImage);
          updatedStudent.profileImageUrl = await getDownloadURL(upload.ref);
        } catch (error) {
          imageUploadMessage = ' Details saved, but the profile image needs Firebase Storage write permission.';
          console.error('Could not upload profile image', error);
        }
      }
      await set(ref(database, `students/${updatedKey}`), updatedStudent);
      if (updatedKey !== profileId) {
        await set(ref(database, `students/${profileId}`), null);
      }
      localStorage.setItem('hackbridge-profile-id', updatedKey);
      if (imageUploadMessage) {
        status.textContent = imageUploadMessage;
      } else {
        window.location.href = 'profile.html';
      }
    } catch (error) {
      status.textContent = 'Could not save profile details. Please try again.';
      console.error('Could not update student profile', error);
    }
  });
}

function setupProjectEditor(profileId) {
  const form = document.querySelector('#add-project-form');
  if (!form || !profileId) return;

  const status = form.querySelector('[data-project-status]');
  const fileInput = form.elements.projectImage;
  const preview = form.querySelector('[data-project-image-preview]');
  fileInput.addEventListener('change', () => {
    const selectedImage = fileInput.files[0];
    if (!selectedImage) return;
    preview.src = URL.createObjectURL(selectedImage);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const project = {
      title: formData.get('title').trim(),
      description: formData.get('description').trim(),
      presentedAt: formData.get('presentedAt').trim(),
      imageUrl: ''
    };
    status.textContent = 'Saving project...';

    try {
      const selectedImage = fileInput.files[0];
      let imageWarning = '';
      if (selectedImage) {
        try {
          const imageRef = storageRef(storage, `project-images/${profileId}/${Date.now()}`);
          const upload = await uploadBytes(imageRef, selectedImage);
          project.imageUrl = await getDownloadURL(upload.ref);
        } catch (error) {
          imageWarning = ' Project details saved, but the image needs Firebase Storage write permission.';
          console.error('Could not upload project image', error);
        }
      }
      await push(ref(database, `students/${profileId}/projects`), project);
      if (imageWarning) {
        status.textContent = imageWarning;
      } else {
        window.location.href = 'profile.html';
      }
    } catch (error) {
      status.textContent = 'Could not save project. Please try again.';
      console.error('Could not save project', error);
    }
  });
}

function loadStudentProjects(profileId) {
  const containers = document.querySelectorAll('[data-student-projects], [data-home-projects]');
  if (!containers.length || !profileId) return;

  onValue(ref(database, `students/${profileId}/projects`), (snapshot) => {
    const projects = Object.values(snapshot.val() || {});
    containers.forEach((container) => {
      container.replaceChildren();
      if (!projects.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'muted project-empty-state';
        emptyState.textContent = 'No projects added yet. Use Add Project to showcase your work.';
        container.append(emptyState);
      }
      projects.forEach((project) => {
      const card = document.createElement('article');
      card.className = 'card project-card';
      const image = document.createElement('img');
      image.className = 'project-image';
      image.src = project.imageUrl || 'HackBridgeLogo.png';
      image.alt = `${project.title || 'Student'} project`;
      const body = document.createElement('div');
      body.className = 'body';
      const title = document.createElement('h3');
      title.textContent = project.title || 'Untitled project';
      const description = document.createElement('p');
      description.textContent = project.description || '';
      const presentation = document.createElement('div');
      presentation.className = 'meta-row';
      presentation.textContent = `Presented at: ${project.presentedAt || 'Not specified'}`;
      body.append(title, description, presentation);
      card.append(image, body);
      container.append(card);
      });
    });
  });
}

function setupProfileImagePreview(form, savedImageUrl) {
  const fileInput = form.elements.profileImage;
  const preview = form.querySelector('[data-profile-image-preview]');
  if (!fileInput || !preview) return;

  if (savedImageUrl) {
    preview.src = savedImageUrl;
    preview.hidden = false;
  }

  fileInput.addEventListener('change', () => {
    const selectedImage = fileInput.files[0];
    if (!selectedImage) return;
    preview.src = URL.createObjectURL(selectedImage);
    preview.hidden = false;
  });
}

function setupYouTubeDirectory() {
  const grid = document.querySelector('[data-channel-grid]');
  const languageFilter = document.querySelector('[data-language-filter]');
  if (!languageFilter) return;

  const channels = [
    ['CodeWithHarry', 'India', 'Hindi / English', 'https://www.youtube.com/@CodeWithHarry'],
    ['Apna College', 'India', 'Hindi / English', 'https://www.youtube.com/@ApnaCollegeOfficial'],
    ['Telusko', 'India', 'English', 'https://www.youtube.com/@Telusko'],
    ['Chai aur Code', 'India', 'Hindi', 'https://www.youtube.com/@chaiaurcode'],
    ['College Wallah', 'India', 'Hindi', 'https://www.youtube.com/@CollegeWallah'],
    ['WsCube Tech', 'India', 'Hindi / English', 'https://www.youtube.com/@wscubetech'],
    ['Kunal Kushwaha', 'India', 'English', 'https://www.youtube.com/@KunalKushwaha'],
    ['Hitesh Choudhary', 'India', 'Hindi / English', 'https://www.youtube.com/@HiteshCodeLab'],
    ['Thapa Technical', 'India', 'Hindi / English', 'https://www.youtube.com/@ThapaTechnical'],
    ['Gate Smashers', 'India', 'Hindi', 'https://www.youtube.com/@GateSmashers'],
    ['freeCodeCamp.org', 'International', 'English', 'https://www.youtube.com/@freecodecamp'],
    ['Traversy Media', 'International', 'English', 'https://www.youtube.com/@TraversyMedia'],
    ['The Net Ninja', 'International', 'English', 'https://www.youtube.com/@NetNinja'],
    ['Fireship', 'International', 'English', 'https://www.youtube.com/@Fireship'],
    ['Programming with Mosh', 'International', 'English', 'https://www.youtube.com/@programmingwithmosh'],
    ['Web Dev Simplified', 'International', 'English', 'https://www.youtube.com/@WebDevSimplified'],
    ['Kevin Powell', 'International', 'English', 'https://www.youtube.com/@KevinPowell'],
    ['CS50', 'International', 'English', 'https://www.youtube.com/@cs50'],
    ['Academind', 'International', 'English', 'https://www.youtube.com/@academind'],
    ['Corey Schafer', 'International', 'English', 'https://www.youtube.com/@coreyms']
  ].map(([name, region, language, url]) => ({
    name,
    region,
    language,
    url,
    videos: [
      'Beginner programming roadmap',
      'HTML and CSS fundamentals',
      'JavaScript complete course',
      'Data structures and algorithms',
      'Build a real-world project',
      'React and modern frontend',
      'Backend development essentials',
      'Database and SQL fundamentals',
      'Git and GitHub for developers',
      'Interview preparation guide'
    ]
  }));

  const regions = document.querySelectorAll('[data-region-filter]');
  const programmingLanguages = [
    'Java', 'JavaScript', 'Node.js', 'Python', 'Express.js', 'Flutter',
    'React Native', 'C', 'C+', 'C++', 'C#', 'TypeScript', 'HTML', 'CSS',
    'SQL', 'Go', 'Rust', 'Kotlin', 'Swift', 'PHP', 'Ruby'
  ];
  let youtubeVideos = {};
  let youtubeChannels = {};

  programmingLanguages.forEach((language) => {
    const option = document.createElement('option');
    option.value = language;
    option.textContent = language;
    languageFilter.append(option);
  });

  onValue(ref(database, 'youtubeVideos'), (snapshot) => {
    youtubeVideos = snapshot.val() || {};
    renderVideoLibrary();
  });

  onValue(ref(database, 'youtubeChannels'), (snapshot) => {
    youtubeChannels = snapshot.val() || {};
    renderYouTubeChannels();
  });

  let selectedRegion = 'all';
  regions.forEach((button) => {
    button.addEventListener('click', () => {
      selectedRegion = button.dataset.regionFilter;
      regions.forEach((item) => item.classList.toggle('active', item === button));
      renderChannels();
    });
  });
  languageFilter.addEventListener('change', renderChannels);

  function renderChannels() {
    const visibleChannels = channels.filter((channel) => {
      const matchesRegion = selectedRegion === 'all' || channel.region === selectedRegion;
      return matchesRegion;
    });
    if (grid) grid.replaceChildren(...visibleChannels.map(renderChannel));
    renderVideoLibrary();
  }

  function renderChannel(channel) {
    const article = document.createElement('article');
    article.className = 'channel-card';

    const header = document.createElement('div');
    header.className = 'channel-card-header';
    const title = document.createElement('div');
    title.innerHTML = `<span class="channel-region">${channel.region}</span><h3>${channel.name}</h3><p>${channel.language}</p>`;
    const channelLink = document.createElement('a');
    channelLink.className = 'ghost-btn';
    channelLink.href = channel.url;
    channelLink.target = '_blank';
    channelLink.rel = 'noreferrer';
    channelLink.textContent = 'Channel';
    header.append(title, channelLink);

    article.append(header);
    return article;
  }

  function renderVideoLibrary() {
    const library = document.querySelector('[data-video-library]');
    if (!library) return;
    library.querySelectorAll('.language-video-section').forEach((section) => section.remove());

    const selectedLanguage = languageFilter.value;
    const languageGroups = Object.entries(youtubeVideos).filter(([language]) => {
      return selectedLanguage === 'all' || language === selectedLanguage || decodeURIComponent(language) === selectedLanguage;
    });

    languageGroups.forEach(([languageKey, languageVideos]) => {
      const language = decodeURIComponent(languageKey);
      const videosForLanguage = Object.values(languageVideos || {});
      if (!videosForLanguage.length) return;

      const section = document.createElement('div');
      section.className = 'language-video-section';
      const heading = document.createElement('h3');
      heading.textContent = `${language} videos`;
      const videos = document.createElement('div');
      videos.className = 'youtube-resource-grid';

      videosForLanguage.forEach((video) => {
        const card = document.createElement('article');
        card.className = 'youtube-resource-card';
        const videoId = getYouTubeVideoId(video.videoUrl);

        if (videoId) {
          const thumbnailLink = document.createElement('a');
          thumbnailLink.className = 'youtube-resource-thumb';
          thumbnailLink.href = video.videoUrl;
          thumbnailLink.target = '_blank';
          thumbnailLink.rel = 'noreferrer';
          const thumbnail = document.createElement('img');
          thumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          thumbnail.alt = `${video.description || language} video thumbnail`;
          thumbnail.loading = 'lazy';
          thumbnailLink.append(thumbnail);
          card.append(thumbnailLink);
        }

        const body = document.createElement('div');
        body.className = 'youtube-resource-body';
        const channel = document.createElement('span');
        channel.className = 'youtube-resource-channel';
        channel.textContent = video.channelName || 'YouTube channel';
        const description = document.createElement('h4');
        description.textContent = video.description || `${language} learning video`;
        const watchLink = document.createElement('a');
        watchLink.className = 'ghost-btn youtube-watch-link';
        watchLink.href = video.videoUrl;
        watchLink.target = '_blank';
        watchLink.rel = 'noreferrer';
        watchLink.textContent = 'Watch on YouTube';
        body.append(channel, description, watchLink);
        card.append(body);
        videos.append(card);
      });

      section.append(heading, videos);
      library.append(section);
    });
  }

  function renderYouTubeChannels() {
    const channelGrid = document.querySelector('[data-youtube-channel-grid]');
    if (!channelGrid) return;
    channelGrid.replaceChildren();

    const channelsFromDatabase = Object.values(youtubeChannels || {});
    if (!channelsFromDatabase.length) {
      const emptyState = document.createElement('p');
      emptyState.className = 'muted';
      emptyState.textContent = 'No YouTube channels added yet.';
      channelGrid.append(emptyState);
      return;
    }

    channelsFromDatabase.forEach((channel) => {
      const card = document.createElement('article');
      card.className = 'youtube-channel-card';
      const header = document.createElement('div');
      header.className = 'youtube-channel-card-header';
      const logo = document.createElement('img');
      logo.className = 'youtube-channel-logo';
      logo.src = getYouTubeChannelLogoUrl(channel.channelUrl);
      logo.alt = '';
      logo.loading = 'lazy';
      logo.addEventListener('error', () => logo.remove());
      header.append(logo);
      const name = document.createElement('h3');
      name.textContent = channel.channelName || 'Untitled channel';
      const link = document.createElement('a');
      link.className = 'youtube-channel-link';
      link.href = channel.channelUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Visit channel';
      card.append(header, name, link);
      channelGrid.append(card);
    });
  }

  renderChannels();
}

function getYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.hostname.endsWith('youtube.com')) {
      return url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] || '';
    }
  } catch {
    return '';
  }
  return '';
}

function getYouTubeChannelLogoUrl(value) {
  try {
    const url = new URL(value);
    const handle = url.pathname.match(/@([^/]+)/)?.[1];
    return handle ? `https://unavatar.io/youtube/${encodeURIComponent(handle)}` : '';
  } catch {
    return '';
  }
}

function setupLanguageButtons(form, savedLanguages) {
  const languageInput = form.elements.programmingLanguages;
  const selectedLanguages = new Set(savedLanguages.split(',').map((language) => language.trim()).filter(Boolean));
  const languageButtons = form.querySelectorAll('[data-language]');

  languageButtons.forEach((button) => {
    const language = button.dataset.language;
    button.classList.toggle('selected', selectedLanguages.has(language));
    button.setAttribute('aria-pressed', selectedLanguages.has(language));
    button.addEventListener('click', () => {
      if (selectedLanguages.has(language)) {
        selectedLanguages.delete(language);
      } else {
        selectedLanguages.add(language);
      }
      button.classList.toggle('selected', selectedLanguages.has(language));
      button.setAttribute('aria-pressed', selectedLanguages.has(language));
      languageInput.value = [...selectedLanguages].join(', ');
    });
  });

  languageInput.value = [...selectedLanguages].join(', ');
}

function setAuthState(button, message) {
  const status = document.querySelector('[data-auth-status]');
  if (status) status.textContent = message;
  if (button) button.disabled = message.endsWith('...');
}

function getAuthErrorMessage(error) {
  const messages = {
    'email-already-exists': 'This email is already registered. Try logging in.',
    'invalid-credentials': 'The email or password is incorrect.'
  };
  return messages[error.message] || 'Could not save your details. Please try again.';
}

function findUserByEmail(users, email) {
  const matchingEntry = Object.entries(users || {}).find(([, user]) => user.email === email);
  return matchingEntry ? { key: matchingEntry[0], value: matchingEntry[1] } : null;
}

function getStudentKey(email) {
  return email.replace(/\./g, '%2E');
}

async function updateProfileChip(profileId) {
  const profileChip = document.querySelector('[data-profile-chip]');
  const profileName = document.querySelector('[data-profile-name]');
  const profileEmail = document.querySelector('[data-profile-email]');
  const profilePageNames = document.querySelectorAll('[data-profile-page-name]');
  const profilePageEmails = document.querySelectorAll('[data-profile-page-email]');
  if (!profileId) return;

  try {
    const snapshot = await get(ref(database, `students/${profileId}`));
    const student = snapshot.val();
    if (!student) return;

    if (profileName && profileEmail && profileChip) {
      profileName.textContent = student.name;
      profileEmail.textContent = student.email || '';
      profileChip.hidden = false;
    }
    profilePageNames.forEach((element) => {
      element.textContent = student.name || '';
    });
    profilePageEmails.forEach((element) => {
      element.textContent = student.email || '';
    });
    renderStudentDetails(student);
    document.querySelectorAll('[data-profile-image]').forEach((image) => {
      if (student.profileImageUrl) {
        image.src = student.profileImageUrl;
        image.hidden = false;
      }
    });
  } catch (error) {
    console.error('Could not load student profile', error);
  }
}

function renderStudentDetails(student) {
  const detailsList = document.querySelector('[data-student-details]');
  if (!detailsList) return;

  detailsList.replaceChildren();
  Object.entries(student).forEach(([field, value]) => {
    if (field === 'password' || field === 'profileImageUrl' || value === '') return;

    const item = document.createElement('li');
    const label = document.createElement('span');
    const detail = document.createElement('strong');
    label.textContent = formatStudentField(field);
    detail.textContent = value;
    item.append(label, detail);
    detailsList.append(item);
  });
}

function formatStudentField(field) {
  const labels = {
    collegeName: 'College name',
    programmingLanguages: 'Known programming languages'
  };
  return labels[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function markJoined(button, title) {
  button.textContent = 'Joined';
  button.disabled = true;
  button.setAttribute('aria-label', `Joined ${title}`);
}

function renderQuestion(container, question) {
  const article = document.createElement('article');
  article.className = 'forum-card';
  article.dataset.firebaseQuestion = 'true';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = question.topic || 'New question';

  const questionText = document.createElement('div');
  questionText.className = 'forum-question';
  questionText.textContent = question.text || '';

  const answer = document.createElement('div');
  answer.className = 'answer-box';
  answer.textContent = 'A community member can answer this question in the language club thread.';

  article.append(tag, questionText, answer);
  container.prepend(article);
}
