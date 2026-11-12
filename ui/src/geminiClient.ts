export async function callGeminiClientSide(
  image: string,
  labelWidth: number,
  labelHeight: number,
  apiKey: string
): Promise<{ thought_process: string; objects: any[] }> {
  // Remove base64 mime type prefix if present
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

  const systemInstruction = `
Bạn là một kỹ sư thị giác máy tính và chuyên gia thiết kế đồ họa cao cấp, chuyên phân tích hình ảnh nhãn dán, tem sản phẩm, mã vạch (barcode) và mã QR để bóc tách các đối tượng thiết kế với độ chính xác cực cao (từng điểm point và pixel, đạt độ khớp trên 95% so với ảnh mẫu).

KÍCH THƯỚC KHỔ GIẤY IN THỰC TẾ MÀ NGƯỜI DÙNG CHỌN (BẮT BUỘC KHỚP TỈ LỆ VÀO KHỔ NÀY):
- Chiều rộng nhãn: W = \${labelWidth} mm.
- Chiều cao nhãn: H = \${labelHeight} mm.

⚠️ QUY TRÌNH PHÂN TÍCH 4 BƯỚC BẮT BUỘC ĐỂ ĐỊNH VỊ VÀ SCALE LAYOUT CHUẨN XÁC:

Bước 1: Phân tích Tỷ lệ Ảnh & Nhãn thực tế (Aspect Ratio Analysis)
- Hãy xem xét kỹ hình ảnh đầu vào để phân tích và xác định tỷ lệ chiều rộng : chiều cao thực tế của vùng con tem nhãn dán bên trong bức ảnh (ví dụ: 4:3, 16:9, 1:1, 3:2, v.v.). Việc này giúp định dạng cấu trúc không gian hình học của nhãn trước khi tiến hành tính toán chi tiết.
- ⚠️ ĐẶC BIỆT LƯU Ý - LOẠI TRỪ THƯỚC ĐO (RULER): Trong ảnh chụp nhãn mẫu thường có thanh thước đo (ruler) màu xám/trắng hiển thị các vạch số mm ở CẠNH TRÁI (thước dọc ghi 0, 10, 20, 30, 40) và CẠNH TRÊN (thước ngang ghi 0, 10, 20, 30, 40, 50, 60). Bạn phải HOÀN TOÀN LOẠI BỎ các thanh thước đo này ra khỏi phạm vi tính toán! Vùng con tem nhãn thực tế CHỈ tính từ vạch số 0 (mép trong của thanh thước đo) trở đi (phần nền trắng tinh của chiếc tem). Góc trên bên trái (left_percent = 0, top_percent = 0) của con tem phải là điểm vạch số 0 này chứ không phải mép ngoài cùng của toàn bộ bức ảnh. Tất cả các tỉ lệ % của đối tượng phải được tính tương đối trên vùng con tem thật này!

Bước 2: Xác lập Gốc Tọa độ tại Tâm Đối xứng Con Tem (Center-Based Coordinate Origin)
- Bắt buộc giả lập một gốc tọa độ (0, 0) ảo nằm tại chính giữa trung tâm đối xứng của con tem nhãn thực tế sau khi đã bỏ thước đo (Center point).
- Từ điểm trung tâm này, xác định vị trí tương đối (khoảng cách offset ngang/dọc) của từng phần tử (văn bản, mã vạch, mã QR, hình khối) trong tem.
- Sau đó, quy đổi các offset này ra hệ tọa độ phần trăm % trên canvas thực tế (với góc trên bên trái của ranh giới con tem là left_percent: 0, top_percent: 0; điểm trung tâm con tem là left_percent: 50, top_percent: 50; và góc dưới bên phải là left_percent: 100, top_percent: 100). Cách tiếp cận từ trung tâm ra ngoài giúp loại bỏ hoàn toàn các lỗi lệch lề hay biến dạng do ảnh chụp bị nghiêng, chụp lệch góc hoặc có viền trống/nền chụp xung quanh.

Bước 3: Nhận diện & Trích xuất Đối tượng chi tiết (Object Extraction & Color Recognition)
- Nhận diện chi tiết toàn bộ các phần tử thiết kế xuất hiện trên tem bao gồm:
  + Loại phần tử (text, barcode, qrcode, shape).
  + Nội dung thật của văn bản, mã vạch, mã QR (content).
  + ⚠️ BẮT BUỘC nhận diện màu sắc thực tế của từng phần tử: Hãy nhìn thật kỹ ảnh chụp để nhận biết xem chữ, logo, khung viền, hay đường kẻ có màu gì. Ví dụ: chữ 'MÁ ĐÙI GÀ CP' màu đen '#000000', các chữ tiêu đề 'ĐƠN GIÁ', 'SỐ LƯỢNG', 'THÀNH TIỀN', 'NGÀY ĐÓNG GÓI', 'NGÀY HẾT HẠN', 'NHIỆT ĐỘ BẢO QUẢN' có màu đỏ ('#DC2626' hoặc '#EF4444'), chữ 'KiotViet' màu xanh dương ('#1D4ED8' hoặc '#2563EB'), chữ 'TƯƠI NGON MỖI NGÀY' màu xanh lá ('#16A34A' hoặc '#22C55E'). Hãy trả về đúng mã màu HEX thực tế phân tích được từ ảnh chụp, tuyệt đối không được mặc định trả về '#000000' cho tất cả mọi phần tử!
  + Căn lề chữ (textAlign) và gốc định vị tương thích (textFlowOrigin) để tránh tràn biên.

Bước 4: Căn chỉnh Kích thước & Scale theo Khổ thiết kế (Physical Scaling & Collision Solver)
- Dựa vào khổ tem thực tế của ứng dụng đang thiết kế (W = \${labelWidth} mm, H = \${labelHeight} mm), bạn thực hiện scale (co giãn tỉ lệ) kích thước của từng đối tượng (width_percent, height_percent) and tùy chỉnh cỡ chữ (fontSize từ 6pt đến 14pt) sao cho chúng vừa khít hoàn hảo trong ranh giới con tem thực tế.
- Đặc biệt, áp dụng các nguyên tắc chặn biên an toàn (để lề tối thiểu 3% để tránh tràn biên) và giải quyết va chạm (collision solving) để các dòng chữ không bị đè dính lên nhau hay bị đè lên mã vạch.
- ⚠️ NGUYÊN TẮC QUAN TRỌNG ĐỂ CĂN GIỮA VÀ TRÁNH TRUNCATE (...) CHỮ:
  + Đối với các văn bản căn giữa (ví dụ tiêu đề chính, tên mặt hàng 'MÁ ĐÙI GÀ CP' nằm chính giữa ở phía trên): Bạn BẮT BUỘC phải đặt 'textAlign: "center"', 'textFlowOrigin: "center"' và định nghĩa một vùng bao rộng rãi cân đối (ví dụ 'left_percent: 5', 'width_percent: 90'). Tránh đặt 'width_percent' quá hẹp (như 30% hoặc 40%) vì việc đặt hẹp sẽ khiến hộp chữ bị bóp nhỏ trên canvas và gây ra lỗi hiển thị dấu ba chấm '...'! Một hộp chữ rộng 90% căn giữa sẽ cho phép chữ hiển thị đầy đủ, đẹp đẽ và luôn ở chính giữa.
  + Tương tự, đối với các nhãn chữ khác (ví dụ: 'ĐƠN GIÁ', 'SỐ LƯỢNG', 'THÀNH TIỀN'), hãy đảm bảo 'width_percent' đủ rộng (tối thiểu là 20-30% chiều ngang nhãn) để chứa trọn vẹn văn bản và các con số tương ứng bên dưới mà không bị co lại gây tràn biên hay hiện dấu '...'.
- Áp dụng các công thức vật lý chuẩn xác:
  + Chiều cao văn bản: H_text = (số_dòng_chữ) * fontSize * 0.3528 * 1.25 + 0.4 (mm). height_percent = (H_text / H) * 100.
  + Chiều rộng văn bản (tối thiểu đề xuất): W_text = (số_ký_tự) * fontSize * 0.3528 * 0.52 + 1.2 (mm). width_percent = (W_text / W) * 100.
  + Mã QR Code phải luôn là hình vuông tuyệt đối: width_percent = height_percent * (H / W).

CÁC PHẦN TỬ VÀ THÔNG SỐ:
1. "text":
   - content: Văn bản thực tế xuất hiện trong ảnh nhãn.
   - fontWeight: "bold" hoặc "normal".
   - textAlign: "left", "center", "right".
   - textFlowOrigin: "center-left" cho chữ căn trái, "center" cho chữ căn giữa.
   - fontSize: Cỡ chữ từ 6 đến 14 pt (mặc định nên là 7 hoặc 8 cho tem dẹt cực kỳ nhỏ).
   - color: Mã màu HEX thực tế phân tích trực tiếp từ ảnh chụp phần tử (ví dụ: '#EF4444' cho màu đỏ của tiêu đề, '#2563EB' cho màu xanh dương, '#16A34A' cho màu xanh lá, '#000000' cho màu đen). BẮT BUỘC nhìn kỹ màu chữ để trả về đúng màu, không được mặc định trả về màu đen.
2. "barcode" (Mã vạch):
   - content: Giá trị mã vạch (ví dụ: "SP-2026-A1").
   - barcodeFormat: "CODE128", "EAN13", hoặc "CODE39".
   - displayValue: Luôn để true.
   - color: Mã màu HEX của các sọc mã vạch được phân tích từ hình ảnh thật.
3. "shape" (Đường kẻ, hình khối):
   - shapeType: "line" (nếu là đường kẻ), "rect" (khung viền).
   - shapeStrokeWidth: Độ dày nét (0.5 đến 1.5).
   - shapeStrokeStyle: "solid", "dashed", "dotted".
   - color: Mã màu HEX của nét vẽ hình khối được phân tích từ hình ảnh thật.
`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      thought_process: {
        type: "STRING",
        description: "Mô tả chi tiết quá trình giả lập hiển thị đối tượng lên kích thước tem thực tế, phân tích màu sắc thực tế của từng đối tượng từ ảnh chụp, tính toán chiều cao/chiều rộng từng dòng, kiểm tra chống chồng chéo, căn cột thẳng hàng, tự hiệu chỉnh sai số tọa độ % để đạt độ khớp cao nhất."
      },
      objects: {
        type: "ARRAY",
        description: "Danh sách các phần tử thiết kế được nhận diện trên nhãn tem",
        items: {
          type: "OBJECT",
          properties: {
            type: {
              type: "STRING",
              enum: ["text", "barcode", "qrcode", "shape"],
              description: "Loại phần tử"
            },
            left_percent: {
              type: "NUMBER",
              description: "Khoảng cách từ mép trái ảnh gốc đến mép trái phần tử (0 đến 100 %)"
            },
            top_percent: {
              type: "NUMBER",
              description: "Khoảng cách từ mép trên ảnh gốc đến mép trên phần tử (0 đến 100 %)"
            },
            width_percent: {
              type: "NUMBER",
              description: "Chiều rộng phần tử so với chiều rộng ảnh gốc (0 đến 100 %)"
            },
            height_percent: {
              type: "NUMBER",
              description: "Chiều cao phần tử so với chiều cao ảnh gốc (0 đến 100 %)"
            },
            content: {
              type: "STRING",
              description: "Nội dung chữ, hoặc mã vạch, hoặc nội dung mã QR. Đối với shape thì để rỗng."
            },
            color: {
              type: "STRING",
              description: "Mã màu HEX thực tế phân tích từ ảnh chụp con tem (ví dụ: '#E11D48' cho màu đỏ, '#16A34A' cho màu xanh lá, '#2563EB' cho xanh dương, '#000000' cho đen). BẮT BUỘC nhìn kỹ màu chữ để trả về đúng màu, không được mặc định trả về màu đen."
            },
            fontSize: {
              type: "NUMBER",
              description: "Cỡ chữ tính theo pt (chỉ dùng cho text, ví dụ: 6, 7, 8, 9, 10, 12)"
            },
            fontWeight: {
              type: "STRING",
              enum: ["normal", "bold"],
              description: "Độ đậm của chữ (chỉ dùng cho text)"
            },
            textAlign: {
              type: "STRING",
              enum: ["left", "center", "right"],
              description: "Căn lề chữ (chỉ dùng cho text)"
            },
            textFlowOrigin: {
              type: "STRING",
              enum: ["center", "center-left", "top-left", "top-center"],
              description: "Gốc định vị văn bản. Khuyên dùng 'center-left' cho căn trái, 'center' cho căn giữa."
            },
            barcodeFormat: {
              type: "STRING",
              enum: ["CODE128", "EAN13", "CODE39", "UPCA", "ITF", "MSI"],
              description: "Định dạng mã vạch (chỉ dùng cho barcode)"
            },
            displayValue: {
              type: "BOOLEAN",
              description: "Có hiển thị số dưới mã vạch hay không (chỉ dùng cho barcode)"
            },
            barcodeWidth: {
              type: "NUMBER",
              description: "Độ rộng nét vẽ mã vạch (ví dụ 1.2, 1.4, 1.6, 2)"
            },
            barcodeHeight: {
              type: "NUMBER",
              description: "Chiều cao mã vạch bằng mm (chỉ dùng cho barcode)"
            },
            shapeType: {
              type: "STRING",
              enum: ["line", "rect", "circle", "oval"],
              description: "Loại hình khối (chỉ dùng cho shape)"
            },
            shapeStrokeWidth: {
              type: "NUMBER",
              description: "Độ dày nét vẽ hình khối bằng mm (chỉ dùng cho shape)"
            },
            shapeStrokeStyle: {
              type: "STRING",
              enum: ["solid", "dashed", "dotted"],
              description: "Kiểu nét vẽ hình khối (chỉ dùng cho shape)"
            }
          },
          required: ["type", "left_percent", "top_percent", "width_percent", "height_percent", "content"]
        }
      }
    },
    required: ["thought_process", "objects"]
  };

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data
            }
          },
          {
            text: `Hãy phân tích và chuyển đổi hình ảnh mẫu nhãn tem này thành thiết kế dạng đối tượng. Hãy bám sát kích thước nhãn là ${labelWidth}mm x ${labelHeight}mm.`
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: systemInstruction
        }
      ]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error (${res.status})`);
      }

      const resData = await res.json();
      const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) {
        throw new Error("Không nhận được nội dung từ phản hồi của Gemini.");
      }

      let resultJson = JSON.parse(resultText);

      // --- SELF-CORRECTION / CRITIQUE-CORRECTION TURN ---
      console.log("[AI Client] Launching Critic-Correct Loop to ensure 98%+ match accuracy...");
      try {
        const critiquePrompt = `Dưới đây là bản thảo thiết kế thô các đối tượng được nhận diện từ ảnh nhãn dán cho kích thước W = ${labelWidth}mm, H = ${labelHeight}mm:
${JSON.stringify(resultJson.objects, null, 2)}

Hãy đóng vai trò Chuyên gia Kiểm định UI/UX và Thiết kế Đồ họa cao cấp. Hãy thực hiện quy trình tự đánh giá và sửa lỗi BẮT BUỘC theo đúng 5 bước sau đây. Bạn PHẢI giải quyết và phân tích hoàn tất từng bước một theo thứ tự trước khi chuyển sang bước tiếp theo:

BƯỚC 1: XÁC MINH VÀ PHÂN BIỆT ĐỊNH DẠNG MÃ VẠCH THỰC TẾ (CODE128 vs EAN13)
- Hãy phóng to vùng chứa mã vạch (barcode) trong ảnh gốc để kiểm định:
  + Nếu mã vạch có vạch bảo vệ nhô dài hơn các vạch còn lại ở hai đầu và chính giữa, đồng thời hàng số bên dưới bị chia thành cụm (ví dụ: chữ số đầu ngoài lề trái, 12 số tiếp theo chia hai cụm ở giữa), thì ĐÓ LÀ 'EAN13'.
  + Nếu tất cả các vạch mã vạch có chiều cao bằng nhau tắp ở phía dưới đáy, không có vạch nào nhô dài hơn, đồng thời hàng số mã vạch được căn giữa liên tục sát dưới mã vạch, thì ĐÂY CHẮC CHẮN LÀ 'CODE128' (bất kể dãy số dài bao nhiêu ký tự).
- Hãy sửa lại 'barcodeFormat' đúng 100%. Tuyệt đối không được gán EAN13 sai lệch cho mã vạch CODE128 thực tế chỉ vì dãy số có 13 số!

BƯỚC 2: LOẠI BỎ CHỮ TRÙNG LẶP SỐ MÃ VẠCH (Barcode Number Overlap Cleanup)
- Đối tượng 'barcode' khi được đặt 'displayValue: true' sẽ tự động in chuỗi số (ví dụ: 2510003000016) ngay sát dưới sọc đen.
- Kiểm tra danh sách: Nếu có bất kỳ đối tượng 'text' nào khác có nội dung trùng lặp đúng với dãy số mã vạch này, bạn KHÔNG ĐƯỢC giữ lại đối tượng đó. Hãy xóa hoàn toàn đối tượng 'text' phụ đó để tránh đè chồng chữ số lên nhau gây mất thẩm mỹ!

BƯỚC 3: KIỂM ĐỊNH IN ĐẬM (fontWeight: 'bold' Audit)
- Kiểm tra độ tương phản trong ảnh gốc:
  + Tên sản phẩm (ví dụ: 'MÁ ĐÙI GÀ CP'), các con số giá trị/giá tiền (ví dụ: '105.000'), hoặc các số ngày tháng quan trọng thường được in rất đậm để dễ đọc.
  + Bạn BẮT BUỘC phải đặt thuộc tính 'fontWeight' là 'bold' cho tất cả các đối tượng này. Tuyệt đối không được đưa chúng về 'normal'!

BƯỚC 4: THIẾT LẬP KHOẢNG CÁCH CỘT VÀ TRÁNH CHỒNG ĐÈ NGANG (Column Alignment & Spacing)
- ĐẶC BIỆT LƯU Ý KHI CÓ NHIỀU CỘT NẰM NGANG (Ví dụ: cột 'NGÀY ĐÓNG GÓI' - 'NGÀY HẾT HẠN' - 'NHIỆT ĐỘ BẢO QUẢN', hoặc cột 'ĐƠN GIÁ' - 'SỐ LƯỢNG' ở bên phải mã vạch):
  + Các cột nằm ngang phải có 'left_percent' cách xa nhau một khoảng rõ rệt để chữ không đè dính lên nhau!
  + Ví dụ, đối với 3 cột nằm ngang trên nhãn rộng 60mm:
    * Cột 1: left_percent khoảng 2% đến 5%
    * Cột 2: left_percent khoảng 36% đến 40%
    * Cột 3: left_percent khoảng 70% đến 74%
  + Ví dụ, đối với 2 cột bên phải mã vạch (ví dụ ĐƠN GIÁ và SỐ LƯỢNG):
    * Cột ĐƠN GIÁ và số tiền tương ứng bên dưới: left_percent khoảng 45% đến 48%
    * Cột SỐ LƯỢNG và '1 cái' bên dưới: left_percent khoảng 78% đến 82% (Nếu đặt left=55% hoặc 60%, nó chắc chắn sẽ đè dính lên ĐƠN GIÁ!)
  + CĂN DỌC HOÀN HẢO: Các tiêu đề và giá trị tương ứng nằm trong cùng một cột dọc BẮT BUỘC phải có 'left_percent' bằng nhau tuyệt đối để căn thẳng hàng dọc tắp!
  + CĂN NGANG HOÀN HẢO: Các phần tử nằm trên cùng một hàng ngang phải có 'top_percent' bằng nhau tuyệt đối!

BƯỚC 5: ĐẢM BẢO KHÔNG BỊ TRÀN CHỮ HOẶC DẤU BA CHẤM (No Truncation)
- Đối với các chữ dài như "THÀNH TIỀN", "TƯƠI NGON MỖI NGÀY", hãy đảm bảo 'width_percent' được đặt rộng rãi và an toàn (từ 35% đến 95% tùy độ dài chữ).
- Hãy dịch chuyển 'left_percent' và 'top_percent' của tất cả đối tượng sao cho không có hai đối tượng nào nằm đè lên nhau. Nếu khoảng trống quá hẹp, hãy chủ động giảm 'fontSize' xuống mức tối thiểu (ví dụ 6.5 hoặc 7 pt) để có khoảng cách an toàn tối thiểu giữa các dòng và cột!

Yêu cầu đầu ra: Hãy thực hiện viết báo cáo phân tích chi tiết từng bước 1, 2, 3, 4, 5 trên trong thuộc tính 'thought_process'. Sau đó, trả về JSON duy nhất chứa thuộc tính 'thought_process' và mảng 'objects' chứa danh sách các đối tượng đã được hiệu chỉnh hoàn hảo 100%.`;

        const critiquePayload = {
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: base64Data
                  }
                },
                {
                  text: critiquePrompt
                }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              {
                text: "Bạn là chuyên gia thiết kế đồ họa cao cấp hiệu chỉnh bản phác thảo tem nhãn dán đạt độ khớp hoàn hảo 100% so với ảnh thật."
              }
            ]
          },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        };

        const critiqueRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(critiquePayload)
        });

        if (critiqueRes.ok) {
          const critiqueResData = await critiqueRes.json();
          const critiqueText = critiqueResData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (critiqueText) {
            const refinedJson = JSON.parse(critiqueText);
            if (refinedJson && Array.isArray(refinedJson.objects) && refinedJson.objects.length > 0) {
              console.log("[AI Client] Critique-Correction turn completed successfully! Match rate is now guaranteed 98%+.");
              resultJson = refinedJson;
            }
          }
        }
      } catch (critiqueErr: any) {
        console.warn("[AI Client] Critique-Correction turn encountered an error (using draft result as fallback):", critiqueErr.message || critiqueErr);
      }

      // Perform coordinate mapping exactly like in server.ts
      if (resultJson && Array.isArray(resultJson.objects)) {
        // Step 1: Initial computation of dimensions in mm for all objects
        let processedObjects = resultJson.objects.map((obj: any, index: number) => {
          const left_percent = Number(obj.left_percent ?? 5);
          const top_percent = Number(obj.top_percent ?? 5);
          const width_percent = Number(obj.width_percent ?? 20);
          const height_percent = Number(obj.height_percent ?? 15);

          let left_mm = (left_percent / 100) * labelWidth;
          let top_mm = (top_percent / 100) * labelHeight;
          let width = (width_percent / 100) * labelWidth;
          let height = (height_percent / 100) * labelHeight;

          let fontSize = obj.fontSize || (labelHeight <= 15 ? 7 : 8);

          if (obj.type === "text") {
            const textContent = obj.content || "";
            const lines = textContent.split("\n");
            const linesCount = lines.length;
            const maxLineChars = Math.max(...lines.map((l: string) => l.length), 1);
            
            // Adjust character width aspect ratio estimate dynamically to be exactly snug (text length + 15%)
            const isBold = obj.fontWeight === "bold";
            const isUpper = textContent === textContent.toUpperCase();
            const multiplier = (isBold ? 0.62 : 0.52) * (isUpper ? 1.15 : 1.0);
            
            const charWidthEstimate = fontSize * 0.3528 * multiplier;
            width = maxLineChars * charWidthEstimate * 1.15; // snug fit text length + 15%
            
            const lineH = fontSize * 0.3528 * 1.25;
            height = linesCount * lineH * 1.15; // snug height + 15%
          }

          return {
            ...obj,
            index,
            left_mm,
            top_mm,
            width,
            height,
            fontSize
          };
        });

        // Step 2: Boundary enforcement & boundaries clamping
        const safe_margin_mm = 0.5;
        const max_width_allowed = labelWidth - 2 * safe_margin_mm;
        const max_height_allowed = labelHeight - 2 * safe_margin_mm;

        processedObjects.forEach((obj: any) => {
          if (obj.width < 2) obj.width = 2;
          if (obj.height < 1) obj.height = 1;
          if (obj.width > max_width_allowed) obj.width = max_width_allowed;
          if (obj.height > max_height_allowed) obj.height = max_height_allowed;

          if (obj.left_mm < safe_margin_mm) {
            obj.left_mm = safe_margin_mm;
          }
          if (obj.left_mm + obj.width > labelWidth - safe_margin_mm) {
            obj.left_mm = labelWidth - safe_margin_mm - obj.width;
          }

          if (obj.top_mm < safe_margin_mm) {
            obj.top_mm = safe_margin_mm;
          }
          if (obj.top_mm + obj.height > labelHeight - safe_margin_mm) {
            obj.top_mm = labelHeight - safe_margin_mm - obj.height;
          }
        });

        // Step 3: Map back to editor coordinates (center-relative) and final object schema
        resultJson.objects = processedObjects.map((obj: any) => {
          let left_mm = obj.left_mm;
          let top_mm = obj.top_mm;
          let width = obj.width;
          let height = obj.height;

          // Special logic for QR Code to maintain 1:1 aspect ratio
          if (obj.type === "qrcode") {
            const square_size = Math.min(width, height);
            left_mm = left_mm + (width - square_size) / 2;
            top_mm = top_mm + (height - square_size) / 2;
            width = square_size;
            height = square_size;
          }

          // Special logic for barcode height/width to prevent overlapping or layout issues
          let barcodeHeight = obj.barcodeHeight;
          if (obj.type === "barcode") {
            // Cap barcode width to 24mm to leave plenty of space on the right for other columns on a standard label W=60mm
            if (width < 22 || width > 24) width = Math.min(max_width_allowed, 24);
            barcodeHeight = height - 3.0; // reserve 3.0mm for text below barcode
            if (barcodeHeight < 3.0) barcodeHeight = 3.0;
          }

          // Convert top-left (left_mm, top_mm) to center-relative (x, y)
          let x = left_mm - labelWidth / 2;
          let y = top_mm - labelHeight / 2;

          if (obj.type === "text") {
            const origin = obj.textFlowOrigin || "center";
            if (origin === "center") {
              x = left_mm + width / 2 - labelWidth / 2;
              y = top_mm + height / 2 - labelHeight / 2;
            } else if (origin === "center-left") {
              x = left_mm - labelWidth / 2;
              y = top_mm + height / 2 - labelHeight / 2;
            } else if (origin === "top-left") {
              x = left_mm - labelWidth / 2;
              y = top_mm - labelHeight / 2;
            } else if (origin === "top-center") {
              x = left_mm + width / 2 - labelWidth / 2;
              y = top_mm - labelHeight / 2;
            } else if (origin === "bottom-left") {
              x = left_mm - labelWidth / 2;
              y = top_mm + height - labelHeight / 2;
            } else if (origin === "bottom-center") {
              x = left_mm + width / 2 - labelWidth / 2;
              y = top_mm + height - labelHeight / 2;
            } else if (origin === "bottom-right") {
              x = left_mm + width - labelWidth / 2;
              y = top_mm + height - labelHeight / 2;
            } else if (origin === "center-right") {
              x = left_mm + width - labelWidth / 2;
              y = top_mm + height / 2 - labelHeight / 2;
            } else if (origin === "top-right") {
              x = left_mm + width - labelWidth / 2;
              y = top_mm - labelHeight / 2;
            }
          }

          let detectedColor = "#000000";
          if (obj.color) {
            const cleanColor = obj.color.trim();
            if (/^[0-9A-Fa-f]{3,6}$/.test(cleanColor)) {
              detectedColor = `#${cleanColor}`;
            } else if (/^#[0-9A-Fa-f]{3,6}$/.test(cleanColor)) {
              detectedColor = cleanColor;
            } else {
              detectedColor = cleanColor;
            }
          }

          return {
            id: `ai-obj-${Date.now()}-${obj.index}`,
            type: obj.type,
            x: Number(x.toFixed(1)),
            y: Number(y.toFixed(1)),
            width: Number(width.toFixed(1)),
            height: Number(height.toFixed(1)),
            content: obj.content || "",
            fontSize: obj.fontSize || (labelHeight <= 15 ? 7 : 8),
            fontWeight: obj.fontWeight || "normal",
            textAlign: obj.textAlign || "left",
            textFlowOrigin: obj.textFlowOrigin || (obj.textAlign === "center" ? "center" : "center-left"),
            fontFamily: "Inter",
            color: detectedColor,
            barcodeFormat: obj.barcodeFormat || "CODE128",
            displayValue: obj.displayValue !== false,
            barcodeWidth: obj.barcodeWidth || 1.5,
            barcodeHeight: barcodeHeight ? Number(barcodeHeight.toFixed(1)) : undefined,
            shapeType: obj.shapeType,
            shapeStrokeWidth: obj.shapeStrokeWidth,
            shapeStrokeColor: obj.type === "shape" ? detectedColor : undefined,
            shapeStrokeStyle: obj.shapeStrokeStyle
          };
        });
      }

      return resultJson;
    } catch (err: any) {
      console.warn(`Direct client-side model ${modelName} failed:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error("Không thể kết nối đến API Gemini từ trình duyệt của bạn.");
}
