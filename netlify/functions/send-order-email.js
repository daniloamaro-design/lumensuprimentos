// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBDOv-Fx7056KRX7AnwQ53wuTAnJlUqDXg",
  authDomain: "lumen-passagens.firebaseapp.com",
  projectId: "lumen-passagens",
  storageBucket: "lumen-passagens.firebasestorage.app",
  messagingSenderId: "183562911494",
  appId: "1:183562911494:web:1d153435a14c25e0dd6887",
  measurementId: "G-0EC08DQZHN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);