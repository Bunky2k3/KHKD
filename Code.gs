// ====== CẤU HÌNH ======
const TAB_NAME = "KẾ HOẠCH";          // tab doanh thu (giữ nguyên như bản đang chạy)
const DATA_START_ROW = 4;
const DATA_END_ROW = 16;
const QUARTERLY_START_ROW = 20;

// Màn Sản lượng: cùng cấu trúc cột A:D = [Đơn vị, Kế hoạch, Đã thực hiện, Còn lại]
const OUTPUT_TAB_NAME = "Sản lượng";  // có thể là tab khác, hoặc cùng tab nhưng khác dòng
const OUTPUT_START_ROW = 7;
const OUTPUT_END_ROW = 14;

function doGet(e) {
  try {
    const view = (e && e.parameter && e.parameter.view) || "year";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let rows;

    if (view === "output") {
      const sheet = ss.getSheetByName(OUTPUT_TAB_NAME);
      if (!sheet) throw new Error("Không tìm thấy tab: " + OUTPUT_TAB_NAME);
      rows = sheet.getRange(OUTPUT_START_ROW, 1, OUTPUT_END_ROW - OUTPUT_START_ROW + 1, 4).getValues();
    } else {
      const sheet = ss.getSheetByName(TAB_NAME);
      if (!sheet) throw new Error("Không tìm thấy tab: " + TAB_NAME);
      if (view === "year") {
        rows = sheet.getRange(DATA_START_ROW, 1, DATA_END_ROW - DATA_START_ROW + 1, 4).getValues();
      } else {
        const last = Math.max(sheet.getLastRow(), QUARTERLY_START_ROW);
        rows = sheet.getRange(QUARTERLY_START_ROW, 1, last - QUARTERLY_START_ROW + 1, 5).getValues();
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ rows: rows })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err.message || err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
