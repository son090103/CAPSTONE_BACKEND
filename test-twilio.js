// Test Twilio SMS độc lập. Chạy: node test-twilio.js +84xxxxxxxxx
require("dotenv").config();

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;
const to = process.argv[2];

console.log("SID:", sid ? sid.slice(0, 6) + "..." : "(THIẾU)");
console.log("TOKEN:", token ? "có" : "(THIẾU)");
console.log("FROM:", from || "(THIẾU)");
console.log("TO:", to || "(THIẾU - truyền: node test-twilio.js +8490...)");

if (!sid || !token || !from || !to) {
  console.error("Thiếu biến. Kiểm .env và tham số dòng lệnh.");
  process.exit(1);
}

const client = require("twilio")(sid, token);

(async () => {
  try {
    const msg = await client.messages.create({
      body: "Ma xac nhan bao gia AGM Garage: 123456 (test)",
      from,
      to,
    });
    console.log("GUI OK. SID:", msg.sid, "| status:", msg.status);
  } catch (e) {
    console.error("LOI:", e.status, e.code, e.message);
    if (e.code === 21608) console.error(">> So chua verify. Vao Verified Caller IDs them so nay.");
    if (e.code === 21211) console.error(">> So sai dinh dang. Phai la E.164: +84...");
  }
})();
