# WebGSD2

เว็บไซต์ ฝ่ายอำนวยการ ๒ กองบัญชาการตำรวจตระเวนชายแดน — https://www.bppgsd2.com
(GitHub Pages + Firebase โปรเจกต์ `gsd2-532a1`)

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | ตัวเว็บทั้งหมด (Tailwind CDN + Firebase JS SDK) |
| `firestore.rules` | กฎความปลอดภัย Firestore |
| `storage.rules` | กฎความปลอดภัย Cloud Storage |
| `firebase.json`, `.firebaserc` | ตั้งค่าสำหรับ deploy กฎด้วย Firebase CLI |

## ตั้งค่าโปรเจกต์ Firebase ใหม่ (ทำครั้งเดียว)

1. **Authentication → Sign-in method** เปิด *Email/Password*
2. **Authentication → Settings → User actions** ปิด *Enable create (sign-up)* เพื่อไม่ให้คนนอกสมัครบัญชีเองได้
3. **Authentication → Settings → Authorized domains** เพิ่ม `www.bppgsd2.com` และ `bppgsd2.com`
4. **Authentication → Users** เพิ่มบัญชีเจ้าหน้าที่ (โปรเจกต์เดิม `webgsd2` ย้ายบัญชีมาไม่ได้อัตโนมัติ ต้องสร้างใหม่ หรือใช้ `firebase auth:export` / `auth:import`)
5. **Firestore Database** สร้างฐานข้อมูล แล้วเพิ่มข้อมูลเหล่านี้
   - `staff/{uid ของเจ้าหน้าที่}` สร้างเอกสารชื่อเดียวกับ UID ของแต่ละคน (ใส่ field อะไรก็ได้ เช่น `name`) คนที่มีเอกสารนี้ = เจ้าหน้าที่
   - `public/stats` ตัวเลขหน้ากระดานสถิติ:
     ```
     drugSeizures: 1402        (number)
     illegalEntry: 854         (number)
     intelReports: 320         (number)
     patrols: 128              (number)
     notes: { drugSeizures: "+12% จากเดือนที่แล้ว", ... }   (map, ไม่บังคับ)
     updatedAt: <timestamp>
     ```
6. Deploy กฎ:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,storage
   ```
   หรือคัดลอกเนื้อหา `firestore.rules` / `storage.rules` ไปวางใน Console → Rules แล้วกด Publish

## เซิร์ฟเวอร์ไฟล์ลับ (พอร์ต 1009)

ตัวแปร `SECURE_API_BASE_URL` ใน `index.html` ต้องเป็น **HTTPS** และเข้าถึงได้จากอินเทอร์เน็ต
เพราะเว็บอยู่บน HTTPS เบราว์เซอร์จะบล็อกการเรียก `http://` (mixed content) และ IP `100.x.x.x` เป็นของ Tailscale คนนอกเครือข่ายจึงเข้าไม่ถึง
ตัวเลือก: Cloudflare Tunnel (`cloudflared`) หรือ Tailscale Funnel แล้วใส่ URL ใหม่ใน `SECURE_API_BASE_URL`

ฝั่งเซิร์ฟเวอร์ต้อง:
- เปลี่ยน Firebase Admin SDK ให้ใช้ service account ของโปรเจกต์ **`gsd2-532a1`** (token จากโปรเจกต์ใหม่จะใช้กับโปรเจกต์เก่าไม่ได้)
- ตรวจ `Authorization: Bearer <ID token>` ด้วย `verifyIdToken()` ทุกคำขอ และเช็กว่ามีเอกสาร `staff/{uid}` ด้วย
- ตั้ง CORS ให้อนุญาต origin `https://www.bppgsd2.com`
- กัน path traversal ใน `/api/download/:name` (ห้ามมี `..`, `/`, `\`)
