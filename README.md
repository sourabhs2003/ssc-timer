# ssc-timer

A high-performance, mobile-first Progressive Web App (PWA) called "SSC-X Focus Tracker" designed for SSC CGL 2027 preparation.

## Features
- **Study Timer + Session Tracker:** Tracks focus sessions with subjects, durations, and timestamps.
- **Subject Management:** Add, edit, and organize study subjects by strength.
- **Target System:** Counts down to syllabus and exam deadlines, and calculates dynamic daily study hour requirements.
- **Analytics Dashboard:** Animated charts showing daily, weekly, and subject-wise study distributions.
- **Streak System:** Tracks continuous study days to build consistency.
- **Offline First:** Backs up data to LocalStorage automatically while syncing to Firebase Firestore.

## Stack
- HTML, CSS, JavaScript (Vanilla Single Page App)
- Chart.js for data visualization
- Firebase Firestore for cloud sync (prefix: `sscx_`)
