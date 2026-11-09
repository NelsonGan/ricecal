/**
 * Store listing copy, one entry per locale.
 *
 * English is the source and everything else is a translation of it. The
 * figures (3.25 million packaged products, 53,000 Asian dishes) are facts about
 * the catalogue and are carried across unchanged; if it grows, change them here
 * and in `src/scenes/locales/en.ts` together, because the brand panel prints
 * the same numbers.
 *
 * Nothing here mentions the trial or the price. Both are shown by the store
 * itself on the same page, and a listing that repeats them dates the moment
 * either changes.
 *
 * `fil` is present because Google Play has a Filipino listing. App Store
 * Connect does not, and `IOS_LOCALE_MAP` in the upload lib simply has no entry
 * for it, so it is skipped on that side rather than filtered here.
 */

export interface LocaleDescription {
  description: string;
  whatsNew?: string;
}

export const APP_DESCRIPTIONS: Record<string, LocaleDescription> = {

  en: {
    description: `RiceCal is a calorie diary for Asian food, with a workout tracker beside it.

Most calorie apps were built around Western plates, so nasi lemak comes back as "rice, mixed" and char kuey teow is anybody's guess. RiceCal knows these dishes by name, in the portions they are actually served in, from the hawker stall to your own kitchen.

FIVE WAYS TO LOG A MEAL
Snap a plate and every dish on it is named, sized and counted. Or type it the way you would say it out loud: "nasi lemak with fried chicken and a teh tarik." Scan a barcode and it reads the label, from 3.25 million packaged products. Search 53,000 Asian dishes, from hawker stalls to chains to home cooking. Or save a recipe once and log it in a tap from then on.

YOUR DAY IN ONE RING
What is left to eat, with carbs, protein and fat right beside it. Water and weight too. Your budget is worked out from your body and your goal, and it keeps itself up to date.

WORKOUTS, SET BY SET
Log gym sessions one set at a time, from 278 exercises with a drawing for each. Start from your own routines or one of 19 ready-made programs. Last time's numbers sit beside every set, a record is marked the moment you beat it, and a rest timer runs between sets. Bring your history over from Strong or Hevy.

MOVEMENT ADDS, IT NEVER TAKES AWAY
Connect Apple Health or Health Connect and what you burn is added to what you can eat. It is never subtracted from it.

TRENDS AND REVIEWS
Seven days, thirty days or a year, across calories, water and weight. A finished week comes back as a few cards you can read in a minute and share if you want to.

WRITTEN TO BE KIND
A day over budget gets "a bit over today, tomorrow is a new count." Never a telling off.

Terms of Use: https://ricecal.app/terms
Privacy Policy: https://ricecal.app/privacy
Contact: https://ricecal.app/contact`,
    whatsNew: `- Added saved food sharing in group chats
- Added the ability to see who reacted to messages
- Added control over automatic food and workout sharing
- Fixed health sync getting stuck
- Fixed crashes when opening the app on older phones

The best meals come with good company.`,
  },

  ms: {
    description: `RiceCal ialah diari kalori untuk makanan Asia, dengan penjejak senaman di sebelahnya.

Kebanyakan aplikasi kalori dibina untuk hidangan Barat, jadi nasi lemak jadi "nasi campur" dan char kuey teow entah apa-apa. RiceCal kenal hidangan ini dengan namanya, dalam sajian sebenar, dari gerai tepi jalan hinggalah dapur anda sendiri.

LIMA CARA CATAT HIDANGAN
Ambil gambar pinggan dan setiap hidangan di atasnya dinamakan, disukat dan dikira. Atau taip seperti anda bercakap: "nasi lemak dengan ayam goreng dan teh tarik." Imbas barkod dan labelnya dibaca terus, daripada 3.25 juta produk berbungkus. Cari 53,000 hidangan Asia, dari gerai hinggalah masakan rumah. Atau simpan resipi sekali sahaja, kemudian catat dengan satu ketukan.

SATU GELANG UNTUK SEHARI
Berapa lagi yang boleh dimakan, dengan karbohidrat, protein dan lemak di sebelahnya. Air dan berat badan juga. Bajet kalori dikira daripada badan dan matlamat anda, dan ia sentiasa dikemas kini.

SENAMAN, SET DEMI SET
Catat sesi gim satu set demi satu set, daripada 278 senaman yang setiap satunya ada lukisan. Mulakan dengan rutin anda sendiri atau salah satu daripada 19 program sedia ada. Angka kali lepas ada di sebelah setiap set, rekod ditanda sebaik sahaja anda memecahkannya, dan pemasa rehat berjalan antara set. Bawa sejarah anda dari Strong atau Hevy.

PERGERAKAN MENAMBAH, BUKAN MENOLAK
Sambungkan Apple Health atau Health Connect. Kalori yang dibakar ditambah pada baki anda, bukan ditolak daripadanya.

TREN DAN ULASAN
Tujuh hari, tiga puluh hari atau setahun, untuk kalori, air dan berat. Minggu yang tamat kembali sebagai beberapa kad yang boleh dibaca dalam seminit dan dikongsi jika mahu.

DITULIS DENGAN BAIK
Hari yang terlebih sedikit dapat "lebih sedikit hari ini, esok kiraan baharu." Bukan leteran.

Terma Penggunaan: https://ricecal.app/terms
Dasar Privasi: https://ricecal.app/privacy
Hubungi kami: https://ricecal.app/contact`,
    whatsNew: `- Menambah perkongsian makanan tersimpan dalam sembang kumpulan
- Menambah senarai pemberi reaksi pada mesej
- Menambah kawalan perkongsian automatik makanan dan senaman
- Membaiki penyegerakan kesihatan yang tersekat
- Membaiki aplikasi ranap apabila dibuka pada telefon lama

Hidangan terbaik dinikmati bersama teman yang baik.`,
  },

  zh: {
    description: `RiceCal 是一本为亚洲菜做的热量日记，旁边还有一本健身记录。

大多数热量应用是照着西式餐盘做的，椰浆饭被认成"米饭配菜"，炒粿条更是无从说起。RiceCal 认得这些菜的名字，也认得它们真实的分量，从路边摊到你自家厨房。

五种方式记一餐
拍一张盘子，盘里每道菜都会被认出、估量并算清。或者像平时说话那样打出来："椰浆饭配炸鸡，再来一杯拉茶。"扫一下条码，直接从 325 万件包装食品里读出标签。搜索 53,000 道亚洲菜，小贩摊、连锁店和家常菜都有。也可以把菜谱存一次，之后一点就记好。

一天只看一个圆环
还能吃多少，旁边就是碳水、蛋白质和脂肪，还有喝水和体重。热量额度依据你的身体和目标算出，并且会自己保持更新。

健身，一组一组记
健身房的训练一组一组地记，278 个动作，每个都配有插图。可以从自己的训练计划开始，也可以选 19 套现成方案之一。每组旁边都有上次的成绩，一破纪录马上标出，组间还有休息计时。之前在 Strong 或 Hevy 的记录也能导入。

运动只会加，不会扣
连接 Apple Health 或 Health Connect，消耗的热量会加进你能吃的额度里，绝不会从中扣除。

趋势与回顾
七天、三十天或一年，涵盖热量、喝水和体重。走完的一周会变成几张卡片，一分钟读完，想分享也可以。

用词是善意的
超了一点的那天，看到的是"今天稍微多了点，明天重新开始"，不是责备。

使用条款：https://ricecal.app/terms
隐私政策：https://ricecal.app/privacy
联系我们：https://ricecal.app/contact`,
    whatsNew: `- 新增了在群组聊天中分享已保存食物的功能
- 新增了查看消息回应者的功能
- 新增了食物和运动自动分享控制
- 修复了健康同步卡住的问题
- 修复了旧手机打开应用时崩溃的问题

美食配好友才更美好。`,
  },

  id: {
    description: `RiceCal adalah buku catatan kalori untuk makanan Asia, dengan pelacak latihan di sampingnya.

Kebanyakan aplikasi kalori dibuat untuk piring Barat, jadi nasi lemak jadi "nasi campur" dan char kuey teow entah apa. RiceCal kenal hidangan ini dari namanya, dalam porsi yang benar-benar disajikan, dari kaki lima sampai dapur kamu sendiri.

LIMA CARA MENCATAT MAKAN
Foto piringmu dan tiap hidangan di atasnya dikenali, ditakar dan dihitung. Atau ketik seperti kamu bicara: "nasi lemak dengan ayam goreng dan teh tarik." Pindai barcode dan labelnya dibaca langsung, dari 3,25 juta produk kemasan. Cari 53.000 hidangan Asia, dari kaki lima sampai masakan rumah. Atau simpan resep sekali, lalu catat sekali ketuk.

SATU LINGKARAN UNTUK SEHARI
Berapa yang masih bisa dimakan, dengan karbohidrat, protein dan lemak di sebelahnya. Air dan berat badan juga. Jatah kalorimu dihitung dari tubuh dan targetmu, dan terus diperbarui sendiri.

LATIHAN, SET DEMI SET
Catat sesi gym satu set demi satu set, dari 278 gerakan yang masing-masing punya gambar. Mulai dari rutinitasmu sendiri atau salah satu dari 19 program siap pakai. Angka sesi terakhir ada di samping setiap set, rekor ditandai begitu kamu memecahkannya, dan pengatur waktu istirahat berjalan di antara set. Bawa riwayatmu dari Strong atau Hevy.

GERAK MENAMBAH, TIDAK PERNAH MENGURANGI
Sambungkan Apple Health atau Health Connect. Kalori yang terbakar ditambahkan ke jatah makanmu, bukan dipotong darinya.

TREN DAN ULASAN
Tujuh hari, tiga puluh hari atau setahun, untuk kalori, air dan berat. Pekan yang selesai kembali sebagai beberapa kartu yang bisa dibaca semenit dan dibagikan kalau mau.

DITULIS DENGAN RAMAH
Hari yang lewat sedikit dapat "hari ini sedikit lebih, besok hitungan baru." Bukan omelan.

Ketentuan Penggunaan: https://ricecal.app/terms
Kebijakan Privasi: https://ricecal.app/privacy
Kontak: https://ricecal.app/contact`,
    whatsNew: `- Menambahkan fitur berbagi makanan tersimpan di obrolan grup
- Menambahkan daftar pemberi reaksi pada pesan
- Menambahkan kontrol berbagi makanan dan olahraga otomatis
- Memperbaiki sinkronisasi kesehatan yang macet
- Memperbaiki aplikasi tertutup saat dibuka di ponsel lama

Hidangan terbaik dinikmati bersama teman yang baik.`,
  },

  th: {
    description: `RiceCal คือไดอารีแคลอรีสำหรับอาหารเอเชีย พร้อมตัวบันทึกการออกกำลังกายอยู่ข้างกัน

แอปนับแคลอรีส่วนใหญ่ทำมาเพื่อจานแบบตะวันตก นาซิเลอมักจึงกลายเป็น "ข้าวราดอะไรสักอย่าง" และผัดหมี่ก็เดาไม่ถูก RiceCal รู้จักเมนูเหล่านี้ตามชื่อจริง และตามปริมาณที่เสิร์ฟจริง ตั้งแต่ร้านริมทางจนถึงครัวที่บ้านคุณ

ห้าวิธีบันทึกมื้ออาหาร
ถ่ายรูปจาน แล้วทุกเมนูในจานจะถูกเรียกชื่อ กะปริมาณ และนับให้ หรือพิมพ์แบบที่คุณพูด เช่น "นาซิเลอมักกับไก่ทอด แล้วก็เตห์ตาริก" สแกนบาร์โค้ดแล้วอ่านจากฉลากได้เลย จากสินค้าบรรจุภัณฑ์ 3.25 ล้านรายการ ค้นเมนูเอเชียได้ 53,000 รายการ ตั้งแต่ร้านริมทางจนถึงอาหารทำเอง หรือบันทึกสูตรไว้ครั้งเดียว จากนั้นแตะเดียวก็เสร็จ

ทั้งวันอยู่ในวงแหวนเดียว
เหลือกินได้อีกเท่าไหร่ พร้อมคาร์บ โปรตีนและไขมันข้างกัน รวมถึงน้ำและน้ำหนัก งบแคลอรีคำนวณจากร่างกายและเป้าหมายของคุณ และอัปเดตตัวเองตลอด

ออกกำลังกาย ทีละเซ็ต
บันทึกการเล่นฟิตเนสทีละเซ็ต จาก 278 ท่า ที่มีภาพวาดประกอบทุกท่า เริ่มจากรูทีนของคุณเองหรือเลือกจาก 19 โปรแกรมสำเร็จรูป ตัวเลขครั้งก่อนอยู่ข้างทุกเซ็ต ทำลายสถิติเมื่อไหร่ก็มีเครื่องหมายขึ้นทันที และมีตัวจับเวลาพักระหว่างเซ็ต ย้ายประวัติเดิมมาจาก Strong หรือ Hevy ได้

การขยับคือการบวกเพิ่ม ไม่ใช่หักออก
เชื่อม Apple Health หรือ Health Connect แล้วแคลอรีที่เผาผลาญจะถูกบวกเข้ากับที่คุณกินได้ ไม่เคยถูกหักออกจากมัน

แนวโน้มและสรุปย้อนหลัง
เจ็ดวัน สามสิบวัน หรือหนึ่งปี ทั้งแคลอรี น้ำ และน้ำหนัก สัปดาห์ที่จบแล้วจะกลับมาเป็นการ์ดไม่กี่ใบ อ่านจบในหนึ่งนาที และแชร์ได้ถ้าต้องการ

ใช้คำอย่างเป็นมิตร
วันที่เกินไปนิดจะได้ข้อความว่า "วันนี้เกินไปนิด พรุ่งนี้เริ่มนับใหม่" ไม่ใช่การตำหนิ

ข้อกำหนดการใช้งาน: https://ricecal.app/terms
นโยบายความเป็นส่วนตัว: https://ricecal.app/privacy
ติดต่อเรา: https://ricecal.app/contact`,
    whatsNew: `- เพิ่มการแชร์อาหารที่บันทึกไว้ในแชทกลุ่ม
- เพิ่มรายชื่อผู้แสดงความรู้สึกต่อข้อความ
- เพิ่มการควบคุมการแชร์อาหารและการออกกำลังกายอัตโนมัติ
- แก้ไขการซิงค์สุขภาพค้าง
- แก้ไขแอปปิดตัวเมื่อเปิดบนโทรศัพท์รุ่นเก่า

มื้อที่ดีที่สุดคือมื้อที่มีเพื่อนดี ๆ ร่วมโต๊ะ`,
  },

  vi: {
    description: `RiceCal là nhật ký calo dành cho món ăn châu Á, kèm theo nhật ký tập luyện ngay bên cạnh.

Phần lớn ứng dụng đếm calo được làm cho đĩa ăn phương Tây, nên nasi lemak thành "cơm trộn" còn char kuey teow thì chịu. RiceCal biết những món này theo đúng tên, theo đúng khẩu phần người ta dọn ra, từ hàng rong tới gian bếp nhà bạn.

NĂM CÁCH GHI MỘT BỮA ĂN
Chụp đĩa thức ăn và từng món trên đó được gọi tên, ước lượng và đếm. Hoặc gõ như lúc bạn nói: "nasi lemak với gà rán và một ly teh tarik." Quét mã vạch để đọc thẳng từ nhãn, trong 3,25 triệu sản phẩm đóng gói. Tìm 53.000 món châu Á, từ hàng rong đến món nhà nấu. Hoặc lưu công thức một lần, sau đó ghi bằng một chạm.

CẢ NGÀY TRONG MỘT VÒNG TRÒN
Còn ăn được bao nhiêu, kèm tinh bột, đạm và chất béo ngay bên cạnh. Có cả nước và cân nặng. Hạn mức calo được tính từ cơ thể và mục tiêu của bạn, và tự cập nhật.

TẬP LUYỆN, TỪNG HIỆP MỘT
Ghi buổi tập gym từng hiệp một, với 278 bài tập, bài nào cũng có hình minh họa. Bắt đầu từ lịch tập của bạn hoặc một trong 19 chương trình có sẵn. Số liệu lần trước nằm cạnh mỗi hiệp, kỷ lục được đánh dấu ngay khi bạn phá, và đồng hồ nghỉ chạy giữa các hiệp. Mang lịch sử tập từ Strong hoặc Hevy sang.

VẬN ĐỘNG CỘNG THÊM, KHÔNG BAO GIỜ TRỪ ĐI
Kết nối Apple Health hoặc Health Connect và lượng calo bạn đốt được cộng vào phần bạn có thể ăn, không bao giờ bị trừ khỏi đó.

XU HƯỚNG VÀ NHÌN LẠI
Bảy ngày, ba mươi ngày hay một năm, với calo, nước và cân nặng. Một tuần đã khép lại trở về dưới dạng vài thẻ đọc trong một phút, chia sẻ được nếu bạn muốn.

VIẾT ĐỂ TỬ TẾ
Ngày quá một chút sẽ nhận được "hôm nay hơi quá, mai đếm lại từ đầu." Không bao giờ là lời trách.

Điều khoản sử dụng: https://ricecal.app/terms
Chính sách bảo mật: https://ricecal.app/privacy
Liên hệ: https://ricecal.app/contact`,
    whatsNew: `- Thêm chia sẻ món ăn đã lưu trong trò chuyện nhóm
- Thêm danh sách người bày tỏ cảm xúc với tin nhắn
- Thêm điều khiển tự động chia sẻ món ăn và buổi tập
- Sửa lỗi đồng bộ sức khỏe bị kẹt
- Sửa lỗi ứng dụng bị đóng khi mở trên điện thoại cũ

Bữa ăn ngon nhất luôn có bạn tốt bên cạnh.`,
  },

  ja: {
    description: `RiceCal は、アジアの料理のためのカロリー日記です。トレーニングの記録もすぐそばにあります。

カロリーアプリの多くは西洋の皿を前提に作られていて、ナシレマは「ご飯となにか」になり、チャークイティオに至っては見当もつきません。RiceCal はこれらの料理を名前で知っていて、実際に出てくる量で知っています。屋台から自宅の台所まで。

記録のしかたは五通り
皿を撮れば、皿の上の料理が一品ずつ名前と量とカロリーになります。話すように打つだけでもかまいません。「ナシレマとフライドチキン、それにテータリッ」。バーコードを読めば、325万件の市販品からラベルの数字がそのまま入ります。アジアの料理を53,000件検索できます。屋台の料理も、チェーン店も、家の料理も。レシピは一度入れれば、次からはタップひとつです。

一日はリングひとつ
あと何キロカロリー食べられるか。その横に炭水化物、たんぱく質、脂質。水分と体重も。目標値は体と目的から計算され、常に更新されます。

トレーニングは一セットずつ
ジムでのトレーニングを一セットずつ記録できます。種目は278種類、すべてにイラスト付き。自分のルーティンからでも、19種類の既成プログラムからでも始められます。各セットの横には前回の数字。自己ベストを超えたらその場で印がつき、セットの合間はレストタイマーが動きます。Strong や Hevy の履歴も取り込めます。

動いた分は足される。引かれない
Apple Health または Health Connect をつなぐと、消費した分が食べられる量に足されます。差し引かれることはありません。

推移とふりかえり
7日、30日、1年。カロリー、水分、体重で見られます。終わった一週間は数枚のカードになり、一分で読めて、共有もできます。

言葉はやさしく
少し超えた日には「今日は少し多め、明日また数え直し」。責める言葉は出しません。

利用規約：https://ricecal.app/terms
プライバシーポリシー：https://ricecal.app/privacy
お問い合わせ：https://ricecal.app/contact`,
    whatsNew: `- グループチャットで保存した食事を共有する機能を追加しました
- メッセージにリアクションした人の一覧を追加しました
- 食事と運動の自動共有を切り替える機能を追加しました
- ヘルスケアの同期が止まる問題を修正しました
- 古いスマートフォンで起動時にクラッシュする問題を修正しました

最高の食事には気の合う仲間がいます。`,
  },

  ko: {
    description: `RiceCal은 아시아 음식을 위한 칼로리 일기이고, 운동 기록도 함께 있습니다.

대부분의 칼로리 앱은 서양식 접시를 기준으로 만들어져서, 나시르막은 "밥과 반찬"이 되고 차퀘이티아우는 아예 알아보지 못합니다. RiceCal은 이 음식들을 이름으로 알고, 실제로 나오는 양으로 압니다. 노점부터 집 부엌까지요.

한 끼를 남기는 다섯 가지 방법
접시를 찍으면 그 위의 음식마다 이름과 양, 칼로리가 붙습니다. 말하듯이 적어도 됩니다. "나시르막에 프라이드치킨, 그리고 테타릭 한 잔." 바코드를 찍으면 325만 개 가공식품에서 라벨을 그대로 읽어옵니다. 아시아 음식 53,000가지를 검색할 수 있습니다. 노점, 프랜차이즈, 집밥까지요. 레시피는 한 번만 입력하면 다음부터는 한 번 탭입니다.

하루는 링 하나로
얼마나 더 먹을 수 있는지, 그 옆에 탄수화물과 단백질과 지방. 물과 체중도 함께. 하루 목표는 몸과 목표에서 계산되고 스스로 갱신됩니다.

운동은 세트마다
헬스장 운동을 한 세트씩 기록합니다. 278가지 운동에 모두 그림이 있습니다. 내 루틴으로 시작해도 되고, 19가지 기본 프로그램 중 하나를 골라도 됩니다. 세트마다 지난번 기록이 옆에 보이고, 기록을 깨는 순간 표시되며, 세트 사이에는 휴식 타이머가 돌아갑니다. Strong이나 Hevy의 기록도 가져올 수 있습니다.

움직임은 더할 뿐, 빼지 않습니다
Apple Health나 Health Connect를 연결하면 소모한 칼로리가 먹을 수 있는 양에 더해집니다. 거기서 빠지는 일은 없습니다.

추이와 돌아보기
7일, 30일 또는 1년. 칼로리와 물, 체중까지. 끝난 한 주는 1분이면 읽는 몇 장의 카드로 돌아오고, 원하면 공유할 수 있습니다.

말투도 설계의 일부입니다
조금 넘긴 날에는 "오늘은 조금 넘었어요, 내일 다시 셉니다." 나무라지 않습니다.

이용약관: https://ricecal.app/terms
개인정보처리방침: https://ricecal.app/privacy
문의: https://ricecal.app/contact`,
    whatsNew: `- 그룹 채팅에 저장한 음식 공유를 추가했습니다
- 메시지에 반응한 사람 목록을 추가했습니다
- 음식과 운동 자동 공유 설정을 추가했습니다
- 건강 동기화가 멈추는 문제를 수정했습니다
- 오래된 휴대폰에서 앱 실행 시 종료되는 문제를 수정했습니다

최고의 식사에는 좋은 친구가 함께합니다.`,
  },

  hi: {
    description: `RiceCal एशियाई खाने के लिए बनी कैलोरी डायरी है, और साथ में वर्कआउट ट्रैकर भी।

ज़्यादातर कैलोरी ऐप पश्चिमी थाली के हिसाब से बने हैं, इसलिए नासी लेमक "चावल, मिक्स" बन जाता है और चार क्वे तियाव का तो अंदाज़ा ही नहीं लगता। RiceCal इन व्यंजनों को नाम से पहचानती है, और उसी मात्रा में जिसमें वे असल में परोसे जाते हैं, ठेले से लेकर आपकी अपनी रसोई तक।

मील दर्ज करने के पाँच तरीके
थाली की तस्वीर लीजिए और उसका हर व्यंजन पहचाना, नापा और गिना जाता है। या जैसे बोलते हैं वैसे लिख दीजिए: "नासी लेमक के साथ फ्राइड चिकन और एक तेह तारिक।" बारकोड स्कैन कीजिए और 32.5 लाख पैकेज्ड उत्पादों में से लेबल सीधे पढ़ लिया जाता है। 53,000 एशियाई व्यंजन खोजिए, ठेले के खाने से लेकर घर की रसोई तक। या रेसिपी एक बार सेव कीजिए और उसके बाद एक टैप।

पूरा दिन एक रिंग में
अभी कितना और खाया जा सकता है, साथ में कार्ब, प्रोटीन और फैट। पानी और वज़न भी। आपका बजट आपके शरीर और लक्ष्य से निकाला जाता है और खुद अपडेट रहता है।

वर्कआउट, एक-एक सेट
जिम सेशन एक-एक सेट करके लिखिए, 278 एक्सरसाइज़ में से, हर एक के साथ चित्र। अपने रूटीन से शुरू कीजिए या 19 तैयार प्रोग्राम में से कोई चुनिए। हर सेट के पास पिछली बार के आंकड़े रहते हैं, रिकॉर्ड टूटते ही निशान लग जाता है, और सेट के बीच रेस्ट टाइमर चलता है। Strong या Hevy से अपना पुराना रिकॉर्ड ले आइए।

चलना जोड़ता है, घटाता कभी नहीं
Apple Health या Health Connect जोड़िए और जो कैलोरी आप जलाते हैं वह खाने की मात्रा में जुड़ जाती है। उसमें से कभी घटाई नहीं जाती।

रुझान और समीक्षा
सात दिन, तीस दिन या एक साल, कैलोरी, पानी और वज़न के लिए। पूरा हुआ हफ्ता कुछ कार्ड बनकर लौटता है, जिन्हें एक मिनट में पढ़ा और चाहें तो साझा किया जा सकता है।

शब्द नरम रखे गए हैं
बजट से थोड़ा ऊपर गए दिन पर लिखा होता है "आज थोड़ा ज़्यादा हुआ, कल गिनती नई।" डाँट कभी नहीं।

उपयोग की शर्तें: https://ricecal.app/terms
गोपनीयता नीति: https://ricecal.app/privacy
संपर्क: https://ricecal.app/contact`,
    whatsNew: `- समूह चैट में सहेजे गए भोजन साझा करने की सुविधा जोड़ी गई
- संदेशों पर प्रतिक्रिया देने वालों की सूची जोड़ी गई
- भोजन और वर्कआउट के अपने आप साझा होने का नियंत्रण जोड़ा गया
- स्वास्थ्य सिंक अटकने की समस्या ठीक की गई
- पुराने फ़ोन पर ऐप खोलते समय क्रैश ठीक किया गया

अच्छे साथ के साथ हर भोजन बेहतरीन होता है।`,
  },

  ta: {
    description: `RiceCal என்பது ஆசிய உணவுகளுக்கான கலோரி நாட்குறிப்பு, அதனுடன் உடற்பயிற்சிப் பதிவும் உண்டு.

பெரும்பாலான கலோரி செயலிகள் மேற்கத்திய உணவுகளை அடிப்படையாகக் கொண்டவை. அதனால் நாசி லெமாக் "கலந்த சாதம்" என்று பதிவாகிறது; சார் குவே தியாவ் பற்றிய கணக்கு வெறும் ஊகமாகிவிடுகிறது. சாலையோர உணவுக்கடையிலிருந்து உங்கள் வீட்டுச் சமையலறை வரை, உணவுகளின் பெயர்களையும் அவை உண்மையில் பரிமாறப்படும் அளவுகளையும் RiceCal அறிந்திருக்கிறது.

உணவைப் பதிவு செய்ய ஐந்து வழிகள்
உணவுத்தட்டைப் படம் எடுங்கள். அதிலுள்ள ஒவ்வொரு உணவின் பெயரும் அளவும் கலோரிகளும் கணக்கிடப்படும். அல்லது பேசுவதைப் போலவே எழுதுங்கள்: "வறுத்த கோழியுடன் நாசி லெமாக், ஒரு தே தாரிக்." பார்கோடை ஸ்கேன் செய்தால், 3.25 மில்லியன் பொட்டலப் பொருட்களின் லேபிள்களில் இருந்து தகவல் கிடைக்கும். கடை உணவுகள், உணவகச் சங்கிலிகள், வீட்டுச் சமையல் என 53,000 ஆசிய உணவுகளில் தேடுங்கள். அல்லது உங்கள் சமையல் குறிப்பை ஒருமுறை சேமித்து, பின்னர் ஒரே தட்டலில் பதிவு செய்யுங்கள்.

ஒரே வட்டத்தில் உங்கள் நாள்
இன்னும் சாப்பிடக்கூடிய கலோரிகளுடன் கார்போஹைட்ரேட், புரதம், கொழுப்பு ஆகியவற்றையும் அருகிலேயே பாருங்கள். தண்ணீரும் எடையும் கூட. உங்கள் உடல் மற்றும் இலக்கின் அடிப்படையில் கலோரி வரம்பு கணக்கிடப்பட்டு, தானாகவே புதுப்பிக்கப்படும்.

உடற்பயிற்சி, ஒவ்வொரு செட்டாக
ஜிம் பயிற்சியை ஒவ்வொரு செட்டாகப் பதிவு செய்யுங்கள். 278 பயிற்சிகள், ஒவ்வொன்றுக்கும் ஓவியம் உண்டு. உங்கள் சொந்த வழக்கத்திலிருந்தோ 19 தயார் திட்டங்களில் ஒன்றிலிருந்தோ தொடங்குங்கள். ஒவ்வொரு செட்டின் அருகிலும் கடந்த முறையின் எண்கள் இருக்கும், சாதனையை முறியடித்த உடனே குறிக்கப்படும், செட்டுகளுக்கு இடையே ஓய்வு நேரம் ஓடும். Strong அல்லது Hevy-யிலிருந்து உங்கள் பழைய பதிவுகளைக் கொண்டு வரலாம்.

இயக்கம் கூடுதலாகச் சேர்க்கும்; குறைக்காது
Apple Health அல்லது Health Connect உடன் இணைத்தால், நீங்கள் எரிக்கும் கலோரிகள் சாப்பிடக்கூடிய வரம்பில் சேர்க்கப்படும். அவை ஒருபோதும் அதிலிருந்து கழிக்கப்படாது.

போக்குகளும் வாரச் சுருக்கங்களும்
ஏழு நாட்கள், முப்பது நாட்கள் அல்லது ஓராண்டுக்கான கலோரிகள், தண்ணீர், எடை ஆகியவற்றைப் பாருங்கள். முடிந்த வாரத்தின் சுருக்கம் சில அட்டைகளாகத் திரும்ப வரும். ஒரு நிமிடத்தில் படிக்கலாம்; விரும்பினால் பகிரலாம்.

கனிவான வார்த்தைகள்
வரம்பைச் சற்று மீறிய நாளில் "இன்று சற்று அதிகம்; நாளை புதிதாகக் கணக்கிடலாம்" என்ற செய்தி கிடைக்கும். கண்டிப்பு கிடையாது.

பயன்பாட்டு விதிமுறைகள்: https://ricecal.app/terms
தனியுரிமைக் கொள்கை: https://ricecal.app/privacy
தொடர்புக்கு: https://ricecal.app/contact`,
    whatsNew: `- குழு அரட்டையில் சேமித்த உணவுகளைப் பகிரும் வசதி சேர்க்கப்பட்டது
- செய்திகளுக்கு எதிர்வினையாற்றியோர் பட்டியல் சேர்க்கப்பட்டது
- உணவு மற்றும் உடற்பயிற்சித் தானியங்கிப் பகிர்வுக் கட்டுப்பாடு சேர்க்கப்பட்டது
- உடல்நல ஒத்திசைவு முடங்குவது சரிசெய்யப்பட்டது
- பழைய கைபேசிகளில் செயலியைத் திறக்கும்போது மூடுவது சரிசெய்யப்பட்டது

நல்ல துணையுடன் உணவே சிறந்த விருந்து.`,
  },

  bn: {
    description: `RiceCal হলো এশীয় খাবারের জন্য ক্যালোরির ডায়েরি, সঙ্গে আছে ওয়ার্কআউট ট্র্যাকারও।

বেশিরভাগ ক্যালোরি অ্যাপ পশ্চিমা খাবারের কথা ভেবে তৈরি। তাই নাসি লেমাক হয়ে যায় "মিশ্র ভাত", আর চার কুয়ে তিয়াওয়ের হিসাব হয় আন্দাজে। রাস্তার খাবারের দোকান থেকে আপনার নিজের রান্নাঘর পর্যন্ত, RiceCal এসব খাবারের নাম এবং যে পরিমাণে সত্যিই পরিবেশন করা হয়, তা জানে।

খাবার নথিভুক্ত করার পাঁচটি উপায়
প্লেটের ছবি তুলুন। প্রতিটি খাবারের নাম, পরিমাণ ও ক্যালোরি হিসাব করা হবে। অথবা যেভাবে বলেন, সেভাবেই লিখুন: "ভাজা মুরগির সঙ্গে নাসি লেমাক আর এক কাপ তেহ তারিক।" বারকোড স্ক্যান করলে ৩২.৫ লাখ প্যাকেটজাত পণ্যের লেবেল থেকে সরাসরি তথ্য পাওয়া যায়। রাস্তার দোকান, রেস্তোরাঁর চেইন ও বাড়ির রান্নাসহ ৫৩,০০০ এশীয় খাবার খুঁজুন। অথবা রেসিপি একবার সংরক্ষণ করুন, তারপর এক ট্যাপেই খাবার নথিভুক্ত করুন।

একটি বৃত্তে আপনার পুরো দিন
আর কত ক্যালোরি খেতে পারবেন, তার পাশেই দেখুন কার্বোহাইড্রেট, প্রোটিন ও চর্বি। পানি ও ওজনও রয়েছে। আপনার শরীর ও লক্ষ্য অনুযায়ী ক্যালোরির বরাদ্দ হিসাব করা হয় এবং তা নিজে থেকেই আপডেট হয়।

ওয়ার্কআউট, প্রতিটি সেট ধরে
জিমের সেশন এক সেট করে লিখুন, ২৭৮টি ব্যায়াম থেকে, প্রতিটির সঙ্গে ছবি আছে। নিজের রুটিন থেকে শুরু করুন বা ১৯টি তৈরি প্রোগ্রামের একটি বেছে নিন। প্রতিটি সেটের পাশে গতবারের সংখ্যা থাকে, রেকর্ড ভাঙলেই চিহ্ন পড়ে, আর সেটের মাঝে বিশ্রামের টাইমার চলে। Strong বা Hevy থেকে পুরোনো ইতিহাস নিয়ে আসুন।

চলাফেরা বরাদ্দ বাড়ায়, কমায় না
Apple Health বা Health Connect যুক্ত করলে শরীরচর্চায় খরচ হওয়া ক্যালোরি আপনার খাবারের বরাদ্দে যোগ হয়। তা কখনো বরাদ্দ থেকে বাদ যায় না।

প্রবণতা ও সাপ্তাহিক ফিরে দেখা
সাত দিন, ত্রিশ দিন বা এক বছরের ক্যালোরি, পানি ও ওজন দেখুন। শেষ হওয়া সপ্তাহের সারাংশ কয়েকটি কার্ডে ফিরে আসে। এক মিনিটে পড়তে পারেন, চাইলে ভাগ করে নিতে পারেন।

কথায় থাকে আন্তরিকতা
একদিন বরাদ্দ একটু ছাড়িয়ে গেলে দেখবেন "আজ একটু বেশি হয়েছে, আগামীকাল নতুন করে হিসাব হবে।" কোনো বকুনি নয়।

ব্যবহারের শর্তাবলি: https://ricecal.app/terms
গোপনীয়তার নীতি: https://ricecal.app/privacy
যোগাযোগ: https://ricecal.app/contact`,
    whatsNew: `- গ্রুপ চ্যাটে সংরক্ষিত খাবার শেয়ার করার সুবিধা যোগ করা হয়েছে
- বার্তায় প্রতিক্রিয়া দেওয়া ব্যক্তিদের তালিকা যোগ করা হয়েছে
- খাবার ও ওয়ার্কআউট স্বয়ংক্রিয় শেয়ারের নিয়ন্ত্রণ যোগ করা হয়েছে
- স্বাস্থ্য সিঙ্ক আটকে যাওয়ার সমস্যা ঠিক করা হয়েছে
- পুরোনো ফোনে অ্যাপ খোলার সময় ক্র্যাশ ঠিক করা হয়েছে

ভালো সঙ্গেই খাবার সবচেয়ে উপভোগ্য হয়।`,
  },

  fil: {
    description: `Ang RiceCal ay calorie diary para sa pagkaing Asyano, na may workout tracker sa tabi nito.

Karamihan ng calorie app ay ginawa para sa pagkaing Kanluranin, kaya ang nasi lemak ay nagiging "kanin, halo-halo" at ang char kuey teow ay hulaan na lang. Kilala ng RiceCal ang mga putaheng ito sa pangalan, sa sukat na talagang inihahain, mula karinderya hanggang sa sarili mong kusina.

LIMANG PARAAN NG PAG-LOG
Kunan ang plato at bawat putahe rito ay pinapangalanan, sinusukat at binibilang. O i-type kung paano mo sasabihin: "nasi lemak na may fried chicken at teh tarik." I-scan ang barcode at babasahin ang label mula sa 3.25 milyong produktong nakabalot. Maghanap sa 53,000 putaheng Asyano, mula karinderya hanggang lutong bahay. O i-save ang recipe minsan, at isang tap na lang pagkatapos.

ISANG BILOG PARA SA BUONG ARAW
Kung ilan pa ang pwedeng kainin, katabi ang carbs, protein at taba. Pati tubig at timbang. Ang budget mo ay kinukuha mula sa katawan at layunin mo, at kusang nag-a-update.

WORKOUT, ISA-ISANG SET
I-log ang gym session nang isa-isang set, mula sa 278 exercise na may drawing bawat isa. Magsimula sa sarili mong routine o sa isa sa 19 na handang program. Katabi ng bawat set ang numero mo noong nakaraan, may marka agad kapag nakagawa ka ng bagong record, at may rest timer sa pagitan ng mga set. Ilipat ang history mo mula sa Strong o Hevy.

ANG PAGGALAW AY DAGDAG, HINDI BAWAS
Ikonekta ang Apple Health o Health Connect at ang nasunog mong calories ay idinadagdag sa pwede mong kainin. Hindi ito binabawas doon.

TRENDS AT REVIEW
Pitong araw, tatlumpung araw o isang taon, para sa calories, tubig at timbang. Ang tapos na linggo ay bumabalik bilang ilang card na mababasa sa isang minuto at maibabahagi kung gusto mo.

MABAIT ANG PAGKAKASULAT
Ang araw na lumagpas nang kaunti ay makakakuha ng "medyo lumagpas ngayon, bukas bagong bilang." Hindi pagsermon.

Mga Tuntunin ng Paggamit: https://ricecal.app/terms
Patakaran sa Privacy: https://ricecal.app/privacy
Kontak: https://ricecal.app/contact`,
    whatsNew: `- Nagdagdag ng pagbabahagi ng na-save na pagkain sa group chat
- Nagdagdag ng listahan ng mga nag-react sa mensahe
- Nagdagdag ng kontrol sa awtomatikong pagbabahagi ng pagkain at ehersisyo
- Inayos ang natigil na pag-sync ng kalusugan
- Inayos ang pag-crash sa pagbukas ng app sa lumang telepono

Pinakamasarap ang pagkain kapag maganda ang kasama.`,
  },

  es: {
    description: `RiceCal es un diario de calorías para la comida asiática, con un registro de entrenamientos al lado.

Casi todas las apps de calorías se hicieron pensando en platos occidentales, así que el nasi lemak acaba siendo "arroz variado" y el char kuey teow no lo reconoce nadie. RiceCal conoce estos platos por su nombre, en las raciones en que de verdad se sirven, del puesto callejero a tu propia cocina.

CINCO FORMAS DE REGISTRAR UNA COMIDA
Fotografía el plato y cada comida que hay en él queda nombrada, medida y contada. O escríbelo como lo dirías: "nasi lemak con pollo frito y un teh tarik." Escanea un código de barras y se lee la etiqueta, entre 3,25 millones de productos envasados. Busca entre 53.000 platos asiáticos, desde puestos callejeros hasta cocina casera. O guarda una receta una vez y regístrala en un toque a partir de entonces.

TU DÍA EN UN ANILLO
Lo que queda por comer, con hidratos, proteínas y grasas justo al lado. También agua y peso. Tu presupuesto sale de tu cuerpo y de tu objetivo, y se mantiene al día solo.

ENTRENAMIENTOS, SERIE A SERIE
Registra tus sesiones de gimnasio serie a serie, con 278 ejercicios, cada uno con su dibujo. Empieza desde tus rutinas o desde uno de los 19 programas ya hechos. Los números de la última vez aparecen junto a cada serie, un récord se marca en cuanto lo superas y un temporizador de descanso corre entre series. Trae tu historial desde Strong o Hevy.

MOVERTE SUMA, NUNCA RESTA
Conecta Apple Health o Health Connect y lo que quemas se suma a lo que puedes comer. Nunca se descuenta de ahí.

TENDENCIAS Y RESÚMENES
Siete días, treinta días o un año, en calorías, agua y peso. Una semana terminada vuelve como unas pocas tarjetas que se leen en un minuto y se comparten si quieres.

ESCRITO CON AMABILIDAD
Un día pasado de la cuenta recibe "hoy te has pasado un poco, mañana se cuenta de nuevo." Nunca una regañina.

Términos de uso: https://ricecal.app/terms
Política de privacidad: https://ricecal.app/privacy
Contacto: https://ricecal.app/contact`,
    whatsNew: `- Se añadió la opción de compartir comidas guardadas en chats de grupo
- Se añadió una lista de personas que reaccionaron a mensajes
- Se añadió control del uso compartido automático de comidas y entrenamientos
- Se corrigió el bloqueo de la sincronización de salud
- Se corrigieron cierres al abrir la app en teléfonos antiguos

Las mejores comidas se disfrutan en buena compañía.`,
  },

  fr: {
    description: `RiceCal est un journal de calories pour la cuisine asiatique, avec un suivi d’entraînement juste à côté.

La plupart des applications de calories ont été pensées pour des assiettes occidentales, alors le nasi lemak devient « riz, divers » et le char kuey teow, personne ne sait. RiceCal connaît ces plats par leur nom, dans les portions où on les sert vraiment, du stand de rue à votre propre cuisine.

CINQ FAÇONS D’ENREGISTRER UN REPAS
Photographiez l’assiette et chaque plat qui s’y trouve est nommé, mesuré et compté. Ou écrivez-le comme vous le diriez : « nasi lemak avec du poulet frit et un teh tarik. » Scannez un code-barres et l’étiquette est lue directement, parmi 3,25 millions de produits emballés. Cherchez parmi 53 000 plats asiatiques, de la cuisine de rue aux plats maison. Ou enregistrez une recette une fois et notez-la ensuite en un geste.

VOTRE JOURNÉE EN UN ANNEAU
Ce qu’il reste à manger, avec les glucides, les protéines et les lipides juste à côté. L’eau et le poids aussi. Votre objectif se calcule à partir de votre corps et de votre but, et se met à jour tout seul.

L’ENTRAÎNEMENT, SÉRIE PAR SÉRIE
Notez vos séances de salle série par série, parmi 278 exercices, chacun avec son dessin. Partez de vos propres routines ou de l’un des 19 programmes prêts à l’emploi. Les chiffres de la dernière fois s’affichent à côté de chaque série, un record est signalé dès que vous le battez et un minuteur de repos tourne entre les séries. Importez votre historique depuis Strong ou Hevy.

BOUGER AJOUTE, NE RETIRE JAMAIS
Connectez Apple Health ou Health Connect et ce que vous brûlez s’ajoute à ce que vous pouvez manger. Cela n’en est jamais déduit.

TENDANCES ET BILANS
Sept jours, trente jours ou un an, pour les calories, l’eau et le poids. Une semaine terminée revient sous forme de quelques cartes qui se lisent en une minute et se partagent si vous le souhaitez.

ÉCRIT AVEC BIENVEILLANCE
Une journée un peu au-dessus reçoit « un peu trop aujourd’hui, demain on recompte. » Jamais un reproche.

Conditions d’utilisation: https://ricecal.app/terms
Politique de confidentialité: https://ricecal.app/privacy
Contact: https://ricecal.app/contact`,
    whatsNew: `- Ajout du partage de plats enregistrés dans les discussions de groupe
- Ajout de la liste des personnes ayant réagi aux messages
- Ajout du contrôle du partage automatique des plats et entraînements
- Correction de la synchronisation de santé bloquée
- Correction des plantages au lancement sur les anciens téléphones

Les meilleurs repas se savourent en bonne compagnie.`,
  },

  de: {
    description: `RiceCal ist ein Kalorientagebuch für asiatisches Essen, mit einem Trainingstagebuch gleich daneben.

Die meisten Kalorien-Apps sind um westliche Teller herum gebaut, also wird aus Nasi Lemak „Reis, gemischt" und bei Char Kuey Teow rät die App. RiceCal kennt diese Gerichte beim Namen, in den Portionen, in denen sie wirklich serviert werden, von der Straßenküche bis in deine eigene Küche.

FÜNF WEGE, EINE MAHLZEIT ZU BUCHEN
Fotografiere den Teller, und jedes Gericht darauf wird benannt, geschätzt und gezählt. Oder tipp es so, wie du es sagen würdest: „Nasi Lemak mit Brathähnchen und ein Teh Tarik." Scanne einen Barcode, und das Etikett wird direkt gelesen, aus 3,25 Millionen verpackten Produkten. Durchsuche 53.000 asiatische Gerichte, von der Straßenküche bis zur Hausmannskost. Oder speichere ein Rezept einmal und buche es danach mit einem Tipp.

DEIN TAG IN EINEM RING
Was noch übrig ist, mit Kohlenhydraten, Eiweiß und Fett gleich daneben. Wasser und Gewicht ebenfalls. Dein Budget wird aus deinem Körper und deinem Ziel berechnet und hält sich selbst aktuell.

TRAINING, SATZ FÜR SATZ
Buche dein Training im Gym Satz für Satz, aus 278 Übungen mit je einer eigenen Zeichnung. Starte mit deinen eigenen Routinen oder einem von 19 fertigen Programmen. Die Werte vom letzten Mal stehen neben jedem Satz, ein Rekord wird markiert, sobald du ihn knackst, und zwischen den Sätzen läuft ein Pausentimer. Deine Historie aus Strong oder Hevy nimmst du einfach mit.

BEWEGUNG KOMMT DAZU, SIE NIMMT NIE WEG
Verbinde Apple Health oder Health Connect, und was du verbrennst, kommt zu dem dazu, was du essen kannst. Abgezogen wird es nie.

VERLÄUFE UND RÜCKBLICKE
Sieben Tage, dreißig Tage oder ein Jahr, für Kalorien, Wasser und Gewicht. Eine abgeschlossene Woche kommt als ein paar Karten zurück, in einer Minute gelesen und auf Wunsch geteilt.

FREUNDLICH FORMULIERT
Ein Tag über dem Budget bekommt „heute ein bisschen drüber, morgen wird neu gezählt." Nie eine Zurechtweisung.

Nutzungsbedingungen: https://ricecal.app/terms
Datenschutzrichtlinie: https://ricecal.app/privacy
Kontakt: https://ricecal.app/contact`,
    whatsNew: `- Teilen gespeicherter Gerichte in Gruppenchats hinzugefügt
- Liste der Personen mit Nachrichtenreaktionen hinzugefügt
- Steuerung des automatischen Teilens von Essen und Workouts hinzugefügt
- Hängenbleibende Gesundheitssynchronisierung behoben
- Abstürze beim Öffnen der App auf älteren Handys behoben

Die besten Mahlzeiten genießt man in guter Gesellschaft.`,
  },

  pt: {
    description: `O RiceCal é um diário de calorias para comida asiática, com um registro de treinos ao lado.

A maioria dos apps de calorias foi feita para pratos ocidentais, então nasi lemak vira "arroz, misto" e char kuey teow ninguém sabe. O RiceCal conhece esses pratos pelo nome, nas porções em que são servidos de verdade, da barraquinha de rua até a sua própria cozinha.

CINCO JEITOS DE REGISTRAR UMA REFEIÇÃO
Fotografe o prato e cada comida nele é nomeada, medida e contada. Ou escreva do jeito que você falaria: "nasi lemak com frango frito e um teh tarik." Escaneie um código de barras e o rótulo é lido direto, entre 3,25 milhões de produtos embalados. Busque em 53 mil pratos asiáticos, da comida de rua à comida caseira. Ou salve uma receita uma vez e registre num toque daí em diante.

SEU DIA EM UM ANEL
O que ainda dá para comer, com carboidratos, proteínas e gorduras logo ao lado. Água e peso também. Sua meta sai do seu corpo e do seu objetivo, e se mantém atualizada sozinha.

TREINOS, SÉRIE POR SÉRIE
Registre seus treinos na academia série por série, com 278 exercícios, cada um com seu desenho. Comece pelas suas rotinas ou por um dos 19 programas prontos. Os números da última vez aparecem ao lado de cada série, um recorde é marcado assim que você o supera e um cronômetro de descanso corre entre as séries. Traga seu histórico do Strong ou do Hevy.

MOVIMENTO SOMA, NUNCA TIRA
Conecte o Apple Health ou o Health Connect e o que você queima entra no que pode comer. Nunca é descontado dali.

TENDÊNCIAS E RETROSPECTIVAS
Sete dias, trinta dias ou um ano, em calorias, água e peso. Uma semana encerrada volta como alguns cartões que você lê em um minuto e compartilha se quiser.

ESCRITO COM GENTILEZA
Um dia acima da meta recebe "passou um pouco hoje, amanhã a conta recomeça." Nunca uma bronca.

Termos de Uso: https://ricecal.app/terms
Política de Privacidade: https://ricecal.app/privacy
Contato: https://ricecal.app/contact`,
    whatsNew: `- Adicionado compartilhamento de comidas salvas em chats de grupo
- Adicionada lista de pessoas que reagiram às mensagens
- Adicionado controle do compartilhamento automático de comidas e treinos
- Corrigido travamento da sincronização de saúde
- Corrigidas falhas ao abrir o app em celulares antigos

As melhores refeições vêm com boa companhia.`,
  },

  it: {
    description: `RiceCal è un diario delle calorie per la cucina asiatica, con un registro degli allenamenti accanto.

Quasi tutte le app di calorie sono costruite attorno ai piatti occidentali, così il nasi lemak diventa "riso, misto" e il char kuey teow non lo riconosce nessuno. RiceCal conosce questi piatti per nome, nelle porzioni in cui vengono davvero serviti, dalla bancarella alla tua cucina.

CINQUE MODI PER REGISTRARE UN PASTO
Fotografa il piatto e ogni portata viene riconosciuta, misurata e contata. Oppure scrivilo come lo diresti: "nasi lemak con pollo fritto e un teh tarik." Scansiona un codice a barre e l’etichetta viene letta direttamente, tra 3,25 milioni di prodotti confezionati. Cerca tra 53.000 piatti asiatici, dal cibo di strada alla cucina di casa. O salva una ricetta una volta e poi registrala con un tocco.

LA TUA GIORNATA IN UN ANELLO
Quello che resta da mangiare, con carboidrati, proteine e grassi lì accanto. Anche acqua e peso. Il tuo obiettivo si calcola dal tuo corpo e da ciò che vuoi ottenere, e si aggiorna da solo.

ALLENAMENTI, SERIE DOPO SERIE
Registra le sessioni in palestra serie dopo serie, tra 278 esercizi, ognuno con il suo disegno. Parti dalle tue routine o da uno dei 19 programmi già pronti. I numeri dell’ultima volta sono accanto a ogni serie, un record viene segnato appena lo superi e tra una serie e l’altra parte il timer di recupero. Porta con te lo storico da Strong o Hevy.

MUOVERSI AGGIUNGE, NON TOGLIE MAI
Collega Apple Health o Health Connect e quello che bruci si somma a quello che puoi mangiare. Non viene mai sottratto.

ANDAMENTI E RIEPILOGHI
Sette giorni, trenta giorni o un anno, per calorie, acqua e peso. Una settimana finita torna come poche schede che si leggono in un minuto e si condividono se vuoi.

SCRITTO CON GENTILEZZA
Una giornata sopra la soglia riceve "oggi un po’ oltre, domani si riconta." Mai un rimprovero.

Termini di utilizzo: https://ricecal.app/terms
Informativa sulla privacy: https://ricecal.app/privacy
Contatti: https://ricecal.app/contact`,
    whatsNew: `- Aggiunta la condivisione dei piatti salvati nelle chat di gruppo
- Aggiunto l'elenco delle persone che hanno reagito ai messaggi
- Aggiunto il controllo della condivisione automatica di pasti e allenamenti
- Corretto il blocco della sincronizzazione dei dati sanitari
- Corretti gli arresti all'apertura dell'app sui vecchi telefoni

I pasti migliori si gustano in buona compagnia.`,
  },

  nl: {
    description: `RiceCal is een caloriedagboek voor Aziatisch eten, met een trainingslog ernaast.

De meeste calorie-apps zijn gebouwd rond westerse borden, dus nasi lemak wordt "rijst, gemengd" en char kuey teow herkent niemand. RiceCal kent deze gerechten bij naam, in de porties waarin ze echt worden opgediend, van de straatkraam tot je eigen keuken.

VIJF MANIEREN OM EEN MAALTIJD TE LOGGEN
Fotografeer je bord en elk gerecht erop krijgt een naam, een portie en een telling. Of typ het zoals je het zou zeggen: "nasi lemak met gebakken kip en een teh tarik." Scan een barcode en het etiket wordt direct gelezen, uit 3,25 miljoen verpakte producten. Zoek in 53.000 Aziatische gerechten, van straatkeuken tot thuis gekookt. Of bewaar een recept één keer en log het daarna met één tik.

JE DAG IN ÉÉN RING
Wat er nog over is, met koolhydraten, eiwitten en vetten ernaast. Water en gewicht ook. Je budget wordt berekend uit je lichaam en je doel, en houdt zichzelf bij.

TRAINEN, SET VOOR SET
Log je sportschoolsessies set voor set, uit 278 oefeningen met elk een eigen tekening. Begin met je eigen routines of een van de 19 kant-en-klare programma’s. De cijfers van vorige keer staan naast elke set, een record wordt gemarkeerd zodra je het verbetert en tussen de sets loopt een rusttimer. Neem je geschiedenis mee uit Strong of Hevy.

BEWEGEN TELT ERBIJ OP, NOOIT ERAF
Koppel Apple Health of Health Connect en wat je verbrandt komt bij wat je mag eten. Het gaat er nooit vanaf.

TRENDS EN TERUGBLIKKEN
Zeven dagen, dertig dagen of een jaar, voor calorieën, water en gewicht. Een afgeronde week komt terug als een paar kaarten die je in een minuut leest en desgewenst deelt.

VRIENDELIJK GESCHREVEN
Een dag boven het budget krijgt "vandaag een beetje eroverheen, morgen telt opnieuw." Nooit een terechtwijzing.

Gebruiksvoorwaarden: https://ricecal.app/terms
Privacybeleid: https://ricecal.app/privacy
Contact: https://ricecal.app/contact`,
    whatsNew: `- Opgeslagen gerechten delen in groepschats toegevoegd
- Lijst toegevoegd van mensen die op berichten reageerden
- Instelling voor automatisch delen van eten en trainingen toegevoegd
- Vastlopende gezondheidssynchronisatie verholpen
- Crashes bij het openen van de app op oudere telefoons verholpen

De beste maaltijden geniet je in goed gezelschap.`,
  },

  ru: {
    description: `RiceCal это дневник калорий для азиатской еды, а рядом с ним дневник тренировок.

Большинство счётчиков калорий сделаны под западную тарелку, поэтому наси лемак превращается в «рис с чем-то», а про чар куэй теоу приложение просто гадает. RiceCal знает эти блюда по именам и в тех порциях, в которых их действительно подают, от уличного лотка до вашей кухни.

ПЯТЬ СПОСОБОВ ЗАПИСАТЬ ПРИЁМ ПИЩИ
Сфотографируйте тарелку, и каждое блюдо на ней получит название, объём и калории. Или напишите так, как сказали бы вслух: «наси лемак с жареной курицей и тэ тарик». Отсканируйте штрихкод, и этикетка считается напрямую из 3,25 миллиона упакованных товаров. Ищите среди 53 000 азиатских блюд, от уличной еды до домашней кухни. Или сохраните рецепт один раз и потом записывайте его одним касанием.

ДЕНЬ В ОДНОМ КОЛЬЦЕ
Сколько ещё можно съесть, а рядом углеводы, белки и жиры. Вода и вес тоже. Норма рассчитывается по вашему телу и цели и обновляется сама.

ТРЕНИРОВКИ, ПОДХОД ЗА ПОДХОДОМ
Записывайте тренировки в зале подход за подходом: 278 упражнений, у каждого свой рисунок. Начните со своих программ или с одной из 19 готовых. Результаты прошлого раза видны рядом с каждым подходом, рекорд отмечается в тот же момент, а между подходами идёт таймер отдыха. Историю можно перенести из Strong или Hevy.

ДВИЖЕНИЕ ПРИБАВЛЯЕТ, А НЕ ОТНИМАЕТ
Подключите Apple Health или Health Connect, и сожжённые калории прибавятся к тому, что можно съесть. Из этого они не вычитаются никогда.

ДИНАМИКА И ИТОГИ
Семь дней, тридцать дней или год, по калориям, воде и весу. Завершённая неделя возвращается несколькими карточками, которые читаются за минуту и при желании отправляются друзьям.

НАПИСАНО ПО-ДОБРОМУ
День с перебором получает «сегодня немного больше, завтра счёт заново». Никаких упрёков.

Условия использования: https://ricecal.app/terms
Политика конфиденциальности: https://ricecal.app/privacy
Связаться с нами: https://ricecal.app/contact`,
    whatsNew: `- Добавлен обмен сохранёнными блюдами в групповых чатах
- Добавлен список авторов реакций на сообщения
- Добавлено управление автоматической отправкой еды и тренировок
- Исправлено зависание синхронизации здоровья
- Исправлены сбои при открытии приложения на старых телефонах

Лучшие блюда вкуснее в хорошей компании.`,
  },

  tr: {
    description: `RiceCal, Asya yemekleri için bir kalori günlüğü; yanında bir antrenman takipçisi de var.

Kalori uygulamalarının çoğu Batı tabağına göre kurulmuş, o yüzden nasi lemak "pilav, karışık" oluyor, char kuey teow ise tamamen tahmin. RiceCal bu yemekleri adıyla tanıyor, gerçekte servis edildikleri porsiyonlarla, sokak tezgâhından kendi mutfağına kadar.

ÖĞÜN KAYDETMENİN BEŞ YOLU
Tabağın fotoğrafını çek, üstündeki her yemek adlandırılsın, ölçülsün ve sayılsın. Ya da nasıl söyleyeceksen öyle yaz: "kızarmış tavuklu nasi lemak ve bir teh tarik." Barkodu tara, etiket 3,25 milyon paketli ürün arasından doğrudan okunsun. 53.000 Asya yemeği arasında ara, sokak lezzetlerinden ev yemeklerine. Ya da bir tarifi bir kez kaydet, sonrasında tek dokunuşla gir.

GÜNÜN TAMAMI TEK HALKADA
Daha ne kadar yiyebileceğin, hemen yanında karbonhidrat, protein ve yağ. Su ve kilo da var. Bütçen vücuduna ve hedefine göre hesaplanır ve kendini güncel tutar.

ANTRENMAN, SET SET
Spor salonu antrenmanlarını set set kaydet, her birinin kendi çizimi olan 278 hareket arasından. Kendi rutinlerinle ya da 19 hazır programdan biriyle başla. Geçen seferin rakamları her setin yanında durur, rekoru kırdığın anda işaretlenir ve setler arasında dinlenme sayacı çalışır. Geçmişini Strong veya Hevy'den getir.

HAREKET EKLER, ASLA GÖTÜRMEZ
Apple Health veya Health Connect’i bağla, yaktığın kalori yiyebileceğine eklensin. Oradan asla düşülmez.

EĞİLİMLER VE DEĞERLENDİRMELER
Yedi gün, otuz gün ya da bir yıl; kalori, su ve kilo için. Biten bir hafta bir dakikada okunan birkaç karta dönüşür, istersen paylaşırsın.

NAZİK BİR DİLLE YAZILDI
Bütçeyi biraz aşan gün "bugün biraz fazla oldu, yarın sayım yeniden başlıyor" der. Asla azarlamaz.

Kullanım Koşulları: https://ricecal.app/terms
Gizlilik Politikası: https://ricecal.app/privacy
İletişim: https://ricecal.app/contact`,
    whatsNew: `- Grup sohbetlerinde kayıtlı yemek paylaşımı eklendi
- Mesajlara tepki veren kişilerin listesi eklendi
- Otomatik yemek ve antrenman paylaşımı kontrolü eklendi
- Sağlık eşitlemesinin takılması düzeltildi
- Eski telefonlarda uygulama açılırken oluşan çökmeler düzeltildi

En güzel yemekler iyi dostlarla yenir.`,
  },

  pl: {
    description: `RiceCal to dziennik kalorii dla kuchni azjatyckiej, a obok niego dziennik treningów.

Większość aplikacji kalorycznych powstała wokół zachodniego talerza, więc nasi lemak wychodzi jako „ryż z czymś", a char kuey teow to już czyste zgadywanie. RiceCal zna te dania z nazwy i w porcjach, w jakich naprawdę się je podaje, od ulicznego straganu po twoją własną kuchnię.

PIĘĆ SPOSOBÓW NA ZAPIS POSIŁKU
Zrób zdjęcie talerza, a każde danie na nim zostanie nazwane, zmierzone i policzone. Albo napisz tak, jak byś to powiedział: „nasi lemak ze smażonym kurczakiem i teh tarik." Zeskanuj kod kreskowy, a etykieta zostanie odczytana wprost, spośród 3,25 miliona produktów pakowanych. Szukaj wśród 53 000 dań azjatyckich, od kuchni ulicznej po domowe gotowanie. Albo zapisz przepis raz i od tej pory dodawaj go jednym dotknięciem.

CAŁY DZIEŃ W JEDNYM PIERŚCIENIU
Ile jeszcze możesz zjeść, a obok węglowodany, białko i tłuszcz. Woda i waga też. Twój limit liczony jest z twojego ciała i celu, i sam się aktualizuje.

TRENINGI, SERIA PO SERII
Zapisuj treningi na siłowni seria po serii, spośród 278 ćwiczeń, każde z własnym rysunkiem. Zacznij od własnych planów albo od jednego z 19 gotowych programów. Wyniki z poprzedniego razu widać przy każdej serii, rekord jest oznaczany, gdy tylko go pobijesz, a między seriami odlicza minutnik przerwy. Przenieś swoją historię ze Strong lub Hevy.

RUCH DODAJE, NIGDY NIE ODEJMUJE
Podłącz Apple Health albo Health Connect, a spalone kalorie dojdą do tego, co możesz zjeść. Nigdy nie są od tego odejmowane.

TRENDY I PODSUMOWANIA
Siedem dni, trzydzieści dni albo rok, dla kalorii, wody i wagi. Zamknięty tydzień wraca jako kilka kart, które czyta się w minutę i można je udostępnić.

NAPISANE ŻYCZLIWIE
Dzień ponad limit dostaje „dziś trochę więcej, jutro liczymy od nowa." Nigdy nagany.

Warunki korzystania: https://ricecal.app/terms
Polityka prywatności: https://ricecal.app/privacy
Kontakt: https://ricecal.app/contact`,
    whatsNew: `- Dodano udostępnianie zapisanych potraw w czatach grupowych
- Dodano listę osób reagujących na wiadomości
- Dodano kontrolę automatycznego udostępniania jedzenia i treningów
- Naprawiono zawieszanie synchronizacji zdrowia
- Naprawiono awarie przy otwieraniu aplikacji na starszych telefonach

Najlepsze posiłki smakują w dobrym towarzystwie.`,
  },

  uk: {
    description: `RiceCal це щоденник калорій для азійської їжі, а поруч щоденник тренувань.

Більшість лічильників калорій зроблені під західну тарілку, тому насі лемак стає «рис із чимось», а про чар куей теоу застосунок просто вгадує. RiceCal знає ці страви на ім’я і в тих порціях, у яких їх справді подають, від вуличного лотка до вашої кухні.

П’ЯТЬ СПОСОБІВ ЗАПИСАТИ ПРИЙОМ ЇЖІ
Сфотографуйте тарілку, і кожна страва на ній отримає назву, обсяг і калорії. Або напишіть так, як сказали б уголос: «насі лемак зі смаженою куркою і те тарік». Відскануйте штрихкод, і етикетка зчитається напряму з 3,25 мільйона пакованих товарів. Шукайте серед 53 000 азійських страв, від вуличної їжі до домашньої кухні. Або збережіть рецепт один раз і далі записуйте його одним дотиком.

ДЕНЬ В ОДНОМУ КІЛЬЦІ
Скільки ще можна з’їсти, а поряд вуглеводи, білки та жири. Вода і вага теж. Норма рахується з вашого тіла і мети й оновлюється сама.

ТРЕНУВАННЯ, ПІДХІД ЗА ПІДХОДОМ
Записуйте тренування в залі підхід за підходом: 278 вправ, у кожної свій малюнок. Почніть зі своїх програм або з однієї з 19 готових. Результати минулого разу видно біля кожного підходу, рекорд позначається тієї ж миті, а між підходами йде таймер відпочинку. Історію можна перенести зі Strong або Hevy.

РУХ ДОДАЄ, А НЕ ЗАБИРАЄ
Підключіть Apple Health або Health Connect, і спалені калорії додадуться до того, що можна з’їсти. З цього вони не віднімаються ніколи.

ДИНАМІКА ТА ПІДСУМКИ
Сім днів, тридцять днів або рік, за калоріями, водою і вагою. Завершений тиждень повертається кількома картками, які читаються за хвилину і за бажання надсилаються друзям.

НАПИСАНО ПО-ДОБРОМУ
День із перебором отримує «сьогодні трохи більше, завтра рахунок заново». Ніяких докорів.

Умови використання: https://ricecal.app/terms
Політика конфіденційності: https://ricecal.app/privacy
Зв’язатися з нами: https://ricecal.app/contact`,
    whatsNew: `- Додано обмін збереженими стравами в групових чатах
- Додано список людей з реакціями на повідомлення
- Додано керування автоматичним поширенням їжі та тренувань
- Виправлено зависання синхронізації здоров’я
- Виправлено збої під час відкриття застосунку на старих телефонах

Найкращі страви смакують у добрій компанії.`,
  },

  sv: {
    description: `RiceCal är en kaloridagbok för asiatisk mat, med en träningslogg bredvid.

De flesta kaloriappar är byggda kring västerländska tallrikar, så nasi lemak blir "ris, blandat" och char kuey teow är rena gissningen. RiceCal känner de här rätterna vid namn, i de portioner de faktiskt serveras i, från gatuståndet till ditt eget kök.

FEM SÄTT ATT LOGGA EN MÅLTID
Fotografera tallriken så får varje rätt på den ett namn, en portion och en kaloriangivelse. Eller skriv det som du skulle säga det: "nasi lemak med friterad kyckling och en teh tarik." Skanna en streckkod så läses etiketten direkt, ur 3,25 miljoner förpackade varor. Sök bland 53 000 asiatiska rätter, från gatukök till hemlagat. Eller spara ett recept en gång och logga det med en tryckning därefter.

HELA DAGEN I EN RING
Vad som är kvar att äta, med kolhydrater, protein och fett alldeles intill. Vatten och vikt också. Din budget räknas fram ur din kropp och ditt mål, och håller sig aktuell av sig själv.

TRÄNING, SET FÖR SET
Logga gympassen set för set, bland 278 övningar som alla har en egen teckning. Börja från dina egna rutiner eller ett av 19 färdiga program. Förra gångens siffror står bredvid varje set, ett rekord markeras i samma stund som du slår det och en vilotimer går mellan seten. Ta med din historik från Strong eller Hevy.

RÖRELSE LÄGGS TILL, DRAS ALDRIG IFRÅN
Anslut Apple Health eller Health Connect så läggs det du bränner till det du får äta. Det dras aldrig ifrån.

TRENDER OCH TILLBAKABLICKAR
Sju dagar, trettio dagar eller ett år, för kalorier, vatten och vikt. En avslutad vecka kommer tillbaka som några kort du läser på en minut och delar om du vill.

SKRIVET MED VÄNLIGHET
En dag över budget får "lite över idag, imorgon räknas det om." Aldrig en tillrättavisning.

Användarvillkor: https://ricecal.app/terms
Integritetspolicy: https://ricecal.app/privacy
Kontakt: https://ricecal.app/contact`,
    whatsNew: `- Lade till delning av sparade maträtter i gruppchattar
- Lade till en lista över personer som reagerat på meddelanden
- Lade till inställning för automatisk delning av mat och träning
- Åtgärdade hälsosynkronisering som fastnade
- Åtgärdade krascher när appen öppnas på äldre telefoner

De bästa måltiderna avnjuts i gott sällskap.`,
  },

  nb: {
    description: `RiceCal er en kaloridagbok for asiatisk mat, med en treningslogg ved siden av.

De fleste kaloriapper er bygget rundt vestlige tallerkener, så nasi lemak blir "ris, blandet" og char kuey teow er ren gjetning. RiceCal kjenner disse rettene ved navn, i porsjonene de faktisk serveres i, fra gatekjøkkenet til ditt eget kjøkken.

FEM MÅTER Å LOGGE ET MÅLTID
Ta bilde av tallerkenen, og hver rett på den får navn, porsjon og kalorier. Eller skriv det slik du ville sagt det: "nasi lemak med fritert kylling og en teh tarik." Skann en strekkode, så leses etiketten direkte, fra 3,25 millioner emballerte varer. Søk blant 53 000 asiatiske retter, fra gatekjøkken til hjemmelaget. Eller lagre en oppskrift én gang og logg den med ett trykk etterpå.

HELE DAGEN I ÉN RING
Hva som er igjen å spise, med karbohydrater, protein og fett rett ved siden av. Vann og vekt også. Budsjettet regnes ut fra kroppen din og målet ditt, og holder seg oppdatert av seg selv.

TRENING, SETT FOR SETT
Logg treningsøktene sett for sett, blant 278 øvelser som alle har sin egen tegning. Start fra dine egne rutiner eller et av 19 ferdige programmer. Tallene fra sist står ved hvert sett, en rekord markeres i det du slår den, og en hviletimer går mellom settene. Ta med historikken din fra Strong eller Hevy.

BEVEGELSE LEGGES TIL, TREKKES ALDRI FRA
Koble til Apple Health eller Health Connect, så legges det du forbrenner til det du kan spise. Det trekkes aldri fra.

TRENDER OG TILBAKEBLIKK
Sju dager, tretti dager eller et år, for kalorier, vann og vekt. En avsluttet uke kommer tilbake som noen få kort du leser på et minutt og deler om du vil.

SKREVET MED VENNLIGHET
En dag over budsjett får "litt over i dag, i morgen telles det på nytt." Aldri en irettesettelse.

Bruksvilkår: https://ricecal.app/terms
Personvernerklæring: https://ricecal.app/privacy
Kontakt: https://ricecal.app/contact`,
    whatsNew: `- La til deling av lagrede retter i gruppechatter
- La til en liste over personer som reagerte på meldinger
- La til kontroll over automatisk deling av mat og trening
- Rettet helsesynkronisering som hang seg opp
- Rettet krasj ved åpning av appen på eldre telefoner

De beste måltidene nytes i godt selskap.`,
  },

  da: {
    description: `RiceCal er en kaloriedagbog til asiatisk mad, med en træningslog ved siden af.

De fleste kalorieapps er bygget op om vestlige tallerkener, så nasi lemak bliver til "ris, blandet" og char kuey teow er det rene gætteri. RiceCal kender disse retter ved navn, i de portioner de faktisk serveres i, fra gadeboden til dit eget køkken.

FEM MÅDER AT LOGGE ET MÅLTID
Tag et billede af tallerkenen, og hver ret på den får navn, portion og kalorier. Eller skriv det, som du ville sige det: "nasi lemak med friteret kylling og en teh tarik." Scan en stregkode, så læses etiketten direkte, fra 3,25 millioner emballerede varer. Søg blandt 53.000 asiatiske retter, fra gadekøkken til hjemmelavet. Eller gem en opskrift én gang og log den med ét tryk derefter.

HELE DAGEN I ÉN RING
Hvad der er tilbage at spise, med kulhydrater, protein og fedt lige ved siden af. Vand og vægt også. Dit budget beregnes ud fra din krop og dit mål og holder sig selv opdateret.

TRÆNING, SÆT FOR SÆT
Log dine træningspas sæt for sæt, blandt 278 øvelser med hver sin tegning. Start fra dine egne rutiner eller et af 19 færdige programmer. Tallene fra sidst står ved hvert sæt, en rekord markeres i samme øjeblik, du slår den, og en pausetimer kører mellem sættene. Tag din historik med fra Strong eller Hevy.

BEVÆGELSE LÆGGES TIL, TRÆKKES ALDRIG FRA
Tilslut Apple Health eller Health Connect, så lægges det, du forbrænder, til det, du må spise. Det trækkes aldrig fra.

TENDENSER OG TILBAGEBLIK
Syv dage, tredive dage eller et år, for kalorier, vand og vægt. En afsluttet uge kommer tilbage som nogle få kort, du læser på et minut og deler, hvis du vil.

SKREVET MED VENLIGHED
En dag over budgettet får "lidt over i dag, i morgen tælles der forfra." Aldrig en irettesættelse.

Brugsvilkår: https://ricecal.app/terms
Privatlivspolitik: https://ricecal.app/privacy
Kontakt: https://ricecal.app/contact`,
    whatsNew: `- Tilføjede deling af gemte retter i gruppechats
- Tilføjede en liste over personer der reagerede på beskeder
- Tilføjede styring af automatisk deling af mad og træning
- Rettede sundhedssynkronisering der gik i stå
- Rettede nedbrud ved åbning af appen på ældre telefoner

De bedste måltider nydes i godt selskab.`,
  },
};

/** Display order, and the list every upload iterates. */
export const DESCRIPTION_LOCALE_CODES = [
  'en',
  'ms',
  'zh',
  'id',
  'th',
  'vi',
  'ja',
  'ko',
  'hi',
  'ta',
  'bn',
  'fil',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'ru',
  'tr',
  'pl',
  'uk',
  'sv',
  'nb',
  'da',
] as const;
