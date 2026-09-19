import { database, get, ref } from './firebase.js';

if (localStorage.getItem('hackbridge-role') !== 'owner') {
  window.location.replace('login.html');
} else {
  const logoutButton = document.querySelector('#owner-logout');
  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('hackbridge-role');
    window.location.replace('login.html');
  });

  loadDashboard();
}

async function loadDashboard() {
  const studentsSnapshot = await get(ref(database, 'students'));
  const students = Object.values(studentsSnapshot.val() || {});

  document.querySelector('[data-student-count]').textContent = students.length;
  document.querySelector('[data-student-label]').textContent = students.length === 1 ? 'student' : 'students';

  const list = document.querySelector('[data-owner-students]');
  list.replaceChildren();
  if (!students.length) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No students registered yet.';
    list.append(emptyItem);
    return;
  }

  students.forEach((student) => {
    const item = document.createElement('li');
    const identity = document.createElement('div');
    identity.className = 'owner-student-identity';
    const avatar = document.createElement('span');
    avatar.className = 'owner-student-avatar';
    avatar.textContent = (student.name || 'S').trim().charAt(0).toUpperCase();
    const name = document.createElement('span');
    const email = document.createElement('strong');
    name.textContent = student.name || 'Unnamed student';
    email.textContent = student.email || '';
    identity.append(avatar, name);
    item.append(identity, email);
    list.append(item);
  });
}
