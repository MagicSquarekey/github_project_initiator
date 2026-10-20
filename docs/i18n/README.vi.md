# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · **Tiếng Việt** · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Trình khởi chạy cục bộ cho mọi dự án GitHub của bạn: trạng thái, khởi động/dừng và cập nhật một cú nhấp.

Dịch vụ Node.js không phụ thuộc với bảng điều khiển một trang. Theo dõi dự án, khởi động và dừng chúng, tải bản cập nhật — không bao giờ sửa mã nguồn của chúng.

## Bắt đầu nhanh

```bash
node src/index.js
```

Mở: http://127.0.0.1:8780

Cần Node.js 20+. Windows được hỗ trợ đầy đủ; Linux/macOS dùng lớp nền tảng tích hợp.

## Tính năng

- **Trạng thái trong nháy mắt** — trạng thái chạy, cổng, PID và thời gian hoạt động, làm mới mỗi 3 giây.
- **Khởi động / dừng / khởi động lại** — dùng lại script khởi động riêng của từng dự án.
- **Cập nhật một cú nhấp** — tạm lưu thay đổi chưa commit, cập nhật rồi khôi phục; nếu lỗi sẽ hoàn tác.
- **Mọi công nghệ** — Next.js, FastAPI, tệp nhị phân Go, Godot, pygame và dịch vụ pip trong cùng một bảng.
- **Thêm dự án từ bảng điều khiển** — chọn thư mục; lệnh khởi chạy và cổng được tự động nhận diện, không cần sửa JSON.
- **Giao diện song ngữ và sáng/tối** — chuyển ở thanh đầu, ghi nhớ cục bộ.
- **Chỉ là trình khởi chạy** — không bao giờ chạy git init hay ghi vào dự án được quản lý.

## Dự án được quản lý

| Dự án | Công nghệ | Cổng | Cập nhật |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | đồng bộ fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | thủ công |
| wb2api-panel | Go | 7863 | thủ công |
| REA | TypeScript / CLI | — | thủ công |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | thủ công |

## Bảo mật và cô lập

- Chỉ lắng nghe trên 127.0.0.1, không xác thực (công cụ cục bộ một người dùng).
- Cấu hình và nhật ký cục bộ được loại khỏi git; chỉ công bố một ví dụ di động.
- Không bao giờ ghi vào dự án được quản lý; thao tác ghi duy nhất là cập nhật do bạn kích hoạt.

## Tài liệu

- [Thiết kế và kiến trúc (tiếng Trung)](../design.md)
- [README chi tiết (tiếng Trung)](../README.full.zh-CN.md)
- `npm test` — 190 bài kiểm thử: phân tích, xác thực cấu hình, luồng git và kết xuất bảng điều khiển
