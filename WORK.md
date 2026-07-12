# Work Log — GameCoverandPoint

เอกสารนี้บันทึกงานที่ทำกับระบบ Balance, Item, Camera และ Movement ตาม
`AI-SPEC-balance-items-camera.md`

## สถานะล่าสุด

- วันที่อัปเดต: 12 กรกฎาคม 2026
- Branch: `main`
- Feature commit ล่าสุด: `659ba6b` — `Show scan radius as a ground ring + add cooldown countdown to HUD`
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

## Role Visibility, Visible Decoy และ Teammate Camera

- Mission HUD, mission rings และ task markers แสดงเฉพาะ Hider
- Seeker ไม่มี minimap และกด M เปิดไม่ได้; Ghost ยังใช้ minimap ดูรอบเกมได้
- Mission panel ระบุชัดว่าเป็น `HIDER MISSIONS`, ไปที่ ◆ แล้วกด E และ Seeker มองไม่เห็น
- เปลี่ยน Decoy จาก fake-noise ที่มองไม่เห็นเป็น fake employee จริง
- Decoy ใช้หน้าตา, nickname และทิศหันของเจ้าของ วิ่งเป็นเวลาไม่เกิน 5 วินาที
- Decoy หายเป็นควันเมื่อชนกำแพงหรือหมดเวลา และ broadcast ให้ทุก role เห็นเหมือนกัน
- กล่องสุ่มเปลี่ยนจากกล่องแดงธรรมดาเป็น Mystery Gift สีม่วงพร้อม ribbon/halo สีทอง
- หลังเก็บ ไอเท็มที่ถือมี emoji ลอยเหนือผู้เล่นและ HUD pattern เฉพาะ Smoke/Decoy/Stun/Sprint
- Hider กด C เพื่อ cycle กล้องไปดูเพื่อนที่ยังเล่นอยู่เป็นเวลา 4 วินาที โดยไม่ย้ายตัวละคร
- ทดสอบ Decoy ด้วยสอง client แล้วทั้ง Hider และ Seeker ได้ payload เดียวกัน

## Work Zone A Access และ Stable Lights

- พบ cubicle partition แนวตั้งตัดผ่าน top doorway ของ Work Zone A ทำให้ช่องเดินแคบเกือบเท่าตัวละคร
- ตัด collision ของ divider แนวตั้งดังกล่าวออก แต่เก็บ horizontal cubicle dividers ไว้
- ตรวจ path ผ่าน top doorway เป็นช่วงต่อเนื่องแล้วไม่มี collision
- ย้าย `SUBMIT THE REPORT` ออกจาก light switch ไปยัง prop ใหม่ `worka-report`
- เพิ่ม Report Terminal ที่มี pedestal, document tray และจอ cyan เรืองแสง
- ตรวจตำแหน่ง Report Terminal ฝั่ง server แล้วไม่ชนกำแพง
- เปลี่ยน dark-room overlay จาก transparent 3D box หกด้านเป็น plane เดียวเหนือห้อง
- ลดปัญหา transparent sorting/z-fighting ที่ทำให้ไฟดูเหมือนกระพริบระหว่าง fade

## Playtest Feedback Round — Minimap Leak, Seeker Abilities, Mission Cooldown

หลัง demo กับ user รอบล่าสุด ได้ feedback 5 ข้อ + ตามมาอีก 2 ข้อย่อย แก้ครบทุกข้อแล้ว
โดยไม่แตะระบบซ่อน/ตรวจ/จับเดิม

### 1. Minimap รั่วเห็นคนหา

- Hider เห็น minimap/map ปกติ แต่ก่อนหน้านี้เห็นตำแหน่ง Seeker ปนอยู่ด้วย ทั้งที่ไม่ควรเห็น
- แก้โดยกรอง remote players ที่ role เป็น `seeker` ออกจาก minimap render เฉพาะตอนผู้ชมไม่ใช่ Ghost
- Ghost (ผู้ถูกจับ/สเปกเตเตอร์) ยังเห็นทุกคนเหมือนเดิม ไม่กระทบ

### 2. Seeker Scan Ability (F, cooldown 15 วิ)

- Seeker กด `F` เพื่อสแกนหา Hider ที่กำลังซ่อนอยู่ในรัศมี 220px รอบตัว (คนที่ไม่ได้ซ่อนไม่นับ เพราะเห็นอยู่แล้วในโลก 3D)
- เป็น one-shot private snapshot ส่งเฉพาะ client ที่ขอ ไม่ใช่ live tracking ต่อเนื่อง (กัน cheat)
- แสดงผลเป็นเงาคนสีดำ (shadow silhouette) ยืนอยู่ตรงตำแหน่งจริงเป็นเวลา 3 วินาทีแล้วจางหาย
- เพิ่มวงแหวนขยายรัศมี (ground ring) ที่ตำแหน่ง Seeker ตอนกด F: สีแดงถ้าเจอคนซ่อน สีฟ้าถ้าไม่เจอ ให้เห็นชัดว่าโซนที่สแกนครอบคลุมแค่ไหน
- เพิ่ม HUD countdown "สแกนพร้อมใช้อีก N วิ" ระหว่างติด cooldown จะหายไปเองเมื่อพร้อมใช้ใหม่
- เพิ่ม persistent hint `[F] สแกนหาคนซ่อนในรัศมี` ให้ Seeker เห็นตลอดเวลาที่ไม่มี prompt อื่นซ้อนอยู่

### 3. ปรับสมดุลความเร็ว Seeker

- เพิ่มความเร็ว Seeker จาก 216 เป็น 230 (Hider คงที่ 200) ให้รู้สึกว่า Seeker เร็วกว่าอย่างชัดเจนขึ้นแต่ไม่มากเกินไป

### 4. Cooldown ระหว่างทำ Office Mission

- เพิ่ม cooldown 12 วินาทีต่อผู้เล่นระหว่างทำภารกิจสำเร็จแต่ละอัน ป้องกันการรัวทำภารกิจติดกันทันที

### 5. ภารกิจของ Seeker — Trace Terminal

- เพิ่มจุด Trace Terminal ที่ Reception (เสาอำพัน/ทอง มีจอเรืองแสงและจานดาวเทียม แยกจาก Report Terminal สีฟ้าของ Hider)
- Seeker เดินไปกด SPACE ที่จุดนี้ (cooldown 60 วิ) จะได้ตำแหน่งของ Hider ทุกคนที่ยังไม่ถูกจับ (รวมคนที่ไม่ได้ซ่อนด้วย) เป็นเวลา 10 วินาที
- แสดงเป็นเงาคนสีดำที่ตำแหน่งจริงในโลก 3D เหมือน scan
- Seeker ปกติไม่มี minimap เลย — ระหว่างหน้าต่าง 10 วินาทีนี้จะเปิด minimap ชั่วคราวให้ และ plot ตำแหน่งที่ตรวจพบเป็นวงแหวนสีแดงบน minimap ด้วย พอหมดเวลาจะปิด minimap กลับไปเหมือนเดิม
- เพิ่ม `SEEKER MISSION` HUD panel มุมซ้ายบน (ใช้ช่องเดียวกับ `HIDER MISSIONS` เพราะสองบทบาทไม่เห็นพร้อมกัน) อธิบายทั้ง Trace Terminal และ Scan ability

### ตามมา: ชื่อ Seeker เป็นสีแดง

- เมื่อ Hider มองเห็น Seeker ตัวจริง (ไม่ได้ซ่อนอยู่) ชื่อผู้เล่นเหนือหัว Seeker จะเป็นสีแดงแทนสีขาว ให้สังเกตได้ไวขึ้นว่าใครคือ Seeker
- Nameplate เป็น canvas-baked texture ต้อง build ใหม่ทุกครั้งที่เปลี่ยนสี (`Character3D.setNameColor`)

### ไฟล์หลักที่แก้รอบนี้

- `shared/gameConstants.ts` — เพิ่ม `SCAN_COOLDOWN_MS`, `SCAN_RADIUS_PX`, `SCAN_REVEAL_DURATION_MS`, `TRACE_COOLDOWN_MS`, `TRACE_REVEAL_DURATION_MS`, `MISSION_COOLDOWN_MS`, ปรับ `SEEKER_SPEED`
- `shared/messages.ts` — เพิ่ม `RevealPingMessage`
- `shared/mapLayout.ts` — เพิ่ม prop kind `trace-terminal`
- `server/src/rooms/GameRoom.ts` — `handleScanPulse`, `triggerTraceTerminal`, cooldown maps ใหม่, mission cooldown gate
- `client/src/screens/GameScreen.ts` — minimap filter, scan/trace key handling, `playRevealBeacons` (shadow silhouette), `playScanRing`, seeker mission HUD wiring, trace-reveal minimap wiring
- `client/src/dom/Minimap.ts` — รองรับ `revealPoints` วาดวงแหวนสีแดง
- `client/src/dom/GameHud.ts` — `setSeekerMission`, `setScanCooldown`
- `client/src/entities3d/Character3D.ts`, `client/src/textures/nameplate.ts` — `setNameColor`

### หมายเหตุการทดสอบ

- Solo play (ผู้เล่นคนเดียว) จะได้ role Hider เสมอ เพราะ `assignRoles()` บังคับ `seekerCount = 0` เมื่อมีผู้เล่นแค่ 1 คน — ต้องเปิดสอง client/สอง browser tab เพื่อทดสอบฝั่ง Seeker
- ทดสอบผ่าน 2-client script (join ห้องเดียวกันแล้วอ่าน role จาก state) และ local role-override สำหรับตรวจ UI/visual เฉพาะจุด ยืนยันแล้วว่าใช้งานได้ตามที่ตั้งใจ

## Urgent Endgame Music

- เพิ่ม music mood ใหม่ `urgent` เมื่อ phase SEEK เหลือเวลาไม่เกิน 30 วินาที
- เพิ่มความเร็วจาก tense 0.72x เป็น urgent 0.48x ของระยะ step
- เปลี่ยน arpeggio เป็น square wave เบาลงและเพิ่ม low heartbeat pulse สลับหนัก/เบา
- เพิ่มความดังจาก 0.16 เป็น 0.19 ด้วย gain ramp 0.45 วินาที ไม่ตัดเพลงทันที
- กลับเป็น calm/tense อัตโนมัติเมื่อเปลี่ยน phase หรือเริ่มรอบใหม่

## Landing Page และ Story

- ตั้งชื่อ presentation ใหม่เป็น `Clock Out Protocol — Escape the Overtime`
- Story: เวลา 18:00 ระบบ Office AI เปิด Overtime Lockdown; Clock-Out Crew ต้องทำภารกิจและซ่อนจาก Office Patrol เพื่อกลับบ้าน
- เปลี่ยน Menu จาก dialog กลางจอเป็น responsive landing page แบบเว็บไซต์
- เพิ่ม sticky navigation: Story, How to Play, Roles และ Play Now
- เพิ่ม hero, story, role comparison, four-step tutorial, control reference และ play/join form
- รักษา character preview, create room และ join room flow เดิม
- สร้าง key art แบบ voxel/isometric office โดยใช้ built-in image generation และเก็บไว้ที่ `client/public/images/office-escape-hero.png`
- หน้าแรกและ error messages เปลี่ยนเป็นภาษาอังกฤษให้สอดคล้องกับชื่อห้องในเกม

## Runtime Map Art Direction Pass

- ปรับกล้อง isometric ไม่ให้เลื่อนพ้นขอบพื้นแผนที่ จึงไม่เห็นพื้นที่ดำขนาดใหญ่เมื่อผู้เล่นอยู่ติดผนังด้านนอก
- ลด ambient light และเพิ่ม directional light เพื่อให้เฟอร์นิเจอร์ ผนัง และตัวละครมีรูปทรง/เงาที่อ่านง่ายขึ้น
- ทำพื้นรวมให้เข้มและด้านขึ้น ลดความรู้สึกเป็นกระเบื้องสีขาวโล่ง ๆ และช่วยดันสีประจำห้องให้เด่น
- เพิ่ม dark wall cap และ baseboard สี accent ของแต่ละห้อง ทำให้ผัง office และขอบเขตห้องชัดจากมุมกล้องด้านบน
- เปลี่ยนต้นไม้จิ๋วและกองเอกสารจาก sprite แบนเป็น geometry 3D พร้อมเพิ่มขนาดถังขยะ กล่อง และ coat rack
- รักษา collision, mission positions, minimap และ gameplay layout เดิมทั้งหมด การปรับรอบนี้เป็น visual/readability pass
- ตรวจผ่าน production build ทั้ง client และ server สำเร็จ
