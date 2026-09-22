const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "asia-southeast1", maxInstances: 5 });

function localAnalysis(prompt, dataHint) {
  const p = String(prompt || "").toLowerCase();
  const d = dataHint || {};
  if (p.includes("năng suất") || p.includes("kém nhất") || p.includes("sản lượng thấp")) {
    return "Mình chưa đọc được toàn bộ mùa vụ từ server trong bản này. Anh/chị mở màn Quản lý > Tổng quan để xem bảng năng suất, hoặc hỏi lại sau khi dữ liệu đã đồng bộ.";
  }
  if (p.includes("kiểm định") || p.includes("việtgap")) {
    return "Chứng nhận kiểm định/VietGAP nằm ở chi tiết từng sản phẩm (mã QR). Quét tem trên bao bì sẽ thấy ngày hái, hộ trồng và chứng nhận.";
  }
  if (p.includes("giá") || p.includes("mua")) {
    return "Giá và nhu cầu thu mua cập nhật theo tin đăng ở mục Sản phẩm / Tin thu mua. So sánh vài tin gần nhất trước khi chốt deal nhé.";
  }
  return d && d.products
    ? "Trợ lý AI máy chủ chưa bật (thiếu khóa model). Mình gợi ý: xem danh sách sản phẩm đang bán và bộ lọc kiểm định/VietGAP ở trang Sản phẩm."
    : "Câu hỏi đã ghi nhận. Trợ lý AI máy chủ chưa bật đầy đủ — anh/chị thử lại hoặc xem gợi ý nhanh bên dưới.";
}

exports.askAI = onCall({ cors: true, invoker: "public" }, async (request) => {
  const prompt = request.data && request.data.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
    throw new HttpsError("invalid-argument", "prompt không hợp lệ");
  }
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (apiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      "Bạn là trợ lý nông nghiệp xã Bình Mỹ (Củ Chi). Trả lời ngắn gọn, chân thực, dễ hiểu cho bà con nông dân.\n\nCâu hỏi: " +
                      prompt.slice(0, 2000),
                  },
                ],
              },
            ],
          }),
        }
      );
      if (res.ok) {
        const j = await res.json();
        const text =
          j &&
          j.candidates &&
          j.candidates[0] &&
          j.candidates[0].content &&
          j.candidates[0].content.parts &&
          j.candidates[0].content.parts[0] &&
          j.candidates[0].content.parts[0].text;
        if (text) return { text: String(text).trim().slice(0, 4000) };
      }
    } catch (_) {
      /* fall through to local */
    }
  }
  return { text: localAnalysis(prompt, request.data && request.data.stats) };
});
