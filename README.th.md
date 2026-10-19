# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · **ไทย** · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> ตัวเรียกใช้งานในเครื่องสำหรับทุกโปรเจกต์ GitHub ของคุณ: ดูสถานะ เริ่ม/หยุด และอัปเดตในคลิกเดียว

บริการ Node.js ที่ไม่มี dependency พร้อมแดชบอร์ดหน้าเดียว คอยตรวจสอบโปรเจกต์ เริ่มและหยุด รวมถึงดึงอัปเดต โดยไม่แก้ไขโค้ดของโปรเจกต์เลย

## เริ่มต้นอย่างรวดเร็ว

```bash
node src/index.js
```

เปิด: http://127.0.0.1:8780

ต้องใช้ Node.js 20+ รองรับ Windows อย่างเต็มที่ ส่วน Linux/macOS ใช้เลเยอร์แพลตฟอร์มในตัว

## คุณสมบัติ

- **สถานะในพริบตา** — สถานะการทำงาน พอร์ต PID และเวลาทำงาน รีเฟรชทุก 3 วินาที
- **เริ่ม / หยุด / รีสตาร์ท** — ใช้สคริปต์เริ่มต้นของแต่ละโปรเจกต์
- **อัปเดตในคลิกเดียว** — สำรองการเปลี่ยนแปลงที่ยังไม่ commit ชั่วคราว อัปเดตแล้วคืนกลับ หากล้มเหลวจะย้อนกลับ
- **ทุกสแตก** — Next.js, FastAPI, ไบนารี Go, Godot, pygame และบริการ pip ในตารางเดียว
- **UI สองภาษาและธีมสว่าง/มืด** — สลับจากแถบหัว จำค่าไว้ในเครื่อง
- **เป็นเพียงตัวเรียกใช้งาน** — ไม่รัน git init และไม่เขียนลงโปรเจกต์ที่จัดการ

## โปรเจกต์ที่จัดการ

| โปรเจกต์ | สแตก | พอร์ต | อัปเดต |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | ซิงก์ฟอร์ก |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | ด้วยตนเอง |
| wb2api-panel | Go | 7863 | ด้วยตนเอง |
| REA | TypeScript / CLI | — | ด้วยตนเอง |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | ด้วยตนเอง |

## ความปลอดภัยและการแยกส่วน

- รับฟังเฉพาะ 127.0.0.1 ไม่มีการยืนยันตัวตน (เครื่องมือในเครื่องสำหรับผู้ใช้คนเดียว)
- การตั้งค่าและบันทึกในเครื่องถูกตัดออกจาก git เผยแพร่เฉพาะตัวอย่างที่พกพาได้
- ไม่เขียนลงโปรเจกต์ที่จัดการ การเขียนเดียวคือการอัปเดตที่คุณสั่ง

## เอกสาร

- [การออกแบบและสถาปัตยกรรม (ภาษาจีน)](docs/design.md)
- [README ฉบับละเอียด (ภาษาจีน)](docs/README.full.zh-CN.md)
- `npm test` — 111 การทดสอบ: การแยกวิเคราะห์ การตรวจสอบการตั้งค่า ขั้นตอน git และการเรนเดอร์แดชบอร์ด
