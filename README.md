# ChoreQuest 🎮🏠
**NES-style Tetris chore tracker — shared in real time via Firebase**

Both phones see the same chores, completions, scores, and high scores. Data persists forever across days.

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### 1. Create a GitHub repo
- Go to [github.com](https://github.com) → **New repository**
- Name it `chorequest`, set **Public**, click **Create**

### 2. Upload all 5 files
On your new repo page → click **uploading an existing file** → drag all 5 files:
- `index.html`
- `style.css`
- `firebase.js`
- `audio.js`
- `README.md`

Click **Commit changes**

### 3. Enable GitHub Pages
- Go to repo **Settings → Pages**
- Source: **Deploy from a branch** → `main` branch → `/ (root)` → **Save**

### 4. Your URL (live in ~1 min)
```
https://YOUR-USERNAME.github.io/chorequest
```
Send this URL to your partner. You're both live! ✅

---

## ⚠️ Fix Firestore Security Rules
By default Firebase uses "test mode" which expires in 30 days.
To make it permanent:

1. Go to [Firebase Console](https://console.firebase.google.com) → **Firestore → Rules**
2. Replace the rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /household/{document=**} {
      allow read, write: if true;
    }
  }
}
```
3. Click **Publish**

---

## How to Play

1. **Add chores** from the main menu (shared — both phones see them instantly)
2. **Select your player**: YOU or PARTNER
3. Game board waits — **complete a chore → block drops!**
4. Move blocks: swipe left/right, tap to rotate, swipe down to drop
5. Clear rows to earn points
6. **Hi-score and best day** are tracked and shared between both phones

## What Syncs (Everything!)
| Data | Syncs? |
|------|--------|
| Chore list | ✅ Real-time |
| Daily completions | ✅ Real-time |
| Hi-score | ✅ Real-time |
| Best day record | ✅ Real-time |
| Current player | 🔒 Per-device (by design) |

## Files
```
index.html  — App shell & screens
style.css   — NES pixel art styling  
firebase.js — Game logic + Firebase sync
audio.js    — Chiptune sound effects
```
