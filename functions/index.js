// เป็นไฟล์ที่เอาไว้เปลี่ยนแปลงแก้ไขเพื่อจะเขียน funciton หรือในที่นี้คือเขียนตัว webhook

const { onRequest } = require("firebase-functions/v2/https");
// Set the maximum instances to 10 for all functions
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const { WebhookClient } = require("dialogflow-fulfillment");
const NodeCache = require("node-cache");
const myCache = new NodeCache(); // Create variable myCache to store data

// ตอนนี้ไม่ได้ใช้ function webhook นี้แล้ว แต่ไปใช้ function dialogflowFulfillment ด้านล่างแทน
exports.webhook = onRequest(async (req, res) => {
  if (req.method === "POST") {
    const events = req.body.events;
    for (const event of events) {
      switch (event.type) {
        case "message":
          if (event.message.type === "text") {
            console.log(event.message.text);
            // Text
            // const msg = await gemini.textOnly(event.message.text);
            // await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            // return res.end();

            // Chat is Bot can remember old message situations
            const msg = await gemini.chat(event.message.text);
            await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            return res.end();
          }
          if (event.message.type === "image") {
            const imageBinary = await line.getImageBinary(event.message.id);
            const msg = await gemini.multimodal(imageBinary);
            await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            return res.end();
          }
          break;
      }
    }
  }
  return res.send(req.method);
});

// Create new webhook (new function) It's called dialogflowFulfillment
exports.dialogflowFulfillment = onRequest(async (req, res) => {
  console.log("DialogflowFulfillment");
  if (req.method === "POST") {
    var userId =
      req.body.originalDetectIntentRequest.payload.data.source.userId;
    var replyToken =
      req.body.originalDetectIntentRequest.payload.data.replyToken;
    const agent = new WebhookClient({ request: req, response: res });
    console.log("Query " + agent.query);

    console.log("UserId: " + userId);
    var mode = myCache.get(userId);
    console.log("Mode: " + mode);
    if (mode === undefined) {
      mode = "Dialogflow";
    }
    var notifyStatus = myCache.get("Notify" + userId);
    if (notifyStatus === undefined) { // There hasn't been any information yet.
      notifyStatus = true; // Set status is notify
    }
    
    if (agent.query == "success") {
      mode = "Dialogflow";
      console.log("Change Mode to: " + mode);
      await line.reply(replyToken, [
        {
          type: "text",
          text: "ระบบตั้งค่าเริ่มต้นให้คุณแล้ว สอบถามได้เลยครับ",
        },
      ]);
      myCache.set(userId, mode, 600); // หลังจากครบ 600 วินาที ระบบจะออกจากสถานะการคุยกับ Staff โดยอัตโนมัติ
      console.log("Lastest Mode: " + mode);
      return res.end();
    }

    if (mode == "bot") {
      agent.query = "สอบถามกับ AI" + agent.query;
    } else if (mode == "staff") {
      agent.query = "สอบถามกับ Staff" + agent.query;
    }

    if (agent.query.includes("สอบถามกับ Staff")) {
      mode = "staff";
      console.log("Change Mode to: " + mode);
      let profile = await line.getUserProfile(userId);
      console.log(profile.data);
      if (notifyStatus) {
        line.notify({
          message:
            "มีผู้ใช้ชื่อ " +
            profile.data.displayName +
            " ต้องการติดต่อ " +
            agent.query,
          imageFullsize: profile.data.pictureUrl,
          imageThumbnail: profile.data.pictureUrl,
        });
        await line.reply(replyToken, [
          {
            type: "text",

            text:
              agent.query +
              " เราได้แจ้งเตือนไปยัง Staff แล้วครับ Staff จะรีบมาตอบนะครับ",
          },
        ]);
      }
      myCache.set("Notify" + userId, false, 600);
    }
    else if (agent.query.includes("สอบถามกับ AI")) {
      mode = "bot";
      console.log("Change Mode to: " + mode);
      let question = agent.query;
      question = question.replace("สอบถามกับ AI", "");
      const msg = await gemini.chat(question);
      await line.reply(replyToken, [
        {
          type: "text",
          sender: {
            name: "Gemini",
            iconUrl: "https://wutthipong.info/images/geminiicon.png",
          },
          text: msg,
        },
      ]);
    } else {
      // Quick reply in chat line
      mode = "Dialogflow";
      let question = "คุณต้องการสอบถามกับ Staff หรือ AI";
      let answer1 = "สอบถามกับ Staff " + agent.query;
      let answer2 = "สอบถามกับ AI " + agent.query;

      // await line.reply(
      //   replyToken,
      //   template.quickreply(question, answer1, answer2)
      // );
      await line.reply(replyToken, [
        {
          type: "text",
          text: question,
          sender: {
            name: "Dialogflow",
            // iconUrl: "https://wutthipong.info/images/geminiicon.png",
          },
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "สอบถามกับ Staff",
                  text: answer1,
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "สอบถามกับ AI",
                  text: answer2,
                },
              },
            ],
          },
        },
      ]);
    }
    myCache.set(userId, mode, 600);
    console.log("Lastest Mode: " + mode);
  }
  return res.send(req.method);
});



// เพิ่มการดึงคำตอบจาก google sheet
// ฟังก์ชันสำหรับตรวจสอบว่าคำตอบจาก Dialogflow มีหรือไม่
function hasDialogflowAnswer(message) {
  // ตรวจสอบว่าคำตอบจาก Dialogflow มีค่าหรือไม่
  if (message.data.dialogflowResponse.fulfillmentText) {
    // มีคำตอบจาก Dialogflow
    return true;
  } else {
    // ไม่มีคำตอบจาก Dialogflow
    return false;
  }
}

// ฟังก์ชันสำหรับดึงข้อมูลคำตอบจาก Google Sheet
async function getGoogleSheetAnswer(message) {
  // กำหนด URL ของ Google Sheet
  const sheetUrl = "https://docs.google.com/spreadsheets/d/1EzUP1w-L1xYiaQdkQqs5V636YRYxRgQ66ZPfCVaewFA/edit";

  // เรียก API ของ Google Sheets
  const response = await Sheets.Spreadsheets.Values.get({
    spreadsheetId: sheetUrl,
    range: "A1:B1014",
  });

  // ตรวจสอบว่าคำตอบจาก Google Sheet มีหรือไม่
  if (response.values) {
    // มีคำตอบจาก Google Sheet
    // กำหนดคำตอบจาก Google Sheet
    const answer = response.values[0][0];

    // ส่งคำตอบจาก Google Sheet กลับไป
    return answer;
  } else {
    // ไม่มีคำตอบจาก Google Sheet
    return null;
  }
}

// ฟังก์ชันสำหรับตอบกลับข้อความ
function replyMessage(message) {
  // ตรวจสอบว่าคำตอบจาก Dialogflow มีหรือไม่
  if (hasDialogflowAnswer(message)) {
    // มีคำตอบจาก Dialogflow
    // ส่งคำตอบจาก Dialogflow กลับไป
    return message.data.dialogflowResponse.fulfillmentText;
  } else {
    // ไม่มีคำตอบจาก Dialogflow
    // ดึงข้อมูลคำตอบจาก Google Sheet
    const answer = getGoogleSheetAnswer(message);

    // ส่งคำตอบจาก Google Sheet กลับไป
    return answer;
  }
}

// ฟังก์ชันหลักของบอท
function handleMessage(message) {
  // ตอบกลับข้อความ
  const reply = replyMessage(message);

  // ส่งข้อความตอบกลับ
  return {
    type: "text",
    text: reply,
  };
}

// // ฟังก์ชันสำหรับดึงข้อมูลคำตอบจาก Google Sheet
// async function getGoogleSheetAnswer(message) {
//   // กำหนด URL ของ Google Sheet
//   const sheetUrl = "https://docs.google.com/spreadsheets/d/1234567890/edit";

//   // เรียก API ของ Google Sheets
//   const response = await Sheets.Spreadsheets.Values.get({
//     spreadsheetId: sheetUrl,
//     range: "A1:B10",
//   });

//   // ตรวจสอบว่าคำตอบจาก Google Sheet มีหรือไม่
//   if (response.values) {
//     // มีคำตอบจาก Google Sheet
//     // กำหนดคำตอบจาก Google Sheet
//     const answer = response.values[0][0];

//     // ส่งคำตอบจาก Google Sheet กลับไป
//     return answer;
//   } else {
//     // ไม่มีคำตอบจาก Google Sheet
//     return null;
//   }
// }
