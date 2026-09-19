import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import {
  get,
  getDatabase,
  onValue,
  push,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm_AAvf6sbsqLuAgbsr7LLU3cdJwDithY",
  authDomain: "hackbridge-84b1e.firebaseapp.com",
  databaseURL: "https://hackbridge-84b1e-default-rtdb.firebaseio.com",
  projectId: "hackbridge-84b1e",
  storageBucket: "hackbridge-84b1e.firebasestorage.app",
  messagingSenderId: "255489550602",
  appId: "1:255489550602:web:64a4a1804eb3c18ad432f3",
  measurementId: "G-JLC29ZCNEP"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);
const storage = getStorage(app);

export {
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
};
