# WebGSD2

เว็บไซต์ ฝ่ายอำนวยการ ๒ กองบัญชาการตำรวจตระเวนชายแดน — https://www.bppgsd2.com
(GitHub Pages + Firebase โปรเจกต์ `gsd2-532a1`) — เว็บแบบ static ไม่ต้อง build

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้าเว็บทุกหน้า + หน้าต่างป๊อปอัป + ชุดไอคอน SVG |
| `assets/css/app.css` | ดีไซน์ทั้งหมด (คงชุดสีเดิม navy / slate / ฟ้า `#38bdf8`) |
| `assets/js/app.js` | ระบบเว็บ: เปลี่ยนหน้า, ล็อกอิน, แจ้งเบาะแส, ข่าว, เอกสาร, สถิติ, ระบบเจ้าหน้าที่ |
| `assets/img/` | ไอคอนเว็บ, ภาพแชร์โซเชียล (`og.jpg`), ลายแผนที่เส้นชั้นความสูง |
| `images/` , `images/sm/` | รูปผู้บังคับบัญชา (ต้นฉบับ / ย่อขนาดที่เว็บใช้จริง) |
| `404.html`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest` | ไฟล์มาตรฐานสำหรับ production |
| `firestore.rules`, `storage.rules` | กฎความปลอดภัย Firebase |

> แก้ CSS/JS แล้ว ให้เปลี่ยนเลข `?v=...` ท้ายลิงก์ใน `index.html` เพื่อให้เบราว์เซอร์โหลดไฟล์ใหม่

## หน้าเว็บ

| ลิงก์ | หน้า |
|---|---|
| `#/` | หน้าหลัก + ปุ่มแจ้งเบาะแส + ข่าวล่าสุด |
| `#/command` | โครงสร้างสายบังคับบัญชา |
| `#/stats` | สถิติผลการปฏิบัติงาน (จาก `public/stats`) |
| `#/news` , `#/news/<id>` | ข่าวสารและประกาศ (จาก `bulletins`) ลิงก์ตรงไปยังข่าวได้ |
| `#/docs` | คลังเอกสาร (จาก `documents`) + แฟ้มลับสำหรับเจ้าหน้าที่ |
| `#/contact` | ติดต่อหน่วยงาน |
| `#/console` | **ระบบเจ้าหน้าที่** (ต้องล็อกอินและมีสิทธิ์ staff) |

## ระบบเจ้าหน้าที่ (`#/console`)

- **เบาะแส** — ดูเบาะแสจากประชาชน, เปลี่ยนสถานะ (ใหม่ / กำลังตรวจสอบ / ปิดเรื่อง), เขียนบันทึกภายใน, ลบ
  แต่ละเรื่องมี *เลขอ้างอิง* 8 หลัก ตรงกับที่ผู้แจ้งได้รับหลังส่ง
- **ข่าวสาร** — เพิ่ม/แก้/ลบข่าว 3 ประเภท: ประชาสัมพันธ์, แจ้งเตือนภัย, ประกาศสืบหา (ใส่ลิงก์รูป https ได้)
- **เอกสาร** — เพิ่มลิงก์ไฟล์สาธารณะ (เช่น ลิงก์แชร์ Nextcloud / Google Drive)
- **สถิติ** — แก้ตัวเลข 4 ช่อง + หมายเหตุ บันทึกแล้วหน้าสถิติอัปเดตทันที

ผู้ใช้ทุกคนกด "ลืมรหัสผ่าน" ในหน้าล็อกอินเพื่อรับลิงก์ตั้งรหัสใหม่ทางอีเมลได้

## ตั้งค่า Firebase (ทำครั้งเดียว)

1. **Authentication → Sign-in method** เปิด *Email/Password*
2. **Authentication → Settings → User actions** ปิด *Enable create (sign-up)* เพื่อไม่ให้คนนอกสมัครเอง
3. **Authentication → Settings → Authorized domains** เพิ่ม `www.bppgsd2.com` และ `bppgsd2.com`
4. **Authentication → Users** เพิ่มบัญชีเจ้าหน้าที่
5. **Firestore** สร้างเอกสาร `staff/{UID}` ให้เจ้าหน้าที่แต่ละคน (ใส่ field อะไรก็ได้ เช่น `name`) — มีเอกสารนี้ = มีสิทธิ์เจ้าหน้าที่
6. **Deploy กฎความปลอดภัยชุดใหม่ (จำเป็น)** — กฎนี้เปิดให้อ่าน `bulletins` / `documents` และให้เจ้าหน้าที่จัดการได้
   ถ้ายังไม่ deploy หน้าข่าวและเอกสารจะว่าง และระบบเจ้าหน้าที่จะบันทึกข่าว/เอกสารไม่ได้
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,storage
   ```
   หรือคัดลอก `firestore.rules` ไปวางใน Console → Firestore → Rules แล้วกด Publish

ข้อมูลที่เว็บใช้ (สร้างผ่านระบบเจ้าหน้าที่ได้ ไม่ต้องสร้างเอง):

```
public/stats      { drugSeizures, illegalEntry, intelReports, patrols: number, notes: map, updatedAt }
bulletins/{id}    { title, summary, body, category: news|alert|wanted, imageUrl, publishedAt, updatedAt, authorUid }
documents/{id}    { code, title, url (https), fileType, category, updatedAt }
clue_reports/{id} { type, details, contact, createdAt, status?, staffNote?, updatedAt? }
```

## เซิร์ฟเวอร์แฟ้มลับ (พอร์ต 1009)

ตั้งค่าที่ `CONFIG.secureApiBase` ใน `assets/js/app.js` (ตั้งเป็น `""` เพื่อปิดส่วนนี้)
ต้องเป็น **HTTPS** และเข้าถึงได้จากอินเทอร์เน็ต — ค่าปัจจุบัน `http://100.92.143.123:1009` เป็น IP ของ Tailscale และเป็น http
เบราว์เซอร์จึงบล็อก (เว็บจะแสดงคำเตือนให้เจ้าหน้าที่) ใช้ Cloudflare Tunnel หรือ Tailscale Funnel แล้วใส่ URL https ใหม่

ฝั่งเซิร์ฟเวอร์ต้อง:
- ใช้ service account ของโปรเจกต์ **`gsd2-532a1`**
- ตรวจ `Authorization: Bearer <ID token>` ด้วย `verifyIdToken()` ทุกคำขอ และเช็กว่ามีเอกสาร `staff/{uid}`
- ตั้ง CORS อนุญาต origin `https://www.bppgsd2.com`
- กัน path traversal ใน `/api/download/:name` (ห้ามมี `..`, `/`, `\`)

## ทดสอบในเครื่อง

```bash
python3 -m http.server 5520
```
แล้วเปิด http://localhost:5520
