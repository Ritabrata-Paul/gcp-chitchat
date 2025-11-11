import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAB9OUnybU2ZiYWUosRIT2dlw6Z2SNdv1o",
  authDomain: "chathola-d68dd.firebaseapp.com",
  databaseURL: "https://chathola-d68dd-default-rtdb.firebaseio.com",
  projectId: "chathola-d68dd",
  storageBucket: "chathola-d68dd.firebasestorage.app",
  messagingSenderId: "882785683927",
  appId: "1:882785683927:web:6533b8f05105d1b0412392",
  measurementId: "G-NNLN14J7YB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
