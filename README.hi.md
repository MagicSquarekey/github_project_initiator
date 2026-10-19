# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · **हिन्दी** · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> आपके सभी GitHub प्रोजेक्ट्स के लिए एक स्थानीय लॉन्चर: स्थिति, स्टार्ट/स्टॉप और एक-क्लिक अपडेट।

बिना किसी निर्भरता वाली Node.js सेवा और सिंगल-पेज डैशबोर्ड। यह आपके प्रोजेक्ट्स की निगरानी करती है, उन्हें चालू/बंद करती है और अपडेट लाती है — बिना उनका कोड बदले।

## त्वरित शुरुआत

```bash
node src/index.js
```

खोलें: http://127.0.0.1:8780

Node.js 20+ आवश्यक। Windows पूरी तरह समर्थित; Linux/macOS अंतर्निहित प्लेटफ़ॉर्म लेयर का उपयोग करते हैं।

## विशेषताएँ

- **एक नज़र में स्थिति** — रनिंग स्थिति, पोर्ट, PID और अपटाइम, हर 3 सेकंड में ताज़ा।
- **स्टार्ट / स्टॉप / रीस्टार्ट** — हर प्रोजेक्ट की अपनी स्टार्ट स्क्रिप्ट का उपयोग।
- **एक-क्लिक अपडेट** — बिना कमिट किए बदलावों को अस्थायी रूप से सहेजता है, अपडेट करता है और फिर बहाल करता है; विफलता पर रोलबैक।
- **कोई भी स्टैक** — Next.js, FastAPI, Go बाइनरी, Godot, pygame और pip सेवाएँ एक ही तालिका में।
- **द्विभाषी UI और लाइट/डार्क** — हेडर से बदलें, पसंद स्थानीय रूप से याद रहती है।
- **केवल लॉन्चर** — प्रबंधित प्रोजेक्ट्स में कभी git init नहीं चलाता और न ही लिखता है।

## प्रबंधित प्रोजेक्ट्स

| प्रोजेक्ट | स्टैक | पोर्ट | अपडेट |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | फ़ोर्क सिंक |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | मैन्युअल |
| wb2api-panel | Go | 7863 | मैन्युअल |
| REA | TypeScript / CLI | — | मैन्युअल |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | मैन्युअल |

## सुरक्षा और अलगाव

- केवल 127.0.0.1 पर सुनता है, कोई प्रमाणीकरण नहीं (एकल-उपयोगकर्ता स्थानीय टूल)।
- स्थानीय कॉन्फ़िग और लॉग git से बाहर रखे गए हैं; केवल एक पोर्टेबल उदाहरण प्रकाशित होता है।
- प्रबंधित प्रोजेक्ट्स में कभी नहीं लिखता; एकमात्र लेखन वह अपडेट है जो आप चलाते हैं।

## दस्तावेज़

- [डिज़ाइन और आर्किटेक्चर (चीनी में)](docs/design.md)
- [विस्तृत README (चीनी में)](docs/README.full.zh-CN.md)
- `npm test` — 111 परीक्षण: पार्सिंग, कॉन्फ़िग सत्यापन, git प्रवाह और डैशबोर्ड रेंडरिंग
