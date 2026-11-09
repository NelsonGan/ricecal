import type { LocaleModule } from './types';

/** Vietnamese. Translated from ./en; every figure is carried across unchanged. */
const vi: LocaleModule = {
  meta: { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },

  phone: {
    today: {
      h: "Mỗi bữa ăn\nđều được đếm",
      hl: "đều được đếm",
      sub: "Một vòng tròn cho phần còn lại. Chất và nước ngay bên cạnh.",
    },
    workout: {
      h: "Ghi từng hiệp,\nphá kỷ lục của bạn",
      hl: "phá kỷ lục của bạn",
      sub: "Buổi tập trước hiện cạnh mỗi hiệp. Có cúp khi bạn vượt qua.",
    },
    dish: {
      h: "Chọn khẩu phần,\nsố tự chạy theo",
      hl: "số tự chạy theo",
      sub: "Tô, đĩa hay miếng. Đổi khẩu phần là số đổi theo.",
    },
    trends: {
      h: "Xem tuần này\nđã đi đâu hết",
      hl: "đã đi đâu hết",
      sub: "Bảy ngày, ba mươi ngày hay một năm. Calo, nước và cân nặng.",
    },
    feed: {
      h: 'Chia sẻ món ngon,\nkết nối bạn bè',
      hl: 'kết nối bạn bè',
      sub: 'Theo dõi bạn bè và chia sẻ món ăn bạn yêu thích.',
    },
    recipes: {
      h: "Nấu một lần,\nghi bằng một chạm",
      hl: "ghi bằng một chạm",
      sub: "Nhập nguyên liệu và số phần ăn. Sau đó chỉ một chạm.",
    },
    panel: {
      title: "Năm cách\nghi món Á",
      sub: "Hàng rong, món nhà nấu, đồ đóng gói ngoài tiệm.",
      stats: { usersChoice: 'Lựa chọn của 2K người dùng' },
      metrics: { calories: "Calo", water: "Nước", weight: "Cân nặng" },
      snap    : { t: "Chụp đĩa thức ăn", b: "Từng món trên đĩa được gọi tên, ước lượng và đếm." },
      describe: { t: "Nói bạn đã ăn gì", b: "“Một tô phở bò với rau thơm.”" },
      scan    : { t: "Quét mã vạch", b: "Đọc thẳng từ nhãn, chỉ trong một giây." },
      search  : { t: "Tìm trong dữ liệu món ăn", b: "Món hàng rong, chuỗi quán và món nhà nấu." },
      recipes : { t: "Lưu công thức của bạn", b: "Nhập một lần, sau đó ghi bằng một chạm." },
    },
  },

  feature: {
    titleA: "Chụp đĩa thức ăn.",
    titleB: { pre: "Nhận lại ", hl: "lượng calo", post: "." },
    sub: "Món Á, đếm cho đúng",
  },

  landing: {
    title: "Nhật ký calo biết phở bò là gì.",
    highlight: "phở bò",
    subtitle: "Chụp, nói hoặc quét. Phần còn lại RiceCal lo.",
  },
};

export default vi;
