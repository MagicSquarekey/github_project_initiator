# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · **বাংলা** · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> আপনার সব GitHub প্রজেক্টের জন্য একটি লোকাল লঞ্চার: স্ট্যাটাস, চালু/বন্ধ এবং এক ক্লিকে আপডেট।

কোনো নির্ভরতা ছাড়া Node.js সার্ভিস ও একক-পৃষ্ঠার ড্যাশবোর্ড। এটি আপনার প্রজেক্ট মনিটর করে, চালু ও বন্ধ করে, আপডেট আনে — প্রজেক্টের কোড কখনো না বদলে।

## দ্রুত শুরু

```bash
node src/index.js
```

খুলুন: http://127.0.0.1:8780

Node.js 20+ প্রয়োজন। Windows সম্পূর্ণ সমর্থিত; Linux/macOS অন্তর্নির্মিত প্ল্যাটফর্ম লেয়ার ব্যবহার করে।

## বৈশিষ্ট্য

- **এক নজরে স্ট্যাটাস** — চলমান অবস্থা, পোর্ট, PID ও আপটাইম, প্রতি ৩ সেকেন্ডে হালনাগাদ।
- **চালু / বন্ধ / রিস্টার্ট** — প্রতিটি প্রজেক্টের নিজস্ব স্টার্ট স্ক্রিপ্ট ব্যবহার করে।
- **এক ক্লিকে আপডেট** — কমিট না করা পরিবর্তন সাময়িকভাবে সংরক্ষণ করে, আপডেট করে এবং ফিরিয়ে দেয়; ব্যর্থ হলে রোলব্যাক।
- **যেকোনো স্ট্যাক** — Next.js, FastAPI, Go বাইনারি, Godot, pygame ও pip সার্ভিস একই টেবিলে।
- **দ্বিভাষিক UI ও লাইট/ডার্ক** — হেডার থেকে বদলান, পছন্দ লোকালি সংরক্ষিত।
- **শুধু লঞ্চার** — ম্যানেজ করা প্রজেক্টে কখনো git init চালায় না বা লেখে না।

## ম্যানেজ করা প্রজেক্ট

| প্রজেক্ট | স্ট্যাক | পোর্ট | আপডেট |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | ফর্ক সিঙ্ক |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | ম্যানুয়াল |
| wb2api-panel | Go | 7863 | ম্যানুয়াল |
| REA | TypeScript / CLI | — | ম্যানুয়াল |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | ম্যানুয়াল |

## নিরাপত্তা ও বিচ্ছিন্নতা

- শুধু 127.0.0.1-এ শোনে, কোনো প্রমাণীকরণ নেই (একক-ব্যবহারকারী লোকাল টুল)।
- লোকাল কনফিগ ও লগ git থেকে বাদ; শুধু একটি পোর্টেবল উদাহরণ প্রকাশিত হয়।
- ম্যানেজ করা প্রজেক্টে কখনো লেখে না; একমাত্র লেখা হলো আপনার চালানো আপডেট।

## ডকুমেন্টেশন

- [ডিজাইন ও আর্কিটেকচার (চীনা)](docs/design.md)
- [বিস্তারিত README (চীনা)](docs/README.full.zh-CN.md)
- `npm test` — ১১১টি পরীক্ষা: পার্সিং, কনফিগ যাচাই, git প্রবাহ ও ড্যাশবোর্ড রেন্ডারিং
