# AKNOVA AI

Apna khud ka AI chatbot — Groq API ke upar bana hua, login system aur tumhari branding ke saath.

## Kaise kaam karta hai

```
Browser (index.html/script.js) → Netlify Function (chat.js) → Groq API
```

Tumhari API key sirf server-side (`chat.js`) mein rehti hai — browser mein kabhi nahi jaati.

**Zaroori: API key kabhi bhi chat mein Claude ko mat bhejo.** Chat history save hoti hai, aur ye security risk hai. Key hamesha seedha Netlify environment variables mein dalna.

---

## Setup — 6 steps

### 1. Groq API key lo (FREE)
1. https://console.groq.com pe account banao (Google se sign up kar sakte ho)
2. **API Keys** section mein jao, "Create API Key" karo
3. Key copy kar lo (sirf ek dafa dikhti hai)
4. Groq ka free tier generous hai — student project ke liye kaafi hai

### 2. Is folder ko GitHub pe push karo
```bash
cd AKNOVA
git init
git add .
git commit -m "AKNOVA AI"
git remote add origin <tumhara-github-repo-url>
git push -u origin main
```

### 3. Netlify pe deploy karo
1. https://app.netlify.com pe login karo
2. **Add new site → Import an existing project**
3. GitHub repo select karo
4. Build settings khali chorr do (`netlify.toml` mein already set hai)
5. **Deploy site** dabao

### 4. API key ko Netlify mein set karo (ZAROORI)
1. Netlify dashboard mein apni site kholo
2. **Site configuration → Environment variables → Add a variable**
3. Key: `GROQ_API_KEY`
4. Value: apni copied Groq key paste karo
5. Save karo, phir **Deploys → Trigger deploy** karo

### 5. Login system enable karo (Netlify Identity)
1. Netlify dashboard mein **Site configuration → Identity → Enable Identity**
2. Registration preference: "Open" ya "Invite only" choose karo
3. **External providers → Add provider → Google** — enable kar do (Netlify khud Google OAuth handle karta hai, tumhe kuch setup nahi karna)
4. Save karo — bas ho gaya, koi code change nahi chahiye

Login button top-right mein dikhega. Email/password aur "Log in with Google" dono automatically kaam karenge.

**Facebook login:** Netlify Identity Facebook support nahi karta (sirf Google, GitHub, GitLab, Bitbucket). Agar Facebook login zaroori hai to Auth0 ya Firebase Auth use karna paray ga — thora zyada setup hai, bata dena to wo bhi bana dunga.

### 6. Test karo
Apni Netlify URL kholo, "Log in" try karo, phir koi message chatbot ko bhejo.

---

## Founder identity (already built-in)

Agar koi AI se poochay "tumhara founder kaun hai" / "who made you" / "who is your creator" — kisi bhi language mein (Urdu, Roman Urdu, English) — AI khud bata dega ke **AK company** ne banaya hai aur founder **AK ABDULLAHKING** hai, usi language mein jis mein sawal poocha gaya ho. Ye `netlify/functions/chat.js` ke `SYSTEM_PROMPT` mein set hai.

## Cost samajhna

Groq ka free tier hai lekin rate limits ke saath — heavy traffic pe upgrade ki zaroorat par sakti hai. Current limits check karo: https://console.groq.com/docs/rate-limits

## Customize karna

- **Naam/branding**: `index.html` mein "AKNOVA" replace karo
- **Colors**: `style.css` ke top pe `:root` variables
- **AI ka personality/founder text**: `netlify/functions/chat.js` mein `SYSTEM_PROMPT`
- **Model**: same file mein `GROQ_MODEL` (dusre Groq models: https://console.groq.com/docs/models)

## ChatGPT jaisa aur behtar banana ho to (agli iteration mein add kar sakte hain)

- Copy button har message pe
- Regenerate response button
- Stop generating button (streaming responses)
- Message edit karna
- Dark/light mode toggle
- Chat history ko login ke saath save karna (abhi sirf session ke liye hai)

Bata dena kaunsa pehle chahiye, add kar dunga.

## Files

```
AKNOVA/
├── index.html                    → chat UI + login button
├── style.css                     → design (nova-burst theme, starfield, glass effects)
├── script.js                     → frontend logic, starfield animation, login (Netlify Identity)
├── netlify.toml                  → Netlify build config
├── netlify/functions/chat.js     → secure backend, calls Groq API, founder identity rule
└── README.md                     → ye file
