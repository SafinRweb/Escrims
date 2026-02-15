# ⚔️ Escrims — Esports Tournament Platform

A modern, full-featured esports tournament management platform built with React, TypeScript, and Firebase. Create tournaments, manage brackets, track standings, and share live streams — all in one place.

![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?logo=firebase&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)

---

## ✨ Features

- **🏆 Tournament Creation** — Set up tournaments with custom team count, prize pool, logo, and description
- **👥 Team Management** — Add teams with names and optional logo URLs; edit anytime
- **📊 Live Standings Table** — Auto-calculated rankings with Kills, Deaths, K/D ratio, and Points
- **📅 Match Scheduling** — Set match dates/times with DD/MM/YYYY format and TBA/TBD status
- **🎮 Score Tracking** — Record match results; standings update automatically
- **📺 Livestream Integration** — Paste YouTube/Twitch links for live tournament coverage
- **🔐 Authentication** — Firebase Auth with organizer registration and admin roles
- **🛡️ Admin Dashboard** — Approve/reject tournaments, manage platform content
- **📰 News System** — Post and view esports news articles
- **📤 Export** — Download standings as data for external use
- **🌙 Dark Theme** — Sleek, modern dark UI built for gamers

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Icons | Lucide React |
| Routing | React Router DOM |
| Hosting | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase project (Firestore + Auth enabled)

### Installation

```bash
# Clone the repo
git clone https://github.com/SafinRweb/Escrims.git
cd Escrims

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

---

## 📁 Project Structure

```
src/
├── components/
│   ├── layout/          # Navbar, Footer
│   └── ui/              # Toast, ConfirmModal
├── lib/
│   ├── firebase.ts      # Firebase initialization
│   ├── AuthContext.tsx   # Auth provider & hooks
│   ├── admins.ts        # Admin email whitelist
│   └── tournamentLogic.ts  # Tournament types & logic
├── pages/
│   ├── Home.tsx          # Landing page
│   ├── Login.tsx         # User login
│   ├── RegisterOrganizer.tsx  # Organizer sign-up
│   ├── Dashboard.tsx     # Organizer dashboard
│   ├── CreateTournament.tsx   # Tournament creation wizard
│   ├── TournamentView.tsx     # Tournament details & management
│   ├── AdminDashboard.tsx     # Admin panel
│   ├── Rankings.tsx      # Global rankings
│   ├── News.tsx          # News listing
│   └── NewsDetail.tsx    # News article view
└── main.tsx              # App entry point
```

---

## 👤 Roles

| Role | Capabilities |
|------|-------------|
| **Visitor** | View tournaments, standings, news |
| **Organizer** | Create tournaments, manage matches, edit teams, set livestream links |
| **Admin** | Approve/reject tournaments, manage all content, delete tournaments |

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for the esports community
</p>
