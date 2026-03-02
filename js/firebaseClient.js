// Firebase client setup for Pausa
// Centraliza la configuración para que no tengas que tocarla en varios archivos.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Proyecto Firebase específico de Pausa
const firebaseConfig = {
  apiKey: "AIzaSyA09PTOAdqFWqY86hJVYsx5kfPwlTJI0Bc",
  authDomain: "pausa-39df2.firebaseapp.com",
  projectId: "pausa-39df2",
  storageBucket: "pausa-39df2.firebasestorage.app",
  messagingSenderId: "713583439467",
  appId: "1:713583439467:web:6f965fd003afb796d50b2e"
};

const app = initializeApp(firebaseConfig);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (_) {
  // Analytics puede fallar en localhost; no es crítico.
}

const db = getFirestore(app);

export { app, analytics, db };

