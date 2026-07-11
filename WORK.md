# Work Log — GameCoverandPoint

เอกสารนี้บันทึกงานที่ทำกับระบบ Balance, Item, Camera และ Movement ตาม
`AI-SPEC-balance-items-camera.md`

## สถานะล่าสุด

- วันที่อัปเดต: 11 กรกฎาคม 2026
- Branch: `main`
- Feature commit: `8558b9c` — `Implement balanced items and lock gameplay camera`
- Client: Vercel — https://game-coverand-point.vercel.app/
- Server: Render — `wss://gamecoverandpoint.onrender.com`
- Server health: `https://gamecoverandpoint.onrender.com/health`
- Auto-deploy จาก GitHub ทำงานแล้วทั้ง Vercel และ Render

## PART C — Movement และ Character Smoothness

### สิ่งที่ทำแล้ว

- เพิ่ม acceleration จากหยุดนิ่งไปถึงความเร็วเป้าหมายประมาณ 0.12 วินาที
- เพิ่ม deceleration ตอนปล่อยปุ่มประมาณ 0.08 วินาที
- Normalize input แนวทแยง ป้องกันการวิ่งเร็วขึ้นเมื่อกดสองทิศพร้อมกันx
- ตัวละครคงทิศล่าสุดเมื่อหยุดเดิน
- เปลี่ยนการหมุนเป็น shortest-angle damping factor 12
- เพิ่ม `rotY` ใน move message และ Player schema
- Remote player รับ rotation จาก server และหมุนแบบ smooth
- Remote position ยังใช้ interpolation เพื่อลดการกระตุก
- ล้าง velocity เมื่อเดินไม่ได้หรือถูก stun ป้องกันตัวละครไถลหลังสถานะสิ้นสุด

### ไฟล์หลักที่แก้

- `client/src/entities3d/Character3D.ts`
- `client/src/entities3d/LocalPlayer3D.ts`
- `client/src/entities3d/RemotePlayer3D.ts`
- `client/src/schema/Player.ts`
- `server/src/schema/Player.ts`
- `server/src/rooms/GameRoom.ts`
- `shared/messages.ts`

## PART B — Camera Lock

### สิ่งที่ทำแล้ว

- ล็อกกล้อง isometric ที่ azimuth 45 องศา
- ใช้มุมกดมาตรฐาน `atan(1 / sqrt(2))` หรือประมาณ 35.26 องศา
- ล็อก zoom และ viewport scale ให้ผู้เล่นทุกคนเห็นพื้นที่เท่ากัน
- ปิดการหมุนกล้องด้วย Q/E
- ปิดการหมุนกล้องด้วย mouse drag
- ปิด wheel/trackpad zoom และเรียก `preventDefault()` ป้องกัน browser scroll
- เพิ่ม damped camera follow factor 5 ให้กล้องตามผู้เล่นอย่างนุ่มนวล
- อัปเดต Help UI ไม่ให้แสดงคำสั่งหมุนหรือซูมกล้องเดิม

### ไฟล์หลักที่แก้

- `client/src/screens/GameScreen.ts`
- `client/src/dom/GameHud.ts`

## PART A — Balance และ Item System

### Balance

- ลดความเร็ว Seeker จาก 220 เป็น 216 เทียบเท่าเร็วกว่า Hider 8%
- Inspect miss cooldown ตั้งเป็น 3 วินาที
- ตั้ง `MIN_PLAYERS` เป็น 1 ชั่วคราวสำหรับ solo visual/gameplay test
- Hider ที่ยังไม่ถูกจับได้รับโบนัส 25 คะแนนทุก 60 วินาที
- คงระบบ inspect budget และ relocate window เดิมของเกมไว้

### Item Box

- เปลี่ยนจุดเก็บ Smoke เดิมให้เป็นกล่องไอเท็มเรืองแสง
- เฉพาะ Hider สามารถเก็บได้
- เก็บอัตโนมัติเมื่อเดินเข้าใกล้
- ถือได้ครั้งละหนึ่งชิ้น
- ชนิดไอเท็มถูกสุ่มฝั่ง server ตอนเก็บ ไม่ได้กำหนดล่วงหน้าใน state
- น้ำหนักสุ่ม:
  - Smoke 30%
  - Decoy 30%
  - Stun Trap 25%
  - Sprint 15%
- ใช้ไอเท็มด้วยปุ่ม Q หรือกดช่องไอเท็มบน HUD
- ใช้ไอเท็มไม่ได้ขณะซ่อน, ถูกจับ หรือเป็น Ghost
- มี item-use cooldown 3 วินาทีต่อผู้เล่น
- ล้างไอเท็ม กล่องที่เก็บ และกับดักเมื่อเริ่มรอบใหม่

### Smoke Bomb

- ใช้ระบบ smoke cloud/daze ที่มีอยู่เดิม
- ระเบิดที่ตำแหน่งของ Hider
- ส่ง visual effect ให้ทุก client
- Seeker ในรัศมีถูกลดความเร็วและมี fog effect ชั่วคราว

### Decoy

- เชื่อม item เข้ากับระบบ fake-noise decoy เดิม
- ส่งตำแหน่งเสียงปลอมเฉพาะ Seeker
- เลือกจุดที่ไม่มี Hider ซ่อนอยู่ เพื่อไม่เปิดเผยตำแหน่งเพื่อนร่วมทีม

> สถานะปัจจุบันยังเป็น fake-noise ไม่ใช่ clone character ที่วิ่งจนชนกำแพง
> ตามสเปกฉบับเต็ม

### Stun Trap

- วางกับดักที่ตำแหน่งของ Hider
- กับดักอยู่ได้ 45 วินาที
- มีพร้อมกันได้สูงสุดสองอันทั้งแผนที่
- เมื่อวางอันที่สาม ระบบลบอันเก่าสุด
- Hider เห็นกับดักเป็นวงโปร่งแสง
- ตำแหน่งกับดักส่งด้วย private message เฉพาะ Hider
- Seeker ไม่ได้รับข้อมูลตำแหน่งกับดัก
- Seeker ที่เหยียบถูกหยุด 2.5 วินาที
- ยกเลิกความสามารถตรวจระหว่าง stun ด้วย inspect cooldown ฝั่ง server
- ลบกับดักเมื่อถูกเหยียบหรือหมดอายุ

### Sprint

- เพิ่มความเร็ว Hider 40%
- ระยะเวลา 4 วินาที
- `speedMultiplier` อยู่ใน server schema และถูก reset เมื่อหมดเวลา/เริ่มรอบใหม่

### UI

- เพิ่มช่องไอเท็มมุมล่างซ้าย
- แสดงชื่อและ icon ของไอเท็มที่ถือ
- แสดงข้อความ `กด Q ใช้`
- แสดง popup เมื่อเก็บไอเท็ม
- แสดง feedback เมื่อ Seeker ถูก stun
- แสดง feedback โบนัสรอดครบ 60 วินาที

## Anti-cheat และ Server Authority

- การสุ่มชนิดไอเท็มทำบน server ตอนเก็บ
- การเก็บกล่องตรวจระยะบน server
- การใช้ไอเท็มและ cooldown ตรวจบน server
- การเหยียบ, หมดอายุ และจำนวน Stun Trap ตัดสินบน server
- Server ปฏิเสธ movement ขณะ Seeker ถูก stun
- เพิ่ม filter ไม่ให้ Seeker ได้รับค่า `CoverPoint.isOccupied`
- ตำแหน่ง Hider ที่ซ่อนยังใช้ per-client schema filter เดิม
- `coverOccupants` และ `stunTraps` เก็บใน server memory ไม่ส่งใน public state

## การทดสอบที่ทำแล้ว

- `npm ci` ผ่านทั้ง client และ server
- `npm run build` ฝั่ง server ผ่าน TypeScript compile
- `npm run build` ฝั่ง client ผ่าน TypeScript และ Vite production build
- เปิด client บน local browser สำเร็จ
- สร้างห้องและเชื่อม local Colyseus server สำเร็จ
- ตรวจ production Vercel แล้วพบ bundle ใหม่
- เชื่อม production Render ด้วย Colyseus client สำเร็จ
- ตรวจ production server แล้วว่า:
  - Player schema มี `heldItem`
  - ห้องหนึ่งคนยังอยู่ phase `lobby`
- Host สามารถเริ่มรอบคนเดียวได้ใน solo test mode
- Health endpoint แสดง `release` และ `minPlayers` เพื่อยืนยันว่า Render ใช้ revision ใหม่

## หมายเหตุจาก Dependency Audit

- Server dependencies รายงาน 12 vulnerabilities: 2 low, 10 moderate
- Client dependencies รายงาน 2 vulnerabilities: 1 moderate, 1 high
- ยังไม่ได้ใช้ `npm audit fix --force` เพราะอาจเปลี่ยน major version และทำให้ระบบเดิมเสีย

## งานที่ยังเหลือ

- ทำ Decoy เป็น character clone ที่มีชื่อเหมือนผู้เล่นและวิ่งจนชนกำแพง
- ปรับ Smoke ให้เป็น cloud ทึบต่อเนื่อง 6 วินาที แทน effect/daze แบบเดิม
- เพิ่ม ribbon/รายละเอียด visual ให้กล่องของขวัญชัดขึ้น
- ทำ VFX ตอนซ่อนสำเร็จและถูกจับตาม animation spec ให้ครบ
- ทดสอบ pinch gesture บน Mac trackpad จริง
- ทดสอบ multiplayer 4–6 คนอย่างน้อยสามรอบ
- วัดอัตราชนะ Hider เป้าหมาย 40–60%
- จูน spawn interval, item drop rate, stun duration และจำนวน inspect จากผล playtest
- แยก Vite bundle เพราะ production bundle ปัจจุบันมีขนาดมากกว่า 500 kB
- วางแผนอัปเดต dependency หลังตรวจ breaking changes

## Visual Pass — Room Identity และ Office Set Dressing

- เพิ่มสีพื้น, สีขอบ, สีผนัง, ป้าย และ accent light แยกครบทุกห้อง
- กำหนด palette กลางใน `ROOM_VISUALS` เพื่อให้โลก 3D และ minimap ใช้สีตรงกัน
- Server Lab: เพิ่มตู้ rack, patch panel, status LED และ cable tray
- Lounge: เพิ่ม coffee table, แก้ว, floor lamp และมุมนั่งพัก
- Restroom: เพิ่มแนวกระเบื้อง, vanity counter, soap dispenser และถัง
- Work Zone A/B: เพิ่ม monitor, document tray, แก้ว และของบนโต๊ะ พร้อมคนละโทนสี
- Meeting Room: เพิ่ม presentation screen, projector, conference phone และสมุดประชุม
- Reception: เพิ่ม queue post, logo wall, parcel stack และพื้นที่รับแขก
- Phone Booth: เพิ่ม desk phone, acoustic panel และ status lamp
- เฟอร์นิเจอร์ GLB รับสี accent ของห้องแบบอ่อน ๆ โดยยังรักษา texture เดิม
- เพิ่ม marker ใต้ prop/cover ให้แต่ละห้องอ่านง่ายขึ้นโดยไม่เปิดเผย occupancy
- ผนังใช้สีเฉพาะห้อง ส่วนทางเดินกลางยังเป็นโทนกลางสำหรับ readability
- Minimap ใช้สีเดียวกับห้องในโลก 3D
- Minimap มุมขวาบนคลิกเพื่อขยาย/ย่อได้ และยังรองรับปุ่ม M
- คลิกฉากหลังของ minimap ขนาดใหญ่เพื่อปิดได้
- Visual ทั้งหมดเป็น cosmetic ไม่เปลี่ยน collision, spawn หรือ gameplay logic
- เปิด sRGB output และ ACES filmic tone mapping เพื่อให้สี/แสงมีมิติมากขึ้น
- เพิ่ม atmospheric fog และ hemisphere fill light ลดภาพแบน
- ลดมุมมองกล้องจาก 320 เป็น 270 world units เพื่อให้รายละเอียดอ่านง่ายขึ้น
- เพิ่มเส้นทางเดินหลัก, wayfinding strip สีห้อง และ light pool บนพื้นทางเดิน

## คำสั่งตรวจสอบก่อน Deploy

```bash
npm run build --prefix server
npm run build --prefix client
git diff --check
git status
```

## Office Missions และ Pattern Pass

- เพิ่ม mission pool เจ็ดภารกิจที่ผูกกับ Server, Lounge, Restroom, Work Zone A/B, Meeting และ Reception
- สุ่มสามภารกิจใหม่ทุกต้นรอบและ sync ผ่าน Colyseus schema
- Hider ทำภารกิจได้เฉพาะ phase SEEK, ต้องไม่ซ่อน/ถูกจับ และต้องอยู่ในระยะ prop จริง
- กด E ที่วง mission สีเหลืองเพื่อทำภารกิจ
- ภารกิจละ 30 คะแนน; ทำครบทั้งชุดให้ผู้รอดคนละ 50 คะแนนและลดเวลารอบ 20 วินาที
- HUD แสดง `OFFICE MISSIONS 0/3` และขีดฆ่ารายการที่ทำแล้ว
- Minimap แสดง marker สีเหลืองของภารกิจที่ยังไม่สำเร็จ
- จุดภารกิจในโลกมี ring และ diamond animation
- เปลี่ยนชื่อห้องใน map, minimap และ room hint เป็นภาษาอังกฤษ
- เพิ่มลวดลายพื้นเฉพาะห้อง: server grid, restroom tiles, work-zone carpet, meeting/lounge rug และ reception diagonal pattern
- ช่องไอเท็มใช้สี/gradient ต่างกันสำหรับ Smoke, Decoy, Stun และ Sprint
- Server ปฏิเสธการทำ mission จากระยะไกล (ตรวจ integration แล้ว)
