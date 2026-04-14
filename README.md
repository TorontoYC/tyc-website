# Toronto Yacht Club — Website

Static HTML/CSS/JS website for Toronto Yacht Club, a marine detailing and repair company serving the Greater Toronto Area.

## Tech Stack
- **HTML/CSS/JS** — no frameworks
- **Vercel** — hosting (auto-deploys from this repo)
- **Google Fonts** — DM Serif Display + Source Sans 3

## Local Development
Open any `.html` file in your browser, or use a local server:
```
npx serve .
```

## Deployment
Push to `main` → Vercel auto-deploys.

## Structure
```
├── index.html              Home
├── services/index.html     Services
├── history/index.html      About Us
├── ourwork/index.html      Our Work (gallery)
├── inquiries/index.html    Contact / Inquiry Form
├── local-listings/index.html  Boats for Sale
├── sell-your-boat/index.html  Sell Your Yacht
├── css/style.css           Main stylesheet
├── js/main.js              Nav toggle, lightbox
├── images/                 Site images (add after downloading from Squarespace)
├── robots.txt              Search engine directives
├── sitemap.xml             Sitemap for Google
└── vercel.json             Vercel routing config
```

## TODO
- [ ] Download images from old Squarespace site and add to /images/
- [ ] Connect form submissions to backend (Formspree/Supabase/Vercel function)
- [ ] Add hero background image to homepage
- [ ] Populate Our Work gallery with real photos
- [ ] Get Downtown Toronto exact address from Javier
- [ ] Set up Google Search Console after launch
